'use client';

import Link from 'next/link';
import { Code39Label } from '../barcode-label';
import { catalogChoices, groupByCatalog, type CatalogRef } from '../../../lib/yalika-pos-groups';
import { skuClash, suggestSku, takenSkus } from '../../../lib/yalika-sku';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

type Variant = { id: string; name: string; sku: string | null; stock: number; price: number | null; unitCost: number | null; status: string };
type Product = { id: string; name: string; sku: string | null; type: string; price: number; stock: number;
  trackInventory: boolean; status: string; unitCost: number | null; unitsPerPack: number; packSalePrice: number | null;
  webVisible: boolean; lowStockAt?: number; seasonal?: boolean; seasonEndsAt?: string | null; catalogId?: string | null; category: { id: string; name: string } | null; variants: Variant[]; images: Array<{ id: string; url: string; isPrimary: boolean }> };
type ProductBarcode = { id: string; value: string; format: string; kind: string; unitsPerScan: number; generated: boolean; active: boolean };
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const sizeLabels = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const field = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-50 placeholder:text-slate-500';
const action = 'rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40';

function parseApiMessage(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const value = (payload as { message: unknown }).message;
    return Array.isArray(value) ? value.join('; ') : String(value);
  }
  return 'No se completó la operación';
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika/${path}`, {
    ...init, cache: 'no-store',
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(parseApiMessage(body));
  return body as T;
}
function validMoney(value: string, required = true) {
  return !required && value.trim() === '' ||
    value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000;
}

/** createOnly: cajero con permiso de agregar productos; no edita ni oculta los que ya existen. */
export function ProductManager({ companyId, createOnly = false }: { companyId: string; createOnly?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [catalogPick, setCatalogPick] = useState('');
  const [newCatalogName, setNewCatalogName] = useState('');
  const [sizeStock, setSizeStock] = useState<Record<string, string>>({});
  const [price, setPrice] = useState('');
  const [packs, setPacks] = useState('1');
  const [unitCostBox, setUnitCostBox] = useState('');
  const [packSalePrice, setPackSalePrice] = useState('');
  const [clothing, setClothing] = useState(false);
  const [sizeSelection, setSizeSelection] = useState<string[]>(['S', 'M', 'L']);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editPack, setEditPack] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editBoxPrice, setEditBoxPrice] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [editLowAt, setEditLowAt] = useState('5');
  const [editDeadline, setEditDeadline] = useState('');
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeUnits, setBarcodeUnits] = useState('1');
  const [barcodeKind, setBarcodeKind] = useState<'unit' | 'pack'>('unit');

  const reload = useCallback(async () => {
    const catalog = await api<Product[]>(`catalog/product/company/${encodeURIComponent(companyId)}`);
    setProducts(catalog);
    try {
      setCatalogs(await api<Array<{ id: string; name: string }>>(`catalog/commerce/company/${encodeURIComponent(companyId)}`));
    } catch {
      setCatalogs([]);
    }
    return catalog;
  }, [companyId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void reload().catch((err: unknown) => {
      if (mounted) setError(err instanceof Error ? err.message : 'No fue posible cargar el catálogo');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [reload]);

  const current = useMemo(() => products.find((product) => product.id === active), [products, active]);
  const filtered = useMemo(() => products.filter((product) =>
    [product.name, product.sku ?? '', ...product.variants.map(v => v.name)].join(' ').toLocaleLowerCase('es-MX')
      .includes(query.toLocaleLowerCase('es-MX'))), [products, query]);
  const grouped = useMemo(() => groupByCatalog(filtered.map((product) => ({
    key: product.id, catalogId: product.catalogId, categoryId: product.category?.id,
    categoryName: product.category?.name ?? 'Sin categoría', trackInventory: product.trackInventory,
    stock: product.variants.length ? product.variants.reduce((a, v) => a + v.stock, 0) : product.stock, product,
  })), catalogs), [filtered, catalogs]);
  const searching = query.trim() !== '';
  const choices = useMemo(() => catalogChoices(catalogs), [catalogs]);
  // Sin negocios con nombre propio (o si el admin elige "Nuevo negocio") se escribe el nombre aquí.
  const creatingCatalog = !createOnly && (choices.length === 0 || catalogPick === '__new');
  const pickedId = catalogPick || (choices.length === 1 ? choices[0].id : '');
  const pickedCatalog = creatingCatalog ? undefined : choices.find(c => c.id === pickedId);
  const taken = useMemo(() => takenSkus(products), [products]);
  const activeSizes = clothing ? sizeLabels.filter(size => sizeSelection.includes(size)) : [];
  const skuProblem = skuClash(sku, activeSizes, taken);
  const sizeQuantities = activeSizes.map(size => ({ size, qty: sizeStock[size]?.trim() ? Number(sizeStock[size]) : 0 }));
  const sizeQtyValid = sizeQuantities.every(item => Number.isInteger(item.qty) && item.qty >= 0 && item.qty <= 10000);
  const totalPieces = sizeQuantities.reduce((sum, item) => sum + (Number.isInteger(item.qty) ? item.qty : 0), 0);
  const currentMargin = current?.unitCost == null ? null : current.price - current.unitCost;
  const createCost = validMoney(unitCostBox, false) && unitCostBox.trim() !== '' && Number.isInteger(Number(packs)) && Number(packs) > 0
    ? Number(unitCostBox) / Number(packs) : null;

  async function loadBarcodes(productId: string) {
    try {
      setBarcodes(await api<ProductBarcode[]>(`catalog/product/${productId}/barcodes`));
    } catch {
      setBarcodes([]);
    }
  }

  function chooseProduct(product: Product) {
    setActive(product.id);
    setEditPrice(String(product.price));
    setEditPack(String(product.unitsPerPack));
    setEditCost(product.unitCost == null ? '' : String(product.unitCost * product.unitsPerPack));
    setEditBoxPrice(product.packSalePrice == null ? '' : String(product.packSalePrice));
    setEditVisible(product.webVisible);
    setEditLowAt(String(product.lowStockAt ?? 5));
    setEditDeadline(product.seasonal && product.seasonEndsAt ? product.seasonEndsAt.slice(0, 10) : '');
    setEditPhoto(null);
    setError(''); setMessage('');
    setBarcodeValue(''); setBarcodeUnits('1'); setBarcodeKind('unit');
    void loadBarcodes(product.id);
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (!name.trim() || !validMoney(price) || !Number.isInteger(Number(packs)) || Number(packs) < 1 || Number(packs) > 100000 ||
        !validMoney(unitCostBox, false) || !validMoney(packSalePrice, false) || (clothing && !sizeSelection.length)) {
      setError('Revisa nombre, precio, cajas y tallas. Todos los importes deben ser números válidos.'); return;
    }
    if (clothing && !sizeQtyValid) { setError('Las piezas de cada talla deben ser números enteros de 0 en adelante.'); return; }
    if (skuProblem) { setError(`El código ${skuProblem.code} ya lo usa «${skuProblem.owner}». Escribe otro o toca «Sugerir».`); return; }
    if (creatingCatalog && !newCatalogName.trim()) { setError('Escribe el nombre del negocio o página donde va este producto. Ej. Boutique Luna.'); return; }
    if (!creatingCatalog && !pickedCatalog) { setError('Elige en qué negocio o página va este producto.'); return; }
    setBusy(true);
    try {
      let targetCatalogId = pickedCatalog?.id;
      if (creatingCatalog) {
        const madeCatalog = await api<CatalogRef>(`catalog/commerce/company/${encodeURIComponent(companyId)}`, { method: 'POST', body: JSON.stringify({ name: newCatalogName.trim() }) });
        targetCatalogId = madeCatalog.id;
        setCatalogs(previous => [...previous, madeCatalog]); setCatalogPick(madeCatalog.id); setNewCatalogName('');
      }
      const created = await api<Product>('catalog/product', { method: 'POST', body: JSON.stringify({
        companyId, name: name.trim(), sku: sku.trim() || undefined, type: 'product', catalogId: targetCatalogId,
        price: Number(price), stock: 0, trackInventory: true, unitsPerPack: clothing ? 1 : Number(packs),
        unitCost: createCost == null || clothing ? undefined : createCost,
        packSalePrice: packSalePrice.trim() ? Number(packSalePrice) : undefined,
        webVisible: false,
        variants: clothing ? sizeSelection.map(size => ({ name: size, sku: sku.trim() ? `${sku.trim()}-${size}` : undefined,
          stock: 0, attributes: { size } })) : undefined,
      }) });
      // Product creation is committed first. Photo failure leaves it intact, without duplicate creation on retry.
      if (photoFile) {
        try { await uploadPhoto(created.id, photoFile, true); }
        catch { setMessage('Producto creado. No se pudo guardar la foto; agrégala desde Editar.'); }
      }
      // Existencia inicial por talla: entra como una recepción normal, así queda en el historial de Inventario.
      let stockNote = '';
      const entries = clothing && !createOnly ? sizeQuantities.filter(item => item.qty > 0) : [];
      if (entries.length) {
        try {
          const made = (await reload()).find(p => p.id === created.id);
          const lines = entries.flatMap(item => {
            const variant = made?.variants.find(v => v.name === item.size);
            return variant ? [{ productId: created.id, variantId: variant.id, packs: item.qty, unitsPerPack: 1 }] : [];
          });
          if (lines.length !== entries.length) throw new Error('Falta una talla');
          await api('catalog/receipt', { method: 'POST', body: JSON.stringify({
            companyId, operationId: crypto.randomUUID(), sourceName: 'Existencia inicial', reference: `Alta de ${name.trim()}`, lines }) });
          stockNote = `Producto creado con ${totalPieces} piezas repartidas por talla.`;
        } catch { stockNote = 'Producto creado, pero no se pudo registrar la existencia por talla. Regístrala en Inventario.'; }
      }
      const fresh = await reload();
      const product = fresh.find(p => p.id === created.id);
      if (product) chooseProduct(product);
      setName(''); setSku(''); setPrice(''); setPacks('1'); setUnitCostBox('');
      setPackSalePrice(''); setPhotoFile(null); setSizeStock({});
      setMessage(previous => previous || stockNote || (clothing && !createOnly ? 'Producto creado con existencia cero (no anotaste piezas por talla). Regístralas en Inventario.' : 'Producto creado con existencia cero. Registra su recepción para sumar mercancía.'));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se creó el producto'); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(productId: string, file: File, primary: boolean) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 6 * 1024 * 1024) {
      throw new Error('Imagen JPG/PNG/WEBP/GIF de máximo 6 MB');
    }
    const form = new FormData(); form.append('file', file);
    const uploaded = await api<{ url: string }>('media/image', { method: 'POST', body: form });
    await api(`catalog/product/${productId}/image`, { method: 'POST', body: JSON.stringify({
      url: uploaded.url, altText: name || current?.name || 'Producto', isPrimary: primary,
    }) });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!current || busy) return;
    setError(''); setMessage('');
    if (!validMoney(editPrice) || !validMoney(editCost, false) || !validMoney(editBoxPrice, false) ||
      !Number.isInteger(Number(editPack)) || Number(editPack) < 1 || Number(editPack) > 100000) {
      setError('Precio, costo, unidades por caja o precio por caja inválidos'); return;
    }
    if (!/^\d{1,6}$/.test(editLowAt.trim()) || Number(editLowAt) > 100000) {
      setError('El aviso de poca existencia debe ser un número entero de 0 en adelante'); return;
    }
    if (editDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(editDeadline)) {
      setError('La fecha límite no es válida'); return;
    }
    if (current.variants.length > 0 && Number(editPack) !== 1) {
      setError('Los productos por talla se reciben por pieza; la presentación debe ser de 1 unidad.'); return;
    }
    setBusy(true);
    try {
      await api(`catalog/product/${current.id}`, { method: 'PATCH', body: JSON.stringify({
        price: Number(editPrice), unitsPerPack: Number(editPack),
        unitCost: editCost.trim() ? Number(editCost) / Number(editPack) : null,
        packSalePrice: editBoxPrice.trim() ? Number(editBoxPrice) : null,
        webVisible: editVisible,
        lowStockAt: Number(editLowAt),
        // Sólo se envía si cambió, para no pisar una temporada definida por otra vía.
        // Mediodía UTC para que el día no se corra por la zona horaria; null la quita.
        ...(editDeadline !== (current.seasonal && current.seasonEndsAt ? current.seasonEndsAt.slice(0, 10) : '')
          ? { seasonEndsAt: editDeadline ? `${editDeadline}T12:00:00.000Z` : null } : {}),
      }) });
      if (editPhoto) await uploadPhoto(current.id, editPhoto, current.images.length === 0);
      const fresh = await reload();
      const updated = fresh.find(p => p.id === current.id);
      if (updated) chooseProduct(updated);
      setMessage('Ficha actualizada. La existencia no se cambia desde el precio.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se actualizó'); }
    finally { setBusy(false); }
  }

  async function generateInternalBarcode() {
    if (!current || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const created = await api<ProductBarcode>(`catalog/product/${current.id}/barcodes/generate`, { method: 'POST' });
      await loadBarcodes(current.id);
      setMessage(`Código interno listo: ${created.value}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible generar el código');
    } finally { setBusy(false); }
  }

  async function saveBarcode(event: FormEvent) {
    event.preventDefault();
    if (!current || busy) return;
    const value = barcodeValue.trim();
    const unitsPerScan = Number(barcodeUnits);
    if (!value || !Number.isInteger(unitsPerScan) || unitsPerScan < 1 || unitsPerScan > 10000) {
      setError('Revisa el código y las unidades que representa.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`catalog/product/${current.id}/barcodes`, { method: 'POST', body: JSON.stringify({
        value, format: 'OTHER', kind: barcodeKind, unitsPerScan,
      }) });
      setBarcodeValue(''); setBarcodeUnits('1'); setBarcodeKind('unit');
      await loadBarcodes(current.id);
      setMessage('Código vinculado. Ya puede buscarse con lector, cámara o entrada manual.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el código');
    } finally { setBusy(false); }
  }

  async function bulkVisibility(webVisible: boolean) {
    if (!selected.length || busy || !window.confirm(`${webVisible ? 'Marcar para la web' : 'Ocultar de la web'} ${selected.length} productos?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api('catalog/products/visibility', { method: 'PATCH', body: JSON.stringify({ companyId, productIds: selected, webVisible }) });
      await reload(); setSelected([]);
      setMessage(webVisible ? 'Productos marcados; sólo serán públicos si el sitio está publicado.' : 'Productos retirados del escaparate.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se actualizó la selección'); }
    finally { setBusy(false); }
  }


  return <main className="min-h-screen bg-[#07101f] p-4 text-slate-100 md:p-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-emerald-400">YALIKA · POS</p><h1 className="text-3xl font-bold">Productos</h1>
          <p className="text-sm text-slate-400">Catálogo, presentaciones, códigos y publicación web. Las entradas de mercancía se registran en Inventario.</p></div>
        <Link href="/pos/inventario" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15">Ir a inventario</Link>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-500 bg-red-950 p-3 text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-600 bg-emerald-950 p-3 text-emerald-200">{message}</p>}
      {loading && <p>Consultando catálogo...</p>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section id="catalogo" className="scroll-mt-28 space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <h2 className="text-xl font-semibold">Catálogo ({filtered.length})</h2>
          <input className={field} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar producto, SKU o talla" aria-label="Buscar productos" />
          {!createOnly && <><div className="flex flex-wrap gap-2"><button className={action} disabled={!selected.length || busy} onClick={() => void bulkVisibility(true)}>Mostrar en web ({selected.length})</button>
            <button className="rounded-lg border border-slate-500 px-4 py-2 disabled:opacity-40" disabled={!selected.length || busy} onClick={() => void bulkVisibility(false)}>Ocultar en web</button></div>
          <p className="text-xs text-slate-400">La selección masiva sólo cambia visibilidad web; no altera precio, compras ni existencias.</p></>}
          {createOnly && <p className="text-xs text-slate-400">Puedes agregar productos nuevos. Cambiar o mostrar/ocultar los que ya existen lo hace el administrador.</p>}
          <div className="max-h-[580px] space-y-2 overflow-auto">
            {grouped.map(group => <details key={group.id} open={searching || grouped.length === 1 ? true : undefined} className="rounded-2xl border border-slate-700 bg-slate-900/60">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 min-h-12 py-3 font-bold text-white"><span>{group.name}</span><span className="text-xs font-normal text-slate-400">{group.count} productos{group.soldOut ? <span className="ml-2 text-red-400">· {group.soldOut} agotados</span> : null}</span></summary>
              <div className="space-y-2 border-t border-slate-800 p-3">
                {group.categories.map(category => <details key={category.id} open={searching || group.categories.length === 1 ? true : undefined} className="rounded-xl border border-slate-800 bg-slate-950/40">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 min-h-11 px-3 py-2 text-sm font-semibold text-slate-200"><span>{category.name}</span><span className="text-xs font-normal text-slate-500">{category.items.length}</span></summary>
                  <div className="space-y-2 p-3">
                    {category.items.map(({ product }) => <div key={product.id} className={`flex items-center gap-3 rounded-xl border p-3 ${active === product.id ? 'border-emerald-500' : 'border-slate-700'}`}>
              <input type="checkbox" aria-label={`Seleccionar ${product.name}`} checked={selected.includes(product.id)} onChange={event => setSelected(prev => event.target.checked ? [...prev, product.id] : prev.filter(id => id !== product.id))} />
              {product.images[0] && <img src={product.images.find(image => image.isPrimary)?.url ?? product.images[0].url} alt="" className="h-12 w-12 rounded object-contain" />}
              <button className="min-w-0 flex-1 text-left" onClick={() => chooseProduct(product)}><strong className="block truncate">{product.name}</strong><span className="text-xs text-slate-400">{product.sku || 'Sin SKU'} · {money.format(product.price)} · Existencia: {product.variants.length ? product.variants.reduce((a,v)=>a+v.stock,0) : product.stock}</span>
                <span className="block text-xs text-cyan-300">{product.webVisible ? 'Marcado para web' : 'Sólo POS'}{product.variants.length ? ` · ${product.variants.length} variantes` : ''}</span>
                {product.variants.length > 0 && <span className="block text-xs text-slate-300">{product.variants.map(variant => `${variant.name}: ${variant.stock}`).join(' · ')}</span>}</button>
            </div>)}
                  </div>
                </details>)}
              </div>
            </details>)}
          </div>
        </section>
        <div className="space-y-5">
          <form onSubmit={createProduct} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <h2 className="text-xl font-semibold">1 · Crear producto</h2>
            <label className="block text-sm">Nombre<input className={field} value={name} onChange={e => setName(e.target.value)} required maxLength={180} /></label>
            {creatingCatalog
              ? <label className="block text-sm">Negocio o página donde va<input className={field} value={newCatalogName} onChange={e => setNewCatalogName(e.target.value)} maxLength={120} placeholder="Ej. Boutique Luna" />
                  <span className="mt-1 block text-xs text-slate-400">Escribe el nombre de tu negocio o página. Así tus productos no se mezclan con los de otro negocio.</span>
                  {choices.length > 0 && <button type="button" className="mt-1 text-xs text-cyan-300 underline" onClick={() => { setCatalogPick(''); setNewCatalogName(''); }}>Mejor elegir uno que ya tengo</button>}</label>
              : <label className="block text-sm">Negocio o página donde va
                  <select className={field} value={pickedId} onChange={e => setCatalogPick(e.target.value)} required>
                    <option value="">Elige uno</option>
                    {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {!createOnly && <option value="__new">+ Crear un negocio o página nueva…</option>}
                  </select>
                  {createOnly && choices.length === 0 && <span className="mt-1 block text-xs text-amber-300">Todavía no hay negocios. Pide al administrador que cree el primero.</span>}</label>}
            <div className="block text-sm">
              <label htmlFor="new-product-sku">Código / SKU (opcional)</label>
              <div className="mt-1 flex gap-2">
                <input id="new-product-sku" className={field} value={sku} onChange={e => setSku(e.target.value)} maxLength={80} placeholder="Ej. BOU-001" aria-invalid={skuProblem ? true : undefined} />
                <button type="button" className="shrink-0 rounded-lg border border-slate-500 px-3 text-sm" onClick={() => setSku(suggestSku(pickedCatalog?.name || newCatalogName || name, activeSizes, taken))}>Sugerir</button>
              </div>
              {skuProblem
                ? <span role="alert" className="mt-1 block text-xs text-red-300">El código {skuProblem.code} ya lo usa «{skuProblem.owner}». Cada producto lleva el suyo; toca «Sugerir» para uno libre.</span>
                : <span className="mt-1 block text-xs text-slate-400">Es el código interno del producto: 3 letras del negocio y un número, como BOU-001, BOU-002… No se puede repetir. {clothing && sku.trim() ? `Cada talla lleva el suyo: ${activeSizes.slice(0, 3).map(size => `${sku.trim()}-${size}`).join(', ')}${activeSizes.length > 3 ? '…' : ''}.` : 'Déjalo vacío si no lo usas.'}</span>}
            </div>
            <label className="block text-sm">Precio de venta por pieza<input className={field} type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} required /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={clothing} onChange={e=>setClothing(e.target.checked)} /> Ropa con tallas</label>
            {clothing ? <div className="space-y-2">
              <div className="flex flex-wrap gap-2">{sizeLabels.map(size=><label key={size} className="rounded border border-slate-600 p-2 text-sm"><input type="checkbox" checked={sizeSelection.includes(size)} onChange={e=>setSizeSelection(prev=>e.target.checked ? [...prev,size] : prev.filter(v=>v!==size))} /> {size}</label>)}</div>
              {createOnly
                ? <p className="text-xs text-slate-400">Se crean las tallas elegidas; el administrador registra cuántas piezas hay de cada una.</p>
                : activeSizes.length > 0 && <fieldset className="rounded-lg border border-slate-700 p-3">
                  <legend className="px-1 text-sm font-semibold">¿Cuántas piezas tienes de cada talla?</legend>
                  <div className="grid grid-cols-3 gap-2">{activeSizes.map(size => <label key={size} className="text-xs text-slate-300">Talla {size}
                    <input className={field} type="number" inputMode="numeric" min="0" max="10000" step="1" placeholder="0" value={sizeStock[size] ?? ''} onChange={e => setSizeStock(prev => ({ ...prev, [size]: e.target.value }))} /></label>)}</div>
                  <p className="mt-2 text-xs text-slate-400">Total: <strong className="text-emerald-300">{sizeQtyValid ? totalPieces : '—'} piezas</strong>. Déjalo en 0 si aún no llegan; después las registras en Inventario.</p>
                </fieldset>}
            </div> : <>
              <label className="block text-sm">Piezas que contiene cada caja<input className={field} type="number" min="1" step="1" value={packs} onChange={e=>setPacks(e.target.value)} /></label>
              <label className="block text-sm">Costo de compra por caja (opcional)<input className={field} type="number" min="0" step="0.01" value={unitCostBox} onChange={e=>setUnitCostBox(e.target.value)} placeholder="En blanco si no lo sabes" /></label>
              <label className="block text-sm">Precio de venta por caja (opcional; pendiente en caja)<input className={field} type="number" min="0" step="0.01" value={packSalePrice} onChange={e=>setPackSalePrice(e.target.value)} /></label>
              {createCost !== null && validMoney(price) && <p className="text-sm text-emerald-300">Costo unitario {money.format(createCost)} · Ganancia bruta estimada {money.format(Number(price)-createCost)}</p>}
            </>}
            <label className="block text-sm">Foto (opcional; cámara en móvil)<input className={field} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={e=>setPhotoFile(e.target.files?.[0] ?? null)} /></label>
            <button className={action} type="submit" disabled={busy || Boolean(skuProblem)}>{clothing && !createOnly && totalPieces > 0 ? `Crear y registrar ${totalPieces} piezas` : 'Crear producto'}</button>
          </form>
          {current && !createOnly && <form onSubmit={saveEdit} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <h2 className="text-xl font-semibold">2 · Editar {current.name}</h2>
            <label className="block text-sm">Precio por pieza<input className={field} type="number" min="0" step="0.01" value={editPrice} onChange={e=>setEditPrice(e.target.value)} /></label>
            <label className="block text-sm">Unidades por caja<input className={field} type="number" min="1" step="1" value={editPack} onChange={e=>setEditPack(e.target.value)} /></label>
            <label className="block text-sm">Costo por caja (opcional)<input className={field} type="number" min="0" step="0.01" value={editCost} onChange={e=>setEditCost(e.target.value)} /></label>
            <label className="block text-sm">Precio de venta por caja (opcional; pendiente en caja)<input className={field} type="number" min="0" step="0.01" value={editBoxPrice} onChange={e=>setEditBoxPrice(e.target.value)} /></label>
            <label className="block text-sm">Avisarme cuando queden (piezas)<input className={field} type="number" inputMode="numeric" min="0" max="100000" step="1" value={editLowAt} onChange={e=>setEditLowAt(e.target.value)} /></label>
            <label className="block text-sm">Fecha límite para vender o retirar (opcional)<input className={field} type="date" value={editDeadline} onChange={e=>setEditDeadline(e.target.value)} /></label>
            <p className="-mt-2 text-xs text-slate-500">Si la pones, Yalika avisa unos días antes en Inventario → Alertas. No oculta ni bloquea el producto. Déjala vacía si no aplica.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editVisible} onChange={e=>setEditVisible(e.target.checked)} /> Mostrar producto en página web cuando esté publicada</label>
            <label className="block text-sm">Agregar fotografía<input className={field} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={e=>setEditPhoto(e.target.files?.[0] ?? null)} /></label>
            {currentMargin === null ? <p className="text-sm text-amber-300">Costo desconocido: no es posible calcular ganancia.</p> : <p className="text-sm text-emerald-300">Ganancia bruta por pieza: {money.format(currentMargin)} (antes de gastos, impuestos y descuentos).</p>}
            {current.variants.length > 0 && <p className="text-xs text-slate-400">Tallas: {current.variants.map(variant=>`${variant.name} ${variant.stock}`).join(' · ')}. Precio y costo particular por talla: próximo ajuste.</p>}
            <button className={action} type="submit" disabled={busy}>Guardar ficha sin cambiar stock</button>
          </form>}
          {current && <section id="codigos" className="scroll-mt-28 space-y-3 rounded-2xl border border-cyan-700/60 bg-slate-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-xl font-semibold">Códigos de {current.name}</h2><p className="text-xs text-slate-400">Conserva el código del fabricante. Si no tiene, genera uno interno imprimible.</p></div>
              <button type="button" onClick={() => void generateInternalBarcode()} disabled={busy} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Generar interno</button>
            </div>
            <form onSubmit={saveBarcode} className="grid gap-2 sm:grid-cols-3">
              <input className={field} value={barcodeValue} onChange={e=>setBarcodeValue(e.target.value)} placeholder="EAN/UPC/código existente" maxLength={128} />
              <select className={field} value={barcodeKind} onChange={e=>setBarcodeKind(e.target.value as 'unit'|'pack')}><option value="unit">Código de pieza</option><option value="pack">Código de caja/paquete</option></select>
              <input className={field} type="number" min="1" max="10000" step="1" value={barcodeUnits} onChange={e=>setBarcodeUnits(e.target.value)} aria-label="Unidades por escaneo" />
              <button className={action} type="submit" disabled={busy}>Vincular código</button>
            </form>
            <div className="grid gap-3 sm:grid-cols-2">
              {barcodes.map(barcode => <div key={barcode.id} className="rounded-xl border border-slate-700 p-3">
                {barcode.generated && barcode.format === 'CODE39' ? <Code39Label value={barcode.value} caption={`${current.name} · ${barcode.unitsPerScan} unidad${barcode.unitsPerScan===1?'':'es'}`} /> : <div className="rounded-lg bg-white p-3 font-mono text-sm font-bold text-slate-950">{barcode.value}</div>}
                <p className="mt-2 text-xs text-slate-400">{barcode.generated ? 'Interno Yalika' : 'Código existente'} · {barcode.kind === 'pack' ? `Caja/paquete: ${barcode.unitsPerScan} unidades` : 'Pieza'}</p>
              </div>)}
              {barcodes.length === 0 ? <p className="text-sm text-slate-400">Aún no hay códigos vinculados.</p> : null}
            </div>
          </section>}
        </div>
      </div>
    </div>
  </main>;
}

'use client';

import Link from 'next/link';
import { Code39Label } from '../barcode-label';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

type Variant = { id: string; name: string; sku: string | null; stock: number; price: number | null; unitCost: number | null; status: string };
type Product = { id: string; name: string; sku: string | null; type: string; price: number; stock: number;
  trackInventory: boolean; status: string; unitCost: number | null; unitsPerPack: number; packSalePrice: number | null;
  webVisible: boolean; variants: Variant[]; images: Array<{ id: string; url: string; isPrimary: boolean }> };
type ReceiptLine = { productId: string; variantId: string; packs: string; costPerPack: string };
type Receipt = { id: string; repeated?: boolean; movements: Array<{ quantity: number }> };
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
  const response = await fetch(`/api/orion/${path}`, {
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
function emptyLine(productId = ''): ReceiptLine {
  return { productId, variantId: '', packs: '1', costPerPack: '' };
}

export function ProductManager({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
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
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<ReceiptLine[]>([emptyLine()]);
  // A failed request keeps its UUID so a retry cannot duplicate inventory.
  const [operationId, setOperationId] = useState('');
  const [receipts, setReceipts] = useState<Array<{ id: string; sourceName: string; createdAt: string; movements: Array<{ quantity: number }> }>>([]);
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeUnits, setBarcodeUnits] = useState('1');
  const [barcodeKind, setBarcodeKind] = useState<'unit' | 'pack'>('unit');

  const reload = useCallback(async () => {
    const [catalog, history] = await Promise.all([
      api<Product[]>(`catalog/product/company/${encodeURIComponent(companyId)}`),
      api<typeof receipts>(`catalog/receipt/company/${encodeURIComponent(companyId)}`),
    ]);
    setProducts(catalog);
    setReceipts(history);
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
    setBusy(true);
    try {
      const created = await api<Product>('catalog/product', { method: 'POST', body: JSON.stringify({
        companyId, name: name.trim(), sku: sku.trim() || undefined, type: 'product',
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
      const fresh = await reload();
      const product = fresh.find(p => p.id === created.id);
      if (product) chooseProduct(product);
      setName(''); setSku(''); setPrice(''); setPacks('1'); setUnitCostBox('');
      setPackSalePrice(''); setPhotoFile(null);
      setMessage(previous => previous || 'Producto creado con existencia cero. Registra su recepción para sumar mercancía.');
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

  function changeLine(index: number, patch: Partial<ReceiptLine>) {
    setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch, ...(patch.productId ? { variantId: '' } : {}) } : line));
    setOperationId('');
  }
  async function receive(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setMessage('');
    if (!sourceName.trim() || !lines.length) { setError('Indica proveedor/origen y artículos'); return; }
    const submitted = lines.map(line => {
      const product = products.find(p => p.id === line.productId);
      const unitsPerPack = line.variantId ? 1 : product?.unitsPerPack ?? 0;
      return { productId: line.productId, variantId: line.variantId || undefined,
        packs: Number(line.packs), unitsPerPack,
        costPerPack: line.costPerPack.trim() === '' ? undefined : Number(line.costPerPack) };
    });
    if (submitted.some(line => !line.productId || !Number.isInteger(line.packs) || line.packs <= 0 ||
      line.packs > 10000 || !line.unitsPerPack || !Number.isSafeInteger(line.packs * line.unitsPerPack) ||
      line.packs * line.unitsPerPack > 1_000_000 || !validMoney(line.costPerPack === undefined ? '' : String(line.costPerPack), false))) {
      setError('Revisa cada producto, variante, número de cajas/piezas y costo opcional'); return;
    }
    const ids = submitted.map(line => `${line.productId}:${line.variantId ?? ''}`);
    if (new Set(ids).size !== ids.length) { setError('Agrupa los renglones repetidos de un mismo producto y talla'); return; }
    if (!window.confirm(`¿Confirmas la entrada de ${submitted.reduce((sum, line) => sum + line.packs * line.unitsPerPack, 0)} unidades? Se modificará el inventario.`)) return;
    const nextOperationId = operationId || crypto.randomUUID();
    setOperationId(nextOperationId); setBusy(true);
    try {
      const receipt = await api<Receipt>('catalog/receipt', { method: 'POST', body: JSON.stringify({
        companyId, operationId: nextOperationId, sourceName: sourceName.trim(), reference: reference.trim() || undefined,
        lines: submitted,
      }) });
      await reload(); setLines([emptyLine()]); setSourceName(''); setReference(''); setOperationId('');
      setMessage(`Recepción ${receipt.repeated ? 'ya registrada (sin duplicar)' : 'registrada'}: ${receipt.movements.reduce((sum, movement) => sum + movement.quantity, 0)} unidades.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se registró la recepción. Reintenta sin cambiar los datos.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#07101f] p-4 text-slate-100 md:p-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-emerald-400">YALIKA · POS</p><h1 className="text-3xl font-bold">Productos e inventario</h1>
          <p className="text-sm text-slate-400">Un catálogo para tienda y sitio web opcional. Ventas por pieza; cajas de venta pendientes de habilitar en caja.</p></div>
        <nav className="flex gap-3 text-sm"><Link className="rounded-lg border border-slate-600 px-4 py-2" href="/pos">Volver a cobrar</Link>
          <Link className="rounded-lg border border-slate-600 px-4 py-2" href="/sites">Página web opcional</Link></nav>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-500 bg-red-950 p-3 text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-600 bg-emerald-950 p-3 text-emerald-200">{message}</p>}
      {loading && <p>Consultando catálogo...</p>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <h2 className="text-xl font-semibold">Catálogo ({filtered.length})</h2>
          <input className={field} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar producto, SKU o talla" aria-label="Buscar productos" />
          <div className="flex flex-wrap gap-2"><button className={action} disabled={!selected.length || busy} onClick={() => void bulkVisibility(true)}>Mostrar en web ({selected.length})</button>
            <button className="rounded-lg border border-slate-500 px-4 py-2 disabled:opacity-40" disabled={!selected.length || busy} onClick={() => void bulkVisibility(false)}>Ocultar en web</button></div>
          <p className="text-xs text-slate-400">La selección masiva sólo cambia visibilidad web; no altera precio, compras ni existencias.</p>
          <div className="max-h-[580px] space-y-2 overflow-auto">
            {filtered.map(product => <div key={product.id} className={`flex items-center gap-3 rounded-xl border p-3 ${active === product.id ? 'border-emerald-500' : 'border-slate-700'}`}>
              <input type="checkbox" aria-label={`Seleccionar ${product.name}`} checked={selected.includes(product.id)} onChange={event => setSelected(prev => event.target.checked ? [...prev, product.id] : prev.filter(id => id !== product.id))} />
              {product.images[0] && <img src={product.images.find(image => image.isPrimary)?.url ?? product.images[0].url} alt="" className="h-12 w-12 rounded object-contain" />}
              <button className="min-w-0 flex-1 text-left" onClick={() => chooseProduct(product)}><strong className="block truncate">{product.name}</strong><span className="text-xs text-slate-400">{product.sku || 'Sin SKU'} · {money.format(product.price)} · Existencia: {product.variants.length ? product.variants.reduce((a,v)=>a+v.stock,0) : product.stock}</span>
                <span className="block text-xs text-cyan-300">{product.webVisible ? 'Marcado para web' : 'Sólo POS'}{product.variants.length ? ` · ${product.variants.length} variantes` : ''}</span></button>
            </div>)}
          </div>
        </section>
        <div className="space-y-5">
          <form onSubmit={createProduct} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <h2 className="text-xl font-semibold">1 · Crear producto</h2>
            <label className="block text-sm">Nombre<input className={field} value={name} onChange={e => setName(e.target.value)} required maxLength={180} /></label>
            <label className="block text-sm">Código / SKU (opcional)<input className={field} value={sku} onChange={e => setSku(e.target.value)} maxLength={80} /></label>
            <label className="block text-sm">Precio de venta por pieza<input className={field} type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} required /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={clothing} onChange={e=>setClothing(e.target.checked)} /> Ropa con tallas</label>
            {clothing ? <div className="flex flex-wrap gap-2">{sizeLabels.map(size=><label key={size} className="rounded border border-slate-600 p-2 text-sm"><input type="checkbox" checked={sizeSelection.includes(size)} onChange={e=>setSizeSelection(prev=>e.target.checked ? [...prev,size] : prev.filter(v=>v!==size))} /> {size}</label>)}
              <p className="text-xs text-slate-400">Se crean tallas con existencia cero; registra cuántas recibiste en cada talla.</p></div> : <>
              <label className="block text-sm">Piezas que contiene cada caja<input className={field} type="number" min="1" step="1" value={packs} onChange={e=>setPacks(e.target.value)} /></label>
              <label className="block text-sm">Costo de compra por caja (opcional)<input className={field} type="number" min="0" step="0.01" value={unitCostBox} onChange={e=>setUnitCostBox(e.target.value)} placeholder="En blanco si no lo sabes" /></label>
              <label className="block text-sm">Precio de venta por caja (opcional; pendiente en caja)<input className={field} type="number" min="0" step="0.01" value={packSalePrice} onChange={e=>setPackSalePrice(e.target.value)} /></label>
              {createCost !== null && validMoney(price) && <p className="text-sm text-emerald-300">Costo unitario {money.format(createCost)} · Ganancia bruta estimada {money.format(Number(price)-createCost)}</p>}
            </>}
            <label className="block text-sm">Foto (opcional; cámara en móvil)<input className={field} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={e=>setPhotoFile(e.target.files?.[0] ?? null)} /></label>
            <button className={action} type="submit" disabled={busy}>Crear sin inventar existencias</button>
          </form>
          {current && <form onSubmit={saveEdit} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <h2 className="text-xl font-semibold">2 · Editar {current.name}</h2>
            <label className="block text-sm">Precio por pieza<input className={field} type="number" min="0" step="0.01" value={editPrice} onChange={e=>setEditPrice(e.target.value)} /></label>
            <label className="block text-sm">Unidades por caja<input className={field} type="number" min="1" step="1" value={editPack} onChange={e=>setEditPack(e.target.value)} /></label>
            <label className="block text-sm">Costo por caja (opcional)<input className={field} type="number" min="0" step="0.01" value={editCost} onChange={e=>setEditCost(e.target.value)} /></label>
            <label className="block text-sm">Precio de venta por caja (opcional; pendiente en caja)<input className={field} type="number" min="0" step="0.01" value={editBoxPrice} onChange={e=>setEditBoxPrice(e.target.value)} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editVisible} onChange={e=>setEditVisible(e.target.checked)} /> Mostrar producto en página web cuando esté publicada</label>
            <label className="block text-sm">Agregar fotografía<input className={field} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={e=>setEditPhoto(e.target.files?.[0] ?? null)} /></label>
            {currentMargin === null ? <p className="text-sm text-amber-300">Costo desconocido: no es posible calcular ganancia.</p> : <p className="text-sm text-emerald-300">Ganancia bruta por pieza: {money.format(currentMargin)} (antes de gastos, impuestos y descuentos).</p>}
            {current.variants.length > 0 && <p className="text-xs text-slate-400">Tallas: {current.variants.map(variant=>`${variant.name} ${variant.stock}`).join(' · ')}. Precio y costo particular por talla: próximo ajuste.</p>}
            <button className={action} type="submit" disabled={busy}>Guardar ficha sin cambiar stock</button>
          </form>}
          {current && <section className="space-y-3 rounded-2xl border border-cyan-700/60 bg-slate-950 p-4">
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
                <p className="mt-2 text-xs text-slate-400">{barcode.generated ? 'Interno Yaleka' : 'Código existente'} · {barcode.kind === 'pack' ? `Caja/paquete: ${barcode.unitsPerScan} unidades` : 'Pieza'}</p>
              </div>)}
              {barcodes.length === 0 ? <p className="text-sm text-slate-400">Aún no hay códigos vinculados.</p> : null}
            </div>
          </section>}
        </div>
      </div>
      <form onSubmit={receive} className="space-y-4 rounded-2xl border border-emerald-700 bg-slate-950 p-4">
        <h2 className="text-2xl font-semibold">3 · Recepción de mercancía</h2>
        <p className="text-sm text-slate-400">Sólo este formulario suma existencias de venta y deja un comprobante. Costo vacío = desconocido, no cero.</p>
        <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Proveedor / origen<input className={field} value={sourceName} onChange={e=>{setSourceName(e.target.value);setOperationId('');}} required maxLength={150} /></label>
          <label className="text-sm">Referencia de compra (opcional)<input className={field} value={reference} onChange={e=>{setReference(e.target.value);setOperationId('');}} maxLength={100} /></label></div>
        {lines.map((line,index)=>{
          const product = products.find(p=>p.id===line.productId);
          const unitCount = product ? (line.variantId ? 1 : product.unitsPerPack) : 0;
          const quantity = Number(line.packs)*unitCount;
          return <div key={index} className="grid gap-2 rounded-xl border border-slate-700 p-3 md:grid-cols-5">
            <label className="text-sm md:col-span-2">Producto<select className={field} value={line.productId} onChange={e=>changeLine(index,{productId:e.target.value})}><option value="">Selecciona producto</option>{products.filter(p=>p.trackInventory && p.status==='active').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {product && product.variants.length > 0 && <label className="text-sm">Talla / variante<select className={field} value={line.variantId} onChange={e=>changeLine(index,{variantId:e.target.value})}><option value="">Selecciona talla</option>{product.variants.filter(v=>v.status==='active').map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
            <label className="text-sm">{line.variantId ? 'Piezas' : 'Cajas / paquetes'}<input className={field} type="number" min="1" step="1" value={line.packs} onChange={e=>changeLine(index,{packs:e.target.value})} /></label>
            <label className="text-sm">Costo por {line.variantId?'pieza':'caja'} (opcional)<input className={field} type="number" min="0" step="0.01" value={line.costPerPack} onChange={e=>changeLine(index,{costPerPack:e.target.value})} /></label>
            <div className="flex items-center justify-between gap-2 text-sm"><span>{Number.isFinite(quantity) ? quantity : '—'} unidades</span><button className="rounded border border-red-700 px-2 py-1 text-red-200" type="button" disabled={lines.length===1} onClick={()=>{setLines(prev=>prev.filter((_,i)=>i!==index));setOperationId('');}}>Quitar</button></div>
          </div>;
        })}
        <button className="rounded border border-slate-600 px-4 py-2" type="button" disabled={lines.length>=100} onClick={()=>{setLines(prev=>[...prev,emptyLine()]);setOperationId('');}}>+ Otro artículo</button>
        <button className={action} type="submit" disabled={busy || loading}>Confirmar entrada y guardar comprobante</button>
        {operationId && <p className="text-xs text-amber-300">Si falló la red, reintenta sin editar: se reutiliza el identificador para evitar duplicar existencias.</p>}
      </form>
      <section className="rounded-2xl border border-slate-700 bg-slate-950 p-4"><h2 className="mb-3 text-xl font-semibold">Últimas recepciones</h2>
        {receipts.length===0 && <p className="text-sm text-slate-400">Todavía no hay recepciones registradas con R7.</p>}
        {receipts.map(receipt=><p key={receipt.id} className="border-b border-slate-800 py-2 text-sm">{new Date(receipt.createdAt).toLocaleString('es-MX')} · {receipt.sourceName} · {receipt.movements.reduce((sum,item)=>sum+item.quantity,0)} unidades · <span className="font-mono text-xs">{receipt.id.slice(0,8)}</span></p>)}
      </section>
    </div>
  </main>;
}

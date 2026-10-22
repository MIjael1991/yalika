
'use client';

import Link from 'next/link';
import { groupByCatalog, namedCatalogs, type CatalogRef } from '../../../lib/yalika-pos-groups';
import { StockAlertsPanel } from './stock-alerts-panel';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

type Variant = { id: string; name: string; stock: number; status: string };
type Product = {
  catalogId?: string | null; category?: { id: string; name: string } | null;
  id: string; name: string; sku: string | null; stock: number; status: string; trackInventory: boolean;
  unitsPerPack: number; unitCost: number | null; variants: Variant[];
};
type ReceiptLine = { productId: string; variantId: string; packs: string; costPerPack: string };
type Receipt = { id: string; sourceName: string; reference: string | null; createdAt: string; movements: Array<{ quantity: number }> };

const field = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400';
const primary = 'rounded-xl bg-emerald-500 px-4 py-2.5 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40';

function apiMessage(payload: unknown) {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const value = (payload as { message: unknown }).message;
    return Array.isArray(value) ? value.join('; ') : String(value);
  }
  return 'No se completó la operación';
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika/${path}`, {
    ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(apiMessage(body));
  return body as T;
}
function line(productId = ''): ReceiptLine { return { productId, variantId: '', packs: '1', costPerPack: '' }; }

export function InventoryWorkspace({ companyId }: { companyId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogRef[]>([]);
  const [lines, setLines] = useState<ReceiptLine[]>([line()]);
  const [sourceName, setSourceName] = useState('');
  const [reference, setReference] = useState('');
  const [operationId, setOperationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [alertsKey, setAlertsKey] = useState(0);

  const reload = useCallback(async () => {
    const [catalog, history] = await Promise.all([
      api<Product[]>(`catalog/product/company/${encodeURIComponent(companyId)}`),
      api<Receipt[]>(`catalog/receipt/company/${encodeURIComponent(companyId)}`),
    ]);
    setProducts(catalog); setReceipts(history);
    try { setCatalogs(await api<Array<{ id: string; name: string }>>(`catalog/commerce/company/${encodeURIComponent(companyId)}`)); } catch { setCatalogs([]); }
  }, [companyId]);

  useEffect(() => {
    let alive = true; setLoading(true);
    void reload().catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar inventario'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reload]);

  const activeProducts = useMemo(() => products.filter(p => p.status === 'active' && p.trackInventory), [products]);
  const productGroups = useMemo(() => groupByCatalog(activeProducts.map((p) => ({
    key: p.id, catalogId: p.catalogId, categoryId: p.category?.id, categoryName: p.category?.name ?? 'Sin categoría',
    trackInventory: p.trackInventory, stock: p.variants.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock, product: p,
  })), catalogs), [activeProducts, catalogs]);
  const catalogLabel = useMemo(() => {
    const names = new Map(namedCatalogs(catalogs).map((c) => [c.id, c.name]));
    return (id?: string | null) => (id ? names.get(id) : undefined);
  }, [catalogs]);
  const lowStock = useMemo(() => activeProducts.map((p) => ({
    ...p, totalStock: p.variants.length ? p.variants.reduce((sum, v) => sum + v.stock, 0) : p.stock,
  })).filter(p => p.totalStock <= 3).sort((a,b) => a.totalStock - b.totalStock), [activeProducts]);
  const totalUnits = useMemo(() => activeProducts.reduce((sum,p) => sum + (p.variants.length ? p.variants.reduce((s,v)=>s+v.stock,0) : p.stock),0), [activeProducts]);

  function changeLine(index: number, patch: Partial<ReceiptLine>) {
    setLines(current => current.map((item, i) => i === index ? { ...item, ...patch, ...(patch.productId ? { variantId: '' } : {}) } : item));
    setOperationId('');
  }

  async function receive(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(''); setMessage('');
    if (!sourceName.trim()) { setError('Indica proveedor u origen.'); return; }
    const submitted = lines.map(item => {
      const product = products.find(p => p.id === item.productId);
      const unitsPerPack = item.variantId ? 1 : product?.unitsPerPack ?? 0;
      return { productId: item.productId, variantId: item.variantId || undefined, packs: Number(item.packs), unitsPerPack,
        costPerPack: item.costPerPack.trim() === '' ? undefined : Number(item.costPerPack) };
    });
    if (submitted.some(item => !item.productId || !Number.isInteger(item.packs) || item.packs < 1 || item.packs > 10000 || !item.unitsPerPack ||
      item.packs * item.unitsPerPack > 1_000_000 || (item.costPerPack !== undefined && (!Number.isFinite(item.costPerPack) || item.costPerPack < 0)))) {
      setError('Revisa artículos, cantidades y costos.'); return;
    }
    const seen = new Set<string>();
    for (const item of submitted) {
      const key = `${item.productId}:${item.variantId ?? ''}`;
      if (seen.has(key)) { setError('El mismo producto o variante no puede aparecer dos veces en la misma recepción.'); return; }
      seen.add(key);
    }
    const op = operationId || crypto.randomUUID();
    if (!operationId) setOperationId(op);
    setBusy(true);
    try {
      const result = await api<{ repeated?: boolean; movements: Array<{ quantity: number }> }>('catalog/receipt', {
        method: 'POST', body: JSON.stringify({ companyId, operationId: op, sourceName: sourceName.trim(),
          reference: reference.trim() || undefined, lines: submitted }),
      });
      const units = result.movements.reduce((sum, item) => sum + item.quantity, 0);
      setMessage(result.repeated ? `La recepción ya existía. No se duplicó inventario (${units} unidades).` : `Entrada registrada: ${units} unidades.`);
      if (!result.repeated) { setSourceName(''); setReference(''); setLines([line()]); setOperationId(''); }
      await reload();
      setAlertsKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se registró la recepción');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#07101f] px-4 py-6 text-slate-100 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-400">Yalika · POS</p>
            <h1 className="mt-1 text-3xl font-bold">Inventario</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Recibe mercancía con comprobante e idempotencia. Una caja suma sus piezas al mismo inventario: no se crean existencias dobles.</p>
          </div>
          <Link href="/pos/productos" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm">Administrar productos y códigos</Link>
        </header>

        {error ? <p role="alert" className="rounded-xl border border-red-500/50 bg-red-950/50 p-3 text-red-200">{error}</p> : null}
        {message ? <p role="status" className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3 text-emerald-100">{message}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">Productos controlados</p><p className="mt-2 text-3xl font-bold">{activeProducts.length}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">Unidades registradas</p><p className="mt-2 text-3xl font-bold">{totalUnits}</p></div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-xs uppercase text-amber-300">Existencia baja ≤ 3</p><p className="mt-2 text-3xl font-bold text-amber-200">{lowStock.length}</p></div>
        </section>

        <StockAlertsPanel companyId={companyId} catalogs={catalogs} reloadKey={alertsKey} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={receive} className="space-y-4 rounded-2xl border border-emerald-700/50 bg-slate-950 p-4 md:p-5">
            <div><h2 className="text-xl font-semibold">Entrada de mercancía</h2><p className="text-sm text-slate-400">Costo vacío significa desconocido; Yalika no lo convierte en cero.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Proveedor / origen<input className={field} value={sourceName} onChange={e=>{setSourceName(e.target.value);setOperationId('');}} required maxLength={150} /></label>
              <label className="text-sm">Referencia (opcional)<input className={field} value={reference} onChange={e=>{setReference(e.target.value);setOperationId('');}} maxLength={100} /></label>
            </div>
            {lines.map((item,index) => {
              const product = products.find(p => p.id === item.productId);
              const unitsPerPack = item.variantId ? 1 : product?.unitsPerPack ?? 0;
              const quantity = Number(item.packs) * unitsPerPack;
              return (
                <div key={index} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 md:grid-cols-5">
                  <label className="text-sm md:col-span-2">Producto<select className={field} value={item.productId} onChange={e=>changeLine(index,{productId:e.target.value})}><option value="">Selecciona</option>{productGroups.map(g=><optgroup key={g.id} label={g.name}>{g.categories.flatMap(c=>c.items).map(({product:p})=><option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ''}</option>)}</optgroup>)}</select></label>
                  {product?.variants.length ? <label className="text-sm">Variante<select className={field} value={item.variantId} onChange={e=>changeLine(index,{variantId:e.target.value})}><option value="">Selecciona</option>{product.variants.filter(v=>v.status==='active').map(v=><option key={v.id} value={v.id}>{v.name} · hay {v.stock}</option>)}</select></label> : <div />}
                  <label className="text-sm">{item.variantId ? 'Piezas' : 'Cajas / paquetes'}<input className={field} type="number" min="1" max="10000" step="1" value={item.packs} onChange={e=>changeLine(index,{packs:e.target.value})} /></label>
                  <label className="text-sm">Costo por {item.variantId ? 'pieza' : 'caja'}<input className={field} type="number" min="0" step="0.01" value={item.costPerPack} onChange={e=>changeLine(index,{costPerPack:e.target.value})} placeholder="Opcional" /></label>
                  <div className="md:col-span-5 flex items-center justify-between text-xs text-slate-400"><span>{Number.isFinite(quantity) ? `${quantity} unidades entrarán a existencia` : '—'}</span><button type="button" disabled={lines.length===1} onClick={()=>{setLines(current=>current.filter((_,i)=>i!==index));setOperationId('');}} className="text-red-300 disabled:opacity-30">Quitar</button></div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={lines.length>=100} onClick={()=>{setLines(current=>[...current,line()]);setOperationId('');}} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">+ Otro artículo</button>
              <button type="submit" className={primary} disabled={busy || loading}>{busy ? 'Guardando…' : 'Confirmar entrada'}</button>
            </div>
            {operationId ? <p className="text-xs text-amber-300">Si la red falla, reintenta sin editar: se conserva el identificador para no duplicar inventario.</p> : null}
          </form>

          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div><h2 className="text-lg font-semibold">Existencia baja</h2><p className="text-xs text-slate-500">Sólo alerta; no compra ni modifica existencias.</p></div>
            {lowStock.length === 0 ? <p className="text-sm text-emerald-300">Sin productos en nivel bajo.</p> : lowStock.slice(0,20).map(p => (
              <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex justify-between gap-3"><strong>{p.name}</strong><span className="text-amber-200">{p.totalStock}</span></div>
                <p className="text-xs text-slate-500">{catalogLabel(p.catalogId) ? `${catalogLabel(p.catalogId)} · ` : ''}{p.sku || 'Sin SKU'} · {p.unitsPerPack} por caja</p>
              </div>
            ))}
          </section>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <h2 className="text-lg font-semibold">Últimas recepciones</h2>
          {receipts.length === 0 ? <p className="mt-3 text-sm text-slate-500">Todavía no hay recepciones.</p> : (
            <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Origen</th><th className="py-2 pr-4">Referencia</th><th className="py-2">Unidades</th></tr></thead><tbody>{receipts.slice(0,30).map(r=><tr key={r.id} className="border-t border-slate-800"><td className="py-2 pr-4">{new Date(r.createdAt).toLocaleString('es-MX')}</td><td className="py-2 pr-4">{r.sourceName}</td><td className="py-2 pr-4 text-slate-400">{r.reference || '—'}</td><td className="py-2">{r.movements.reduce((sum,m)=>sum+m.quantity,0)}</td></tr>)}</tbody></table></div>
          )}
        </section>
      </div>
    </main>
  );
}

 'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [['Caja', '/pos'], ['Productos', '/pos/productos'], ['Historial de ventas', '/pos/ventas'], ['Devoluciones', '/pos/devoluciones'], ['Cuentas pendientes', '/pos/cuentas']];
export function PosNavigation() {
  const path = usePathname();
  return <nav aria-label="Punto de venta" className="flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-950 p-4 text-sm text-slate-200">{links.map(([name, href]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={`whitespace-nowrap rounded-xl px-4 py-2 ${path === href ? 'bg-cyan-300 text-slate-950' : 'bg-white/5 hover:bg-white/10'}`}>{name}</Link>)}</nav>;
}

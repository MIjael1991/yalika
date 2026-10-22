'use client';

import { useState, type CSSProperties } from 'react';

type Fields = { name: string; role: string; phone: string; email: string; address: string; instagram: string; facebook: string };
type Colors = { bg: string; fg: string; accent: string; onAccent: string; deep: string };

const LABELS: Array<[keyof Fields, string]> = [
  ['name', 'Nombre'],
  ['role', 'Puesto o giro'],
  ['phone', 'Teléfono / WhatsApp'],
  ['email', 'Correo (opcional)'],
  ['address', 'Dirección (opcional)'],
  ['instagram', 'Instagram (opcional)'],
  ['facebook', 'Facebook (opcional)'],
];

export function TarjetaEditor({ initial, colors, publicUrl, qrDataUrl, localOnly }: { initial: Fields; colors: Colors; publicUrl: string; qrDataUrl: string; localOnly: boolean }) {
  const [f, setF] = useState<Fields>(initial);
  const set = (key: keyof Fields) => (value: string) => setF((current) => ({ ...current, [key]: value.slice(0, 80) }));
  const card: CSSProperties = { width: 'min(90mm, 100%)', aspectRatio: '9 / 5', borderRadius: '3mm', overflow: 'hidden', position: 'relative', boxShadow: '0 10px 24px -14px rgba(0,0,0,.5)', breakInside: 'avoid' };
  const lines = [f.phone, f.email, f.address, f.instagram, f.facebook].filter((v) => v.trim());

  return (
    <main className="min-h-screen bg-[#07111f] p-4 text-white md:p-8 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto max-w-4xl">
        <div className="print:hidden">
          <p className="text-xs font-black uppercase tracking-[.28em] text-emerald-300">Yalika · Tarjeta de presentación</p>
          <h1 className="mt-2 text-3xl font-black">Tarjeta opcional</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Se imprime solo si el cliente la pide. Usa los colores de su página y lleva el QR para entrar a ella. Los datos que escribas aquí no se guardan; sirven para esta impresión.</p>
          {localOnly ? <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-xs text-amber-100">El QR apunta a localhost porque estás trabajando en local. En producción usará el dominio público.</p> : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {LABELS.map(([key, label]) => (
              <label key={key} className="grid gap-1 text-xs font-bold text-slate-300">
                {label}
                <input value={f[key]} onChange={(e) => set(key)(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-normal text-white" />
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => window.print()} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950">Imprimir tarjeta</button>
            <a href="/sites" className="rounded-xl border border-white/10 px-5 py-3 font-bold">← Mis páginas</a>
          </div>
        </div>

        <div className="mt-8 grid justify-items-start gap-6 sm:grid-cols-2 print:mt-0 print:grid-cols-1 print:gap-4 print:p-[10mm]">
          <div>
            <div style={{ ...card, background: colors.bg, color: colors.fg, padding: '5mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ position: 'absolute', right: '-8mm', top: '-8mm', width: '30mm', height: '30mm', borderRadius: '50%', background: colors.accent, opacity: 0.18 }} />
              <div style={{ position: 'relative' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>{f.name || ' '}</p>
                <p style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: '.08em', textTransform: 'uppercase' }}>{f.role}</p>
              </div>
              <div style={{ position: 'relative', fontSize: 11, fontWeight: 600, display: 'grid', gap: 2, wordBreak: 'break-word' }}>
                {lines.map((line) => <span key={line}>{line}</span>)}
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '2mm', background: colors.accent }} />
            </div>
            <p className="mt-2 text-xs text-slate-400 print:hidden">Frente</p>
          </div>
          <div>
            <div style={{ ...card, background: colors.accent, color: colors.onAccent, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '4mm' }}>
              <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <img src={qrDataUrl} alt={`QR de ${f.name}`} style={{ width: '24mm', height: '24mm', background: '#fff', padding: '1.5mm', borderRadius: '2mm' }} />
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 800, lineHeight: 1.1 }}>{f.name}</p>
                <p style={{ fontSize: 9, opacity: 0.85, wordBreak: 'break-all' }}>{publicUrl.replace(/^https?:\/\//, '')}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400 print:hidden">Reverso</p>
          </div>
        </div>
      </div>
    </main>
  );
}

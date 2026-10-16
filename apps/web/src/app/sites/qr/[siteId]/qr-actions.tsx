'use client';

import { useState } from 'react';

export function QrActions({ url, qrDataUrl, slug }: { url: string; qrDataUrl: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-3 print:hidden">
      <button onClick={() => void copy()} className="rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950">{copied ? 'Copiado ✓' : 'Copiar enlace'}</button>
      <button onClick={() => window.print()} className="rounded-xl border border-white/10 px-4 py-3 font-bold">Imprimir QR</button>
      <a href={qrDataUrl} download={`QR-${slug}.png`} className="rounded-xl border border-white/10 px-4 py-3 text-center font-bold">Guardar QR</a>
    </div>
  );
}

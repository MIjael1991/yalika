'use client';

import { useRef, useState } from 'react';

const CODE39: Record<string, string> = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn',
};

/** Abre una ventana solo con las etiquetas (no la pantalla completa) y lanza la impresión. */
function printLabels(html: string, copies: number) {
  const popup = window.open('', '_blank', 'width=520,height=640');
  if (!popup) return false;
  const labels = Array.from({ length: copies }, () => `<div class="l">${html}</div>`).join('');
  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>` +
      `body{margin:8mm;font-family:sans-serif}.g{display:flex;flex-wrap:wrap;gap:4mm}` +
      `.l{break-inside:avoid;border:1px dashed #999;padding:2mm;text-align:center}` +
      `svg{width:60mm;height:auto}.c{font-size:9px}.v{font-family:monospace;font-weight:bold;font-size:12px}` +
      `</style></head><body><div class="g">${labels}</div></body></html>`,
  );
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
  return true;
}

export function Code39Label({ value, caption }: { value: string; caption?: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [printError, setPrintError] = useState('');
  const normalized = value.toUpperCase().replace(/[^0-9A-Z. $/+%\-]/g, '-');
  const encoded = `*${normalized}*`;
  let x = 10;
  const bars: Array<{ x: number; width: number }> = [];
  for (const char of encoded) {
    const pattern = CODE39[char] ?? CODE39['-'];
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i] === 'w' ? 3 : 1;
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += 1;
  }
  const width = Math.max(x + 10, 220);
  return (
    <div className="inline-flex flex-col items-center rounded-xl bg-white p-3 text-slate-950 print:border print:border-black">
      <div ref={bodyRef} className="flex flex-col items-center">
      <svg viewBox={`0 0 ${width} 64`} className="h-20 w-64 max-w-full" role="img" aria-label={`Código ${normalized}`}>
        <rect width={width} height="64" fill="white" />
        {bars.map((bar, index) => <rect key={index} x={bar.x} y="4" width={bar.width} height="48" fill="black" />)}
      </svg>
      <span className="v font-mono text-xs font-bold tracking-wider">{normalized}</span>
      {caption ? <span className="c mt-1 text-center text-[10px] text-slate-600">{caption}</span> : null}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs print:hidden">
        <label className="flex items-center gap-1">
          Copias
          <input
            type="number"
            min={1}
            max={60}
            value={copies}
            onChange={(event) => setCopies(Math.min(60, Math.max(1, Math.floor(Number(event.target.value)) || 1)))}
            className="h-8 w-14 rounded border border-slate-300 px-1 text-slate-950"
          />
        </label>
        <button
          type="button"
          onClick={() => setPrintError(bodyRef.current && printLabels(bodyRef.current.innerHTML, copies) ? '' : 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para Yalika.')}
          className="rounded bg-slate-900 px-3 py-1.5 font-semibold text-white"
        >
          Imprimir etiqueta
        </button>
      </div>
      {printError ? <span className="mt-1 text-[11px] text-red-700">{printError}</span> : null}
    </div>
  );
}

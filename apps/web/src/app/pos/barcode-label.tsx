'use client';

const CODE39: Record<string, string> = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn',
};

export function Code39Label({ value, caption }: { value: string; caption?: string }) {
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
      <svg viewBox={`0 0 ${width} 64`} className="h-20 w-64 max-w-full" role="img" aria-label={`Código ${normalized}`}>
        <rect width={width} height="64" fill="white" />
        {bars.map((bar, index) => <rect key={index} x={bar.x} y="4" width={bar.width} height="48" fill="black" />)}
      </svg>
      <span className="font-mono text-xs font-bold tracking-wider">{normalized}</span>
      {caption ? <span className="mt-1 text-center text-[10px] text-slate-600">{caption}</span> : null}
    </div>
  );
}

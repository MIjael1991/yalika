// Ilustraciones propias de las plantillas Yalika (SVG escrito en código).
// Son estáticas y sin dependencias: no cuestan nada, no se rompen sin internet y
// hacen que ninguna plantilla se vea vacía. Los colores salen solo de las plantillas,
// nunca de datos escritos por usuarios.

export type Pal = { a: string; b: string; bg: string };

const svg = (vb: string, inner: string, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;

const n1 = (v: number) => v.toFixed(1);
const id = (s: string) => s.replace(/[^a-z0-9]/gi, '');

/* ---------- piezas pequeñas ---------- */
const estrella = (x: number, y: number, r: number, c: string) => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p.push(`${n1(x + Math.cos(t) * rr)},${n1(y + Math.sin(t) * rr)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${c}"/>`;
};
const flor = (x: number, y: number, r: number, c1: string, c2: string) => {
  let s = '';
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    s += `<circle cx="${n1(x + Math.cos(t) * r * 0.62)}" cy="${n1(y + Math.sin(t) * r * 0.62)}" r="${n1(r * 0.42)}" fill="${c1}"/>`;
  }
  return s + `<circle cx="${x}" cy="${y}" r="${n1(r * 0.4)}" fill="${c2}"/>`;
};
const vela = (x: number, y: number, s: number, c: string) =>
  `<rect x="${n1(x - 6 * s)}" y="${n1(y - 30 * s)}" width="${n1(12 * s)}" height="${n1(40 * s)}" rx="${n1(2 * s)}" fill="${c}"/>` +
  `<path d="M${x} ${n1(y - 52 * s)} q${n1(8 * s)} ${n1(12 * s)} 0 ${n1(20 * s)} q${n1(-8 * s)} ${n1(-8 * s)} 0 ${n1(-20 * s)}Z" fill="#ffd166"/>`;
const corazon = (x: number, y: number, s: number, c: string) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 12 C-18 -2 -8 -16 0 -6 C8 -16 18 -2 0 12Z" fill="${c}"/>`;
const copo = (x: number, y: number, r: number) =>
  `<g stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".9">` +
  [0, 60, 120].map((a) => `<line x1="${n1(x - r)}" y1="${y}" x2="${n1(x + r)}" y2="${y}" transform="rotate(${a} ${x} ${y})"/>`).join('') +
  `</g>`;
const esfera = (x: number, y: number, r: number, c: string) =>
  `<rect x="${n1(x - 4)}" y="${n1(y - r - 7)}" width="8" height="8" rx="1" fill="#f5c451"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${n1(x - r * 0.35)}" cy="${n1(y - r * 0.35)}" r="${n1(r * 0.2)}" fill="#fff" opacity=".5"/>`;
const regalo = (x: number, y: number, s: number, c1: string, c2: string) =>
  `<rect x="${n1(x - 26 * s)}" y="${n1(y - 20 * s)}" width="${n1(52 * s)}" height="${n1(40 * s)}" rx="${n1(3 * s)}" fill="${c1}"/>` +
  `<rect x="${n1(x - 5 * s)}" y="${n1(y - 20 * s)}" width="${n1(10 * s)}" height="${n1(40 * s)}" fill="${c2}"/>` +
  `<rect x="${n1(x - 26 * s)}" y="${n1(y - 4 * s)}" width="${n1(52 * s)}" height="${n1(8 * s)}" fill="${c2}"/>` +
  `<circle cx="${n1(x - 9 * s)}" cy="${n1(y - 27 * s)}" r="${n1(8 * s)}" fill="none" stroke="${c2}" stroke-width="${n1(4 * s)}"/><circle cx="${n1(x + 9 * s)}" cy="${n1(y - 27 * s)}" r="${n1(8 * s)}" fill="none" stroke="${c2}" stroke-width="${n1(4 * s)}"/>`;
const arbol = (x: number, y: number, s: number, c: string) =>
  `<rect x="${n1(x - 5 * s)}" y="${n1(y)}" width="${n1(10 * s)}" height="${n1(16 * s)}" fill="#6b4a2f"/>` +
  `<polygon points="${x},${n1(y - 70 * s)} ${n1(x - 34 * s)},${n1(y - 22 * s)} ${n1(x + 34 * s)},${n1(y - 22 * s)}" fill="${c}"/>` +
  `<polygon points="${x},${n1(y - 52 * s)} ${n1(x - 42 * s)},${n1(y + 2 * s)} ${n1(x + 42 * s)},${n1(y + 2 * s)}" fill="${c}"/>` +
  estrella(x, y - 74 * s, 8 * s, '#ffd166') +
  `<circle cx="${n1(x - 14 * s)}" cy="${n1(y - 8 * s)}" r="${n1(4 * s)}" fill="#e8433f"/><circle cx="${n1(x + 16 * s)}" cy="${n1(y - 14 * s)}" r="${n1(4 * s)}" fill="#f5c451"/><circle cx="${n1(x)}" cy="${n1(y - 34 * s)}" r="${n1(4 * s)}" fill="#e8433f"/>`;
const papel = (y: number, cols: string[], n = 8) => {
  const w = 400 / n;
  let s = `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#ffffff" stroke-opacity=".5" stroke-width="2"/>`;
  for (let i = 0; i < n; i++) {
    const x = i * w + 4;
    const half = (w - 8) / 2;
    s += `<path d="M${n1(x)} ${y} h${n1(w - 8)} v34 l${n1(-half)} -8 l${n1(-half)} 8Z" fill="${cols[i % cols.length]}"/><circle cx="${n1(x + half)}" cy="${y + 13}" r="5" fill="#1d0b2e" fill-opacity=".35"/>`;
  }
  return s;
};
const etiqueta = (c: string, t: string) =>
  `<g transform="translate(100 82) rotate(-12)"><path d="M-52 -26 H26 L56 0 L26 26 H-52Z" fill="${c}"/><circle cx="-36" cy="0" r="6" fill="#ffffff"/><text x="-18" y="9" font-size="26" font-weight="800" fill="#ffffff" font-family="system-ui,Arial,sans-serif">${t}</text></g>`;
const bolsaCompra = (x: number, y: number, s: number, c: string) =>
  `<path d="M${n1(x - 24 * s)} ${n1(y - 16 * s)} H${n1(x + 24 * s)} L${n1(x + 28 * s)} ${n1(y + 30 * s)} H${n1(x - 28 * s)}Z" fill="${c}"/>` +
  `<path d="M${n1(x - 12 * s)} ${n1(y - 16 * s)} q0 ${n1(-18 * s)} ${n1(12 * s)} ${n1(-18 * s)} q${n1(12 * s)} 0 ${n1(12 * s)} ${n1(18 * s)}" fill="none" stroke="${c}" stroke-width="${n1(4 * s)}"/>`;
const pan = (x: number, y: number, r: number) => {
  let s = `<circle cx="${x}" cy="${y}" r="${r}" fill="#c98b4a"/><circle cx="${n1(x - r * 0.3)}" cy="${n1(y - r * 0.35)}" r="${n1(r * 0.3)}" fill="#d9a066" opacity=".6"/>`;
  for (const a of [0, 90, 180, 270]) s += `<rect x="${n1(x - r * 0.1)}" y="${n1(y - r * 0.95)}" width="${n1(r * 0.2)}" height="${n1(r * 0.65)}" rx="${n1(r * 0.1)}" fill="#e8b87a" transform="rotate(${a + 45} ${x} ${y})"/>`;
  return s + `<circle cx="${x}" cy="${y}" r="${n1(r * 0.2)}" fill="#e8b87a"/>`;
};

/* ---------- dibujos de 200 x 160 ---------- */
type Inner = (a: string, b: string) => string;

const nailSet = (kind: string, c1: string, c2: string) => {
  const xs = [28, 64, 100, 136, 172];
  const hs = [70, 84, 92, 84, 64];
  let o = '';
  for (let i = 0; i < 5; i++) {
    const x = xs[i] - 14;
    const h = hs[i];
    const y = 130 - h;
    const gid = `ng${id(kind + c1 + c2)}${i}`;
    let fill = c1;
    o += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
    if (kind === 'ombre' || kind === 'chrome') fill = `url(#${gid})`;
    o += `<path d="M${x} ${y + h} V${y + 14} Q${x} ${y} ${x + 14} ${y} Q${x + 28} ${y} ${x + 28} ${y + 14} V${y + h}Z" fill="${fill}"/>`;
    if (kind === 'french') o += `<path d="M${x} ${y + 14} Q${x} ${y} ${x + 14} ${y} Q${x + 28} ${y} ${x + 28} ${y + 14} Q${x + 14} ${y + 26} ${x} ${y + 14}Z" fill="${c2}"/>`;
    if (kind === 'glitter') for (let j = 0; j < 6; j++) o += `<circle cx="${x + 5 + ((j * 7) % 22)}" cy="${y + 12 + ((j * 13) % (h - 18))}" r="2" fill="${c2}"/>`;
    if (kind === 'cherry' && i % 2 === 0)
      o += `<circle cx="${x + 10}" cy="${y + h - 22}" r="6" fill="${c2}"/><circle cx="${x + 20}" cy="${y + h - 18}" r="6" fill="${c2}"/><path d="M${x + 10} ${y + h - 28} Q${x + 16} ${y + h - 38} ${x + 22} ${y + h - 34}" stroke="#2f8a5b" stroke-width="2" fill="none"/>`;
    if (kind === 'hearts' && i % 2 === 1) o += corazon(x + 14, y + h - 18, 0.55, c2);
    o += `<rect x="${x + 5}" y="${y + 6}" width="5" height="${Math.max(10, h - 36)}" rx="2.5" fill="#fff" opacity=".45"/>`;
  }
  return o;
};

const INNER: Record<string, Inner> = {
  // boutique
  vestido: (a) => `<path d="M88 20 L112 20 L116 62 L150 146 Q100 162 50 146 L84 62Z" fill="${a}"/><path d="M84 62 H116" stroke="#fff" stroke-opacity=".6" stroke-width="4"/>`,
  blusa: (a) => `<path d="M72 24 L100 34 L128 24 L168 54 L150 80 L136 72 V140 H64 V72 L50 80 L32 54Z" fill="${a}"/><path d="M82 24 Q100 46 118 24" stroke="#fff" stroke-opacity=".6" stroke-width="4" fill="none"/>`,
  pantalon: (a) => `<path d="M66 18 H134 L144 144 H108 L100 66 L92 144 H56Z" fill="${a}"/><path d="M66 30 H134" stroke="#fff" stroke-opacity=".6" stroke-width="5"/>`,
  bolsa: (a) => `<path d="M76 62 Q76 26 100 26 Q124 26 124 62" stroke="${a}" stroke-width="7" fill="none"/><rect x="54" y="58" width="92" height="76" rx="14" fill="${a}"/><rect x="92" y="82" width="16" height="12" rx="3" fill="#fff" opacity=".7"/>`,
  zapato: (a) => `<path d="M34 96 Q62 96 80 68 L100 80 Q126 100 168 108 Q178 130 164 136 H40 Q30 130 34 96Z" fill="${a}"/><rect x="34" y="132" width="132" height="8" rx="4" fill="#2a1830" opacity=".75"/>`,
  aretes: (a) => `<g stroke="#d9a441" stroke-width="3" fill="none"><path d="M70 30 q-6 10 0 20"/><path d="M130 30 q6 10 0 20"/></g><circle cx="70" cy="62" r="13" fill="${a}"/><circle cx="130" cy="62" r="13" fill="${a}"/><path d="M70 78 l8 22 h-16Z M130 78 l8 22 h-16Z" fill="#d9a441"/>`,
  // papelería
  lapicero: (a) => `<g transform="rotate(-35 100 80)"><rect x="40" y="70" width="104" height="18" rx="9" fill="${a}"/><rect x="128" y="70" width="14" height="18" fill="#fff" opacity=".35"/><polygon points="40,70 18,79 40,88" fill="#33415c"/><rect x="62" y="62" width="40" height="5" rx="2" fill="#99a3b8"/></g>`,
  lapiceros: () =>
    ['#1f5fe0', '#d81b5c', '#13a56b', '#222222']
      .map((k, i) => `<g transform="rotate(${-20 + i * 14} 100 130)"><rect x="${60 + i * 20}" y="26" width="12" height="96" rx="6" fill="${k}"/><polygon points="${60 + i * 20},122 ${72 + i * 20},122 ${66 + i * 20},138" fill="#33415c"/></g>`)
      .join(''),
  cuaderno: (a) =>
    `<rect x="54" y="18" width="96" height="124" rx="8" fill="${a}"/><rect x="66" y="52" width="72" height="30" rx="4" fill="#fff" opacity=".85"/><g fill="#fff">` +
    [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="54" cy="${32 + i * 16}" r="4"/>`).join('') + `</g>`,
  marcadores: () =>
    ['#ffd60a', '#ff5f97', '#4cc3e0', '#13a56b']
      .map((k, i) => `<g transform="rotate(${-12 + i * 8} 100 130)"><rect x="${52 + i * 26}" y="46" width="18" height="80" rx="5" fill="${k}"/><rect x="${52 + i * 26}" y="30" width="18" height="22" rx="4" fill="#222" opacity=".8"/></g>`)
      .join(''),
  mochila: (a) => `<path d="M62 52 Q62 24 100 24 Q138 24 138 52 V138 Q138 148 128 148 H72 Q62 148 62 138Z" fill="${a}"/><rect x="76" y="92" width="48" height="34" rx="8" fill="#fff" opacity=".35"/><path d="M82 40 Q100 12 118 40" stroke="#222" stroke-width="5" fill="none" opacity=".6"/>`,
  arte: () => `<path d="M100 22 Q168 22 168 84 Q168 120 128 118 Q112 118 118 104 Q124 90 104 90 Q36 98 36 66 Q36 22 100 22Z" fill="#f2d7a8"/><circle cx="76" cy="52" r="9" fill="#d81b5c"/><circle cx="104" cy="42" r="9" fill="#1f5fe0"/><circle cx="132" cy="56" r="9" fill="#ffd60a"/><circle cx="70" cy="78" r="9" fill="#13a56b"/><rect x="132" y="86" width="44" height="6" rx="3" fill="#6b4a2f" transform="rotate(-30 150 90)"/>`,
  hojas: () => `<rect x="64" y="30" width="80" height="108" rx="4" fill="#cfd8ea"/><rect x="58" y="24" width="80" height="108" rx="4" fill="#e8eefb"/><rect x="52" y="18" width="80" height="108" rx="4" fill="#fff"/><g fill="#b9c4dc"><rect x="64" y="34" width="56" height="5"/><rect x="64" y="48" width="56" height="5"/><rect x="64" y="62" width="40" height="5"/></g>`,
  lapices: () =>
    ['#ffd60a', '#1f5fe0', '#d81b5c']
      .map((k, i) => `<g transform="rotate(${-30 + i * 30} 100 140)"><rect x="${78 + i * 22}" y="22" width="14" height="96" fill="${k}"/><polygon points="${78 + i * 22},118 ${92 + i * 22},118 ${85 + i * 22},138" fill="#f2d7a8"/><polygon points="${82 + i * 22},130 ${88 + i * 22},130 ${85 + i * 22},138" fill="#222"/><rect x="${78 + i * 22}" y="22" width="14" height="12" fill="#f4a1b5"/></g>`)
      .join(''),
  // uñas
  ombre: (a, b) => nailSet('ombre', a, b),
  french: (a, b) => nailSet('french', a, b),
  cherry: (a, b) => nailSet('cherry', a, b),
  hearts: (a, b) => nailSet('hearts', a, b),
  chrome: (a, b) => nailSet('chrome', a, b),
  glitter: (a, b) => nailSet('glitter', a, b),
  // temporada
  flor: (a, b) => flor(100, 80, 48, a, b) + flor(46, 112, 26, a, b) + flor(158, 112, 26, a, b),
  vela: (a) => vela(70, 130, 1.4, a) + vela(130, 130, 1.8, a) + flor(100, 138, 20, '#ff9f1c', '#c2410c'),
  pan: (a, b) => pan(100, 84, 52) + flor(40, 124, 22, a, b) + flor(162, 124, 22, a, b),
  papel: (a, b) => papel(8, [a, b, '#7bd389', '#ff5f97', '#4cc3e0'], 6) + flor(100, 112, 30, '#ff9f1c', '#c2410c'),
  arbol: (a) => arbol(100, 118, 1.15, a),
  regalo: (a, b) => regalo(100, 90, 1.5, a, b),
  esfera: (a, b) => esfera(54, 84, 26, a) + esfera(104, 70, 30, b) + esfera(152, 90, 22, '#f5c451'),
  corazon: (a, b) => corazon(100, 76, 3.2, a) + corazon(44, 112, 1.5, b) + corazon(160, 40, 1.2, b),
  etiqueta: (a) => etiqueta(a, '-30%'),
  bolsaCompra: (a, b) => bolsaCompra(100, 84, 2, a) + estrella(150, 40, 16, b) + estrella(50, 52, 10, b),
  estrella: (a, b) => estrella(100, 80, 62, a) + estrella(100, 80, 30, b),
  ramo: (a, b) => `<path d="M100 98 L100 148 M72 104 L96 148 M128 104 L104 148" stroke="#3f9b61" stroke-width="5" fill="none" stroke-linecap="round"/>` + flor(100, 58, 34, a, b) + flor(60, 84, 24, b, a) + flor(140, 84, 24, b, a) + `<path d="M82 120 L118 120 L108 148 L92 148Z" fill="${a}" opacity=".85"/>`,
  pastel: (a, b) => `<rect x="44" y="90" width="112" height="50" rx="9" fill="${a}"/><rect x="58" y="60" width="84" height="34" rx="9" fill="${b}"/><path d="M44 102 q14 14 28 0 q14 14 28 0 q14 14 28 0 q14 14 28 0" fill="#fff" opacity=".85"/><rect x="96" y="38" width="8" height="24" rx="2" fill="#fff"/><path d="M100 24 q9 9 0 16 q-9 -7 0 -16z" fill="#ff9f1c"/>`,
  taza: (a, b) => `<path d="M52 62 H138 V108 Q138 138 106 138 H84 Q52 138 52 108Z" fill="${a}"/><path d="M138 74 h12 q14 0 14 18 q0 18 -14 18 h-12" stroke="${a}" stroke-width="9" fill="none"/><path d="M78 50 q-7 -10 0 -20 M98 50 q-7 -10 0 -20 M118 50 q-7 -10 0 -20" stroke="${b}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  plato: (a, b) => `<circle cx="100" cy="84" r="58" fill="#fff"/><circle cx="100" cy="84" r="44" fill="${a}" opacity=".2"/><circle cx="88" cy="78" r="17" fill="${a}"/><circle cx="118" cy="92" r="14" fill="${b}"/><path d="M78 106 q22 -16 48 0" stroke="#3f9b61" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M26 34 v96 M20 34 v26 q0 9 6 9 q6 0 6 -9 v-26" stroke="#8a93a3" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M176 34 q-16 24 -8 56 h8z" fill="#8a93a3"/><rect x="174" y="90" width="5" height="40" rx="2" fill="#8a93a3"/>`,
  llave: (a) => `<g transform="rotate(-40 100 80)"><circle cx="100" cy="38" r="22" fill="none" stroke="${a}" stroke-width="14"/><rect x="88" y="58" width="24" height="92" rx="9" fill="${a}"/><rect x="94" y="132" width="12" height="8" rx="3" fill="#fff" opacity=".5"/></g>`,
  engrane: (a, b) => { let s = ''; for (let i = 0; i < 8; i++) s += `<rect x="90" y="14" width="20" height="28" rx="4" fill="${a}" transform="rotate(${i * 45} 100 80)"/>`; return s + `<circle cx="100" cy="80" r="46" fill="${a}"/><circle cx="100" cy="80" r="19" fill="${b}"/>`; },
};

export function tileArt(kind: string, p: Pal, label: string) {
  const f = INNER[kind] ?? INNER.estrella;
  return svg('0 0 200 160', `<rect width="200" height="160" fill="${p.bg}"/>${f(p.a, p.b)}`, label);
}

/* ---------- casas e inmuebles (400 x 260) ---------- */
const HOUSE_PAL = [
  { s1: '#9fd7ee', s2: '#e4f5fb', hill: '#7cc08d', wall: '#f5efe3', roof: '#0e6f8a', door: '#b0782f', tree: '#3f9b61' },
  { s1: '#f6c58e', s2: '#fdebd2', hill: '#9ccf8d', wall: '#e9d9c4', roof: '#a33b2b', door: '#4b3a6b', tree: '#4a9a55' },
  { s1: '#b9cdf2', s2: '#eaf0fc', hill: '#86c19a', wall: '#e0e8ee', roof: '#2b3a67', door: '#f2a900', tree: '#2f8a5b' },
];
export function houseArt(kind: string, variant: number, label: string) {
  const p = HOUSE_PAL[variant % HOUSE_PAL.length];
  const g = `hg${id(kind)}${variant % HOUSE_PAL.length}`;
  let s = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.s1}"/><stop offset="1" stop-color="${p.s2}"/></linearGradient></defs><rect width="400" height="260" fill="url(#${g})"/><circle cx="330" cy="52" r="24" fill="#ffe08a"/><ellipse cx="90" cy="60" rx="38" ry="11" fill="#fff" opacity=".7"/><ellipse cx="120" cy="52" rx="26" ry="9" fill="#fff" opacity=".7"/><path d="M0 205 Q100 165 200 198 T400 188 V260 H0Z" fill="${p.hill}"/>`;
  if (kind === 'casa') {
    s += `<rect x="120" y="120" width="170" height="95" fill="${p.wall}"/><polygon points="105,125 205,66 305,125" fill="${p.roof}"/><rect x="190" y="160" width="36" height="55" rx="4" fill="${p.door}"/><rect x="138" y="140" width="38" height="32" rx="3" fill="#cfe9f5"/><rect x="240" y="140" width="38" height="32" rx="3" fill="#cfe9f5"/><circle cx="76" cy="170" r="30" fill="${p.tree}"/><rect x="72" y="190" width="8" height="26" fill="#6b4a2f"/>`;
  } else if (kind === 'depa') {
    s += `<rect x="140" y="62" width="130" height="154" fill="${p.wall}"/><rect x="132" y="56" width="146" height="12" fill="${p.roof}"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) s += `<rect x="${154 + c * 36}" y="${82 + r * 30}" width="22" height="18" rx="2" fill="${(r + c) % 3 === 0 ? '#ffe9a8' : '#cfe9f5'}"/>`;
    s += `<rect x="188" y="186" width="30" height="30" rx="3" fill="${p.door}"/><circle cx="324" cy="176" r="26" fill="${p.tree}"/><rect x="320" y="194" width="8" height="22" fill="#6b4a2f"/>`;
  } else if (kind === 'local') {
    s += `<rect x="100" y="130" width="200" height="86" fill="${p.wall}"/><rect x="92" y="118" width="216" height="18" fill="${p.roof}"/><rect x="120" y="160" width="90" height="56" fill="#cfe9f5"/><rect x="230" y="160" width="46" height="56" rx="3" fill="${p.door}"/>`;
    for (let i = 0; i < 10; i++) s += `<path d="M${100 + i * 20} 136 h20 v10 q-10 12 -20 0Z" fill="${i % 2 ? p.roof : p.door}"/>`;
  } else {
    s += `<path d="M0 215 L400 215 L400 260 L0 260Z" fill="${p.hill}"/><g stroke="#8a6a45" stroke-width="5"><path d="M40 190 V225 M110 190 V225 M180 190 V225 M250 190 V225 M320 190 V225"/><path d="M30 200 H340 M30 216 H340"/></g><rect x="150" y="92" width="110" height="64" rx="6" fill="#fff"/><rect x="198" y="156" width="8" height="36" fill="#8a6a45"/><text x="205" y="120" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="15" fill="${p.roof}">SE VENDE</text><text x="205" y="141" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="700" font-size="12" fill="#555">Terreno</text>`;
  }
  return svg('0 0 400 260', s, label);
}

/* ---------- escenas de portada (400 x 300) ---------- */
const at = (x: number, y: number, k: number, inner: string) => `<g transform="translate(${x} ${y}) scale(${k})">${inner}</g>`;

export function heroArt(scene: string, label: string) {
  const w = '0 0 400 300';
  const grad = (gid: string, c1: string, c2: string) =>
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#${gid})"/>`;
  switch (scene) {
    case 'inmobiliaria':
      return houseArt('casa', 0, label);
    case 'unas':
      return svg(w, grad('hu', '#ffd3df', '#ffc9d8') + at(10, 40, 1.9, INNER.cherry('#fff1f4', '#d81b5c')), label);
    case 'boutique':
      return svg(w, grad('hb', '#f6e7ee', '#f1dbe5') + at(-10, 20, 1.7, INNER.vestido('#8b3a62', '')) + at(150, 70, 1.15, INNER.bolsa('#b5734a', '')) + at(215, 10, 1, INNER.aretes('#d9a441', '')) + at(225, 180, 0.8, INNER.zapato('#c76d96', '')), label);
    case 'papeleria':
      return svg(w, grad('hp', '#fff3b0', '#dbe8ff') + at(-20, 40, 1.6, INNER.lapiceros('', '')) + at(130, 10, 1.3, INNER.cuaderno('#1f5fe0', '')) + at(200, 130, 1.3, INNER.mochila('#2b3a67', '')), label);
    case 'muertos':
      return svg(w, grad('hm', '#3a1a52', '#12061e') + papel(8, ['#ff9f1c', '#e63e8a', '#7bd389', '#4cc3e0', '#ffd166'], 8) + vela(86, 250, 1.8, '#f6e9d0') + vela(314, 250, 1.8, '#f6e9d0') + flor(200, 190, 76, '#ff9f1c', '#c2410c') + flor(120, 262, 34, '#ffb703', '#c2410c') + flor(280, 262, 34, '#ffb703', '#c2410c'), label);
    case 'navidad':
      return svg(w, grad('hn', '#146048', '#0a2a20') + arbol(200, 230, 2.1, '#2a9d6c') + regalo(110, 262, 1.1, '#e8433f', '#f5c451') + regalo(300, 262, 1.3, '#f5c451', '#e8433f') + copo(60, 70, 14) + copo(340, 60, 18) + copo(320, 150, 10) + copo(70, 160, 10), label);
    case 'amor':
      return svg(w, grad('hl', '#ffd6e0', '#ffb3c9') + corazon(200, 150, 7.5, '#e0245e') + corazon(90, 90, 3.2, '#ff9bb5') + corazon(320, 80, 3.6, '#ff9bb5') + corazon(300, 240, 2.4, '#e0245e') + corazon(90, 240, 2.6, '#e0245e') + regalo(200, 260, 1, '#4a0d25', '#ff9bb5'), label);
    case 'venta':
      return svg(w, grad('hv', '#ffe9a0', '#ffd400') + estrella(200, 150, 140, '#e11d2e') + estrella(200, 150, 96, '#ffd400') + `<g transform="translate(200 156) rotate(-10)"><text text-anchor="middle" font-size="50" font-weight="900" fill="#1a1a1a" font-family="system-ui,Arial,sans-serif">-30%</text></g>` + bolsaCompra(70, 230, 1.6, '#1a1a1a') + bolsaCompra(335, 230, 1.6, '#e11d2e'), label);
    case 'madres':
      return svg(w, grad('hmd', '#ffe4ec', '#ffc9da') + corazon(70, 70, 2.4, '#ff9bb5') + corazon(335, 80, 3, '#ff9bb5') + corazon(345, 235, 1.8, '#c2185b') + at(0, -14, 2, INNER.ramo('#c2185b', '#ffd166')) + flor(52, 240, 30, '#ff9bb5', '#ffd166'), label);
    case 'clases':
      return svg(w, grad('hcl', '#d7ecff', '#fff3b0') + at(-24, 40, 1.35, INNER.mochila('#e8433f', '')) + at(100, 10, 1.3, INNER.cuaderno('#1f5fe0', '')) + at(240, 96, 0.9, INNER.lapiceros('', '')) + estrella(60, 36, 14, '#ffd60a') + estrella(350, 40, 10, '#1f5fe0'), label);
    case 'restaurante':
      return svg(w, grad('hrs', '#fff0d6', '#ffd9a3') + at(10, 0, 1.9, INNER.plato('#d9480f', '#2f9e44')) + at(262, 186, 0.72, INNER.taza('#7a4a2a', '#b08968')) + flor(366, 30, 18, '#f59f00', '#d9480f') + flor(40, 262, 20, '#2f9e44', '#d9480f'), label);
    case 'taller':
      return svg(w, grad('htl', '#dbe4ee', '#b8c7d9') + at(-6, 20, 1.7, INNER.engrane('#2b3a67', '#dbe4ee')) + at(190, 40, 1.1, INNER.llave('#e8590c', '')) + at(296, 10, 0.4, INNER.engrane('#e8590c', '#dbe4ee')), label);
    default:
      return houseArt('casa', 0, label);
  }
}

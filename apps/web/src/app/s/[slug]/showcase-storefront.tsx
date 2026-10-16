type SiteSection = {
  id: string;
  type: string;
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  layout: string;
  content?: unknown;
};

type ShowcaseSite = {
  name: string;
  slug: string;
  template: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  whatsappPhone: string | null;
  announcementText: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  extraLinkLabel: string | null;
  extraLinkUrl: string | null;
  sections: SiteSection[];
};

type ShowcaseProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  images: Array<{ id: string; url: string; isPrimary: boolean; sortOrder: number }>;
};

type ShowcasePromotion = { id: string; title: string; description: string | null };

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function whatsapp(phone: string | null, message: string) {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  const international = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

function safeUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

const anchorByType: Record<string, string> = {
  hero: 'inicio', menu: 'servicios', catalog: 'productos', promotions: 'promociones',
  gallery: 'galeria', text: 'informacion', loyalty: 'recompensas', location: 'ubicacion', contact: 'contacto', video: 'video', banner: 'aviso',
};

function navItems(site: ShowcaseSite) {
  const seen = new Set<string>();
  return [...site.sections]
    .filter((section) => section.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({ label: section.title?.trim() || (section.type === 'hero' ? 'Inicio' : section.type), href: `#${anchorByType[section.type] ?? section.type}` }))
    .filter((item) => !seen.has(item.href) && seen.add(item.href));
}

function contentObject(section: SiteSection | undefined) {
  return section?.content && typeof section.content === 'object' ? section.content as Record<string, unknown> : {};
}

function PageNav({ site, dark = false, cta = 'WhatsApp' }: { site: ShowcaseSite; dark?: boolean; cta?: string }) {
  const wa = whatsapp(site.whatsappPhone, `Hola, vi la página ${site.name} en Yalika. Quiero información.`);
  return (
    <nav className={`sticky top-0 z-40 border-b backdrop-blur ${dark ? 'border-white/10 bg-[#201617]/95 text-white' : 'border-black/5 bg-white/95 text-slate-950'}`}>
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href="#inicio" className="shrink-0 text-lg font-black">{site.name}</a>
        <div className="flex flex-1 gap-1 overflow-x-auto py-2 text-xs font-bold sm:justify-center sm:text-sm">{navItems(site).map((item) => <a key={item.href} href={item.href} className="whitespace-nowrap rounded-full px-3 py-2 hover:bg-black/5">{item.label}</a>)}</div>
        {wa ? <a href={wa} target="_blank" rel="noreferrer" className="shrink-0 rounded-full bg-emerald-500 px-4 py-2 text-xs font-black text-white">{cta}</a> : null}
      </div>
    </nav>
  );
}

function SocialLinks({ site }: { site: ShowcaseSite }) {
  const links: Array<{ label: string; href: string }> = [];
  const candidates: Array<[string, string | null]> = [
    ['Instagram', safeUrl(site.instagramUrl)],
    ['Facebook', safeUrl(site.facebookUrl)],
    ['TikTok', safeUrl(site.tiktokUrl)],
    [site.extraLinkLabel || 'Más', safeUrl(site.extraLinkUrl)],
  ];
  for (const [label, href] of candidates) {
    if (href) links.push({ label, href });
  }
  if (!links.length) return null;
  return <div className="flex flex-wrap gap-2">{links.map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noreferrer" className="rounded-full border border-current/20 px-3 py-2 text-xs font-bold">{label}</a>)}</div>;
}

function CherryNails({ site }: { site: ShowcaseSite }) {
  const wa = whatsapp(site.whatsappPhone, `Hola, vi ${site.name} en Yalika. Quiero agendar una cita.`);
  const serviceSection = site.sections.find((item) => item.type === 'menu');
  const serviceContent = contentObject(serviceSection);
  const rawItems = Array.isArray(serviceContent.items) ? serviceContent.items : [];
  const services = rawItems.length ? rawItems as Array<{ title?: string; text?: string }> : [
    { title: 'Gel semipermanente', text: 'Color y acabado cuidado.' },
    { title: 'Uñas acrílicas', text: 'Diseño personalizado.' },
    { title: 'Nail art', text: 'Detalles para tu estilo.' },
    { title: 'Retiro y cuidado', text: 'Atención para tus uñas.' },
  ];
  return (
    <main className="min-h-screen bg-[#fff8fa] text-[#311b25]">
      {site.announcementText ? <div className="bg-[#7b2148] px-4 py-2 text-center text-xs font-black text-white">{site.announcementText}</div> : null}
      <PageNav site={site} cta="Agendar" />
      <section id="inicio" className="overflow-hidden bg-[radial-gradient(circle_at_80%_20%,#ffd7e6_0,#fff8fa_38%,#fff_78%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div><p className="text-xs font-black uppercase tracking-[.28em] text-[#a83368]">Cherry Pop Nails</p><h1 className="mt-4 max-w-3xl text-5xl font-black leading-[.95] sm:text-7xl">{site.heroTitle ?? 'Uñas que hablan de ti'}</h1><p className="mt-6 max-w-2xl text-base leading-7 text-[#795265] sm:text-lg">{site.heroSubtitle ?? 'Manicure, gel y diseños personalizados con atención por cita.'}</p><div className="mt-8 flex flex-wrap gap-3">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-[#7b2148] px-6 py-3 text-sm font-black text-white">Agendar por WhatsApp</a> : null}<a href="#servicios" className="rounded-full border border-[#7b2148]/20 bg-white px-6 py-3 text-sm font-black">Ver servicios</a></div></div>
          <div className="relative min-h-[390px] overflow-hidden rounded-[2.7rem] bg-gradient-to-br from-[#ffe4ee] via-[#ffd2e2] to-[#f1abc7] shadow-2xl">{site.heroImageUrl ? <img src={site.heroImageUrl} alt={site.name} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center"><div className="grid grid-cols-3 gap-3 rotate-[-7deg]">{['#7b2148','#f7a9c4','#fff','#d8799f','#49202f','#ffd7e6'].map((color) => <span key={color} className="h-24 w-16 rounded-t-[2.5rem] rounded-b-2xl border border-white/60 shadow-lg" style={{ background: color }} />)}</div></div>}<div className="absolute inset-x-5 bottom-5 rounded-3xl bg-white/80 p-5 backdrop-blur"><p className="font-black">Atención por cita · Diseño personalizado</p></div></div>
        </div>
      </section>
      <section id="servicios" className="mx-auto max-w-7xl px-4 py-12 sm:px-6"><p className="text-xs font-black uppercase tracking-[.25em] text-[#a83368]">Servicios</p><h2 className="mt-2 text-3xl font-black">Elige tu estilo</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{services.slice(0, 6).map((item, index) => <article key={`${item.title}-${index}`} className="rounded-[2rem] border border-[#7b2148]/10 bg-white p-6 shadow-sm"><div className="mb-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-100 to-rose-200"/><h3 className="font-black">{item.title || 'Servicio'}</h3><p className="mt-2 text-sm text-[#795265]">{item.text || 'Consulta disponibilidad por WhatsApp.'}</p></article>)}</div></section>
      <section id="galeria" className="bg-[#301821] px-4 py-12 text-white sm:px-6"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[.25em] text-pink-200">Galería</p><h2 className="mt-2 text-3xl font-black">Ideas para inspirarte</h2><div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{['Natural','Rosa','Brillos','Diseño libre'].map((label,index) => <div key={label} className={`aspect-square rounded-[2rem] p-5 ${['bg-[#f4c8d7]','bg-[#d96f9d]','bg-[#f7e7d0]','bg-[#8b3d60]'][index]}`}><span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-[#311b25]">{label}</span></div>)}</div></div></section>
      <section id="informacion" className="mx-auto max-w-7xl px-4 py-12 sm:px-6"><div className="grid gap-4 md:grid-cols-3">{['Atención por cita','Diseños personalizados','Confirmación por WhatsApp'].map((text) => <div key={text} className="rounded-2xl border border-[#7b2148]/10 bg-white p-5 font-black">✓ {text}</div>)}</div></section>
      <section id="contacto" className="px-4 pb-12 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2.5rem] bg-[#7b2148] p-8 text-white sm:p-10"><p className="text-xs font-black uppercase tracking-[.25em] text-pink-200">Agenda</p><h2 className="mt-3 text-4xl font-black">¿Lista para tu próximo diseño?</h2><p className="mt-3 max-w-xl text-white/75">Escríbenos para confirmar horario y disponibilidad.</p><div className="mt-6 flex flex-wrap gap-3">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#7b2148]">WhatsApp</a> : null}<SocialLinks site={site} /></div></div></section>
    </main>
  );
}

const lunaDemo = ['Vestido Isabella','Blusa Valentina','Pantalón Sofía','Cartera Luna','Gafas Elegance','Set de aretes'];
const prismaDemo = ['Cuaderno profesional','Plumas gel','Mochila escolar','Marcadores','Hojas carta','Kit de arte'];

function ProductGrid({ products, demo, tone }: { products: ShowcaseProduct[]; demo: string[]; tone: 'luna' | 'prisma' }) {
  const rows = products.slice(0, 6);
  const cards = rows.length ? rows.map((product) => ({ name: product.name, price: product.price, image: product.images?.[0]?.url ?? null })) : demo.map((name) => ({ name, price: null, image: null }));
  return <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{cards.map((card, index) => <article key={`${card.name}-${index}`} className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm"><div className={`aspect-[4/5] ${tone === 'luna' ? 'bg-gradient-to-br from-[#f3dfd2] to-[#fff9f4]' : 'bg-gradient-to-br from-blue-100 to-yellow-100'}`}>{card.image ? <img src={card.image} alt={card.name} className="h-full w-full object-contain p-3" /> : <div className="grid h-full place-items-center text-4xl">{tone === 'luna' ? '✦' : '✎'}</div>}</div><div className="p-4"><h3 className="font-black">{card.name}</h3><p className="mt-2 text-sm font-bold">{card.price === null ? 'Muestra de diseño' : money.format(card.price)}</p></div></article>)}</div>;
}

function LunaBoutique({ site, products }: { site: ShowcaseSite; products: ShowcaseProduct[] }) {
  const wa = whatsapp(site.whatsappPhone, `Hola, vi ${site.name} en Yalika. Quiero información de la colección.`);
  return <main className="min-h-screen bg-[#f7f0ea] text-[#211914]">{site.announcementText ? <div className="bg-[#2b211c] px-4 py-2 text-center text-xs font-bold text-white">{site.announcementText}</div> : null}<PageNav site={site} /><section id="inicio" className="overflow-hidden"><div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:py-16"><div><p className="text-xs font-black uppercase tracking-[.28em] text-[#9c6b51]">Moda que se siente tuya</p><h1 className="mt-4 font-serif text-5xl font-black leading-[.95] sm:text-7xl">{site.heroTitle ?? 'Viste con estilo, compra fácil'}</h1><p className="mt-6 max-w-xl text-[#745f53]">{site.heroSubtitle ?? 'Una experiencia elegante para descubrir tu próximo look.'}</p><div className="mt-8 flex gap-3"><a href="#productos" className="rounded-full bg-[#2b211c] px-6 py-3 text-sm font-black text-white">Ver colección</a>{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-full border border-[#2b211c]/20 bg-white px-6 py-3 text-sm font-black">WhatsApp</a> : null}</div></div><div className="relative min-h-[420px] overflow-hidden rounded-[2.7rem] bg-[#dec4b5] shadow-2xl"><img src="/yalika-showcase/luna-hero.webp" alt="Luna Boutique" className="absolute inset-0 h-full w-full object-cover" /></div></div></section><section id="galeria" className="mx-auto max-w-7xl px-4 pt-10 sm:px-6"><div className="grid gap-3 sm:grid-cols-3">{['Novedades','Looks completos','Accesorios'].map((item) => <a key={item} href="#productos" className="rounded-3xl border border-[#2b211c]/10 bg-white/70 p-5 font-serif text-xl font-black shadow-sm hover:bg-white">{item}<span className="mt-2 block text-xs font-sans font-bold text-[#8a7062]">Explorar ↓</span></a>)}</div></section><section id="productos" className="mx-auto max-w-7xl px-4 py-12 sm:px-6"><p className="text-xs font-black uppercase tracking-[.25em] text-[#9c6b51]">Colección</p><h2 className="mt-2 font-serif text-3xl font-black">Destacados</h2><ProductGrid products={products} demo={lunaDemo} tone="luna" /></section><section id="promociones" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6"><div className="rounded-[2.5rem] bg-[#2c211b] p-8 text-white"><p className="text-xs font-black uppercase tracking-[.3em] text-[#e8c6ae]">Promociones</p><h2 className="mt-4 font-serif text-4xl font-black">Un espacio listo para tus campañas.</h2></div></section><footer id="contacto" className="bg-[#211914] px-4 py-10 text-white sm:px-6"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5"><div><p className="font-serif text-2xl font-black">{site.name}</p><p className="mt-1 text-sm text-white/60">Página de muestra Yalika.</p></div><div className="flex flex-wrap gap-2">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-[#b97855] px-5 py-3 text-sm font-black">WhatsApp</a> : null}<SocialLinks site={site} /></div></div></footer></main>;
}

function PrismaPapeleria({ site, products }: { site: ShowcaseSite; products: ShowcaseProduct[] }) {
  const wa = whatsapp(site.whatsappPhone, `Hola, vi ${site.name} en Yalika. Quiero cotizar productos.`);
  return <main className="min-h-screen bg-[#f7fbff] text-[#082657]"><PageNav site={site} cta="Cotizar" /><section id="inicio" className="overflow-hidden bg-[linear-gradient(135deg,#e9f8ff_0%,#eaf7ff_42%,#fff6a3_100%)]"><div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_.95fr]"><div><p className="text-xs font-black uppercase tracking-[.28em] text-blue-600">Escolar · Oficina · Creatividad</p><h1 className="mt-4 text-5xl font-black leading-[.93] sm:text-7xl">{site.heroTitle ?? 'Todo para tus ideas'}</h1><p className="mt-6 max-w-xl text-blue-800/70">{site.heroSubtitle ?? 'Una página clara, colorida y fácil de usar.'}</p><div className="mt-8 flex gap-3"><a href="#productos" className="rounded-full bg-[#ffd80a] px-6 py-3 text-sm font-black">Ver productos</a>{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-blue-600 px-6 py-3 text-sm font-black text-white">Cotizar</a> : null}</div></div><div className="relative min-h-[400px] overflow-hidden rounded-[2.7rem] bg-[#77d2ff] shadow-2xl"><img src="/yalika-showcase/prisma-hero.webp" alt="Prisma Papelería" className="absolute inset-0 h-full w-full object-cover" /></div></div></section><section id="servicios" className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{['Escolar','Oficina','Arte','Impresión','Promos','Mayoreo'].map((item) => <div key={item} className="rounded-3xl border border-blue-100 bg-white p-5 font-black shadow-sm">{item}</div>)}</div></section><section id="productos" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6"><h2 className="text-3xl font-black">Productos destacados</h2><ProductGrid products={products} demo={prismaDemo} tone="prisma" /></section><section id="informacion" className="mx-auto max-w-7xl px-4 pb-10 sm:px-6"><div className="grid gap-3 sm:grid-cols-3">{['Cotiza por WhatsApp','Recoge en tienda','Pregunta por mayoreo'].map((item) => <div key={item} className="rounded-3xl border border-blue-100 bg-white p-5 font-black shadow-sm">✓ {item}</div>)}</div></section><section id="promociones" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6"><div className="rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-cyan-500 p-8 text-white"><span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-blue-950">PROMOCIONES</span><h2 className="mt-5 text-4xl font-black">Grandes ideas a mejores precios.</h2></div></section><footer id="contacto" className="bg-white px-4 py-10 sm:px-6"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 border-t border-blue-100 pt-8"><div><p className="text-xl font-black">{site.name}</p><p className="mt-1 text-sm text-blue-700/60">Página de muestra Yalika.</p></div><div className="flex flex-wrap gap-2">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-[#20bd4a] px-5 py-3 text-sm font-black text-white">WhatsApp</a> : null}<SocialLinks site={site} /></div></div></footer></main>;
}

export function ShowcaseStorefront({ site, products }: { site: ShowcaseSite; products: ShowcaseProduct[]; promotions: ShowcasePromotion[] }) {
  if (site.template === 'yaleka_cherry_nails') return <CherryNails site={site} />;
  if (site.template === 'yaleka_prisma_papeleria') return <PrismaPapeleria site={site} products={products} />;
  return <LunaBoutique site={site} products={products} />;
}

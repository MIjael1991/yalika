import { SiteLocations } from './site-locations';

function safeUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

function tiktokId(value: unknown) {
  if (typeof value !== 'string') return null;
  return value.match(/\/video\/(\d{8,24})/)?.[1] ?? value.match(/^\d{8,24}$/)?.[0] ?? null;
}

function youtubeId(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (url.protocol !== 'https:') return null;
    if (host === 'youtu.be') return url.pathname.slice(1).match(/^[\w-]{11}$/)?.[0] ?? null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;
      return url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})$/)?.[1] ?? null;
    }
  } catch { return null; }
  return null;
}

function videoFile(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /\.(mp4|webm)$/i.test(url.pathname) ? url.toString() : null;
  } catch { return null; }
}

function todayMexico() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

// Un banner de temporada solo se muestra dentro de sus fechas (AAAA-MM-DD, ambas opcionales).
function bannerActive(content: Record<string, unknown>) {
  const valid = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = valid(content.startsAt);
  const to = valid(content.endsAt);
  const today = todayMexico();
  return (!from || today >= from) && (!to || today <= to);
}

type Section = { id: string; type: string; title: string | null; layout: string; content?: unknown };

export function SiteExtraSections({ sections, accentColor }: { sections: Section[]; accentColor: string }) {
  return <>
    {sections.filter(section => ['banner','video','menu','gallery','text','faq','testimonials','links','location'].includes(section.type)).map((section) => {
      const content = (section.content && typeof section.content === 'object' ? section.content : {}) as Record<string, unknown>;
      if (section.type === 'banner' && !bannerActive(content)) return null;
      if (section.type === 'banner') {
        return <section key={section.id} className="px-4 py-8 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/10 p-7 backdrop-blur sm:p-10"><p className="text-xs font-bold uppercase tracking-[.28em] text-white/60">Promoción</p><h2 className="mt-2 text-3xl font-black">{section.title || String(content.title || 'Algo especial')}</h2><p className="mt-3 max-w-2xl text-white/70">{String(content.text || '')}</p>{safeUrl(content.buttonUrl) ? <a href={safeUrl(content.buttonUrl)!} className="mt-5 inline-block rounded-full px-5 py-3 text-sm font-black text-slate-950" style={{backgroundColor:accentColor}}>{String(content.buttonText || 'Conocer más')}</a> : null}</div></section>;
      }
      if (section.type === 'video') {
        const id = tiktokId(content.url);
        const yt = youtubeId(content.url);
        const file = videoFile(content.url);
        const url = safeUrl(content.url);
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_390px]"><div><p className="text-xs font-bold uppercase tracking-[.28em] text-white/60">Video corto</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">{section.title || String(content.title || 'Conoce el negocio')}</h2><p className="mt-4 max-w-xl leading-7 text-white/70">{String(content.caption || 'Contenido vertical para mostrar producto, ambiente o una promoción.')}</p></div><div className="mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">{yt ? <iframe title={section.title ?? 'Video de YouTube'} src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`} allow="fullscreen" referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full" /> : file ? <video src={file} controls playsInline preload="metadata" className="h-full w-full object-contain" /> : id ? <iframe title={section.title ?? 'Video TikTok'} src={`https://www.tiktok.com/player/v1/${id}?controls=1&description=1`} allow="fullscreen" className="h-full w-full" /> : url ? <a href={url} target="_blank" rel="noreferrer" className="grid h-full place-items-center p-8 text-center text-sm text-white/80">Abrir video</a> : <div className="grid h-full place-items-center p-8 text-center text-white/50">Agrega un enlace de TikTok desde el editor.</div>}</div></div></section>;
      }
      if (section.type === 'location') return <SiteLocations key={section.id} title={section.title} content={content} accentColor={accentColor} />;
      if (section.type === 'faq') {
        const items = (Array.isArray(content.items) ? content.items : []).slice(0, 20).map(item => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>).filter(row => String(row.q ?? '').trim());
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-3xl"><h2 className="text-3xl font-black">{section.title || 'Preguntas frecuentes'}</h2><div className="mt-6 space-y-3">{items.map((row, index) => <details key={index} className="rounded-2xl border border-white/10 bg-white/5 p-5"><summary className="cursor-pointer font-bold">{String(row.q)}</summary><p className="mt-3 whitespace-pre-wrap leading-7 text-white/70">{String(row.a ?? '')}</p></details>)}</div></div></section>;
      }
      if (section.type === 'testimonials') {
        const items = (Array.isArray(content.items) ? content.items : []).slice(0, 12).map(item => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>).filter(row => String(row.text ?? '').trim());
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-7xl"><h2 className="text-3xl font-black">{section.title || 'Lo que dicen nuestros clientes'}</h2><div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((row, index) => <figure key={index} className="rounded-3xl border border-white/10 bg-white/5 p-6"><blockquote className="leading-7 text-white/80">“{String(row.text)}”</blockquote><figcaption className="mt-4 text-sm font-bold" style={{ color: accentColor }}>{String(row.name ?? '')}</figcaption></figure>)}</div></div></section>;
      }
      if (section.type === 'links') {
        const items = (Array.isArray(content.items) ? content.items : []).slice(0, 12).map(item => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>).map(row => ({ label: String(row.label ?? '').trim(), url: safeUrl(row.url) })).filter(row => row.label && row.url);
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-xl text-center"><h2 className="text-3xl font-black">{section.title || 'Enlaces'}</h2><div className="mt-6 grid gap-3">{items.map((row, index) => <a key={index} href={row.url as string} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/15 bg-white/10 px-6 py-4 font-bold hover:bg-white/20">{row.label}</a>)}</div></div></section>;
      }
      if (section.type === 'menu') {
        const items = Array.isArray(content.items) ? content.items : [];
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-5xl"><h2 className="text-3xl font-black">{section.title || 'Menú'}</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{items.slice(0,30).map((item,index)=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return <div key={index} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"><div><b>{String(row.name||'Producto')}</b><p className="mt-1 text-xs text-white/60">{String(row.description||'')}</p></div><span className="font-bold" style={{color:accentColor}}>{String(row.price||'')}</span></div>})}</div></div></section>;
      }
      if (section.type === 'gallery') {
        const images = Array.isArray(content.images) ? content.images.filter((v):v is string=>typeof v==='string').slice(0,12) : [];
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-7xl"><h2 className="text-3xl font-black">{section.title || 'Galería'}</h2><div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">{images.map((src,index)=><img key={index} src={src} alt="" className="aspect-square w-full rounded-2xl object-cover" />)}</div></div></section>;
      }
      return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/5 p-7"><h2 className="text-3xl font-black">{section.title || String(content.title || '')}</h2><p className="mt-4 whitespace-pre-wrap leading-8 text-white/70">{String(content.text || '')}</p></div></section>;
    })}
  </>;
}

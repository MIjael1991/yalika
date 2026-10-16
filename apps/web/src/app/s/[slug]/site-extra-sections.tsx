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

type Section = { id: string; type: string; title: string | null; layout: string; content?: unknown };

export function SiteExtraSections({ sections, accentColor }: { sections: Section[]; accentColor: string }) {
  return <>
    {sections.filter(section => ['banner','video','menu','gallery','text'].includes(section.type)).map((section) => {
      const content = (section.content && typeof section.content === 'object' ? section.content : {}) as Record<string, unknown>;
      if (section.type === 'banner') {
        return <section key={section.id} className="px-4 py-8 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/10 p-7 backdrop-blur sm:p-10"><p className="text-xs font-bold uppercase tracking-[.28em] text-white/60">Promoción</p><h2 className="mt-2 text-3xl font-black">{section.title || String(content.title || 'Algo especial')}</h2><p className="mt-3 max-w-2xl text-white/70">{String(content.text || '')}</p>{safeUrl(content.buttonUrl) ? <a href={safeUrl(content.buttonUrl)!} className="mt-5 inline-block rounded-full px-5 py-3 text-sm font-black text-slate-950" style={{backgroundColor:accentColor}}>{String(content.buttonText || 'Conocer más')}</a> : null}</div></section>;
      }
      if (section.type === 'video') {
        const id = tiktokId(content.url);
        const url = safeUrl(content.url);
        return <section key={section.id} className="px-4 py-12 sm:px-6"><div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_390px]"><div><p className="text-xs font-bold uppercase tracking-[.28em] text-white/60">Video corto</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">{section.title || String(content.title || 'Conoce el negocio')}</h2><p className="mt-4 max-w-xl leading-7 text-white/70">{String(content.caption || 'Contenido vertical para mostrar producto, ambiente o una promoción.')}</p></div><div className="mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">{id ? <iframe title={section.title ?? 'Video TikTok'} src={`https://www.tiktok.com/player/v1/${id}?controls=1&description=1`} allow="fullscreen" className="h-full w-full" /> : url ? <a href={url} target="_blank" rel="noreferrer" className="grid h-full place-items-center p-8 text-center text-sm text-white/80">Abrir video</a> : <div className="grid h-full place-items-center p-8 text-center text-white/50">Agrega un enlace de TikTok desde el editor.</div>}</div></div></section>;
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

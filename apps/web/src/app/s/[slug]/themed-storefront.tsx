import type { CSSProperties } from 'react';
import { SiteExtraSections } from './site-extra-sections';
import type { Product, Promotion, Site } from './site-view';
import { PRESET_BY_ID, type Preset } from './template-presets';
import { heroArt, houseArt, tileArt } from './template-art';
import { isSoldOut, stockInfo, type StockInfo } from './stock-label';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const FONTS: Record<Preset['font'], string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  round: 'ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif',
};

function whatsapp(phone: string | null | undefined, message: string) {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  const international = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function Art({ html }: { html: string }) {
  // El SVG lo genera template-art.ts solo con textos y colores propios de la plantilla.
  return <div className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: html }} />;
}

function itemArt(preset: Preset, index: number) {
  const item = preset.items[index % preset.items.length];
  if (item.kind === 'house') return houseArt(item.house ?? 'casa', item.hv ?? index, item.n);
  return tileArt(item.kind, { a: item.a ?? preset.c.accent, b: item.b ?? preset.c.accent2, bg: item.bg }, item.n);
}

type Card = { key: string; name: string; meta: string | null; price: string | null; image: string | null; art: string; sample: boolean; stock: StockInfo | null };

function buildCards(preset: Preset, products: Product[]): Card[] {
  // Lo agotado se va al final: lo que sí hay se ve primero.
  const real = [...products].sort((a, b) => Number(isSoldOut(a)) - Number(isSoldOut(b))).slice(0, 12);
  if (real.length) {
    return real.map((product, index) => ({
      key: product.id,
      name: product.name,
      meta: product.description,
      price: product.price > 0 ? money.format(product.price) : null,
      image: product.images?.find((image) => image.isPrimary)?.url ?? product.images?.[0]?.url ?? null,
      art: itemArt(preset, index),
      sample: false,
      stock: stockInfo(product),
    }));
  }
  return preset.items.map((item, index) => ({ key: `s${index}`, name: item.n, meta: item.meta ?? null, price: null, image: null, art: itemArt(preset, index), sample: true, stock: null }));
}

export function ThemedStorefront({ site, products }: { site: Site; products: Product[]; promotions?: Promotion[] }) {
  const preset = PRESET_BY_ID[site.template];
  if (!preset) return null;
  const c = preset.c;
  const accent = safeColor(site.accentColor, c.accent);
  const wa = (text: string) => whatsapp(site.whatsappPhone, text);
  const heroWa = wa(`${preset.ctaMessage} (vi la página de ${site.name})`);
  const cards = buildCards(preset, products);
  const sections = [...(site.sections ?? [])].filter((s) => s.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
  const extraTypes = ['banner', 'video', 'menu', 'gallery', 'text', 'faq', 'testimonials', 'links'];
  const extras = sections.filter((s) => extraTypes.includes(s.type));
  const socials = ([['Instagram', safeUrl(site.instagramUrl)], ['Facebook', safeUrl(site.facebookUrl)], ['TikTok', safeUrl(site.tiktokUrl)], [site.extraLinkLabel || 'Más', safeUrl(site.extraLinkUrl)]] as Array<[string, string | null]>).filter(([, href]) => href);
  const root: CSSProperties = { background: c.bg, color: c.fg, fontFamily: FONTS[preset.font] };
  const heading: CSSProperties = { fontFamily: FONTS[preset.font], letterSpacing: '-0.02em' };
  const btn = (bg: string, fg: string): CSSProperties => ({ background: bg, color: fg });
  const hero = site.heroImageUrl ? null : heroArt(preset.hero, preset.label);

  return (
    <main className="min-h-screen" style={root}>
      {site.announcementText ? <div className="px-4 py-2 text-center text-xs font-bold" style={btn(c.deep, '#ffffff')}>{site.announcementText}</div> : null}

      <nav className="sticky top-0 z-40 backdrop-blur" style={{ background: `${c.bg}f2`, borderBottom: `1px solid ${c.soft}` }}>
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a href="#inicio" className="shrink-0 text-lg font-extrabold" style={heading}>{site.name}</a>
          <div className="flex flex-1 gap-1 overflow-x-auto py-2 text-sm font-semibold sm:justify-center">
            {[['#inicio', 'Inicio'], ['#productos', preset.itemsNav], ['#como', 'Cómo funciona'], ['#contacto', 'Contacto']].map(([href, label]) => (
              <a key={href} href={href} className="whitespace-nowrap rounded-full px-3 py-2" style={{ color: c.mut }}>{label}</a>
            ))}
          </div>
          {heroWa ? <a href={heroWa} target="_blank" rel="noreferrer" className="shrink-0 rounded-full px-4 py-2 text-xs font-extrabold" style={btn(accent, c.onAccent)}>{preset.cta}</a> : null}
        </div>
      </nav>

      <section id="inicio">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:py-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.22em]" style={{ color: accent }}>{preset.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black leading-[1.02] sm:text-6xl" style={heading}>{site.heroTitle?.trim() && site.heroTitle.trim() !== site.name ? site.heroTitle : preset.title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-8" style={{ color: c.mut }}>{site.heroSubtitle?.trim() && !/^compra fácil/i.test(site.heroSubtitle) ? site.heroSubtitle : preset.lead}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={heroWa ?? '#productos'} {...(heroWa ? { target: '_blank', rel: 'noreferrer' } : {})} className="rounded-full px-6 py-3 text-sm font-extrabold" style={btn(accent, c.onAccent)}>{preset.cta}</a>
              <a href="#productos" className="rounded-full px-6 py-3 text-sm font-extrabold" style={{ boxShadow: `inset 0 0 0 2px ${accent}`, color: c.fg }}>{preset.itemsNav}</a>
            </div>
          </div>
          <div className="relative aspect-[4/3.1] overflow-hidden rounded-[2rem] shadow-2xl" style={{ background: c.soft }}>
            {site.heroImageUrl ? <img src={site.heroImageUrl} alt={site.name} className="absolute inset-0 h-full w-full object-cover" /> : <Art html={hero ?? ''} />}
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 pb-10 sm:px-6 md:grid-cols-4">
          {preset.highlights.map(([t, s]) => (
            <div key={t} className="rounded-2xl px-4 py-4" style={{ background: c.soft }}>
              <p className="font-extrabold">{t}</p>
              <p className="text-sm" style={{ color: c.mut }}>{s}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="productos" style={{ borderTop: `1px solid ${c.soft}` }}>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[.22em]" style={{ color: accent }}>{preset.itemsNav}</p>
          <h2 className="mt-2 text-3xl font-black sm:text-4xl" style={heading}>{preset.itemsTitle}</h2>
          <p className="mt-2 max-w-2xl" style={{ color: c.mut }}>{preset.itemsLead}</p>
          <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3">
            {cards.map((card) => {
              const soldOut = card.stock?.state === 'out';
              const link = soldOut ? null : wa(`${preset.ctaMessage} ${card.name}`);
              return (
                <article key={card.key} className="flex flex-col overflow-hidden rounded-3xl" style={{ background: c.card, boxShadow: `0 1px 0 ${c.soft}` }}>
                  <div className="relative aspect-[5/4]" style={{ background: c.soft }}>
                    {card.image ? <img src={card.image} alt={card.name} className="absolute inset-0 h-full w-full object-cover" style={soldOut ? { filter: 'grayscale(1)', opacity: 0.55 } : undefined} /> : <div style={soldOut ? { filter: 'grayscale(1)', opacity: 0.55 } : undefined}><Art html={card.art} /></div>}
                    {card.stock && card.stock.state !== 'ok' && card.stock.label ? <span className="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-extrabold" style={soldOut ? { background: '#1f2937', color: '#ffffff' } : { background: '#fde68a', color: '#78350f' }}>{card.stock.label}</span> : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h3 className="font-extrabold leading-snug">{card.name}</h3>
                    {card.meta ? <p className="line-clamp-2 text-sm" style={{ color: c.mut }}>{card.meta}</p> : null}
                    <p className="text-sm font-bold" style={{ color: card.price ? c.fg : c.mut }}>{card.price ?? (card.sample ? 'Muestra de diseño' : 'Consultar precio')}</p>
                    {soldOut ? <span className="mt-auto rounded-xl px-3 py-2 text-center text-sm font-extrabold opacity-60" style={btn(c.soft, c.fg)}>No disponible por ahora</span> : null}
                    {link ? <a href={link} target="_blank" rel="noreferrer" className="mt-auto rounded-xl px-3 py-2 text-center text-sm font-extrabold" style={btn(c.soft, c.fg)}>{preset.itemCta}</a> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="como" style={{ borderTop: `1px solid ${c.soft}` }}>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-3xl font-black sm:text-4xl" style={heading}>{preset.stepsTitle}</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {preset.steps.map(([t, s]) => (
              <div key={t} className="rounded-2xl p-5" style={{ background: c.card }}>
                <p className="font-extrabold">{t}</p>
                <p className="mt-1 text-sm" style={{ color: c.mut }}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {extras.length ? (
        <div style={{ background: c.deep, color: '#ffffff' }}>
          <SiteExtraSections sections={extras} accentColor={accent} />
        </div>
      ) : null}

      <footer id="contacto" style={{ background: c.deep, color: '#ffffff' }}>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-3xl font-black sm:text-4xl" style={heading}>{preset.contactTitle}</h2>
          <p className="mt-2 max-w-xl opacity-80">{preset.contactLead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {heroWa ? <a href={heroWa} target="_blank" rel="noreferrer" className="rounded-full px-6 py-3 text-sm font-extrabold" style={btn(accent, c.onAccent)}>WhatsApp</a> : null}
            {socials.map(([label, href]) => (
              <a key={label} href={href as string} target="_blank" rel="noreferrer" className="rounded-full px-5 py-3 text-sm font-extrabold" style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.35)' }}>{label}</a>
            ))}
          </div>
          <p className="mt-10 text-xs opacity-60">{site.name} · Página hecha con Yalika</p>
        </div>
      </footer>
    </main>
  );
}

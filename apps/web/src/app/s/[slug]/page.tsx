type SiteSection = {
  id: string;
  type: string;
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  layout: string;
};

type Site = {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;

  primaryColor: string | null;
  accentColor: string | null;

  backgroundType: string;
  backgroundValue: string | null;

  logoUrl: string | null;
  heroImageUrl: string | null;

  heroTitle: string | null;
  heroSubtitle: string | null;
  heroButtonText: string | null;
  heroButtonUrl: string | null;

  company: {
    id: string;
    name: string;
  };

  sections: SiteSection[];
};

async function getSite(
  slug: string,
): Promise<Site | null> {
  const apiUrl =
    process.env.ORION_API_URL ??
    'http://localhost:3000';

  try {
    const response = await fetch(
      `${apiUrl}/site/public/${slug}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Site;
  } catch {
    return null;
  }
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;

  const site = await getSite(slug);

  if (!site) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">
            ORION
          </p>

          <h1 className="mt-4 text-3xl font-semibold">
            Sitio no encontrado
          </h1>
        </div>
      </main>
    );
  }

  const backgroundStyle =
    site.backgroundType === 'image' &&
    site.backgroundValue
      ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url("${site.backgroundValue}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {
          background:
            site.backgroundValue ??
            '#020617',
        };

  return (
    <main
      className="min-h-screen text-white"
      style={backgroundStyle}
    >
      <section className="flex min-h-[82vh] items-center justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-6xl text-center">
          {site.logoUrl ? (
            <img
              src={site.logoUrl}
              alt={site.name}
              className="mx-auto mb-8 h-20 w-auto object-contain"
            />
          ) : (
            <p
              className="text-sm font-semibold uppercase tracking-[0.35em]"
              style={{
                color:
                  site.accentColor ??
                  '#22d3ee',
              }}
            >
              {site.company.name}
            </p>
          )}

          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl md:text-7xl">
            {site.heroTitle ??
              site.name}
          </h1>

          {site.heroSubtitle && (
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {site.heroSubtitle}
            </p>
          )}

          {site.heroButtonText && (
            <a
              href={
                site.heroButtonUrl ??
                '#catalog'
              }
              className="mt-10 inline-flex rounded-full px-7 py-3 text-sm font-semibold text-slate-950 transition hover:scale-105"
              style={{
                backgroundColor:
                  site.accentColor ??
                  '#22d3ee',
              }}
            >
              {site.heroButtonText}
            </a>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {site.sections
            .filter(
              (section) =>
                section.type !== 'hero',
            )
            .map((section) => (
              <article
                key={section.id}
                id={section.type}
                className="rounded-3xl border border-white/10 bg-black/20 p-6 backdrop-blur"
              >
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  {section.type}
                </p>

                <h2 className="mt-3 text-xl font-semibold">
                  {section.title ??
                    section.type}
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Este bloque será alimentado automáticamente por ORION.
                </p>
              </article>
            ))}
        </div>
      </section>
    </main>
  );
}
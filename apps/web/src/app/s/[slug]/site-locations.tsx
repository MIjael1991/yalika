import { mapsHref, readLocations, telHref } from './maps-link';

/** Domicilios del negocio, cada uno con su botón "Cómo llegar". */
export function SiteLocations({ title, content, accentColor }: { title: string | null; content: unknown; accentColor: string }) {
  const rows = readLocations(content);
  if (rows.length === 0) return null;

  return (
    <section id="ubicaciones" className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-black">{title || (rows.length > 1 ? 'Nuestros domicilios' : 'Dónde estamos')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((row, index) => {
            const href = mapsHref(row);
            const tel = row.phone ? telHref(row.phone) : null;
            return (
              <article key={index} className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/5 p-5">
                {row.name ? <h3 className="text-lg font-extrabold">{row.name}</h3> : null}
                {row.address ? <p className="leading-7 text-white/75">{row.address}</p> : null}
                {row.hours ? <p className="text-sm text-white/60">Horario: {row.hours}</p> : null}
                {tel ? (
                  <a href={tel} className="text-sm font-bold" style={{ color: accentColor }}>
                    {row.phone}
                  </a>
                ) : null}
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-slate-950"
                    style={{ backgroundColor: accentColor }}
                  >
                    Cómo llegar
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

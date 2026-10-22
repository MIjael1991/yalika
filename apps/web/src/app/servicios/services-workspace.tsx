'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from './servicios.module.css';

type Service = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: string;
  /** Siempre está; no se puede ocultar. */
  always?: boolean;
};

// Ordenados por para quién son. El id es el mismo que guarda el API.
const groups: { title: string; services: Service[] }[] = [
  {
    title: 'Para ti',
    services: [
      { id: 'life', name: 'Mi día', description: 'Tareas, recordatorios y pendientes.', href: '/life', icon: '☀' },
      { id: 'health', name: 'Salud', description: 'Tu información y atención de salud.', href: '/salud', icon: '♡' },
      { id: 'veterinaria', name: 'Veterinaria', description: 'Fichas, consultas y recetas de tus mascotas.', href: '/veterinaria', icon: '✚' },
      { id: 'studio', name: 'Estudio', description: 'Escribe, convierte y escanea documentos, incluso sin internet.', href: '/estudio', icon: '✎', always: true },
    ],
  },
  {
    title: 'Ayuda cerca de ti',
    services: [
      { id: 'presente', name: 'Tequio', description: 'Plomeros, médicos, ingenieros, clases y más, verificados.', href: '/tequio', icon: '⌖' },
    ],
  },
  {
    title: 'Tu negocio',
    services: [
      { id: 'pos', name: 'Punto de venta', description: 'Caja, productos, inventario y ventas.', href: '/pos', icon: '▣' },
      { id: 'sites', name: 'Mis páginas', description: 'Tu página y catálogo en internet.', href: '/sites', icon: '◎' },
      { id: 'surveys', name: 'Encuestas', description: 'Crea preguntas y consulta resultados.', href: '/encuestas', icon: '▤' },
    ],
  },
];

const ids = groups.flatMap((g) => g.services.filter((s) => !s.always).map((s) => s.id));
const cacheKey = (userId: string) => `yalika.visible-services.v1:${userId}`;

export function ServicesWorkspace({
  user,
}: {
  user: { id: string; name: string; modules: string[] };
}) {
  const [available, setAvailable] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    fetch('/api/yalika/assistant-preference/modules', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as {
          availableModules?: unknown;
          visibleModules?: unknown;
        };
        if (
          !Array.isArray(body.availableModules) ||
          (body.visibleModules !== null && !Array.isArray(body.visibleModules))
        ) {
          throw new Error();
        }
        let chosen: string[];
        if (Array.isArray(body.visibleModules)) {
          chosen = body.visibleModules.filter((id): id is string => typeof id === 'string');
        } else {
          try {
            const cache: unknown = JSON.parse(localStorage.getItem(cacheKey(user.id)) || '[]');
            chosen = Array.isArray(cache)
              ? cache.filter((id): id is string => typeof id === 'string' && ids.includes(id))
              : [];
          } catch {
            chosen = [];
          }
        }
        if (!live) return;
        setAvailable(body.availableModules.filter((id): id is string => typeof id === 'string'));
        setSaved(chosen);
        setDraft(chosen);
        setReady(true);
        setNotice(body.visibleModules === null ? 'Elige tus servicios y guarda.' : '');
      })
      .catch(() => {
        if (live) setNotice('No pudimos cargar tu selección. Reintenta; no se cambió nada.');
      });
    return () => {
      live = false;
    };
  }, [user.id, retry]);

  const allowed = (id: string) =>
    available.includes(id) && (user.modules.includes('all') || user.modules.includes(id));
  const changed = JSON.stringify([...draft].sort()) !== JSON.stringify([...saved].sort());

  function toggle(id: string) {
    if (!ready || busy || !allowed(id)) return;
    setDraft((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setNotice('Guardando…');
    const next = draft.filter((id) => allowed(id));
    try {
      const response = await fetch('/api/yalika/assistant-preference/modules', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibleModules: next }),
      });
      const body = (await response.json().catch(() => null)) as { visibleModules?: unknown } | null;
      if (!response.ok || JSON.stringify(body?.visibleModules) !== JSON.stringify(next)) {
        throw new Error();
      }
      setSaved(next);
      setDraft(next);
      try {
        localStorage.setItem(cacheKey(user.id), JSON.stringify(next));
      } catch {
        // Sin almacenamiento local: la cuenta ya quedó guardada.
      }
      window.dispatchEvent(new Event('yalika:services-changed'));
      setNotice('Guardado. Ocultar un servicio no borra su información.');
    } catch {
      setNotice('No se confirmó el guardado. Tu selección sigue aquí para reintentar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>YALIKA · A TU MEDIDA</p>
          <h1>Mis servicios</h1>
          <p>Marca los que quieres ver en tu inicio y en el menú. Ocultar uno no borra nada.</p>
        </header>

        {groups.map((group) => {
          const visible = group.services.filter((s) => s.always || available.includes(s.id));
          if (!visible.length) return null;
          return (
            <section key={group.title} className={styles.group}>
              <h2>{group.title}</h2>
              <div className={styles.grid}>
                {visible.map((service) => (
                  <article key={service.id} className={styles.card}>
                    <div className={styles.top}>
                      <span className={styles.icon} aria-hidden>
                        {service.icon}
                      </span>
                      <h3 className={styles.name}>{service.name}</h3>
                    </div>
                    <p className={styles.description}>{service.description}</p>
                    <div className={styles.bottom}>
                      {service.always ? (
                        <span className={styles.always}>Siempre disponible</span>
                      ) : allowed(service.id) ? (
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={draft.includes(service.id)}
                            disabled={!ready || busy}
                            onChange={() => toggle(service.id)}
                          />
                          En mi inicio
                        </label>
                      ) : (
                        <span className={styles.unavailable}>No disponible en tu cuenta</span>
                      )}
                      {(service.always || allowed(service.id)) && (
                        <Link href={service.href} className={styles.open}>
                          Abrir
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        <section className={changed ? `${styles.save} ${styles.floating}` : styles.save}>
          <p role="status">
            {notice || (changed ? 'Tienes cambios sin guardar.' : 'Todo guardado.')}
          </p>
          <div className={styles.actions}>
            {ready ? (
              <>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy || !changed}
                  onClick={() => void save()}
                >
                  {busy ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy || !changed}
                  onClick={() => setDraft([...saved])}
                >
                  Descartar
                </button>
              </>
            ) : (
              <button type="button" className={styles.secondary} onClick={() => {
                  setNotice('');
                  setRetry((n) => n + 1);
                }}>
                Reintentar
              </button>
            )}
          </div>
        </section>

        <p className={styles.footer}>
          Próximamente: Movilidad y Educación. Mostrar un servicio no da permisos ni acceso a datos
          de otras personas.
        </p>
      </div>
    </main>
  );
}

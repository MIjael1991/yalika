'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  PLACE_LABELS,
  presenteApi,
  PresenteApiError,
  ratingLabel,
  type ClientProfile,
  type Place,
  type PresenteProvider,
} from '@/lib/yalika-presente';

import { PlaceEditor, PlaceSummary } from '../place-editor';
import { FiscalForm } from '../fiscal-form';
import styles from '../presente.module.css';

/** "nuevo:Casa de mamá" crea uno con ese nombre; un id edita ese lugar. */
type Editing = { id: string } | { label: string } | null;

/**
 * Mis datos: tu nombre, tus lugares (Casa, Casa de mamá, Oficina...) y, si ofreces servicios,
 * darte de baja o volver.
 */
export function ClientProfileForm() {
  const [profile, setProfile] = useState<ClientProfile | null | undefined>(undefined);
  const [places, setPlaces] = useState<Place[]>([]);
  const [provider, setProvider] = useState<PresenteProvider | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([
      presenteApi.client(),
      presenteApi.places().catch(() => [] as Place[]),
      presenteApi.me().catch(() => null),
    ])
      .then(([p, list, me]) => {
        if (!live) return;
        setProfile(p);
        // Si ya ofrece servicios, su nombre sirve para empezar.
        setName(p?.displayName ?? me?.displayName ?? '');
        setPlaces(list);
        setProvider(me);
      })
      .catch((failure: unknown) => {
        if (!live) return;
        setProfile(null);
        if (failure instanceof PresenteApiError && failure.status === 401) setSignedOut(true);
        setError(
          failure instanceof PresenteApiError && failure.status === 401
            ? 'Inicia sesión para continuar.'
            : failure instanceof Error
              ? failure.message
              : 'No se pudieron cargar tus datos.',
        );
      });
    return () => {
      live = false;
    };
  }, []);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return setError('Escribe tu nombre.');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setProfile(await presenteApi.saveClient({ displayName: name.trim() }));
      setNotice('Tu nombre quedó guardado.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  function saved(place: Place) {
    setPlaces((current) =>
      current.some((p) => p.id === place.id)
        ? current.map((p) => (p.id === place.id ? place : p))
        : [...current, place],
    );
    setEditing(null);
    setError('');
    setNotice(`«${place.label}» quedó guardado.`);
  }

  async function remove(place: Place) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await presenteApi.removePlace(place.id);
      setPlaces((current) => current.filter((p) => p.id !== place.id));
      setNotice(`Borraste «${place.label}».`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo borrar.');
    } finally {
      setBusy(false);
      setRemoving('');
    }
  }

  const missing = PLACE_LABELS.filter((label) => !places.some((p) => p.label === label));
  const editingPlace = editing && 'id' in editing ? places.find((p) => p.id === editing.id) : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header>
          <p className={styles.eyebrow}>Yalika · Tequio</p>
          <h1 className={styles.title}>Mis datos</h1>
          <p className={styles.sub}>
            Tu nombre y los lugares a donde te pueden ir a ayudar. Los capturas una vez y al
            pedir solo eliges el lugar.
          </p>
          <Link href="/tequio" className={styles.link}>
            Volver
          </Link>
        </header>

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {signedOut ? (
          <div className={styles.actions}>
            <Link href="/login" className={styles.primary}>
              Iniciar sesión
            </Link>
          </div>
        ) : profile === undefined ? (
          <p className={styles.meta}>Cargando…</p>
        ) : (
          <>
            <form className={styles.card} onSubmit={saveName}>
              <h2 className={styles.cardTitle}>Tu nombre</h2>
              <div className={styles.nameRow}>
                <label className={styles.field}>
                  <span className={styles.srOnly}>Tu nombre</span>
                  <input
                    value={name}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Como quieres que te llamen"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button type="submit" className={styles.primary} disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              {profile && <p className={styles.meta}>Tu calificación: {ratingLabel(profile.rating)}</p>}
            </form>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Mis lugares</h2>
              {!profile ? (
                <p className={styles.meta}>Primero guarda tu nombre; luego agrega tus lugares.</p>
              ) : (
                <>
                  <p className={styles.meta}>
                    Tu casa, la casa de un familiar, tu oficina… El punto exacto y la foto solo
                    los ve la persona que elijas, mientras dura el trabajo.
                  </p>
                  {places.map((place) =>
                    editingPlace?.id === place.id ? (
                      <div key={place.id} className={styles.placeEditing}>
                        <PlaceEditor place={place} onSaved={saved} onCancel={() => setEditing(null)} />
                      </div>
                    ) : (
                      <article key={place.id} className={styles.placeCard}>
                        <PlaceSummary place={place} />
                        {!place.address && (
                          <p className={styles.hint}>Completa la calle y el número para usarlo.</p>
                        )}
                        {removing === place.id ? (
                          <div className={styles.confirm}>
                            <span>¿Borrar «{place.label}»?</span>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => remove(place)}
                            >
                              Sí, borrar
                            </button>
                            <button type="button" className={styles.secondary} onClick={() => setRemoving('')}>
                              No
                            </button>
                          </div>
                        ) : (
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.secondary}
                              onClick={() => setEditing({ id: place.id })}
                            >
                              Cambiar
                            </button>
                            <button type="button" className={styles.link} onClick={() => setRemoving(place.id)}>
                              Borrar
                            </button>
                          </div>
                        )}
                      </article>
                    ),
                  )}

                  {editing && 'label' in editing ? (
                    <div className={styles.placeEditing}>
                      <h3 className={styles.formTitle}>Nuevo lugar</h3>
                      <PlaceEditor
                        key={editing.label}
                        defaultLabel={editing.label}
                        onSaved={saved}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  ) : (
                    <div className={styles.addPlaces}>
                      <span className={styles.meta}>Agregar:</span>
                      {missing.map((label) => (
                        <button
                          key={label}
                          type="button"
                          className={styles.chip}
                          onClick={() => setEditing({ label })}
                        >
                          + {label}
                        </button>
                      ))}
                      <button type="button" className={styles.chip} onClick={() => setEditing({ label: '' })}>
                        + Otro lugar
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            {profile && places.length > 0 && (
              <div className={styles.actions}>
                <Link href="/tequio/pedir" className={styles.primary}>
                  Pedir ayuda
                </Link>
              </div>
            )}

            <details className={styles.category}>
              <summary>
                <span>
                  <strong>Mis datos para factura</strong>
                  <small>RFC, régimen y código postal, para cuando pidas factura</small>
                </span>
              </summary>
              <div className={styles.card}>
                <FiscalForm />
              </div>
            </details>

            <Link href="/cuenta?seccion=servicios" className={styles.otherLink}>
              {provider ? 'Tus servicios, cédulas y darte de baja están en ' : '¿Sabes hacer o enseñar algo? Actívalo en '}
              <strong>Cuenta › Lo que sé hacer</strong>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

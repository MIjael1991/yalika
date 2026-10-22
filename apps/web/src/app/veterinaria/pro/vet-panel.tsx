'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  formatAge,
  formatDateTime,
  modeLabel,
  prescribableStatuses,
  reasonLabel,
  sexLabel,
  speciesLabel,
  statusLabel,
  vetApi,
  VetApiError,
  type NewVetPrescriptionItem,
  type VetConsultation,
} from '@/lib/yalika-veterinaria';

import { LoadError } from '../load-error';
import styles from '../veterinaria.module.css';

type DraftItem = {
  key: number;
  medicationName: string;
  dosageText: string;
  frequencyText: string;
  durationText: string;
  instructions: string;
};

const MAX_ITEMS = 30;

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function VetPanel() {
  const [list, setList] = useState<VetConsultation[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadStatus, setLoadStatus] = useState(0);
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const counter = useRef(0);
  const idempotencyKey = useRef('');

  useEffect(() => {
    let live = true;
    vetApi
      .assigned()
      .then((rows) => {
        if (live) setList(rows);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setLoadStatus(e instanceof VetApiError ? e.status : 0);
        setLoadError(
          e instanceof VetApiError && e.status === 404
            ? 'Veterinaria todavía no está disponible para tu cuenta.'
            : e instanceof Error
              ? e.message
              : 'No pudimos cargar tus consultas.',
        );
      });
    return () => {
      live = false;
    };
  }, [reload]);

  function blankItem(): DraftItem {
    counter.current += 1;
    return {
      key: counter.current,
      medicationName: '',
      dosageText: '',
      frequencyText: '',
      durationText: '',
      instructions: '',
    };
  }

  function retry() {
    setList(null);
    setLoadError('');
    setLoadStatus(0);
    setReload((value) => value + 1);
  }

  function openForm(id: string) {
    setOpenId(id);
    setItems([blankItem()]);
    setError('');
    setReasons([]);
    setNotice('');
    idempotencyKey.current = newKey();
  }

  function patchItem(key: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!openId || busy) return;
    const payload: NewVetPrescriptionItem[] = items
      .filter((i) => i.medicationName.trim())
      .map((i) => ({
        medicationName: i.medicationName.trim(),
        ...(i.dosageText.trim() ? { dosageText: i.dosageText.trim() } : {}),
        ...(i.frequencyText.trim() ? { frequencyText: i.frequencyText.trim() } : {}),
        ...(i.durationText.trim() ? { durationText: i.durationText.trim() } : {}),
        ...(i.instructions.trim() ? { instructions: i.instructions.trim() } : {}),
      }));
    if (!payload.length) {
      setError('Escribe el nombre de al menos un medicamento.');
      return;
    }
    setBusy(true);
    setError('');
    setReasons([]);
    try {
      await vetApi.issuePrescription(openId, {
        issuedAt: new Date().toISOString(),
        idempotencyKey: idempotencyKey.current,
        items: payload,
      });
      setOpenId(null);
      setItems([]);
      setNotice('Receta emitida. El tutor ya puede verla en la ficha de su mascota.');
    } catch (e) {
      if (e instanceof VetApiError && e.status === 403) {
        setError(e.message);
        setReasons(e.reasons);
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo emitir la receta.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Yalika · Veterinaria</p>
            <h1 className={styles.title}>Mis consultas como veterinario</h1>
            <p className={styles.sub}>
              Aquí aparecen las consultas en las que un tutor te asignó con tu correo de
              Yalika.
            </p>
          </div>
          <nav className={styles.nav} aria-label="Veterinaria">
            <Link href="/veterinaria" className={styles.link}>
              ← Mis mascotas
            </Link>
            <Link href="/salud/profesional" className={styles.link}>
              Mi perfil profesional
            </Link>
          </nav>
        </header>

        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}

        {loadError && (
          <LoadError message={loadError} status={loadStatus} onRetry={retry} />
        )}

        {!loadError && list === null && <p role="status">Cargando tus consultas…</p>}

        {list && list.length === 0 && (
          <p className={styles.empty}>No tienes consultas asignadas por ahora.</p>
        )}

        {list && list.length > 0 && (
          <ul className={styles.list}>
            {list.map((c) => (
              <li key={c.id} className={styles.item}>
                <strong>
                  {c.pet?.name ?? 'Mascota'} ·{' '}
                  {[speciesLabel(c.pet?.species), c.pet?.breed, sexLabel(c.pet?.sex)]
                    .filter(Boolean)
                    .join(' · ')}
                </strong>
                <span className={styles.meta}>
                  {formatAge(c.pet?.birthDate)} · {modeLabel(c.mode)} · {statusLabel(c.status)}
                </span>
                <span className={styles.meta}>{formatDateTime(c.scheduledAt)}</span>
                {c.reason && <span>{c.reason}</span>}

                {openId !== c.id && prescribableStatuses.includes(c.status) && (
                  <div className={styles.actions}>
                    <button type="button" className={styles.primary} onClick={() => openForm(c.id)}>
                      Emitir receta
                    </button>
                  </div>
                )}

                {openId === c.id && (
                  <form className={styles.form} onSubmit={submit} noValidate>
                    {items.map((item, index) => (
                      <fieldset key={item.key} className={styles.card}>
                        <legend>Medicamento {index + 1}</legend>
                        <label className={styles.field}>
                          Medicamento
                          <input
                            value={item.medicationName}
                            maxLength={160}
                            onChange={(e) => patchItem(item.key, { medicationName: e.target.value })}
                          />
                        </label>
                        <div className={styles.row}>
                          <label className={styles.field}>
                            Dosis
                            <input
                              value={item.dosageText}
                              maxLength={160}
                              onChange={(e) => patchItem(item.key, { dosageText: e.target.value })}
                            />
                          </label>
                          <label className={styles.field}>
                            Cada cuánto
                            <input
                              value={item.frequencyText}
                              maxLength={160}
                              onChange={(e) => patchItem(item.key, { frequencyText: e.target.value })}
                            />
                          </label>
                          <label className={styles.field}>
                            Durante
                            <input
                              value={item.durationText}
                              maxLength={160}
                              onChange={(e) => patchItem(item.key, { durationText: e.target.value })}
                            />
                          </label>
                        </div>
                        <label className={styles.field}>
                          Indicaciones
                          <textarea
                            value={item.instructions}
                            maxLength={500}
                            onChange={(e) => patchItem(item.key, { instructions: e.target.value })}
                          />
                        </label>
                        {items.length > 1 && (
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() =>
                                setItems((current) => current.filter((i) => i.key !== item.key))
                              }
                            >
                              Quitar
                            </button>
                          </div>
                        )}
                      </fieldset>
                    ))}

                    {error && (
                      <div role="alert" className={styles.error}>
                        {error}
                        {reasons.length > 0 && (
                          <ul className={styles.reasons}>
                            {reasons.map((code) => (
                              <li key={code}>{reasonLabel(code)}</li>
                            ))}
                          </ul>
                        )}
                        {reasons.length > 0 && (
                          <p>
                            Completa tu habilitación en{' '}
                            <Link href="/salud/profesional" className={styles.link}>
                              Mi perfil profesional
                            </Link>
                            .
                          </p>
                        )}
                      </div>
                    )}

                    <div className={styles.actions}>
                      {items.length < MAX_ITEMS && (
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={busy}
                          onClick={() => setItems((current) => [...current, blankItem()])}
                        >
                          Agregar otro medicamento
                        </button>
                      )}
                      <button type="submit" className={styles.primary} disabled={busy}>
                        {busy ? 'Emitiendo…' : 'Emitir receta'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => setOpenId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className={styles.footer}>
          Solo un veterinario verificado, con establecimiento vigente, puede emitir recetas.
          Todo lo que emites queda registrado.
        </p>
      </div>
    </main>
  );
}

'use client';

/* eslint-disable @next/next/no-img-element -- vista previa local de la foto */

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  nearestMunicipality,
  photoToDataUrl,
  PLACE_LABELS,
  presenteApi,
  type Municipality,
  type Place,
} from '@/lib/yalika-presente';

import { loadMunicipalities, MunicipalitySelect } from './municipality-select';
import { MapPicker } from './presente-map';
import styles from './presente.module.css';

const OTHER = 'Otro';

/**
 * Capturar un lugar una sola vez: cómo le llamas (Casa, Casa de mamá, Oficina), calle y número,
 * el punto exacto en el mapa (revisado), cómo reconocerlo y una foto opcional de afuera.
 */
export function PlaceEditor({
  place,
  defaultLabel,
  onSaved,
  onCancel,
  beforeSave,
}: {
  /** Lugar a cambiar; sin él se crea uno nuevo. */
  place?: Place | null;
  /** Nombre sugerido al crear (por ejemplo "Casa de mamá"). */
  defaultLabel?: string;
  onSaved: (place: Place) => void;
  onCancel?: () => void;
  /** Algo que debe pasar antes de guardar (por ejemplo, guardar el nombre). */
  beforeSave?: () => Promise<boolean>;
}) {
  const startLabel = place?.label ?? defaultLabel ?? '';
  const quick = (PLACE_LABELS as readonly string[]).includes(startLabel);
  const [kind, setKind] = useState(quick ? startLabel : startLabel ? OTHER : '');
  const [customLabel, setCustomLabel] = useState(quick ? '' : startLabel);
  const [street, setStreet] = useState(place?.street ?? '');
  const [number, setNumber] = useState(place?.number ?? '');
  const [neighborhood, setNeighborhood] = useState(place?.neighborhood ?? '');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    place ? { lat: place.lat, lng: place.lng } : null,
  );
  const [municipalityCode, setMunicipalityCode] = useState(place?.municipalityCode ?? '');
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [checked, setChecked] = useState(Boolean(place));
  const [reference, setReference] = useState(place?.reference ?? '');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    loadMunicipalities()
      .then((list) => live && setMunicipalities(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Si el punto llegó antes que la lista de municipios, el municipio se pone en cuanto carga.
  const [pendingNearest, setPendingNearest] = useState(false);
  useEffect(() => {
    if (!pendingNearest || !point || !municipalities.length) return;
    const nearest = nearestMunicipality(municipalities, point);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se completa una sola vez
    if (nearest) setMunicipalityCode(nearest.code);
    setPendingNearest(false);
  }, [pendingNearest, point, municipalities]);

  function choosePoint(next: { lat: number; lng: number }) {
    setPoint(next);
    // Movió el punto: que lo vuelva a revisar.
    setChecked(false);
    const nearest = nearestMunicipality(municipalities, next);
    if (nearest) setMunicipalityCode(nearest.code);
    else setPendingNearest(true);
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setPhoto(await photoToDataUrl(file));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo preparar la foto.');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const label = (kind === OTHER ? customLabel : kind).trim();
    if (label.length < 2) return setError('Elige cómo le llamas a este lugar.');
    if (street.trim().length < 3) return setError('Escribe la calle.');
    if (!point) return setError('Marca en el mapa la puerta del lugar.');
    if (!municipalityCode) return setError('Elige el municipio.');
    if (!checked) return setError('Revisa en el mapa que el punto esté en el lugar correcto y márcalo.');
    if (beforeSave && !(await beforeSave())) return;
    setBusy(true);
    setError('');
    const data = {
      label,
      street: street.trim(),
      number: number.trim() || undefined,
      neighborhood: neighborhood.trim() || undefined,
      municipalityCode,
      lat: point.lat,
      lng: point.lng,
      reference: reference.trim() || undefined,
    };
    try {
      let saved = place
        ? await presenteApi.updatePlace(place.id, data)
        : await presenteApi.addPlace(data);
      if (photo) saved = await presenteApi.setPlacePhoto(saved.id, photo);
      onSaved(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar el lugar.');
    } finally {
      setBusy(false);
    }
  }

  const center = municipalities.find((m) => m.code === municipalityCode) ?? null;

  return (
    <form className={styles.placeForm} onSubmit={save}>
      <div className={styles.field}>
        <span>¿Cómo le llamas a este lugar?</span>
        <div className={styles.chips} role="group" aria-label="Nombre del lugar">
          {[...PLACE_LABELS, OTHER].map((option) => (
            <button
              key={option}
              type="button"
              className={styles.chip}
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
            >
              {option === OTHER ? 'Otro nombre' : option}
            </button>
          ))}
        </div>
        {kind === OTHER && (
          <input
            aria-label="Nombre del lugar"
            value={customLabel}
            maxLength={40}
            placeholder="Ej. Casa de mi hermana, Taller, Rancho"
            onChange={(e) => setCustomLabel(e.target.value)}
          />
        )}
      </div>

      <div className={styles.addressRow}>
        <label className={styles.field}>
          Calle
          <input
            value={street}
            maxLength={120}
            autoComplete="address-line1"
            placeholder="Ej. Av. Madero"
            onChange={(e) => setStreet(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Número
          <input
            value={number}
            maxLength={20}
            placeholder="Ej. 120-B"
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
      </div>
      <label className={styles.field}>
        Colonia (opcional)
        <input
          value={neighborhood}
          maxLength={80}
          placeholder="Ej. Centro"
          onChange={(e) => setNeighborhood(e.target.value)}
        />
      </label>

      <div className={styles.field}>
        <span>Marca la puerta en el mapa</span>
        <MapPicker value={point} onChange={choosePoint} fallbackCenter={center} />
      </div>
      <label className={styles.field}>
        Municipio
        <MunicipalitySelect value={municipalityCode} onChange={setMunicipalityCode} />
      </label>
      {point && (
        <label className={`${styles.check} ${styles.verify}`}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Ya revisé en el mapa: el punto está en el lugar correcto.</span>
        </label>
      )}

      <label className={styles.field}>
        ¿Cómo lo reconocen? (opcional)
        <input
          value={reference}
          maxLength={160}
          placeholder="Ej. portón café, junto a la tienda, entre Juárez y Morelos"
          onChange={(e) => setReference(e.target.value)}
        />
      </label>

      <div className={styles.field}>
        <span>Foto de la fachada o de afuera (opcional)</span>
        <span className={styles.meta}>
          Si estás ahí, tómala desde la calle. Ayuda a que lleguen al lugar exacto; solo la ve la
          persona que elijas, mientras dura el trabajo.
        </span>
        {photo ? (
          <img className={styles.photoThumb} src={photo} alt="Foto del lugar" />
        ) : place?.hasPhoto ? (
          <p className={styles.done}>Ya tiene foto guardada.</p>
        ) : null}
        <div className={styles.actions}>
          <label className={`${styles.secondary} ${styles.voice}`}>
            {photo || place?.hasPhoto ? 'Cambiar foto' : 'Tomar foto'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
          </label>
          {photo && (
            <button type="button" className={styles.link} onClick={() => setPhoto('')}>
              Quitar foto
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Guardando…' : place ? 'Guardar cambios' : 'Guardar este lugar'}
        </button>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Tarjeta de un lugar guardado (para elegirlo o administrarlo). */
export function PlaceSummary({ place }: { place: Place }) {
  return (
    <span className={styles.placeText}>
      <strong>{place.label}</strong>
      <span>{place.address || 'Falta la calle y el número'}</span>
      <small>
        {[place.municipalityName, place.reference].filter(Boolean).join(' · ')}
        {place.hasPhoto ? ' · con foto' : ''}
      </small>
    </span>
  );
}

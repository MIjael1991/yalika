'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  formatAge,
  formatDateTime,
  modeLabel,
  modeOptions,
  sexLabel,
  sexOptions,
  speciesLabel,
  speciesOptions,
  statusLabel,
  vetApi,
  VetApiError,
  type NewVetPet,
  type VetConsultation,
  type VetPet,
  type VetPrescription,
} from '@/lib/yalika-veterinaria';

import { LoadError } from '../../load-error';
import styles from '../../veterinaria.module.css';

function petToForm(pet: VetPet) {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    sex: pet.sex ?? '',
    birthDate: pet.birthDate ? pet.birthDate.slice(0, 10) : '',
    birthDateApprox: pet.birthDateApprox,
    microchip: pet.microchip ?? '',
  };
}

export function PetDetail({ petId }: { petId: string }) {
  const [pet, setPet] = useState<VetPet | null>(null);
  const [consultations, setConsultations] = useState<VetConsultation[]>([]);
  const [prescriptions, setPrescriptions] = useState<VetPrescription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadStatus, setLoadStatus] = useState(0);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(petToForm({
    id: '', name: '', species: 'DOG', breed: null, sex: null, birthDate: null,
    birthDateApprox: false, microchip: null, createdAt: '',
  }));
  const [editError, setEditError] = useState('');

  const [showConsult, setShowConsult] = useState(false);
  const [consult, setConsult] = useState({
    mode: 'presential', scheduledAt: '', reason: '', veterinarianEmail: '',
  });
  const [consultError, setConsultError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      vetApi.getPet(petId),
      vetApi.consultations(petId),
      vetApi.prescriptions(petId),
    ])
      .then(([p, c, r]) => {
        if (!live) return;
        setPet(p);
        setConsultations(c);
        setPrescriptions(r);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLoadStatus(error instanceof VetApiError ? error.status : 0);
        if (error instanceof VetApiError && error.status === 404) setNotFound(true);
        else
          setLoadError(
            error instanceof Error ? error.message : 'No pudimos cargar la ficha.',
          );
      });
    return () => {
      live = false;
    };
  }, [petId, reload]);

  function retry() {
    setLoadError('');
    setLoadStatus(0);
    setLoaded(false);
    setReload((value) => value + 1);
  }

  const isOwner = pet?.guardianRole === 'OWNER';

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!pet || busy) return;
    const before = petToForm(pet);
    const changes: Partial<NewVetPet> = {};
    const name = editForm.name.trim();
    if (!name) {
      setEditError('El nombre no puede quedar vacío.');
      return;
    }
    if (name !== before.name) changes.name = name;
    if (editForm.species !== before.species) changes.species = editForm.species;
    if (editForm.breed.trim() !== before.breed) changes.breed = editForm.breed.trim();
    if (editForm.sex && editForm.sex !== before.sex) changes.sex = editForm.sex;
    if (editForm.birthDate && editForm.birthDate !== before.birthDate) {
      changes.birthDate = editForm.birthDate;
    }
    if (editForm.birthDateApprox !== before.birthDateApprox) {
      changes.birthDateApprox = editForm.birthDateApprox;
    }
    if (editForm.microchip.trim() && editForm.microchip.trim() !== before.microchip) {
      changes.microchip = editForm.microchip.trim();
    }
    if (!Object.keys(changes).length) {
      setEditError('No hay cambios que guardar.');
      return;
    }
    setBusy(true);
    setEditError('');
    try {
      const updated = await vetApi.updatePet(pet.id, changes);
      setPet({ ...updated, guardianRole: pet.guardianRole });
      setEditing(false);
      setNotice('Datos actualizados.');
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function submitConsult(event: FormEvent) {
    event.preventDefault();
    if (!pet || busy) return;
    const when = new Date(consult.scheduledAt);
    if (!consult.scheduledAt || Number.isNaN(when.getTime())) {
      setConsultError('Elige la fecha y hora de la consulta.');
      return;
    }
    setBusy(true);
    setConsultError('');
    setNotice('');
    try {
      const created = await vetApi.createConsultation(pet.id, {
        mode: consult.mode,
        scheduledAt: when.toISOString(),
        ...(consult.reason.trim() ? { reason: consult.reason.trim() } : {}),
        ...(consult.veterinarianEmail.trim()
          ? { veterinarianEmail: consult.veterinarianEmail.trim() }
          : {}),
      });
      setConsultations((current) => [created, ...current]);
      setShowConsult(false);
      setConsult({ mode: 'presential', scheduledAt: '', reason: '', veterinarianEmail: '' });
      setNotice('Consulta agendada.');
    } catch (error) {
      setConsultError(
        error instanceof Error ? error.message : 'No se pudo agendar la consulta.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <p role="alert" className={styles.error}>
            No encontramos esta mascota en tu cuenta.
          </p>
          <Link href="/veterinaria" className={styles.link}>
            Volver a mis mascotas
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Yalika · Veterinaria</p>
            <h1 className={styles.title}>{pet ? pet.name : 'Ficha de mascota'}</h1>
          </div>
          <Link href="/veterinaria" className={styles.link}>
            ← Mis mascotas
          </Link>
        </header>

        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}

        {loadError && (
          <LoadError message={loadError} status={loadStatus} onRetry={retry} />
        )}

        {!loaded && !loadError && <p role="status">Cargando la ficha…</p>}

        {loaded && pet && (
          <>
            <section className={styles.card} aria-label="Datos de la mascota">
              <h2 className={styles.cardTitle}>Datos</h2>
              {!editing ? (
                <>
                  <p className={styles.meta}>
                    {[speciesLabel(pet.species), pet.breed, sexLabel(pet.sex)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className={styles.meta}>{formatAge(pet.birthDate, pet.birthDateApprox)}</p>
                  {pet.microchip && <p className={styles.meta}>Microchip: {pet.microchip}</p>}
                  {isOwner ? (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => {
                          setEditForm(petToForm(pet));
                          setEditError('');
                          setNotice('');
                          setEditing(true);
                        }}
                      >
                        Editar datos
                      </button>
                    </div>
                  ) : (
                    <p className={styles.meta}>
                      Eres cotutor: puedes ver la ficha, pero solo el tutor principal edita los
                      datos.
                    </p>
                  )}
                </>
              ) : (
                <form className={styles.form} onSubmit={saveEdit} noValidate>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      Nombre
                      <input
                        value={editForm.name}
                        maxLength={80}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      Especie
                      <select
                        value={editForm.species}
                        onChange={(e) => setEditForm({ ...editForm, species: e.target.value })}
                      >
                        {speciesOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      Raza
                      <input
                        value={editForm.breed}
                        maxLength={80}
                        onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      Sexo
                      <select
                        value={editForm.sex}
                        onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}
                      >
                        <option value="">Sin indicar</option>
                        {sexOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      Fecha de nacimiento
                      <input
                        type="date"
                        value={editForm.birthDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      Microchip
                      <input
                        value={editForm.microchip}
                        maxLength={40}
                        onChange={(e) => setEditForm({ ...editForm, microchip: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={editForm.birthDateApprox}
                      onChange={(e) =>
                        setEditForm({ ...editForm, birthDateApprox: e.target.checked })
                      }
                    />
                    La fecha es aproximada
                  </label>
                  {editError && (
                    <p role="alert" className={styles.error}>
                      {editError}
                    </p>
                  )}
                  <div className={styles.actions}>
                    <button type="submit" className={styles.primary} disabled={busy}>
                      {busy ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => setEditing(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className={styles.card} aria-label="Consultas">
              <h2 className={styles.cardTitle}>Consultas</h2>
              {consultations.length === 0 && (
                <p className={styles.empty}>Aún no hay consultas para {pet.name}.</p>
              )}
              {consultations.length > 0 && (
                <ul className={styles.list}>
                  {consultations.map((c) => (
                    <li key={c.id} className={styles.item}>
                      <strong>
                        {modeLabel(c.mode)} · {statusLabel(c.status)}
                      </strong>
                      <span className={styles.meta}>{formatDateTime(c.scheduledAt)}</span>
                      {c.reason && <span>{c.reason}</span>}
                      <span className={styles.meta}>
                        {c.veterinarianUserId
                          ? 'Con veterinario asignado'
                          : 'Sin veterinario asignado'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!showConsult ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => {
                      setNotice('');
                      setShowConsult(true);
                    }}
                  >
                    Agendar consulta
                  </button>
                </div>
              ) : (
                <form className={styles.form} onSubmit={submitConsult} noValidate>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      Tipo de consulta
                      <select
                        value={consult.mode}
                        onChange={(e) => setConsult({ ...consult, mode: e.target.value })}
                      >
                        {modeOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      Fecha y hora
                      <input
                        type="datetime-local"
                        value={consult.scheduledAt}
                        onChange={(e) => setConsult({ ...consult, scheduledAt: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className={styles.field}>
                    Motivo (opcional)
                    <textarea
                      value={consult.reason}
                      maxLength={1000}
                      onChange={(e) => setConsult({ ...consult, reason: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Correo del veterinario en Yalika (opcional)
                    <input
                      type="email"
                      value={consult.veterinarianEmail}
                      onChange={(e) =>
                        setConsult({ ...consult, veterinarianEmail: e.target.value })
                      }
                    />
                  </label>
                  {consultError && (
                    <p role="alert" className={styles.error}>
                      {consultError}
                    </p>
                  )}
                  <div className={styles.actions}>
                    <button type="submit" className={styles.primary} disabled={busy}>
                      {busy ? 'Guardando…' : 'Guardar consulta'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => {
                        setShowConsult(false);
                        setConsultError('');
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className={styles.card} aria-label="Recetas">
              <h2 className={styles.cardTitle}>Recetas</h2>
              {prescriptions.length === 0 ? (
                <p className={styles.empty}>
                  Todavía no hay recetas. Las emite el veterinario asignado a una consulta.
                </p>
              ) : (
                <ul className={styles.list}>
                  {prescriptions.map((rx) => (
                    <li key={rx.id} className={styles.item}>
                      <strong>Receta del {formatDateTime(rx.issuedAt)}</strong>
                      <ul className={styles.meds}>
                        {rx.items.map((item) => (
                          <li key={item.id}>
                            <strong>{item.medicationName}</strong>
                            {[item.dosageText, item.frequencyText, item.durationText]
                              .filter(Boolean)
                              .map((part) => ` · ${part}`)
                              .join('')}
                            {item.instructions ? ` — ${item.instructions}` : ''}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <p className={styles.footer}>
          Las recetas las emite solo un veterinario verificado. Yalika no sugiere medicamentos
          ni dosis.
        </p>
      </div>
    </main>
  );
}

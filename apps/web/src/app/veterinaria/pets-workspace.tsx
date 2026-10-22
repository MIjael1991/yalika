'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  formatAge,
  sexLabel,
  sexOptions,
  speciesLabel,
  speciesOptions,
  vetApi,
  VetApiError,
  type NewVetPet,
  type VetPet,
} from '@/lib/yalika-veterinaria';

import { LoadError } from './load-error';
import styles from './veterinaria.module.css';

const emptyForm = {
  name: '',
  species: 'DOG',
  breed: '',
  sex: '',
  birthDate: '',
  birthDateApprox: false,
  microchip: '',
};

export function PetsWorkspace() {
  const [pets, setPets] = useState<VetPet[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadStatus, setLoadStatus] = useState(0);
  const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    vetApi
      .pets()
      .then((list) => {
        if (live) setPets(list);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLoadStatus(error instanceof VetApiError ? error.status : 0);
        setLoadError(
          error instanceof VetApiError && error.status === 404
            ? 'Veterinaria todavía no está disponible para tu cuenta.'
            : error instanceof Error
              ? error.message
              : 'No pudimos cargar tus mascotas.',
        );
      });
    return () => {
      live = false;
    };
  }, [reload]);

  function retry() {
    setPets(null);
    setLoadError('');
    setLoadStatus(0);
    setReload((value) => value + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const name = form.name.trim();
    if (!name) {
      setFormError('Escribe el nombre de tu mascota.');
      return;
    }
    const data: NewVetPet = { name, species: form.species };
    if (form.breed.trim()) data.breed = form.breed.trim();
    if (form.sex) data.sex = form.sex;
    if (form.birthDate) {
      data.birthDate = form.birthDate;
      data.birthDateApprox = form.birthDateApprox;
    }
    if (form.microchip.trim()) data.microchip = form.microchip.trim();

    setBusy(true);
    setFormError('');
    setNotice('');
    try {
      const created = await vetApi.createPet(data);
      setPets((current) => [...(current ?? []), { ...created, guardianRole: 'OWNER' }]);
      setForm(emptyForm);
      setShowForm(false);
      setNotice(`${created.name} quedó registrada.`);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'No se pudo registrar la mascota.',
      );
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
            <h1 className={styles.title}>Mis mascotas</h1>
            <p className={styles.sub}>
              Cada mascota tiene su propia ficha, consultas y recetas, separadas de tu
              información personal.
            </p>
          </div>
          <nav className={styles.nav} aria-label="Veterinaria">
            <Link href="/veterinaria/pro" className={styles.link}>
              Soy veterinario
            </Link>
            <Link href="/servicios" className={styles.link}>
              Cambiar de servicio
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

        {!loadError && pets === null && <p role="status">Cargando tus mascotas…</p>}

        {pets && pets.length === 0 && !showForm && (
          <p className={styles.empty}>
            Aún no tienes mascotas registradas. Agrega la primera para empezar.
          </p>
        )}

        {pets && pets.length > 0 && (
          <section className={styles.grid} aria-label="Lista de mascotas">
            {pets.map((pet) => (
              <article key={pet.id} className={styles.card}>
                <h2 className={styles.cardTitle}>{pet.name}</h2>
                <p className={styles.meta}>
                  {[speciesLabel(pet.species), pet.breed, sexLabel(pet.sex)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className={styles.meta}>
                  {formatAge(pet.birthDate, pet.birthDateApprox)}
                </p>
                {pet.guardianRole && (
                  <span className={styles.badge}>
                    {pet.guardianRole === 'OWNER' ? 'Tutor principal' : 'Cotutor'}
                  </span>
                )}
                <Link href={`/veterinaria/mascotas/${pet.id}`} className={styles.link}>
                  Abrir ficha
                </Link>
              </article>
            ))}
          </section>
        )}

        {pets && !showForm && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                setNotice('');
                setShowForm(true);
              }}
            >
              Agregar mascota
            </button>
          </div>
        )}

        {pets && showForm && (
          <form className={`${styles.card} ${styles.form}`} onSubmit={submit} noValidate>
            <h2 className={styles.cardTitle}>Nueva mascota</h2>
            <div className={styles.row}>
              <label className={styles.field}>
                Nombre
                <input
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className={styles.field}>
                Especie
                <select
                  value={form.species}
                  onChange={(e) => setForm({ ...form, species: e.target.value })}
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
                Raza (opcional)
                <input
                  value={form.breed}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, breed: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                Sexo (opcional)
                <select
                  value={form.sex}
                  onChange={(e) => setForm({ ...form, sex: e.target.value })}
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
                Fecha de nacimiento (opcional)
                <input
                  type="date"
                  value={form.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                Microchip (opcional)
                <input
                  value={form.microchip}
                  maxLength={40}
                  onChange={(e) => setForm({ ...form, microchip: e.target.value })}
                />
              </label>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={form.birthDateApprox}
                onChange={(e) => setForm({ ...form, birthDateApprox: e.target.checked })}
              />
              La fecha es aproximada
            </label>
            {formError && (
              <p role="alert" className={styles.error}>
                {formError}
              </p>
            )}
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar mascota'}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setFormError('');
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <p className={styles.footer}>
          Solo tú, y los veterinarios que asignes a una consulta, pueden ver la ficha de
          tu mascota. Yalika no da diagnósticos ni dosis: eso lo decide un veterinario.
        </p>
      </div>
    </main>
  );
}

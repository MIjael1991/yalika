'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  availabilityLabel,
  distanceLabel,
  presenteApi,
  providerName,
  providerPerson,
  ratingLabel,
  tradeLabel,
  type SearchResult,
} from '@/lib/yalika-presente';

import { Avatar } from './icons';
import { MunicipalitySelect } from './municipality-select';
import { ProviderProfileView } from './provider-profile';
import styles from './presente.module.css';

type Filter = 'PERSONAS' | 'NEGOCIOS' | 'DOMICILIO' | 'AHORA' | 'CLASES';
const filterOptions: [Filter, string][] = [
  ['PERSONAS', 'Personas'],
  ['NEGOCIOS', 'Negocios'],
  ['DOMICILIO', 'Entrega a domicilio'],
  ['AHORA', 'Disponible ahora'],
  ['CLASES', 'También enseña'],
];

const passes = (p: SearchResult, filters: Filter[]) =>
  filters.every((f) =>
    f === 'PERSONAS'
      ? !p.isBusiness
      : f === 'NEGOCIOS'
        ? p.isBusiness
        : f === 'DOMICILIO'
          ? p.delivers
          : f === 'AHORA'
            ? p.availableNow
            : p.teaches,
  );

/** Aún no hay nadie: que la gente no se desanime y que quien sabe hacerlo se anime. */
export function NobodyYet({ trade }: { trade: string }) {
  return (
    <div className={styles.nobody}>
      <strong>Todavía nadie ofrece {tradeLabel(trade).toLowerCase()} cerca de ti.</strong>
      <span>
        Pídelo de todos modos: le avisamos en cuanto alguien verificado se conecte. Cada día se
        suma más gente de tu zona.
      </span>
      <div className={styles.actions}>
        <Link href={`/tequio/pedir?oficio=${trade}`} className={styles.primary}>
          Pedirlo de todos modos
        </Link>
        <Link href="/tequio/trabajo" className={styles.link}>
          ¿Tú sabes hacerlo? Ofrécelo
        </Link>
      </div>
    </div>
  );
}

/**
 * Personas y negocios verificados que hacen un servicio y llegan a tu municipio, con filtros.
 * Pides a todos o directo a quien elijas.
 */
export function ProviderResults({
  trade,
  municipality,
  onMunicipality,
}: {
  trade: string;
  municipality: string;
  onMunicipality: (code: string) => void;
}) {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sort, setSort] = useState<'cerca' | 'estrellas'>('cerca');
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trade || !municipality) return;
    let live = true;
    presenteApi
      .search(trade, municipality)
      .then((found) => {
        if (!live) return;
        setResults(found);
        setError('');
      })
      .catch((failure: unknown) => {
        if (!live) return;
        setResults([]);
        setError(failure instanceof Error ? failure.message : 'No se pudo buscar.');
      });
    return () => {
      live = false;
    };
  }, [trade, municipality]);

  const toggleFilter = (f: Filter) =>
    setFilters((current) => (current.includes(f) ? current.filter((x) => x !== f) : [...current, f]));

  const shown = (results ?? [])
    .filter((p) => passes(p, filters))
    .sort((a, b) =>
      sort === 'estrellas'
        ? (b.rating.average ?? 0) - (a.rating.average ?? 0) || a.distanceKm - b.distanceKm
        : 0,
    );

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{tradeLabel(trade)} cerca de ti</h3>
      <div className={styles.row}>
        <label className={styles.field}>
          Municipio
          <MunicipalitySelect value={municipality} onChange={onMunicipality} />
        </label>
        {results && results.length > 1 && (
          <label className={styles.field}>
            Ordenar
            <select value={sort} onChange={(e) => setSort(e.target.value as 'cerca' | 'estrellas')}>
              <option value="cerca">Más cerca</option>
              <option value="estrellas">Más estrellas</option>
            </select>
          </label>
        )}
      </div>

      {!municipality && <p className={styles.meta}>Elige tu municipio para ver quién llega.</p>}
      {error && <p className={styles.hint}>{error}</p>}
      {municipality && results === null && !error && <p className={styles.meta}>Buscando…</p>}
      {results && results.length === 0 && !error && <NobodyYet trade={trade} />}

      {results && results.length > 0 && (
        <>
          <div className={`${styles.chips} ${styles.chipsScroll}`} role="group" aria-label="Filtros">
            {filterOptions.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={styles.chip}
                aria-pressed={filters.includes(key)}
                onClick={() => toggleFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <Link href={`/tequio/pedir?oficio=${trade}`} className={styles.primary}>
              Pedir presupuestos a todos
            </Link>
          </div>
          {shown.length === 0 && (
            <p className={styles.empty}>Nadie cumple esos filtros. Quita alguno para ver más.</p>
          )}
        </>
      )}

      {shown.map((p) => (
        <article key={p.id} className={styles.request}>
          <div className={styles.person}>
            <Avatar name={p.businessName || p.displayName} />
            <div className={styles.personBody}>
              <h3>{providerName(p)}</h3>
              {providerPerson(p) && <p className={styles.meta}>{providerPerson(p)}</p>}
              <p className={styles.meta}>
                {ratingLabel(p.rating)} · {distanceLabel(p.distanceKm)}, {p.municipalityName}
              </p>
              <div className={styles.tags}>
                {p.availableNow ? (
                  <span className={`${styles.tag} ${styles.tagLive}`}>Disponible ahora</span>
                ) : (
                  <span className={styles.tag}>{p.present ? 'Presente' : 'Ausente por ahora'}</span>
                )}
                {p.isBusiness && <span className={styles.tag}>Negocio</span>}
                {p.delivers && <span className={styles.tag}>Lleva a domicilio</span>}
                {p.teaches && <span className={`${styles.tag} ${styles.tagSun}`}>También da clases</span>}
              </div>
              <p className={styles.meta}>
                {trade.startsWith('CLASES') ? 'Días de clase: ' : 'Atiende: '}
                {availabilityLabel(p.availability)}
              </p>
            </div>
          </div>
          {p.bio && <p>{p.bio}</p>}
          {open === p.id && <ProviderProfileView providerId={p.id} />}
          <div className={styles.actions}>
            <Link href={`/tequio/pedir?con=${p.id}&oficio=${trade}`} className={styles.secondary}>
              Pedirle directo
            </Link>
            <button
              type="button"
              className={styles.link}
              onClick={() => setOpen((current) => (current === p.id ? '' : p.id))}
            >
              {open === p.id ? 'Ocultar perfil' : 'Ver perfil'}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

'use client';

import { useState } from 'react';

import {
  searchTrades,
  tradeCategories,
  tradeGroups,
  tradeLabel,
  type TradeRequirement,
} from '@/lib/yalika-presente';

import styles from './presente.module.css';

/**
 * Oficios agrupados por categoría.
 * Las profesiones (ingeniería, leyes, salud...) piden cédula: quien ofrece servicios las elige
 * aquí y se le pide su cédula en ese momento (onProfession).
 * Los que aún no están disponibles se ven como "pronto"; quien pide ayuda no los ve.
 */
export function TradePicker({
  value,
  onChange,
  max,
  hidePending = false,
  forWorker = false,
  openCategory,
  allowed,
  onProfession,
  reviewing = [],
  toVerify = [],
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  hidePending?: boolean;
  /** Quien ofrece servicios: lo que ya tiene se marca en naranja y no se repite. */
  forWorker?: boolean;
  /** Quien ofrece servicios eligió una profesión con cédula: se le pide la cédula. */
  onProfession?: (key: string) => void;
  /** Profesiones cuya cédula ya mandó y está en revisión. */
  reviewing?: readonly string[];
  /** Profesiones que eligió y cuya cédula todavía no manda. */
  toVerify?: readonly string[];
  /** Categoría que se muestra abierta al entrar (por ejemplo, desde el inicio). */
  openCategory?: string;
  /** Solo estos oficios (por ejemplo, los que hace un trabajador de confianza). */
  allowed?: readonly string[];
}) {
  const [query, setQuery] = useState('');
  const usable = ([key, , req]: readonly [string, string, TradeRequirement?]) =>
    !(hidePending && req === 'pronto') &&
    !(forWorker && req === 'titulo' && !onProfession) &&
    (!allowed || allowed.includes(key));
  const results = query.trim() ? searchTrades(query, { hidePending }).filter(usable) : null;

  function chip([key, label, req]: readonly [string, string, TradeRequirement?]) {
    const have = value.includes(key);
    // Quien ofrece: lo que ya tiene se marca en naranja y no se puede repetir.
    if (forWorker && have) {
      return (
        <span key={key} className={`${styles.chip} ${styles.chipHave}`} aria-label={`${label}: ya la tienes`}>
          ✓ {label} · ya la tienes
        </span>
      );
    }
    if (forWorker && (reviewing.includes(key) || toVerify.includes(key))) {
      return (
        <span key={key} className={`${styles.chip} ${styles.chipHave}`}>
          {label} · {reviewing.includes(key) ? 'cédula en revisión' : 'falta tu cédula'}
        </span>
      );
    }
    const professional = forWorker && onProfession && (req === 'titulo' || req === 'cedula');
    return (
      <button
        key={key}
        type="button"
        className={styles.chip}
        aria-pressed={have}
        disabled={req === 'pronto' || (!have && value.length >= max && max > 1)}
        onClick={() => {
          if (professional) {
            onProfession(key);
            setQuery('');
          } else toggle(key);
        }}
      >
        {label}
        {req === 'pronto' ? ' · pronto' : req === 'cedula' || req === 'titulo' ? ' · con cédula' : ''}
      </button>
    );
  }

  function toggle(key: string) {
    if (forWorker) {
      // Se agrega y la búsqueda se borra para buscar lo siguiente.
      if (!value.includes(key)) onChange([...value, key]);
      setQuery('');
      return;
    }
    if (value.includes(key)) return onChange(value.filter((k) => k !== key));
    if (max === 1) return onChange([key]);
    if (value.length < max) onChange([...value, key]);
  }

  const other = tradeCategories.flatMap((c) => c.trades).find(([key]) => key === 'OTRO');

  return (
    <div className={styles.categories}>
      {forWorker && (
        <div className={styles.haveBox}>
          <strong>Lo que ya sabes hacer</strong>
          {value.length || reviewing.length || toVerify.length ? (
            <div className={styles.chips}>
              {[...reviewing, ...toVerify].filter((key) => !value.includes(key)).map((key) => (
                <span key={key} className={`${styles.chip} ${styles.chipHave}`}>
                  {tradeLabel(key)} · {reviewing.includes(key) ? 'cédula en revisión' : 'falta tu cédula'}
                </span>
              ))}
              {value.map((key) => (
                <span key={key} className={`${styles.chip} ${styles.chipHave}`}>
                  {tradeLabel(key)}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Quitar ${tradeLabel(key)}`}
                    onClick={() => onChange(value.filter((k) => k !== key))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className={styles.meta}>Todavía nada. Búscalo abajo o ábrelo por sección.</span>
          )}
        </div>
      )}
      {!allowed && (
        <label className={styles.field}>
          {forWorker ? 'Agregar algo que sabes hacer' : 'Buscar'}
          <input
            type="search"
            value={query}
            placeholder={forWorker ? 'Escribe y elige' : 'Ej. pan, guitarra, plomero, fuga, tamales'}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {results && !forWorker && value.length > 0 && (
        <p className={styles.meta}>Elegiste: {value.map(tradeLabel).join(', ')}</p>
      )}
      {results && (
        <div className={styles.chips}>
          {results.map(chip)}
          {!results.length && (
            <p className={styles.meta}>
              No lo encontramos en la lista. Elige «Otra cosa» y descríbelo con tus palabras.
            </p>
          )}
          {other && !results.some(([key]) => key === 'OTRO') && chip(other)}
        </div>
      )}
      {!results &&
        tradeGroups.map((group) => {
          const categories = tradeCategories.filter(
            (c) => c.group === group.key && c.trades.some(usable),
          );
          if (!categories.length) return null;
          return (
            <div key={group.key} className={styles.pickerGroup}>
              {group.key !== 'otros' && <h3 className={styles.pickerGroupTitle}>{group.label}</h3>}
              {categories.map((category) => {
                const trades = category.trades.filter(usable);
                const chosen = trades.filter(([key]) => value.includes(key)).length;
                return (
                  <details
                    key={category.key}
                    className={styles.category}
                    open={chosen > 0 || category.key === openCategory || Boolean(allowed)}
                  >
                    <summary>
                      <span>
                        <strong>{category.label}</strong>
                        <small>{category.hint}</small>
                      </span>
                      {chosen > 0 && <span className={styles.badge}>{chosen}</span>}
                    </summary>
                    <div className={styles.chips}>{trades.map(chip)}</div>
                  </details>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

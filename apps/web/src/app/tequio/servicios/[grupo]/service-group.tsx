'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  tradeCategories,
  tradeGroups,
  tradeLevel,
  type TradeGroup,
} from '@/lib/yalika-presente';

import styles from '../../presente.module.css';
import { ProviderResults } from '../../provider-results';
import { useArea } from '../../use-area';

const levelText = {
  live: 'Hay gente disponible ahora',
  some: 'Gente verificada cerca',
  none: 'Aún nadie conectado',
} as const;

/**
 * Una sección (Profesionales, Para tu casa, Tu carro...): cada servicio es un botón. Con color
 * los que ya tienen gente cerca (más fuerte si hay alguien disponible ahora) y en tenue los que
 * todavía no, con un mensaje para pedirlo de todos modos.
 */
export function ServiceGroup({ groupKey, initialTrade }: { groupKey: TradeGroup; initialTrade: string }) {
  const group = tradeGroups.find((g) => g.key === groupKey)!;
  const { municipality, setMunicipality, activity } = useArea();
  const [trade, setTrade] = useState(initialTrade);
  const categories = tradeCategories.filter((c) => c.group === groupKey);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header>
          <p className={styles.eyebrow}>Yalika · Tequio</p>
          <h1 className={styles.title}>{group.label}</h1>
          <p className={styles.sub}>{group.hint}</p>
          <Link href="/tequio" className={styles.link}>
            Volver
          </Link>
        </header>

        <div className={styles.legend} aria-hidden="true">
          <span data-level="live">Disponible ahora</span>
          <span data-level="some">Verificados cerca</span>
          <span data-level="none">Aún nadie</span>
        </div>

        {categories.map((category) => (
          <section key={category.key} className={styles.group}>
            {categories.length > 1 && <h2 className={styles.groupSub}>{category.label}</h2>}
            <div className={styles.serviceGrid}>
              {category.trades.map(([key, label, req]) => {
                const level = req === 'pronto' ? 'none' : tradeLevel(activity, key);
                const row = activity?.[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={styles.serviceButton}
                    data-level={activity ? level : 'loading'}
                    aria-pressed={trade === key}
                    disabled={req === 'pronto'}
                    onClick={() => setTrade((current) => (current === key ? '' : key))}
                  >
                    <strong>{label}</strong>
                    <small>
                      {req === 'pronto'
                        ? 'Muy pronto'
                        : !activity
                          ? ' '
                          : level === 'live'
                            ? `${row?.present} disponible${row?.present === 1 ? '' : 's'} ahora`
                            : level === 'some'
                              ? `${row?.verified} verificado${row?.verified === 1 ? '' : 's'} cerca`
                              : levelText.none}
                    </small>
                    {(req === 'cedula' || req === 'titulo') && (
                      <span className={styles.serviceBadge}>Con cédula</span>
                    )}
                  </button>
                );
              })}
            </div>
            {category.trades.some(([key]) => key === trade) && (
              <ProviderResults trade={trade} municipality={municipality} onMunicipality={setMunicipality} />
            )}
          </section>
        ))}

        <Link href="/tequio/pedir?oficio=OTRO" className={styles.otherLink}>
          ¿No está lo que buscas? <strong>Pide otra cosa y descríbela con tus palabras</strong>
        </Link>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';

import { tradeCategories, tradeGroups, tradeLevel } from '@/lib/yalika-presente';

import { PresenteIcon } from './icons';
import styles from './presente.module.css';
import { useArea } from './use-area';

/** Orden del inicio: Profesionales; Casa | Carro; Tecnología | Otra cosa; Para ti y tu familia. */
const LAYOUT: { key: (typeof tradeGroups)[number]['key']; wide?: boolean }[] = [
  { key: 'profesional', wide: true },
  { key: 'casa' },
  { key: 'carro' },
  { key: 'tecnologia' },
  { key: 'otros' },
  { key: 'personal', wide: true },
];

/** Botones grandes de cada sección; dicen si ya hay gente disponible cerca. */
export function GroupGrid() {
  const { activity } = useArea();
  return (
    <div className={styles.groupGrid}>
      {LAYOUT.map(({ key, wide }) => {
        const group = tradeGroups.find((g) => g.key === key)!;
        const trades = tradeCategories
          .filter((c) => c.group === key)
          .flatMap((c) => c.trades)
          .filter(([, , req]) => req !== 'pronto');
        const live = trades.filter(([t]) => tradeLevel(activity, t) === 'live').length;
        const some = trades.filter(([t]) => tradeLevel(activity, t) !== 'none').length;
        const href = key === 'otros' ? '/tequio/pedir?oficio=OTRO' : `/tequio/servicios/${key}`;
        return (
          <Link
            key={key}
            href={href}
            className={`${styles.groupButton} ${wide ? styles.groupWide : ''}`}
            data-group={key}
          >
            <span className={styles.catIcon}>
              <PresenteIcon name={group.icon} />
            </span>
            <span className={styles.groupText}>
              <strong>{group.label}</strong>
              <span>{group.hint}</span>
              {key !== 'otros' && activity && (
                <small className={live ? styles.groupLive : undefined}>
                  {live
                    ? `${live === 1 ? '1 servicio' : `${live} servicios`} con gente disponible ahora`
                    : some
                      ? `${some === 1 ? '1 servicio' : `${some} servicios`} con gente verificada cerca`
                      : 'Pídelo: avisamos a quien se conecte'}
                </small>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

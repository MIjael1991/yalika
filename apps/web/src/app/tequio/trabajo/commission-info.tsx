'use client';

import { useEffect, useState } from 'react';

import { formatMxn, MIN_PRICE_MXN, presenteApi, type PresenteProgram } from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { CommissionTable } from './commission-table';

/**
 * «¿Cuánto cobra Yalika?»: la comisión normal y, mientras haya lugares de fundador, la de
 * fundador (mientras les dura el regalo). Lee las reglas del API para no prometer de más.
 */
export function CommissionInfo() {
  const [program, setProgram] = useState<PresenteProgram | null>(null);

  useEffect(() => {
    let live = true;
    presenteApi
      .program()
      .then((loaded) => live && setProgram(loaded))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!program) return null;
  const founders = program.welcome.creditMxn > 0 && program.welcome.left > 0;
  return (
    <details className={styles.category}>
      <summary>
        <span>
          <strong>¿Cuánto cobra Yalika?</strong>
          <small>
            {founders
              ? `Fundadores: ${program.promoCommissionPct}% mientras les dura el regalo, luego ${program.commissionPct}%`
              : `El ${program.commissionPct}% de cada trabajo, desde ${formatMxn(MIN_PRICE_MXN)}`}
          </small>
        </span>
      </summary>
      <div className={styles.form}>
        {founders && (
          <p className={styles.meta}>
            Si eres de los primeros {program.welcome.limit} aprobados recibes{' '}
            {formatMxn(program.welcome.creditMxn)} de regalo. Con ese regalo se pagan tus comisiones
            del {program.promoCommissionPct}%; cuando se acaba, pagas el {program.commissionPct}%. Si
            llegas cuando ya no hay lugares, pagas el {program.commissionPct}% desde el principio.
          </p>
        )}
        <CommissionTable pct={program.commissionPct} promoPct={founders ? program.promoCommissionPct : undefined} />
      </div>
    </details>
  );
}

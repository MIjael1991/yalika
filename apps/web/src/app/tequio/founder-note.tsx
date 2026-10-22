'use client';

import { useEffect, useState } from 'react';

import { formatMxn, presenteApi, type PresenteProgram } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/**
 * Lugares de fundador: los primeros trabajadores aprobados reciben saldo de regalo y pagan la
 * comisión de fundador mientras les dura; después, la normal. Sin lugares: solo la normal.
 */
export function FounderNote() {
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
  const { creditMxn, limit, left } = program.welcome;
  if (creditMxn <= 0 || left <= 0) {
    return (
      <p className={styles.notice2}>
        Yalika cobra el {program.commissionPct}% de cada trabajo. Para empezar a cotizar, recarga tu
        saldo desde {formatMxn(100)}. Si recomiendas a alguien nuevo, ganas servicios sin comisión.
      </p>
    );
  }
  return (
    <p className={styles.founder}>
      Fundadores: los primeros {limit} trabajadores aprobados reciben {formatMxn(creditMxn)} de regalo.
      Mientras te dura el regalo, Yalika cobra el {program.promoCommissionPct}% de cada trabajo; cuando
      se acaba, baja al {program.commissionPct}%. Quedan {left} lugares.
    </p>
  );
}

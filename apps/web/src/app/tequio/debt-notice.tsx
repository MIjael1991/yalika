'use client';

import { useEffect, useState } from 'react';

import { formatMxn, presenteApi, type MyDebts } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/**
 * Aviso de lo que el cliente debe por cancelar con el trabajador en camino: se suma a su
 * siguiente pedido. Si no debe nada, no se muestra.
 */
export function DebtNotice({ when = 'next' }: { when?: 'next' | 'choose' }) {
  const [debts, setDebts] = useState<MyDebts | null>(null);

  useEffect(() => {
    let live = true;
    presenteApi
      .myDebts()
      .then((loaded) => live && setDebts(loaded))
      .catch(() => live && setDebts(null));
    return () => {
      live = false;
    };
  }, []);

  if (!debts?.totalMxn) return null;
  const names = [...new Set(debts.items.map((d) => d.workerName))].join(' y ');
  return (
    <p className={styles.notice2} role="status">
      Tienes <strong>{formatMxn(debts.totalMxn)}</strong> pendientes por cancelar cuando {names}{' '}
      ya iba en camino.{' '}
      {when === 'choose'
        ? 'Se suman al presupuesto que elijas: los pagas junto con el trabajo.'
        : 'Se suman a tu siguiente pedido: los pagas junto con el trabajo.'}{' '}
      Si ya le pagaste directo, pídele que lo marque como pagado.
    </p>
  );
}

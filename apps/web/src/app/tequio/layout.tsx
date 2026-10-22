import type { ReactNode } from 'react';

import { ActiveBubble } from './active-bubble';
import styles from './presente.module.css';

/** Todas las pantallas de Tequio: la burbuja de "cómo va tu pedido" flota encima. */
export default function PresenteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className={styles.floatRoot}>
        <ActiveBubble />
      </div>
    </>
  );
}

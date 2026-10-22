import Link from 'next/link';

import { DebtNotice } from '../debt-notice';
import { Favorites } from '../favorites';
import { MyRequests } from '../my-requests';
import styles from '../presente.module.css';

export const dynamic = 'force-dynamic';

export default function PresenteMisPedidosPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header>
          <p className={styles.eyebrow}>Yalika · Tequio</p>
          <h1 className={styles.title}>Mis pedidos</h1>
          <p className={styles.sub}>Todo lo que has pedido y a quién le tienes confianza.</p>
          <Link href="/tequio" className={styles.link}>
            Volver
          </Link>
        </header>
        <DebtNotice />
        <MyRequests />
        <Favorites />
      </div>
    </main>
  );
}

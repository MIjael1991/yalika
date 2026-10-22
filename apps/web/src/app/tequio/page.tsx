import Link from 'next/link';

import { FounderNote } from './founder-note';
import { GroupGrid } from './group-grid';
import { PresenteIcon } from './icons';
import { TradeSearch } from './trade-search';
import { WorkerQuick } from './worker-quick';
import styles from './presente.module.css';

const trust = [
  ['escudo', 'Personas verificadas', 'CURP, INE y su cara; los de salud, con cédula.'],
  ['candado', 'Solo entra quien elegiste', 'Te da tu PIN en la puerta al llegar.'],
  ['mensaje', 'Tu número no se comparte', 'Todo se habla por mensajes dentro de Yalika.'],
] as const;

export default function TequioPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {/* Si ofreces servicios: activarte sin pedir nada, justo abajo del asistente */}
        <WorkerQuick />

        {/* Escribes lo que necesitas y se activa «Pedir» */}
        <section className={styles.askCard} aria-label="Buscar">
          <TradeSearch />
        </section>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>Tequio en Michoacán</p>
          <h1>Gente de confianza, cerca de ti</h1>
          <p>
            Profesionales, oficios, clases, comida hecha en casa y negocios de tu zona. Pide
            presupuestos y elige a quién dejar entrar.
          </p>
        </section>

        <GroupGrid />

        <section className={styles.group}>
          <h2 className={styles.cardTitle}>En Yalika te cuidamos</h2>
          <ul className={styles.trust}>
            {trust.map(([icon, title, text]) => (
              <li key={icon}>
                <PresenteIcon name={icon} />
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.meta}>
            Aunque ya conozcas a quien te ayuda, pídelo siempre por Tequio: así queda registro y
            los dos están protegidos.
          </p>
        </section>

        <section className={`${styles.card} ${styles.workLink}`}>
          <div>
            <h2 className={styles.cardTitle}>¿Sabes hacer o enseñar algo?</h2>
            <p className={styles.meta}>
              Un oficio, tu negocio, comida por encargo, sistemas o clases: ofrécelo a tu
              comunidad. Te verificas una vez y atiendes en tus días y horas libres.
            </p>
            <FounderNote />
          </div>
          <Link href="/tequio/trabajo" className={styles.primary}>
            Ofrecer mis servicios
          </Link>
        </section>
      </div>
    </main>
  );
}

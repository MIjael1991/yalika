import Link from "next/link";
import { SHORTCUTS, TOOL_GROUPS, toolHref } from "../../lib/estudio-tools";
import { EstudioIcon } from "./estudio-icon";
import styles from "./studio.module.css";
// Pantalla de inicio de Estudio: dice qué se puede hacer y lleva directo a cada cosa.
export function EstudioHome() {
  return (
    <main className={styles.workspace}>
      <div className={styles.homeHero}>
        <h1>¿Qué quieres hacer hoy?</h1>
        <p>Elige una opción y te llevamos paso a paso. Tus archivos se quedan en tu dispositivo: nada se sube a internet.</p>
      </div>
      <section className={styles.homeShortcuts} aria-label="Convertir rápido">
        <h2>¿Qué quieres convertir?</h2>
        <div className={styles.chips}>
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className={styles.chip}>
              {s.label}
            </Link>
          ))}
        </div>
      </section>
      {TOOL_GROUPS.map((g) => (
        <section key={g.id} className={styles.homeGroup} aria-label={g.question}>
          <h2>{g.question}</h2>
          <div className={styles.homeGrid}>
            {g.tools.map((t) => (
              <Link key={t.id} href={toolHref(t.id)} className={styles.homeCard}>
                <span className={styles.homeIcon}>
                  <EstudioIcon name={t.icon} size={24} />
                </span>
                <span className={styles.homeText}>
                  <strong>{t.title}</strong>
                  <span>{t.hint}</span>
                </span>
                <span className={styles.homeGo}>
                  <EstudioIcon name="arrow" size={18} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

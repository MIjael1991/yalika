"use client";
import Link from "next/link";
import { useState } from "react";
import { TOOL_GROUPS, toolById, toolHref } from "../../lib/estudio-tools";
import { EstudioIcon } from "./estudio-icon";
import styles from "./studio.module.css";
// Menú lateral de Estudio: preguntas en lugar de nombres técnicos. En el celular se pliega en un botón que dice dónde estás.
// El padre le pone key={sección}: al cambiar de sección se vuelve a montar y queda cerrado.
export function EstudioMenu({ current }: { current: string }) {
  const [open, setOpen] = useState(false),
    now = toolById(current);
  return (
    <aside className={styles.side} aria-label="Menú de Estudio">
      <button type="button" className={styles.sideToggle} aria-expanded={open} aria-controls="estudio-menu" onClick={() => setOpen(!open)}>
        <span className={styles.sideIcon} data-on>
          <EstudioIcon name={now?.icon ?? "home"} />
        </span>
        <span className={styles.sideNow}>
          <small>Estás en</small>
          <strong>{now?.short ?? "Inicio de Estudio"}</strong>
        </span>
        <span className={styles.sideChevron} data-open={open}>
          <EstudioIcon name="chevron" size={18} />
        </span>
      </button>
      <nav id="estudio-menu" aria-label="Estudio" className={styles.sideNav} data-open={open}>
        <Link href="/estudio" className={styles.sideLink} aria-current={now ? undefined : "page"}>
          <span className={styles.sideIcon}>
            <EstudioIcon name="home" />
          </span>
          <span>¿Qué quieres hacer?</span>
        </Link>
        {TOOL_GROUPS.map((g) => (
          <div key={g.id} className={styles.sideGroup}>
            <p className={styles.sideQuestion}>{g.question}</p>
            {g.tools.map((t) => (
              <Link key={t.id} href={toolHref(t.id)} className={styles.sideLink} aria-current={t.id === current ? "page" : undefined}>
                <span className={styles.sideIcon}>
                  <EstudioIcon name={t.icon} />
                </span>
                <span>{t.title}</span>
              </Link>
            ))}
          </div>
        ))}
        <p className={styles.sidePrivacy}>
          <EstudioIcon name="lock" size={14} /> Todo se hace en tu dispositivo. Nada se sube a internet.
        </p>
      </nav>
    </aside>
  );
}

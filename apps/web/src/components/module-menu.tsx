"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { moduleForPath } from "../lib/module-navigation";
import styles from "./module-menu.module.css";
export function ModuleMenu() {
  const path = usePathname(),
    module = moduleForPath(path);
  const [full, setFull] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/orion/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (live) setFull(p?.user?.modules?.includes("all") === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [path]);
  if (!module) return null;
  return (
    <div className={styles.bar}>
      <Link className={styles.back} href={full ? "/inicio" : "/encuestas"}>
        ← {full ? "Inicio" : "Mis encuestas"}
      </Link>
      <span className={styles.divider} aria-hidden>
        /
      </span>
      <strong className={styles.title}>{module.name}</strong>
      <details ref={details} className={styles.menu}>
        <summary>
          Opciones <span aria-hidden>⌄</span>
        </summary>
        <nav aria-label={`Opciones de ${module.name}`}>
          {module.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              onClick={() => {
                if (details.current) details.current.open = false;
              }}
            >
              {item.name}
              <span aria-hidden>→</span>
            </Link>
          ))}
          {full && (
            <Link className={styles.other} href="/servicios">
              Cambiar de servicio →
            </Link>
          )}
        </nav>
      </details>
    </div>
  );
}

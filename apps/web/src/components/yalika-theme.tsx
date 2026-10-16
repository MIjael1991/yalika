"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
export function YalikaTheme({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState("auto");
  const [systemDark, setSystemDark] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yaleka.appearance.v1");
      if (saved && ["light", "dark", "auto"].includes(saved)) setChoice(saved);
    } catch {}
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    const changed = (e: StorageEvent) => {
      if (e.key === "yaleka.appearance.v1")
        setChoice(
          e.newValue && ["light", "dark", "auto"].includes(e.newValue)
            ? e.newValue
            : "auto",
        );
    };
    window.addEventListener("storage", changed);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", changed);
    };
  }, []);
  function choose(value: string) {
    setChoice(value);
    try {
      localStorage.setItem("yaleka.appearance.v1", value);
      setNotice("Apariencia guardada en este navegador.");
    } catch {
      setNotice("Apariencia aplicada; este navegador no permitió guardarla.");
    }
  }
  return (
    <div
      className="yalika-frame"
      data-yalika-theme={
        choice === "auto" ? (systemDark ? "dark" : "light") : choice
      }
    >
      {pathname === "/cuenta" && (
        <div className="yalika-theme-bar">
          <label>
            Apariencia{" "}
            <select
              aria-label="Apariencia de Yalika"
              value={choice}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="auto">Automático</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
          <span role="status">
            {notice || "No cambia el diseño de tu página pública."}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

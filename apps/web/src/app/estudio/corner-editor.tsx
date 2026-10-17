"use client";
import { useRef, useState } from "react";
import { validQuad, type Quad } from "../../lib/yalika-scan";
import styles from "./studio.module.css";
const NAMES = ["arriba izquierda", "arriba derecha", "abajo derecha", "abajo izquierda"];
export const DEFAULT_QUAD: Quad = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
// Cuatro puntos que se arrastran con el dedo, el mouse o las flechas del teclado.
export function CornerEditor({
  url,
  quad,
  onCommit,
}: {
  url: string;
  quad: Quad;
  onCommit: (q: Quad) => void;
}) {
  const [draft, setDraft] = useState<Quad>(quad),
    [bad, setBad] = useState(false),
    box = useRef<HTMLDivElement>(null);
  function set(i: number, x: number, y: number): Quad {
    const next = draft.map((p, j) => (j === i ? { x: clamp(x), y: clamp(y) } : p)) as Quad;
    setDraft(next);
    return next;
  }
  function commit(q: Quad) {
    const ok = validQuad(q);
    setBad(!ok);
    if (ok) onCommit(q);
  }
  return (
    <div>
      <div ref={box} className={styles.corners}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Imagen original con las esquinas del documento" draggable={false} />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points={draft.map((p) => p.x + "," + p.y).join(" ")}
            fill="rgba(30,120,255,0.18)"
            stroke="#1e78ff"
            strokeWidth="0.004"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {draft.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={"Esquina " + NAMES[i] + ". Arrastra o usa las flechas."}
            className={styles.corner}
            style={{ left: p.x * 100 + "%", top: p.y * 100 + "%" }}
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId) || !box.current) return;
              const r = box.current.getBoundingClientRect();
              set(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              commit(draft);
            }}
            onKeyDown={(e) => {
              const d: Record<string, [number, number]> = {
                ArrowLeft: [-0.005, 0],
                ArrowRight: [0.005, 0],
                ArrowUp: [0, -0.005],
                ArrowDown: [0, 0.005],
              };
              if (!d[e.key]) return;
              e.preventDefault();
              commit(set(i, p.x + d[e.key][0], p.y + d[e.key][1]));
            }}
          />
        ))}
      </div>
      <p className={styles.help} role="status">
        {bad
          ? "Las esquinas no forman una hoja válida (no se cruzan ni quedan muy juntas). Acomódalas otra vez."
          : "Lleva cada punto a una esquina de la hoja. La vista previa se actualiza al soltar."}
      </p>
    </div>
  );
}

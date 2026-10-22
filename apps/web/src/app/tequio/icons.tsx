import type { ReactNode } from 'react';

import styles from './presente.module.css';

/** Íconos de línea de Tequio (24×24, toman el color del texto). */

const paths: Record<string, ReactNode> = {
  urgente: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  hogar: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  mandados: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  carro: (
    <>
      <path d="M5 16V11l2-5h10l2 5v5" />
      <path d="M3 16h18v3H3z" />
      <circle cx="7.5" cy="13" r="1" />
      <circle cx="16.5" cy="13" r="1" />
    </>
  ),
  tecnologia: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  cuidados: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  belleza: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.6 7.6 20 18M8.6 16.4 20 6" />
    </>
  ),
  clases: (
    <>
      <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
      <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </>
  ),
  comida: (
    <>
      <path d="M5 11a3.5 3.5 0 0 1 1-7h12a3.5 3.5 0 0 1 1 7v9H5z" />
      <path d="M9.5 8v3M14.5 8v3" />
    </>
  ),
  eventos: (
    <>
      <ellipse cx="12" cy="9" rx="5" ry="6" />
      <path d="M12 15v1.5M12 16.5c0 2-2 2.5-2 4.5" />
    </>
  ),
  profesionales: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  salud: (
    <>
      <path d="M6 3v6a4 4 0 0 0 8 0V3" />
      <path d="M10 13v2a5 5 0 0 0 10 0v-2" />
      <circle cx="20" cy="11" r="2" />
    </>
  ),
  otros: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  candado: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  mensaje: (
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 10h8" />
    </>
  ),
};

export function PresenteIcon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.otros}
    </svg>
  );
}

const AVATAR_COLORS = ['#0b7a5c', '#1c3352', '#8a5a00', '#0f6e8c', '#6b3fa0', '#a3402a'];

/** Iniciales con un color fijo por persona (mismo nombre, mismo color). */
export function Avatar({ name }: { name: string }) {
  const clean = name.trim();
  // Primera y última palabra con sentido: "Plomería y Pan Juan" → "PJ".
  const words = clean.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w));
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  const initials = picked.map((word) => word[0]?.toUpperCase() ?? '').join('');
  let hash = 0;
  for (const char of clean) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      className={styles.avatar}
      aria-hidden="true"
      style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
    >
      {initials || '?'}
    </span>
  );
}

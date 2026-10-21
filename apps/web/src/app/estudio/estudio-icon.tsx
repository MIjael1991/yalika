// Dibujos sencillos para el menú y la pantalla de inicio de Estudio (trazo de una sola línea, del color del texto).
const PATHS: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  convert: "M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16",
  card: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8.5 9.5a1.7 1.7 0 1 0 .01 0M6 15.5c.6-1.6 3.4-1.6 4 0M13 10h5M13 14h5",
  voice: "M5 10v4M9 6v12M13 3v18M17 8v8M21 11v2",
  merge: "M6 3h7l4 4v5M6 3v9M3 12h14M12 12v5M9 15l3 3 3-3M4 21h16",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  sheet: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  files: "M9 3h8a2 2 0 0 1 2 2v10M6 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM8 12h6M8 16h4",
  chevron: "M6 9l6 6 6-6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
};
export function EstudioIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.doc} />
    </svg>
  );
}

// Borrador de la última transcripción, en este dispositivo y solo para esta cuenta: así no se pierde horas de trabajo si se cierra la pestaña.
import type { FileScope } from "./yalika-local-files";
import type { Segment } from "./yalika-transcript";

export type Draft = { name: string; size: number; language: string; tier: "rapido" | "preciso" | "maximo"; savedAt: string; seconds: number; segments: Segment[] };
const key = (scope: FileScope) => `yaleka.estudio.transcripcion.v1:${scope.companyId}:${scope.userId}`;
const MAX = 4_000_000; // caracteres: más que eso no cabe de forma fiable en el almacenamiento del navegador

export function saveDraft(scope: FileScope, draft: Draft): boolean {
  try {
    const text = JSON.stringify(draft);
    if (text.length > MAX) return false;
    localStorage.setItem(key(scope), text);
    return true;
  } catch {
    return false;
  }
}
export function loadDraft(scope: FileScope): Draft | null {
  try {
    const raw = localStorage.getItem(key(scope));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d.name !== "string" || !Array.isArray(d.segments) || !d.segments.length) return null;
    const segments = d.segments.filter((s) => s && typeof s.text === "string" && Number.isFinite(s.start) && Number.isFinite(s.end)).map((s) => ({ start: s.start, end: s.end, text: s.text, doubt: Array.isArray(s.doubt) ? s.doubt.filter((x) => typeof x === "string") : [], ...(s.reviewed ? { reviewed: true } : {}), ...(Array.isArray(s.shaky) && s.shaky.length ? { shaky: s.shaky.filter((x) => typeof x === "string").slice(0, 60) } : {}) }));
    return segments.length ? { ...d, segments } : null;
  } catch {
    return null;
  }
}
export function clearDraft(scope: FileScope) {
  try {
    localStorage.removeItem(key(scope));
  } catch {
    /* sin almacenamiento */
  }
}

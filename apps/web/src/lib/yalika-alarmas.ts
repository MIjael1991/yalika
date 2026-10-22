// Utilidades compartidas de avisos: qué es importante, cuándo proponer "para después" y llamadas a la API.

export type PendingTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  category?: string | null;
  space: { id: string; name: string; type: string } | null;
};

export const ACTIVE_STATUSES = ["pending", "assigned", "in_progress", "postponed"];

export async function yalikaApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/yalika/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("401");
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Yalika respondió algo que no se pudo leer");
  }
  if (!res.ok) {
    const b = body as { message?: string | string[] } | null;
    throw new Error(Array.isArray(b?.message) ? b.message.join(". ") : (b?.message ?? "No se pudo completar"));
  }
  return body as T;
}

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Salud, medicinas, citas y juntas insisten; pan o pagar la luz se pueden mover con calma. */
export function isImportant(t: { title: string; category?: string | null; space?: { type: string; name: string } | null }) {
  const where = plain(`${t.space?.type ?? ""} ${t.space?.name ?? ""} ${t.category ?? ""}`);
  if (/salud|health|vet|medic/.test(where)) return true;
  return /\b(medic|pastill|gota|insulina|inyecc|dosis|tomar|cita|consulta|junta|reunion|vuelo|examen|audiencia|vacun|desparasit|urgente|importante)/.test(
    plain(t.title),
  );
}

export type LaterOption = { key: string; label: string; until: Date };

export function hourText(d: Date) {
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true });
}

function at(base: Date, dayOffset: number, hour: number, minute = 0) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, minute);
}

/** Opciones de "para después". Lo importante vuelve a avisar pronto; lo ligero propone horas razonables. */
export function laterOptions(now: Date, important: boolean): LaterOption[] {
  const plus = (m: number): Date => new Date(now.getTime() + m * 60000);
  if (important) {
    return [
      { key: "m10", label: "En 10 minutos", until: plus(10) },
      { key: "m30", label: "En 30 minutos", until: plus(30) },
      { key: "h1", label: "En 1 hora", until: plus(60) },
    ];
  }
  const out: LaterOption[] = [{ key: "h1", label: "En 1 hora", until: plus(60) }];
  const six = at(now, 0, 18);
  const eight = at(now, 0, 20);
  if (six.getTime() - now.getTime() > 90 * 60000) out.push({ key: "t18", label: `Hoy a las ${hourText(six)}`, until: six });
  if (eight.getTime() - now.getTime() > 90 * 60000 && out.length < 3) out.push({ key: "t20", label: `Hoy a las ${hourText(eight)}`, until: eight });
  const tomorrow = at(now, 1, 9);
  out.push({ key: "tm9", label: `Mañana a las ${hourText(tomorrow)}`, until: tomorrow });
  return out;
}

/** Hora escrita a mano (HH:MM): hoy si aún no pasa, si no, mañana. */
export function customLater(now: Date, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  let d = at(now, 0, h, mi);
  if (d.getTime() <= now.getTime() + 5 * 60000) d = at(now, 1, h, mi);
  return d;
}

export async function markDone(taskId: string) {
  return yalikaApi(`task/${taskId}/complete`, { method: "POST", body: JSON.stringify({}) });
}

export async function postponeTo(taskId: string, until: Date) {
  return yalikaApi(`task/${taskId}/postpone`, { method: "POST", body: JSON.stringify({ until: until.toISOString() }) });
}

/**
 * Domicilios de la página: lectura segura del contenido y enlace para "Cómo llegar".
 * El enlace es una dirección web normal: en el celular abre la app de mapas que la
 * persona tenga y en la computadora, su navegador de siempre.
 */
export type LocationRow = {
  name: string;
  address: string;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  hours: string;
  phone: string;
};

const MAPS_HOSTS = [
  'google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
  'maps.apple.com',
  'waze.com',
  'openstreetmap.org',
];

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function coordinate(value: unknown, limit: number) {
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

/** Solo enlaces https de servicios de mapas conocidos; cualquier otra cosa se ignora. */
export function safeMapsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return MAPS_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readLocations(content: unknown): LocationRow[] {
  const raw = content && typeof content === 'object' ? (content as Record<string, unknown>).locations : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 12)
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .map((row) => ({
      name: text(row.name, 80),
      address: text(row.address, 200),
      mapsUrl: safeMapsUrl(row.mapsUrl),
      lat: coordinate(row.lat, 90),
      lng: coordinate(row.lng, 180),
      hours: text(row.hours, 120),
      phone: text(row.phone, 30),
    }))
    .filter((row) => row.name || row.address);
}

/** Enlace de "Cómo llegar": el que pegó la persona, luego coordenadas y al final la dirección. */
export function mapsHref(row: Pick<LocationRow, 'address' | 'mapsUrl' | 'lat' | 'lng' | 'name'>): string | null {
  if (row.mapsUrl) return row.mapsUrl;
  const query =
    row.lat !== null && row.lng !== null ? `${row.lat},${row.lng}` : [row.name, row.address].filter(Boolean).join(' ').trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

export function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

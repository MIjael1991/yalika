'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './presente.module.css';

/* Leaflet se sirve desde /vendor/leaflet (BSD-2), sin dependencias nuevas en package.json. */

type LatLng = { lat: number; lng: number };
type LMarker = {
  setLatLng: (p: [number, number]) => LMarker;
  getLatLng: () => LatLng;
  on: (event: string, fn: () => void) => LMarker;
  addTo: (map: LMap) => LMarker;
  remove: () => void;
};
type LMap = {
  setView: (p: [number, number], zoom: number) => LMap;
  fitBounds: (b: [number, number][], opts?: { padding: [number, number]; maxZoom: number }) => LMap;
  on: (event: string, fn: (e: { latlng: LatLng }) => void) => LMap;
  remove: () => void;
  invalidateSize: () => void;
};
type Leaflet = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LMap;
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: LMap) => void };
  marker: (p: [number, number], opts: Record<string, unknown>) => LMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
};

let loading: Promise<Leaflet> | null = null;
function loadLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  loading ??= new Promise<Leaflet>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = '/vendor/leaflet/leaflet.js';
    script.onload = () => (w.L ? resolve(w.L) : reject(new Error('Mapa no disponible')));
    script.onerror = () => {
      loading = null;
      reject(new Error('No se pudo cargar el mapa'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap';

function pin(L: Leaflet, color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"><b style="transform:rotate(45deg);color:#fff;font:700 13px system-ui">${label}</b></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

/**
 * Elegir el punto exacto: toca el mapa o arrastra el marcador.
 * "Usar mi ubicación" pone el punto donde está el teléfono.
 */
export function MapPicker({
  value,
  onChange,
  fallbackCenter,
}: {
  value: LatLng | null;
  onChange: (point: LatLng) => void;
  fallbackCenter?: LatLng | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<LMarker | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const changeRef = useRef(onChange);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  // Crear el mapa una sola vez.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !box.current || mapRef.current) return;
        leafletRef.current = L;
        const start = value ?? fallbackCenter ?? { lat: 19.7033, lng: -101.192 };
        const map = L.map(box.current, { zoomControl: true }).setView(
          [start.lat, start.lng],
          value ? 17 : 13,
        );
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
        map.on('click', (e) => changeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
        mapRef.current = map;
      })
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'No se pudo cargar el mapa'),
      );
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // El centro inicial solo importa al crear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mover el marcador cuando cambia el punto.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !value) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([value.lat, value.lng], {
        draggable: true,
        icon: pin(L, '#0f7a5a', 'C'),
      })
        .on('dragend', () => {
          const p = markerRef.current?.getLatLng();
          if (p) changeRef.current({ lat: p.lat, lng: p.lng });
        })
        .addTo(map);
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
  }, [value]);

  // Si cambia el municipio y aún no hay punto, centrar ahí.
  useEffect(() => {
    if (!value && fallbackCenter && mapRef.current) {
      mapRef.current.setView([fallbackCenter.lat, fallbackCenter.lng], 13);
    }
  }, [fallbackCenter, value]);

  function locate() {
    if (!navigator.geolocation) {
      setError('Este teléfono no comparte su ubicación. Toca el mapa para marcar el punto.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        mapRef.current?.setView([point.lat, point.lng], 17);
        changeRef.current(point);
      },
      () => {
        setLocating(false);
        setError('No pudimos ver tu ubicación. Revisa el permiso o toca el mapa para marcar.');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className={styles.mapBlock}>
      <div ref={box} className={styles.map} role="application" aria-label="Mapa para marcar el punto" />
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={locate} disabled={locating}>
          {locating ? 'Buscando…' : 'Usar mi ubicación'}
        </button>
        <span className={styles.meta}>
          {value ? 'Puedes arrastrar el punto para ajustarlo.' : 'Toca el mapa donde es.'}
        </span>
      </div>
      {error && <p className={styles.hint}>{error}</p>}
    </div>
  );
}

/** Mapa solo para ver: destino (casa) y, si hay, dónde va el trabajador. */
export function MapView({
  destination,
  worker,
}: {
  destination: LatLng;
  worker?: LatLng | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const workerRef = useRef<LMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !box.current || mapRef.current) return;
        leafletRef.current = L;
        const map = L.map(box.current, { zoomControl: true }).setView(
          [destination.lat, destination.lng],
          16,
        );
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
        L.marker([destination.lat, destination.lng], { icon: pin(L, '#0f7a5a', 'C') }).addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'No se pudo cargar el mapa'),
      );
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      workerRef.current = null;
    };
    // El destino no cambia durante el trabajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !worker) return;
    if (!workerRef.current) {
      workerRef.current = L.marker([worker.lat, worker.lng], { icon: pin(L, '#1d4ed8', 'T') }).addTo(map);
      map.fitBounds(
        [
          [destination.lat, destination.lng],
          [worker.lat, worker.lng],
        ],
        { padding: [40, 40], maxZoom: 16 },
      );
    } else {
      workerRef.current.setLatLng([worker.lat, worker.lng]);
    }
  }, [ready, worker, destination.lat, destination.lng]);

  if (error) return <p className={styles.hint}>{error}</p>;
  return <div ref={box} className={styles.map} role="img" aria-label="Mapa del trabajo" />;
}

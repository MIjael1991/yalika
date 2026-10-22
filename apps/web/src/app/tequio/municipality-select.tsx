'use client';

import { useEffect, useState } from 'react';

import { presenteApi, type Municipality } from '@/lib/yalika-presente';

let cached: Promise<Municipality[]> | null = null;
export function loadMunicipalities() {
  cached ??= presenteApi
    .municipalities()
    .then((list) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')))
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

/** Lista de municipios (por ahora Michoacán), ordenada por nombre. */
export function MunicipalitySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [list, setList] = useState<Municipality[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadMunicipalities()
      .then((items) => live && setList(items))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return <span>No se pudo cargar la lista de municipios. Recarga la página.</span>;
  return (
    <select
      value={value}
      disabled={disabled || !list}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{list ? 'Elige el municipio' : 'Cargando municipios…'}</option>
      {list?.map((m) => (
        <option key={m.code} value={m.code}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

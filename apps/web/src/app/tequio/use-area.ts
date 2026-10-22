'use client';

import { useEffect, useState } from 'react';

import { presenteApi, type TradeActivity } from '@/lib/yalika-presente';

/**
 * Tu zona: el municipio de tu primer lugar guardado y qué servicios ya tienen gente cerca
 * (para mostrarlos con color o en tenue).
 */
export function useArea() {
  const [municipality, setMunicipality] = useState('');
  const [activity, setActivity] = useState<TradeActivity | null>(null);

  useEffect(() => {
    let live = true;
    presenteApi
      .places()
      .then((places) => {
        if (live && places[0]) setMunicipality((current) => current || places[0].municipalityCode);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    presenteApi
      .activity(municipality || undefined)
      .then((found) => live && setActivity(found))
      .catch(() => live && setActivity({}));
    return () => {
      live = false;
    };
  }, [municipality]);

  return { municipality, setMunicipality, activity };
}

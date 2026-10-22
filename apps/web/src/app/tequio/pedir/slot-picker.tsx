'use client';

import { useEffect, useState } from 'react';

import { availabilityLabel, presenteApi, toDateTimeInput, type Availability } from '@/lib/yalika-presente';

import styles from '../presente.module.css';

const DAY = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Mexico_City',
});
const HOUR = new Intl.DateTimeFormat('es-MX', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Mexico_City',
});

/**
 * Pedir cita estilo chat: el asistente muestra los horarios libres de la persona; eliges uno, se
 * lo mandamos y ella te confirma o te propone otra hora. Todo por Tequio.
 */
export function SlotPicker({
  providerId,
  name,
  value,
  onPick,
}: {
  providerId: string;
  name: string;
  value: string;
  onPick: (when: string) => void;
}) {
  const [data, setData] = useState<{ availability: Availability | null; slots: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    presenteApi
      .providerSlots(providerId)
      .then((loaded) => live && setData(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [providerId]);

  if (failed) return null;
  if (!data) return <p className={styles.meta}>Buscando sus horarios libres…</p>;

  const byDay = new Map<string, string[]>();
  for (const slot of data.slots) {
    const day = DAY.format(new Date(slot));
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }

  return (
    <div className={styles.botChat}>
      <p className={styles.botMsg}>
        {data.slots.length
          ? `${name} atiende ${availabilityLabel(data.availability).toLowerCase()}. Estos son sus horarios libres esta semana: elige uno y se lo mando. Te confirma o te propone otra hora, aquí mismo.`
          : `${name} no tiene horarios libres esta semana. Elige otro día y hora abajo y le preguntamos.`}
      </p>
      {[...byDay.entries()].map(([day, slots]) => (
        <div key={day} className={styles.slotDay}>
          <strong>{day}</strong>
          <div className={styles.chips}>
            {slots.map((slot) => {
              const local = toDateTimeInput(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  className={styles.chip}
                  aria-pressed={value === local}
                  onClick={() => onPick(local)}
                >
                  {HOUR.format(new Date(slot))}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

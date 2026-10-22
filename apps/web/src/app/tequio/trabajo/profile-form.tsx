'use client';

import { useState, type FormEvent } from 'react';

import {
  curpHint,
  dayOptions,
  MAX_TRADES,
  normalizeCurp,
  presenteApi,
  radiusOptions,
  tradeLabel,
  type PresenteProfileInput,
  type PresenteProvider,
} from '@/lib/yalika-presente';

import { MunicipalitySelect } from '../municipality-select';
import styles from '../presente.module.css';
import { TradePicker } from '../trade-picker';

type Form = {
  displayName: string;
  trades: string[];
  municipalityCode: string;
  radiusKm: number;
  zoneLabel: string;
  bio: string;
  days: number[];
  allDay: boolean;
  from: string;
  to: string;
  curp: string;
  referralCode: string;
  isBusiness: boolean;
  businessName: string;
  delivers: boolean;
  teaches: boolean;
  invoices: boolean;
};

function formFrom(provider: PresenteProvider | null): Form {
  const a = provider?.availability;
  return {
    displayName: provider?.displayName ?? '',
    trades: provider?.trades ?? [],
    municipalityCode: provider?.municipalityCode ?? '',
    radiusKm: provider?.radiusKm ?? 10,
    zoneLabel: provider?.zoneLabel ?? '',
    bio: provider?.bio ?? '',
    days: a?.days ?? [1, 2, 3, 4, 5, 6],
    allDay: a?.allDay ?? false,
    from: a?.from ?? '08:00',
    to: a?.to ?? '20:00',
    curp: '',
    referralCode: '',
    isBusiness: provider?.isBusiness ?? false,
    businessName: provider?.businessName ?? '',
    delivers: provider?.delivers ?? false,
    teaches: provider?.teaches ?? false,
    invoices: provider?.invoices ?? false,
  };
}

/**
 * Datos de trabajo: oficios, zona, días y horario. Antes de verificarse también
 * nombre y CURP; ya verificado, solo lo de trabajo (nombre y CURP quedan fijos).
 */
export function ProfileForm({
  provider,
  verified,
  onSaved,
  onProfession,
  professions = [],
}: {
  provider: PresenteProvider | null;
  verified: boolean;
  onSaved: (saved: PresenteProvider) => void;
  /** Eligió una profesión con cédula: se le pide su cédula. */
  onProfession?: (key: string) => void;
  /** Profesiones que eligió y cuya cédula va a mandar: cuentan como «lo que sabe hacer». */
  professions?: readonly string[];
}) {
  const [form, setForm] = useState<Form>(() => formFrom(provider));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    if (!form.displayName.trim()) return setError('Escribe tu nombre como quieres que te vean.');
    if (!form.trades.length && !provider?.credentials?.length && !professions.length) {
      return setError('Elige al menos un oficio o tu profesión.');
    }
    if (!form.municipalityCode) return setError('Elige tu municipio.');
    if (!form.days.length) return setError('Elige al menos un día.');
    if (!form.allDay && form.from === form.to) {
      return setError('La hora de inicio y la de fin no pueden ser iguales.');
    }
    if (form.isBusiness && !form.businessName.trim()) {
      return setError('Escribe el nombre de tu negocio.');
    }
    const curp = normalizeCurp(form.curp);
    if (!verified && !provider?.curpMasked && !curp) return setError('Escribe tu CURP.');
    if (curp && curpHint(curp)) return setError(curpHint(curp));

    const data: PresenteProfileInput = {
      displayName: form.displayName.trim(),
      trades: form.trades,
      municipalityCode: form.municipalityCode,
      radiusKm: form.radiusKm,
      availableDays: form.days,
      allDay: form.allDay,
      isBusiness: form.isBusiness,
      businessName: form.isBusiness ? form.businessName.trim() : undefined,
      delivers: form.delivers,
      teaches: form.teaches,
      invoices: form.invoices,
    };
    if (!form.allDay) {
      data.fromTime = form.from;
      data.toTime = form.to;
    }
    if (form.zoneLabel.trim()) data.zoneLabel = form.zoneLabel.trim();
    if (form.bio.trim()) data.bio = form.bio.trim();
    if (curp && !verified) data.curp = curp;
    if (form.referralCode.trim() && !verified && !provider?.referred) {
      data.referralCode = form.referralCode.trim();
    }

    setBusy(true);
    setError('');
    try {
      const saved = await presenteApi.saveProfile(data);
      setForm(formFrom(saved));
      setNotice('Guardado.');
      onSaved(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      {!verified && (
        <label className={styles.field}>
          Tu nombre, como quieres que te vean
          <input
            value={form.displayName}
            maxLength={80}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </label>
      )}

      <label className={styles.field}>
        Cuéntale a la gente quién eres y tu experiencia
        <textarea
          value={form.bio}
          maxLength={500}
          placeholder="Ejemplo: Plomero con 15 años de experiencia. Arreglo fugas, calentadores y tinacos."
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </label>

      <div className={styles.field}>
        ¿Qué sabes hacer? Elige todo lo que haces o enseñas; puedes cambiarlo cuando quieras.
        <span className={styles.meta}>
          ¿Eres profesionista (ingeniero, contador, abogado, médico, enfermera, veterinario…)? Elige
          tu profesión y te pedimos tu cédula: el número, una foto de la cédula, una selfie con ella
          en la mano y tu comprobante de la SEP.
        </span>
        <TradePicker
          forWorker
          max={MAX_TRADES}
          value={form.trades}
          onChange={(trades) => setForm({ ...form, trades })}
          onProfession={onProfession}
          reviewing={(provider?.credentials ?? []).filter((c) => c.status === 'PENDING').map((c) => c.trade)}
          toVerify={professions}
        />
        {professions.length > 0 && (
          <p className={styles.notice2}>
            Tu profesión: <strong>{professions.map(tradeLabel).join(', ')}</strong>. Más abajo te
            pedimos tu cédula (número, foto, selfie con ella y comprobante de la SEP).
          </p>
        )}
      </div>

      <fieldset className={styles.form}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.isBusiness}
            onChange={(e) => setForm({ ...form, isBusiness: e.target.checked })}
          />
          <span>Soy negocio (verdulería, carnicería, panadería, distribuidora, taller…)</span>
        </label>
        {form.isBusiness && (
          <>
            <label className={styles.field}>
              Nombre de tu negocio
              <input
                value={form.businessName}
                maxLength={80}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </label>
            <p className={styles.meta}>
              Si vendes comida o carne, tú eres responsable de tus permisos de salud. Yalika solo
              te conecta con tus clientes.
            </p>
          </>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.delivers}
            onChange={(e) => setForm({ ...form, delivers: e.target.checked })}
          />
          <span>Llevo a domicilio lo que vendo o hago</span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.teaches}
            onChange={(e) => setForm({ ...form, teaches: e.target.checked })}
          />
          <span>También enseño lo que sé hacer (doy clases)</span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.invoices}
            onChange={(e) => setForm({ ...form, invoices: e.target.checked })}
          />
          <span>
            Doy factura (CFDI). Te llegan también los pedidos de quien pide factura: tu precio lleva
            IVA (16%) aparte y, al terminar, subes aquí el PDF y el XML.
          </span>
        </label>
      </fieldset>

      <div className={styles.row}>
        <label className={styles.field}>
          Municipio donde trabajas
          <MunicipalitySelect
            value={form.municipalityCode}
            onChange={(code) => setForm({ ...form, municipalityCode: code })}
          />
        </label>
        <label className={styles.field}>
          ¿Hasta qué distancia vas?
          <select
            value={form.radiusKm}
            onChange={(e) => setForm({ ...form, radiusKm: Number(e.target.value) })}
          >
            {radiusOptions.map((km) => (
              <option key={km} value={km}>
                Hasta {km} km
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.field}>
        Colonia (opcional)
        <input
          value={form.zoneLabel}
          maxLength={120}
          onChange={(e) => setForm({ ...form, zoneLabel: e.target.value })}
        />
      </label>

      <div className={styles.field}>
        ¿Qué días atiendes o das clases?
        <div className={styles.days}>
          {dayOptions.map(([day, short, long]) => (
            <button
              key={day}
              type="button"
              className={styles.chip}
              aria-pressed={form.days.includes(day)}
              aria-label={long}
              onClick={() => toggleDay(day)}
            >
              {short}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={form.allDay}
          onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
        />
        <span>Esos días atiendo las 24 horas</span>
      </label>

      {!form.allDay && (
        <div className={styles.row}>
          <label className={styles.field}>
            Desde
            <input
              type="time"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            Hasta
            <input
              type="time"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </label>
        </div>
      )}
      <p className={styles.meta}>
        Si das clases, pon aquí tus días y horario de clases (por ejemplo, de lunes a viernes de
        4 a 7). El horario es para que la gente sepa cuándo atiendes. Los pedidos te llegan cuando
        estás Presente; si un día fuera de tu horario quieres ganarte algo extra, solo ponte
        Presente.
      </p>

      {!verified && (
        <>
          <label className={styles.field}>
            Tu CURP
            {provider?.curpMasked && (
              <span className={styles.meta}>
                Guardada: {provider.curpMasked}. Escríbela solo si quieres cambiarla.
              </span>
            )}
            <input
              value={form.curp}
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setForm({ ...form, curp: e.target.value })}
            />
          </label>
          {form.curp && curpHint(form.curp) && <p className={styles.hint}>{curpHint(form.curp)}</p>}
          {provider?.referred ? (
            <p className={styles.done}>Llegaste recomendado. ¡Bienvenido!</p>
          ) : (
            <label className={styles.field}>
              ¿Te recomendó alguien? Escribe su código (opcional)
              <input
                value={form.referralCode}
                maxLength={20}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="YP1A2B3C4D"
                onChange={(e) => setForm({ ...form, referralCode: e.target.value })}
              />
            </label>
          )}
        </>
      )}

      {notice && <p className={styles.notice}>{notice}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

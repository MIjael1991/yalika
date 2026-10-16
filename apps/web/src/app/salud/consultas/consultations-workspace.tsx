'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { clinicalApi } from '../clinical-api';
import { consultationApi } from './consultations-api';
import styles from './consultas.module.css';

function fmt(value?: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function money(cents: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
  }).format((cents ?? 0) / 100);
}

export default function ConsultationsWorkspace() {
  const [consultations, setConsultations] = useState<any[]>([]);
  const [regimens, setRegimens] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<any>(null);
  const [qrData, setQrData] = useState('');
  const [packageUnits, setPackageUnits] = useState<Record<string, string>>({});
  const [recommendations, setRecommendations] = useState<Record<string, any>>({});

  async function refresh() {
    const [c, r, p] = await Promise.all([
      consultationApi.consultations(),
      consultationApi.regimens(),
      clinicalApi.prescriptions(),
    ]);
    setConsultations(c);
    setRegimens(r);
    setPrescriptions(p);
  }

  useEffect(() => {
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : 'No fue posible cargar consultas'),
    );
  }, []);

  useEffect(() => {
    if (!linkResult?.relativePath) {
      setQrData('');
      return;
    }
    QRCode.toDataURL(`${window.location.origin}${linkResult.relativePath}`, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then(setQrData)
      .catch(() => setQrData(''));
  }, [linkResult]);

  const prescriptionItems = useMemo(
    () =>
      prescriptions.flatMap((rx) =>
        (rx.items ?? []).map((item: any) => ({
          ...item,
          prescriptionId: rx.id,
          label: `${item.medicationName}${item.strength ? ` · ${item.strength}` : ''}`,
        })),
      ),
    [prescriptions],
  );

  async function createConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const scheduledLocal = String(form.get('scheduledAt') || '');
      await consultationApi.createConsultation({
        subjectType: String(form.get('subjectType')) as any,
        mode: String(form.get('mode')) as any,
        scheduledAt: new Date(scheduledLocal).toISOString(),
        reason: String(form.get('reason') || '') || undefined,
        clinicianEmail:
          String(form.get('clinicianEmail') || '').trim() || undefined,
      });
      await consultationApi.materializeLife().catch(() => null);
      event.currentTarget.reset();
      setNotice('Consulta guardada y enviada a Life como evento privado.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible crear la consulta');
    } finally {
      setBusy(false);
    }
  }

  async function createLink(consultationId: string) {
    setBusy(true);
    setError('');
    try {
      const result = await consultationApi.createLink(consultationId, {
        ttlMinutes: 60,
        maxUses: 20,
      });
      setLinkResult(result);
      setNotice('Link temporal generado por 60 minutos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible crear el link');
    } finally {
      setBusy(false);
    }
  }

  async function createRegimen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const itemId = String(form.get('prescriptionItemId') || '');
      const item = prescriptionItems.find((row) => row.id === itemId);
      if (!item) throw new Error('Selecciona un medicamento de una receta');

      await consultationApi.createRegimen({
        prescriptionId: item.prescriptionId,
        prescriptionItemId: item.id,
        instructions: String(form.get('instructions') || ''),
        doseAmount: Number(form.get('doseAmount')),
        doseUnit: String(form.get('doseUnit') || ''),
        administrationsPerDay: Number(form.get('administrationsPerDay')),
        durationDays: Number(form.get('durationDays')),
      });

      await consultationApi.materializeLife().catch(() => null);
      event.currentTarget.reset();
      setNotice('Pauta clínica guardada. La farmacia elegirá la presentación comercial.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible crear la pauta');
    } finally {
      setBusy(false);
    }
  }

  async function recommend(regimenId: string) {
    const value = Number(packageUnits[regimenId]);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Indica cuántas unidades trae la caja o presentación disponible.');
      return;
    }

    const regimen = regimens.find((item) => item.id === regimenId);
    if (!regimen) {
      setError('No encontré la pauta.');
      return;
    }

    const packagesRecommended =
      regimen.remainingUnits <= 0
        ? 0
        : Math.ceil(regimen.remainingUnits / value);
    const commercialUnits = packagesRecommended * value;
    const surplusUnits = Math.max(commercialUnits - regimen.remainingUnits, 0);

    setRecommendations((current) => ({
      ...current,
      [regimenId]: {
        regimenId,
        remainingUnits: regimen.remainingUnits,
        packageUnits: value,
        packagesRecommended,
        commercialUnits,
        surplusUnits,
      },
    }));
  }

  async function dispense(
    regimenId: string,
    packageUnits: number | null,
    packagesPresented: number,
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await consultationApi.dispense(regimenId, {
        packageUnits: packageUnits ?? undefined,
        packagesPresented,
        idempotencyKey: crypto.randomUUID(),
      });
      await consultationApi.materializeLife().catch(() => null);
      setNotice('Surtido registrado. El tratamiento clínico no cambió.');
      setRecommendations((current) => {
        const next = { ...current };
        delete next[regimenId];
        return next;
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible registrar el surtido');
    } finally {
      setBusy(false);
    }
  }

  async function professionalPrescription(
    event: FormEvent<HTMLFormElement>,
    consultationId: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const structured = Boolean(form.get('structured'));
      await consultationApi.createProfessionalPrescription(consultationId, {
        issuedAt: new Date().toISOString(),
        institutionName: String(form.get('institutionName') || '') || undefined,
        items: [
          {
            medicationName: String(form.get('medicationName') || ''),
            strength: String(form.get('strength') || '') || undefined,
            dosageText: String(form.get('dosageText') || '') || undefined,
            frequencyText: String(form.get('frequencyText') || '') || undefined,
            durationText: String(form.get('durationText') || '') || undefined,
            instructions: String(form.get('instructions') || '') || undefined,
            ...(structured
              ? {
                  doseAmount: Number(form.get('doseAmount')),
                  doseUnit: String(form.get('doseUnit') || ''),
                  administrationsPerDay: Number(form.get('administrationsPerDay')),
                  durationDays: Number(form.get('durationDays')),
                }
              : {}),
          },
        ],
      });
      event.currentTarget.reset();
      setNotice(
        'Receta registrada. El doctor prescribe tratamiento; la farmacia define la presentación comercial.',
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible registrar la receta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>YALIKA · SALUD + LIFE</span>
            <h1>Consultas, tratamiento y seguimiento en un solo lugar.</h1>
            <p>
              Agenda una consulta, comparte un acceso temporal, conserva la receta
              y controla lo que falta por surtir sin separar Salud de Life.
            </p>
            <div className={styles.heroActions}>
              <Link href="/salud" className={styles.secondaryButton}>← Volver a Salud</Link>
              <button
                className={styles.primaryButton}
                onClick={() => consultationApi.materializeLife().then(() => setNotice('Life actualizado.')).catch((e) => setError(e.message))}
              >
                Sincronizar Life
              </button>
            </div>
          </div>
          <div className={styles.heroPrice}>
            <span>Consultas</span>
            <strong style={{ fontSize: 42 }}>GRATIS</strong>
            <small>por el momento · cobro real desactivado</small>
          </div>
        </header>

        {error && <div className={styles.error}>{error}</div>}
        {notice && <div className={styles.success}>{notice}</div>}

        <section className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.kicker}>NUEVA CONSULTA</span>
            <h2>Agenda y comparte</h2>
            <form className={styles.form} onSubmit={createConsultation}>
              <div className={styles.two}>
                <label>Paciente
                  <select name="subjectType" defaultValue="HUMAN">
                    <option value="HUMAN">Persona</option>
                    <option value="PET">Mascota</option>
                    <option value="LIVESTOCK">Animal de producción</option>
                  </select>
                </label>
                <label>Modalidad
                  <select name="mode" defaultValue="online">
                    <option value="online">En línea</option>
                    <option value="presential">Presencial</option>
                    <option value="follow_up">Seguimiento</option>
                  </select>
                </label>
              </div>
              <label>Fecha y hora
                <input name="scheduledAt" type="datetime-local" required />
              </label>
              <label>Correo de la cuenta Yalika del profesional (opcional)
                <input name="clinicianEmail" type="email" placeholder="doctor@ejemplo.com" />
                <small>Asignar una cuenta no equivale a verificar cédula profesional.</small>
              </label>
              <label>Motivo breve
                <textarea name="reason" rows={3} placeholder="Seguimiento, revisión, orientación…" />
              </label>
              <button disabled={busy}>Guardar consulta gratis</button>
            </form>
          </article>

          <article className={`${styles.card} ${styles.wide}`}>
            <div className={styles.heading}>
              <div>
                <span className={styles.kicker}>AGENDA</span>
                <h2>Consultas</h2>
              </div>
              <span className={styles.pill}>{consultations.length}</span>
            </div>

            <div className={styles.list}>
              {consultations.map((item) => (
                <div className={styles.consultation} key={item.id}>
                  <div>
                    <div className={styles.row}>
                      <strong>
                        {item.mode === 'online'
                          ? 'Consulta en línea'
                          : item.mode === 'presential'
                            ? 'Consulta presencial'
                            : 'Seguimiento'}
                      </strong>
                      <span className={styles.status}>{item.status}</span>
                    </div>
                    <p>{fmt(item.scheduledAt)}</p>
                    <small>
                      {item.subjectType} · {money(item.priceCents, item.currency)} · pago {item.paymentStatus}
                    </small>
                    {item.reason && <p className={styles.reason}>{item.reason}</p>}
                  </div>

                  <div className={styles.actions}>
                    {item.viewerRole === 'PATIENT' && (
                      <>
                        <button type="button" onClick={() => createLink(item.id)} disabled={busy}>
                          Generar link 60 min
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => consultationApi.revokeLinks(item.id).then(() => { setNotice('Links revocados.'); return refresh(); }).catch((e) => setError(e.message))}
                        >
                          Revocar links
                        </button>
                      </>
                    )}
                  </div>

                  {item.viewerRole === 'CLINICIAN' && (
                    <form
                      className={`${styles.form} ${styles.professionalForm}`}
                      onSubmit={(event) => professionalPrescription(event, item.id)}
                    >
                      <div className={styles.professionalTitle}>
                        <strong>Receta desde esta consulta</strong>
                        <span>Profesional asignado</span>
                      </div>
                      <div className={styles.two}>
                        <label>Medicamento
                          <input name="medicationName" required />
                        </label>
                        <label>Concentración
                          <input name="strength" />
                        </label>
                      </div>
                      <label>Dosis escrita
                        <input name="dosageText" placeholder="1 tableta mañana y noche" />
                      </label>
                      <div className={styles.two}>
                        <label>Frecuencia escrita
                          <input name="frequencyText" />
                        </label>
                        <label>Duración escrita
                          <input name="durationText" />
                        </label>
                      </div>
                      <label>Indicaciones
                        <textarea name="instructions" rows={2} />
                      </label>
                      <label className={styles.check}>
                        <input name="structured" type="checkbox" />
                        Calcular la cantidad total que requiere el tratamiento
                      </label>
                      <div className={styles.four}>
                        <label>Cantidad/toma<input name="doseAmount" type="number" step="any" min="0" /></label>
                        <label>Unidad<input name="doseUnit" placeholder="tableta / mL" /></label>
                        <label>Tomas/día<input name="administrationsPerDay" type="number" step="any" min="0" /></label>
                        <label>Días<input name="durationDays" type="number" step="any" min="0" /></label>
                      </div>
                      <button disabled={busy}>Registrar receta</button>
                      <small>
                        El profesional define el tratamiento. La caja, frasco o presentación se elige después en farmacia.
                      </small>
                    </form>
                  )}
                </div>
              ))}
              {!consultations.length && (
                <div className={styles.empty}>Aún no hay consultas programadas.</div>
              )}
            </div>
          </article>
        </section>

        {linkResult?.relativePath && (
          <section className={styles.sharePanel}>
            <div>
              <span className={styles.kicker}>LINK TEMPORAL</span>
              <h2>Comparte sólo esta consulta</h2>
              <p>{`${typeof window !== 'undefined' ? window.location.origin : ''}${linkResult.relativePath}`}</p>
              <div className={styles.actions}>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}${linkResult.relativePath}`,
                    )
                  }
                >
                  Copiar link
                </button>
                <Link href={linkResult.relativePath} className={styles.secondaryButton}>
                  Abrir acceso
                </Link>
              </div>
            </div>
            {qrData && <img src={qrData} alt="QR temporal de consulta" className={styles.qr} />}
          </section>
        )}

        <section className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.kicker}>TRATAMIENTO</span>
            <h2>Convertir una receta en pauta calculable</h2>
            <form className={styles.form} onSubmit={createRegimen}>
              <label>Medicamento de receta
                <select name="prescriptionItemId" required defaultValue="">
                  <option value="" disabled>Selecciona…</option>
                  {prescriptionItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>Indicación profesional
                <textarea name="instructions" rows={3} required />
              </label>
              <div className={styles.two}>
                <label>Cantidad por toma<input name="doseAmount" type="number" step="any" required /></label>
                <label>Unidad<input name="doseUnit" placeholder="tableta / mL" required /></label>
              </div>
              <div className={styles.two}>
                <label>Tomas por día<input name="administrationsPerDay" type="number" step="any" required /></label>
                <label>Duración en días<input name="durationDays" type="number" step="any" required /></label>
              </div>
              <button disabled={busy}>Guardar tratamiento</button>
            </form>
            <p className={styles.note}>
              El tratamiento guarda cuántas tabletas, cápsulas o mL necesita la persona.
              La presentación comercial se decide en farmacia.
            </p>
          </article>

          <article className={`${styles.card} ${styles.wide}`}>
            <div className={styles.heading}>
              <div>
                <span className={styles.kicker}>FARMACIA / SURTIDO</span>
                <h2>La farmacia recomienda la presentación</h2>
              </div>
              <span className={styles.pill}>{regimens.length}</span>
            </div>
            <div className={styles.regimens}>
              {regimens.map((item) => {
                const recommendation = recommendations[item.id];
                const currentPackage =
                  packageUnits[item.id] ??
                  (item.packageUnits ? String(item.packageUnits) : '');

                return (
                  <div className={styles.regimen} key={item.id}>
                    <div className={styles.rx}>
                      <strong>{item.medication?.medicationName || 'Medicamento'}</strong>
                      <span>{item.medication?.strength || item.doseUnit}</span>
                    </div>
                    <div className={styles.metrics}>
                      <div><span>Necesita</span><strong>{item.requiredUnits}</strong></div>
                      <div><span>Surtido</span><strong>{item.dispensedUnits}</strong></div>
                      <div><span>Falta</span><strong>{item.remainingUnits}</strong></div>
                      <div><span>Estado</span><strong style={{ fontSize: 14 }}>{item.supplyStatus}</strong></div>
                    </div>
                    <p>{item.instructions}</p>

                    {item.remainingUnits > 0 && (
                      <div className={styles.form}>
                        <label>
                          Presentación disponible en farmacia
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="Ej. caja con 6 tabletas"
                            value={currentPackage}
                            onChange={(event) =>
                              setPackageUnits((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <button type="button" onClick={() => recommend(item.id)} disabled={busy}>
                          Calcular recomendación
                        </button>

                        {recommendation && (
                          <div className={styles.note}>
                            Para cubrir {recommendation.remainingUnits} unidad(es), con una presentación de{' '}
                            {recommendation.packageUnits}, Yalika recomienda{' '}
                            <strong>{recommendation.packagesRecommended}</strong> presentación(es).
                            Contenido comercial: {recommendation.commercialUnits}. Sobrante estimado:{' '}
                            {recommendation.surplusUnits}. El sobrante no cambia la dosis.
                            <div className={styles.actions} style={{ marginTop: 10 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  dispense(
                                    item.id,
                                    recommendation.packageUnits,
                                    recommendation.packagesRecommended,
                                  )
                                }
                                disabled={busy}
                              >
                                Surtir lo recomendado
                              </button>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() =>
                                  dispense(item.id, recommendation.packageUnits, 1)
                                }
                                disabled={busy}
                              >
                                Surtir sólo 1 presentación
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {!regimens.length && (
                <div className={styles.empty}>
                  Las pautas aparecerán aquí cuando exista una receta estructurada.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

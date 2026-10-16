'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { historyApi } from '../../historia/history-api';
import styles from '../../historia/history.module.css';

function EmergencyViewerContent() {
  const token = useSearchParams().get('token') ?? '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Falta el token de emergencia.');
      return;
    }

    void historyApi
      .emergencyAccess(token)
      .then(setData)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'No se pudo abrir el acceso de emergencia.'),
      );
  }, [token]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>YALIKA SALUD · ACCESO DE EMERGENCIA</span>
            <h1>Ficha esencial autorizada</h1>
            <p>Acceso temporal para profesional verificado. Queda auditado.</p>
          </div>
          <Link className={styles.button} href="/">
            Inicio
          </Link>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        {data && (
          <>
            <section className={styles.card}>
              <h2>{data.patientName ?? 'Paciente'}</h2>
              <div className={styles.grid}>
                <div className={styles.item}>
                  <strong>Tipo de sangre</strong>
                  <div className={styles.meta}>
                    {data.bloodType ?? 'No compartido'}
                    {data.bloodTypeSource ? ` · ${data.bloodTypeSource}` : ''}
                  </div>
                </div>
                <div className={styles.item}>
                  <strong>Contacto</strong>
                  <div className={styles.meta}>
                    {data.emergencyContact?.name ?? 'No compartido'}
                    {data.emergencyContact?.phone ? ` · ${data.emergencyContact.phone}` : ''}
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.grid}>
              <article className={styles.card}>
                <h2>Alergias</h2>
                {data.allergies?.map((item: any) => (
                  <div className={styles.item} key={item.id}>
                    <strong>{item.substance}</strong>
                    <div className={styles.meta}>
                      {item.reaction ?? 'Sin reacción registrada'} · {item.severity}
                    </div>
                  </div>
                ))}
              </article>

              <article className={styles.card}>
                <h2>Medicamentos actuales</h2>
                {data.currentMedications?.map((item: any) => (
                  <div className={styles.item} key={item.id}>
                    <strong>{item.medicationName}</strong>
                    <div className={styles.meta}>
                      {item.strength ?? ''} {item.form ?? ''} ·{' '}
                      {item.instructions ?? 'Sin indicación estructurada'}
                    </div>
                  </div>
                ))}
              </article>

              <article className={styles.card}>
                <h2>Padecimientos autorizados</h2>
                {data.conditions?.map((item: any) => (
                  <div className={styles.item} key={item.id}>
                    <strong>{item.conditionName}</strong>
                    <div className={styles.meta}>{item.confirmationStatus}</div>
                  </div>
                ))}
              </article>

              <article className={styles.card}>
                <h2>Episodios activos autorizados</h2>
                {data.episodes?.map((item: any) => (
                  <div className={styles.item} key={item.id}>
                    <strong>{item.title}</strong>
                    <div className={styles.meta}>{item.episodeType}</div>
                  </div>
                ))}
              </article>
            </section>

            <div className={styles.warning}>{data.note}</div>
          </>
        )}
      </div>
    </main>
  );
}

function EmergencyViewerFallback() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <h1>Validando acceso de emergencia…</h1>
          <p className={styles.meta}>Comprobando el enlace temporal.</p>
        </section>
      </div>
    </main>
  );
}

export default function EmergencyViewerPage() {
  return (
    <Suspense fallback={<EmergencyViewerFallback />}>
      <EmergencyViewerContent />
    </Suspense>
  );
}

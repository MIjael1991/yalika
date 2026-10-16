'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { consultationApi } from '../consultas/consultations-api';
import styles from '../consultas/consultas.module.css';

function fmt(value?: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ConsultationAccessWorkspace() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  const nextPath = useMemo(
    () => `/salud/consulta?token=${encodeURIComponent(token)}`,
    [token],
  );

  useEffect(() => {
    if (!token) {
      setError('Falta el token de la consulta.');
      return;
    }

    consultationApi
      .access(token)
      .then(setData)
      .catch((e: Error & { status?: number }) => {
        if (e.status === 401) setUnauthorized(true);
        else setError(e.message);
      });
  }, [token]);

  if (unauthorized) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.card}>
            <span className={styles.kicker}>CONSULTA TEMPORAL</span>
            <h1>Usa tu misma cuenta Yalika</h1>
            <p>El enlace se conservará después de iniciar sesión o crear tu cuenta.</p>
            <div className={styles.actions}>
              <Link
                className={styles.secondaryButton}
                href={`/login?next=${encodeURIComponent(nextPath)}`}
              >
                Iniciar sesión
              </Link>
              <Link
                className={styles.secondaryButton}
                href={`/registro?next=${encodeURIComponent(nextPath)}`}
              >
                Crear cuenta Yalika
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.error}>{error}</section>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.card}>Abriendo consulta segura…</section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>YALIKA · CONSULTA SEGURA</span>
            <h1>
              {data.consultation.mode === 'online'
                ? 'Consulta en línea'
                : data.consultation.mode === 'presential'
                  ? 'Consulta presencial'
                  : 'Seguimiento'}
            </h1>
            <p>
              {fmt(data.consultation.scheduledAt)} · acceso {data.viewerRole.toLowerCase()}
            </p>
            <div className={styles.heroActions}>
              <Link href="/salud" className={styles.secondaryButton}>Ir a Salud</Link>
              <Link href="/salud/consultas" className={styles.secondaryButton}>Mis consultas</Link>
            </div>
          </div>
          <div className={styles.heroPrice}>
            <span>Estado</span>
            <strong style={{ fontSize: 28 }}>{data.consultation.status}</strong>
            <small>{data.privacy}</small>
          </div>
        </header>

        <section className={styles.card}>
          <span className={styles.kicker}>TRATAMIENTO VINCULADO</span>
          <h2>Seguimiento de esta consulta</h2>
          <div className={styles.regimens}>
            {(data.regimens ?? []).map((item: any) => (
              <div className={styles.regimen} key={item.id}>
                <div className={styles.rx}>
                  <strong>{item.medication?.medicationName ?? 'Medicamento'}</strong>
                  <span>{item.supplyStatus}</span>
                </div>
                <div className={styles.metrics}>
                  <div><span>Necesita</span><strong>{item.requiredUnits}</strong></div>
                  <div><span>Surtido</span><strong>{item.dispensedUnits}</strong></div>
                  <div><span>Falta</span><strong>{item.remainingUnits}</strong></div>
                  <div><span>Cajas aprox.</span><strong>{item.packagesToCoverRemaining ?? '—'}</strong></div>
                </div>
                <p>{item.instructions}</p>
              </div>
            ))}
            {!(data.regimens ?? []).length && (
              <div className={styles.empty}>Todavía no hay una pauta estructurada ligada a esta consulta.</div>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <strong>Fase actual de consulta en línea</strong>
          <p className={styles.note}>
            Este link crea una sala clínica segura para la consulta, receta y seguimiento.
            La videollamada WebRTC todavía no está habilitada; Yalika no mostrará un botón
            de videollamada falso hasta que exista señalización y cifrado probados.
          </p>
        </section>
      </div>
    </main>
  );
}

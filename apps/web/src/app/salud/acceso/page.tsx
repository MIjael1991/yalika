'use client';

import { useEffect, useState } from 'react';
import { clinicalApi, ClinicalDocument } from '../clinical-api';
import styles from '../salud.module.css';

export default function AccesoSaludPage() {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [grants, setGrants] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [documents, setDocuments] = useState<ClinicalDocument[]>([]);
  const [busy, setBusy] = useState(false);

  const returnPath = token
    ? `/salud/acceso?token=${encodeURIComponent(token)}`
    : '/salud/acceso';
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;
  const registerHref = `/registro?next=${encodeURIComponent(returnPath)}`;

  async function refreshGrants() {
    try {
      setGrants(await clinicalApi.viewerGrants());
    } catch {
      setGrants([]);
    }
  }

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
    void refreshGrants();
  }, []);

  async function request() {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const result = await clinicalApi.requestAccess(token);
      setMessage(`Solicitud creada: ${result.status}. El titular debe aprobarla.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible solicitar acceso');
    } finally {
      setBusy(false);
    }
  }

  async function openGrant(grantId: string) {
    setBusy(true);
    setError('');

    try {
      const session = await clinicalApi.createSession(grantId);
      setSessionId(session.id);
      setDocuments(await clinicalApi.sharedDocuments(session.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible abrir la sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.accessPage}>
      <div className={styles.accessShell}>
        <a className={styles.backLink} href="/salud">← Volver a Yalika Salud</a>

        <section className={styles.accessHero}>
          <div className={styles.accessShield}>✓</div>
          <span className={styles.kicker}>ACCESO TEMPORAL</span>
          <h1>La persona titular conserva el control.</h1>
          <p>
            Este QR no contiene el expediente. Inicia sesión, solicita acceso y espera
            la autorización del titular antes de ver cualquier documento.
          </p>
          <div className={styles.tokenBox}>
            <span>Token recibido</span>
            <strong>{token ? `${token.slice(0, 8)}••••••••` : 'No disponible'}</strong>
          </div>
        </section>

        {error && <div className={styles.error}><strong>Revisa:</strong> {error}</div>}
        {message && <div className={styles.success}>{message}</div>}

        <section className={styles.surface}>
          <span className={styles.kicker}>CUENTA YALIKA</span>
          <h2>Usa la misma cuenta de Yalika</h2>
          <p className={styles.muted}>
            No necesitas una cuenta especial de Salud. Inicia sesión con tu cuenta Yalika
            o crea una sola cuenta general; después regresarás a este acceso.
          </p>
          <div className={styles.inlineActions}>
            <a className={styles.button} href={loginHref}>Iniciar sesión</a>
            <a className={styles.buttonSecondary} href={registerHref}>Crear cuenta Yalika</a>
          </div>
        </section>

        <section className={styles.accessSteps}>
          <article className={styles.surface}>
            <div className={styles.stepNumber}>1</div>
            <span className={styles.kicker}>SOLICITAR</span>
            <h2>Pedir autorización</h2>
            <p className={styles.muted}>
              Tu cuenta queda registrada como solicitante. Abrir el enlace no concede acceso.
            </p>
            <button className={styles.button} onClick={request} disabled={!token || busy}>
              Solicitar acceso
            </button>
          </article>

          <article className={styles.surface}>
            <div className={styles.stepNumber}>2</div>
            <span className={styles.kicker}>APROBACIÓN</span>
            <h2>Revisar permisos aprobados</h2>
            <p className={styles.muted}>
              Cuando el titular apruebe, aparecerá aquí un permiso con vencimiento.
            </p>
            <button className={styles.buttonSecondary} onClick={refreshGrants}>
              Actualizar
            </button>

            <div className={styles.list}>
              {grants.map((grant) => (
                <div className={styles.accessItem} key={grant.id}>
                  <div>
                    <strong>{grant.purpose || 'Acceso autorizado'}</strong>
                    <span>Vence {new Date(grant.expiresAt).toLocaleString('es-MX')}</span>
                  </div>
                  <button className={styles.smallPrimary} onClick={() => openGrant(grant.id)} disabled={busy}>
                    Abrir
                  </button>
                </div>
              ))}
            </div>
          </article>

          <article className={`${styles.surface} ${styles.accessDocuments}`}>
            <div className={styles.stepNumber}>3</div>
            <span className={styles.kicker}>SESIÓN</span>
            <h2>Documentos autorizados</h2>

            {sessionId ? (
              <div className={styles.documentGrid}>
                {documents.map((doc) => (
                  <div className={styles.documentCard} key={doc.id}>
                    <div className={styles.documentIcon}>PDF</div>
                    <div className={styles.documentInfo}>
                      <strong>{doc.title}</strong>
                      <span>{doc.documentType} · {doc.verificationStatus}</span>
                    </div>
                    <a
                      className={styles.linkButton}
                      href={`/api/orion/clinical/access/sessions/${encodeURIComponent(sessionId)}/documents/${encodeURIComponent(doc.id)}/download`}
                    >
                      Descargar si fue autorizado
                    </a>
                  </div>
                ))}
                {!documents.length && <p className={styles.muted}>No hay documentos dentro de este permiso.</p>}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Aún no hay una sesión abierta.</strong>
                <p>Primero solicita y recibe aprobación.</p>
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { presenteApi, type PresenteProvider, type ProviderProfile } from '@/lib/yalika-presente';

import { PresenteIcon } from '../tequio/icons';
import styles from '../tequio/presente.module.css';
import { ServicesSetup } from '../tequio/trabajo/services-setup';
import { loadSecurity, PasswordSection, RecoverySection, type SecurityStatus } from './security-sections';
import { SECTIONS, type SectionKey } from './sections';
import { Performance, Verification, WhoAmI } from './tequio-sections';

/**
 * Mi cuenta: todo en un solo lugar y con su menú. Quién soy, lo que sé hacer (aquí se activa
 * Tequio), verificación, desempeño e historial, contraseña, correo y recuperación.
 */
export function AccountHub({ section }: { section: SectionKey | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [provider, setProvider] = useState<PresenteProvider | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    loadSecurity()
      .then((s) => live && setStatus(s))
      .catch((failure: unknown) => {
        if (!live) return;
        if (failure instanceof Error && /sesión|401/i.test(failure.message)) router.replace('/login');
        else setError(failure instanceof Error ? failure.message : 'No pudimos cargar tu cuenta.');
      });
    presenteApi
      .me()
      .then((me) => live && setProvider(me))
      .catch(() => live && setProvider(null));
    return () => {
      live = false;
    };
  }, [router]);

  const providerId = provider?.status === 'VERIFIED' ? provider.id : null;
  useEffect(() => {
    if (!providerId) return;
    let live = true;
    presenteApi
      .providerProfile(providerId)
      .then((p) => live && setProfile(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [providerId]);

  const changeProvider = useCallback((next: PresenteProvider | null) => setProvider(next), []);
  const shown: SectionKey = section ?? 'perfil';
  const current = SECTIONS.find(([key]) => key === shown)!;

  return (
    <main className={styles.page}>
      <div className={styles.hub} data-section={section ?? ''}>
        <nav className={styles.hubMenu} aria-label="Mi cuenta">
          <header className={styles.hubHead}>
            <p className={styles.eyebrow}>Yalika</p>
            <h1 className={styles.title}>Mi cuenta</h1>
          </header>
          {SECTIONS.map(([key, label, hint, icon]) => (
            <Link
              key={key}
              href={`/cuenta?seccion=${key}`}
              className={styles.hubItem}
              aria-current={shown === key ? 'page' : undefined}
              data-active={shown === key}
            >
              <span className={styles.catIcon}>
                <PresenteIcon name={icon} />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </Link>
          ))}
        </nav>

        <section className={styles.hubContent} aria-labelledby="seccion-titulo">
          <header>
            <Link href="/cuenta" className={`${styles.link} ${styles.hubBack}`}>
              Mi cuenta
            </Link>
            <h2 id="seccion-titulo" className={styles.title}>
              {current[1]}
            </h2>
          </header>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {provider === undefined ? (
            <p className={styles.meta}>Cargando…</p>
          ) : shown === 'perfil' ? (
            <WhoAmI status={status} provider={provider} profile={profile} />
          ) : shown === 'servicios' ? (
            <ServicesSetup provider={provider} onChange={changeProvider} />
          ) : shown === 'verificacion' ? (
            <Verification provider={provider} onChange={changeProvider} />
          ) : shown === 'desempeno' ? (
            <Performance provider={provider} profile={profile} />
          ) : shown === 'acceso' ? (
            <PasswordSection status={status} />
          ) : (
            <RecoverySection status={status} onStatus={setStatus} />
          )}
        </section>
      </div>
    </main>
  );
}

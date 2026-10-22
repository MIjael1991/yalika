import Link from 'next/link';

import styles from './veterinaria.module.css';

// Error de carga: si no hay sesión (401) ofrece iniciar sesión; si no, reintentar.
export function LoadError({
  message,
  status,
  onRetry,
}: {
  message: string;
  status: number;
  onRetry: () => void;
}) {
  const noSession = status === 401;
  return (
    <div role="alert" className={styles.error}>
      {noSession ? 'Inicia sesión para ver esta información.' : message}{' '}
      {noSession ? (
        <Link href="/login" className={styles.link}>
          Iniciar sesión
        </Link>
      ) : (
        <button type="button" className={styles.secondary} onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

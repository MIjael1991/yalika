'use client';

import { useState, type FormEvent } from 'react';

import { formatBalance, presenteApi, type OperatorWallet } from '@/lib/yalika-presente';

import styles from '../presente.module.css';

const CEP_URL = 'https://www.banxico.org.mx/cep/';

/** Acreditar una recarga ya vista en el banco: código del concepto, monto y clave de rastreo. */
export function WalletTopup() {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<OperatorWallet | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  function lookup(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      setFound(null);
      setFound(await presenteApi.walletLookup(code.trim()));
    });
  }

  function credit(event: FormEvent) {
    event.preventDefault();
    if (!found) return;
    const amountMxn = Number(amount);
    if (!Number.isInteger(amountMxn) || amountMxn < 1) {
      setError('Escribe el monto en pesos, sin centavos.');
      return;
    }
    void act(async () => {
      const saved = await presenteApi.walletTopup({
        code: found.code,
        amountMxn,
        reference: reference.trim(),
      });
      setFound(saved);
      setAmount('');
      setReference('');
      setNotice(`Listo: ${saved.displayName} ya tiene ${formatBalance(saved.balanceMxn)}.`);
    });
  }

  return (
    <details className={styles.category}>
      <summary>
        <span>
          <strong>Acreditar recargas</strong>
          <small>Con el código que viene en el concepto de la transferencia</small>
        </span>
      </summary>
      <div className={styles.card}>
        <form className={styles.form} onSubmit={lookup}>
          <label className={styles.field}>
            Código del concepto
            <input
              value={code}
              maxLength={20}
              placeholder="YP1A2B3C4D"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.secondary} disabled={busy || !code.trim()}>
              Buscar
            </button>
          </div>
        </form>

        {found && (
          <form className={styles.form} onSubmit={credit}>
            <p className={styles.meta}>
              <strong>{found.displayName}</strong> · saldo {formatBalance(found.balanceMxn)}
            </p>
            <p className={styles.meta}>
              Antes de acreditar, revisa en tu banco que el dinero sí llegó. Puedes comprobar la
              transferencia con su clave de rastreo en{' '}
              <a href={CEP_URL} target="_blank" rel="noreferrer" className={styles.link}>
                Banxico (CEP)
              </a>
              .
            </p>
            <label className={styles.field}>
              Monto recibido (pesos)
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label className={styles.field}>
              Clave de rastreo o folio
              <input
                value={reference}
                maxLength={40}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || !amount || !reference.trim()}
              >
                {busy ? 'Acreditando…' : 'Acreditar'}
              </button>
            </div>
          </form>
        )}
        {notice && <p className={styles.notice}>{notice}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

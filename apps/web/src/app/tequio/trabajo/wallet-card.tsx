'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  dateTimeLabel,
  formatBalance,
  plural,
  presenteApi,
  type PresenteWallet,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { CommissionTable } from './commission-table';

/** Saldo estilo recarga: regalo de bienvenida, comisión al cerrar cada trabajo y recargas. */
export function WalletCard() {
  const [wallet, setWallet] = useState<PresenteWallet | null>(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(200);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [topupNotice, setTopupNotice] = useState<{ tone: 'ok' | 'wait' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setWallet(await presenteApi.wallet());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cargar tu saldo.');
    }
  }, []);

  useEffect(() => {
    let live = true;
    presenteApi
      .wallet()
      .then((loaded) => live && setWallet(loaded))
      .catch((failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : 'No se pudo cargar tu saldo.');
      });
    return () => {
      live = false;
    };
  }, []);

  // De regreso de Mercado Pago (?recarga=…): revisa el pago unas veces y suma el saldo.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('recarga');
    if (!id) return;
    let live = true;
    let tries = 0;
    const check = async () => {
      tries += 1;
      try {
        const topup = await presenteApi.checkOnlineTopup(id);
        if (!live) return;
        if (topup.status === 'APPROVED') {
          setTopupNotice({ tone: 'ok', text: `¡Listo! Se sumaron $${topup.amountMxn} a tu saldo.` });
          void load();
          return;
        }
        if (topup.status === 'REJECTED') {
          setTopupNotice({ tone: 'bad', text: 'El pago no se aprobó. No se te cobró; intenta con otra tarjeta u OXXO.' });
          return;
        }
        setTopupNotice({
          tone: 'wait',
          text: 'Tu pago está en proceso. Si pagas en OXXO, el saldo aparece cuando pagues en la tienda; te avisamos.',
        });
        if (tries < 6) window.setTimeout(() => void check(), 5_000);
      } catch {
        if (live) setTopupNotice({ tone: 'wait', text: 'Revisando tu pago… si ya pagaste, el saldo aparece en unos minutos.' });
      }
    };
    void check();
    return () => {
      live = false;
    };
  }, [load]);

  async function payOnline() {
    setPaying(true);
    setPayError('');
    try {
      const { url } = await presenteApi.startOnlineTopup(amount);
      window.location.assign(url);
    } catch (failure) {
      setPayError(failure instanceof Error ? failure.message : 'No se pudo abrir Mercado Pago.');
      setPaying(false);
    }
  }

  if (error) return <p className={styles.hint}>{error}</p>;
  if (!wallet) return null;

  return (
    <section className={styles.card}>
      <div className={styles.walletPanel}>
        <p className={styles.meta}>Mi saldo en Tequio</p>
        <p className={`${styles.balance} ${wallet.balanceMxn < 0 ? styles.negative : ''}`}>
          {formatBalance(wallet.balanceMxn)}
        </p>
        <p className={styles.meta}>Tu código para recargar: {wallet.code}</p>
      </div>
      {topupNotice && (
        <p
          role="status"
          className={topupNotice.tone === 'ok' ? styles.notice : topupNotice.tone === 'bad' ? styles.hint : styles.notice2}
        >
          {topupNotice.text}
        </p>
      )}
      {wallet.online && (
        <div className={styles.topupOnline}>
          <strong>Recargar ahora</strong>
          <div className={styles.topupAmounts} role="radiogroup" aria-label="Cuánto recargar">
            {wallet.online.amounts.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={amount === value}
                className={amount === value ? styles.topupAmountOn : styles.topupAmount}
                onClick={() => setAmount(value)}
              >
                ${value}
              </button>
            ))}
          </div>
          <button type="button" className={styles.primary} disabled={paying} onClick={() => void payOnline()}>
            {paying ? 'Abriendo Mercado Pago…' : `Pagar $${amount} con Mercado Pago`}
          </button>
          <small className={styles.meta}>
            Con tarjeta, OXXO o transferencia. Pagas en la página segura de Mercado Pago: Yalika no ve
            ni guarda tu tarjeta. Con tarjeta el saldo aparece en un momento; en OXXO, al pagar en la
            tienda.
          </small>
          {payError && <p className={styles.hint}>{payError}</p>}
        </div>
      )}
      {!wallet.canQuote ? (
        <p className={styles.hint}>
          Te quedaste sin saldo. Recarga para volver a mandar presupuestos.
        </p>
      ) : wallet.low ? (
        <p className={styles.hint}>Te queda poco saldo. Recarga pronto para no quedarte sin trabajos.</p>
      ) : null}
      <p className={styles.meta}>
        Por cada trabajo, Yalika descuenta el {wallet.commissionPct}% del precio final cuando el
        cliente confirma que quedó bien (o a las 48 horas si no contesta). El cliente te paga a ti
        el precio completo.
      </p>
      {wallet.promo && (
        <p className={styles.founder}>
          Eres fundador: pagas el {wallet.commissionPct}% mientras usas tu regalo. Cuando pagues{' '}
          {formatBalance(wallet.promo.giftLeftMxn)} más de comisiones, baja al {wallet.promo.nextPct}%.
        </p>
      )}

      <details className={styles.category}>
        <summary>
          <span>
            <strong>Recomienda y gana servicios gratis</strong>
            <small>
              {wallet.referral.freeServices > 0
                ? `Tienes ${plural(wallet.referral.freeServices, 'servicio gratis', 'servicios gratis')}`
                : 'Por cada persona nueva que recomiendes y recargue'}
            </small>
          </span>
        </summary>
        <div className={styles.form}>
          <p className={styles.meta}>
            Comparte tu código. Cuando la persona se registre con él, la aprueben y haga su primera
            recarga, ganas un servicio sin comisión (hasta{' '}
            {formatBalance(wallet.referral.maxFreeMxn)}). Se acumulan. Solo cuenta para personas
            que nunca se habían registrado y que no recibieron el regalo de fundador.
          </p>
          <p className={styles.code}>{wallet.code}</p>
          <a
            className={styles.secondary}
            href={`https://wa.me/?text=${encodeURIComponent(
              `Te invito a ofrecer tu trabajo en Yalika Tequio. Al registrarte usa mi código ${wallet.code}.`,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            Compartir por WhatsApp
          </a>
        </div>
      </details>

      <details className={styles.category}>
        <summary>
          <span>
            <strong>Tabulador: cuánto descuenta Yalika</strong>
            <small>Cuánto te queda según lo que cobres</small>
          </span>
        </summary>
        <CommissionTable pct={wallet.commissionPct} />
      </details>

      <details className={styles.category}>
        <summary>
          <span>
            <strong>{wallet.online ? 'Recargar por transferencia' : 'Cómo recargar'}</strong>
            <small>Desde ${wallet.minTopupMxn} por transferencia</small>
          </span>
        </summary>
        <div className={styles.form}>
          {wallet.account ? (
            <p className={styles.meta}>
              Transfiere a <strong>{wallet.account.name}</strong>
              {wallet.account.bank ? ` · ${wallet.account.bank}` : ''}
              <br />
              CLABE <span className={styles.code}>{wallet.account.clabe}</span>
            </p>
          ) : (
            <p className={styles.meta}>
              Pide al equipo de Yalika los datos de la cuenta para transferir.
            </p>
          )}
          <p className={styles.meta}>En el concepto escribe solo tu código:</p>
          <p className={styles.code}>{wallet.code}</p>
          <p className={styles.meta}>
            En cuanto revisemos tu transferencia, el saldo aparece aquí. El saldo solo sirve para
            pagar la comisión de Yalika: no se retira ni se pasa a otra persona.
          </p>
        </div>
      </details>

      {wallet.entries.length > 0 && (
        <details className={styles.category}>
          <summary>
            <span>
              <strong>Movimientos</strong>
              <small>Regalo, recargas y comisiones</small>
            </span>
          </summary>
          <ul className={styles.ledger}>
            {wallet.entries.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.label}
                  {entry.note ? ` · ${entry.note}` : ''}
                  <br />
                  <small className={styles.meta}>{dateTimeLabel(entry.createdAt)}</small>
                </span>
                <strong>
                  {entry.kind === 'FREE_SERVICE'
                    ? '+1 servicio'
                    : entry.kind === 'FREE_USED'
                      ? 'Usado'
                      : `${entry.amountMxn > 0 ? '+' : ''}${formatBalance(entry.amountMxn)}`}
                </strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

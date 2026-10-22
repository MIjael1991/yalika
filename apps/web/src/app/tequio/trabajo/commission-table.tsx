import {
  COMMISSION_TABLE_PRICES,
  commissionFor,
  formatBalance,
  formatMxn,
  MIN_PRICE_MXN,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';

/** Tabulador: cuánto descuenta Yalika de cada servicio y cuánto le queda al trabajador. */
export function CommissionTable({ pct, promoPct }: { pct: number; promoPct?: number }) {
  return (
    <div className={styles.form}>
      <p className={styles.meta}>
        Cada visita lleva su presupuesto, desde {formatMxn(MIN_PRICE_MXN)}. El cliente te paga a ti
        el precio completo y Yalika descuenta la comisión de tu saldo cuando el cliente confirma que
        quedó bien.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Si cobras</th>
            {promoPct !== undefined && <th scope="col">Fundador ({promoPct}%): te quedan</th>}
            <th scope="col">{promoPct !== undefined ? `Después (${pct}%): te quedan` : `Yalika descuenta (${pct}%)`}</th>
            {promoPct === undefined && <th scope="col">Te quedan</th>}
          </tr>
        </thead>
        <tbody>
          {COMMISSION_TABLE_PRICES.map((price) => {
            const { commission, net } = commissionFor(price, pct);
            return (
              <tr key={price}>
                <td>{formatMxn(price)}</td>
                {promoPct !== undefined ? (
                  <>
                    <td>{formatBalance(commissionFor(price, promoPct).net)}</td>
                    <td>
                      <strong>{formatBalance(net)}</strong>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{formatBalance(commission)}</td>
                    <td>
                      <strong>{formatBalance(net)}</strong>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { PresenteIcon } from './icons';
import styles from './presente.module.css';

/**
 * En Yalika te cuidamos: por qué conviene pedir (y atender) siempre por Tequio, aunque ya se
 * conozcan. Mismo mensaje en todas las pantallas para que se vuelva costumbre.
 */
export function SafetyNote({ side }: { side: 'client' | 'worker' }) {
  const points =
    side === 'client'
      ? [
          'Verificamos a cada persona con su CURP, su INE y su cara; las de salud, con cédula.',
          'Solo entra quien tú elegiste: te da el PIN en tu puerta.',
          'Tu familia y tú ven el recorrido y la hora de llegada.',
          'Tu teléfono no se comparte: se escriben y se llaman por Tequio, sin ver números.',
          'Pueden grabar la llamada (al otro se le avisa) y todo queda en tu registro de seguridad por 30 días.',
          'Queda registro del precio y de lo acordado, por si algo sale mal.',
        ]
      : [
          'Sabes a quién atiendes: cliente registrado, con su casa y el punto exacto.',
          'Tu teléfono no se comparte: se escriben y se llaman por Tequio, sin ver números.',
          'Pueden grabar la llamada (al otro se le avisa) y todo queda en tu registro de seguridad por 30 días.',
          'El precio queda por escrito: nadie te cambia el trato al llegar.',
          'Cada trabajo suma a tus estrellas y a tu historial, y te trae más clientes.',
          'Queda registro de todo por si algo sale mal.',
        ];
  return (
    <aside className={styles.safety}>
      <strong>
        <PresenteIcon name="escudo" />
        {side === 'client' ? 'En Yalika te cuidamos' : 'En Yalika también te cuidamos a ti'}
      </strong>
      <ul>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <span>
        {side === 'client'
          ? 'Si alguien te pide salirte de Tequio o tu número, desconfía: fuera de aquí no hay registro, ni PIN, ni quién te respalde. Aunque ya lo conozcas, pídelo siempre por Tequio desde «Mis de confianza».'
          : 'Si un cliente te pide tratar por fuera, cuídate: fuera de Tequio no hay registro, ni PIN, ni quién te respalde si no te paga o algo sale mal. Atiéndelo siempre por aquí.'}
      </span>
    </aside>
  );
}

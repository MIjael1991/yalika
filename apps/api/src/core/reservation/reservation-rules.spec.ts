import {
  availableQuantity,
  calculateDeposit,
  isBlockingReservationStatus,
  nextStatusAfterPickupDeadline,
} from './reservation-rules';

describe('reservation-rules', () => {
  it('calcula anticipo fijo sin superar el total', () => {
    expect(calculateDeposit(620, true, 'fixed', 150)).toBe(150);
    expect(calculateDeposit(100, true, 'fixed', 150)).toBe(100);
  });

  it('calcula anticipo porcentual con centavos estables', () => {
    expect(calculateDeposit(619.99, true, 'percentage', 20)).toBe(124);
  });

  it('no exige anticipo cuando la política lo desactiva', () => {
    expect(calculateDeposit(620, false, 'fixed', 150)).toBe(0);
  });

  it('calcula disponibilidad sin permitir negativos', () => {
    expect(availableQuantity(1, 1)).toBe(0);
    expect(availableQuantity(5, 2)).toBe(3);
    expect(availableQuantity(1, 5)).toBe(0);
  });

  it('considera bloqueantes los estados que comprometen mercancía', () => {
    for (const status of [
      'hold',
      'deposit_reported',
      'active',
      'review_expired',
    ]) {
      expect(isBlockingReservationStatus(status)).toBe(true);
    }
    expect(isBlockingReservationStatus('expired')).toBe(false);
    expect(isBlockingReservationStatus('released')).toBe(false);
    expect(isBlockingReservationStatus('converted')).toBe(false);
  });

  it('manda a revisión un apartado pagado que venció', () => {
    const deadline = new Date('2026-10-10T12:00:00Z');
    const now = new Date('2026-10-11T12:00:00Z');
    expect(nextStatusAfterPickupDeadline('active', deadline, now)).toBe(
      'review_expired',
    );
  });

  it('no cambia apartados activos que todavía están vigentes', () => {
    const deadline = new Date('2026-10-12T12:00:00Z');
    const now = new Date('2026-10-11T12:00:00Z');
    expect(nextStatusAfterPickupDeadline('active', deadline, now)).toBe(
      'active',
    );
  });
});

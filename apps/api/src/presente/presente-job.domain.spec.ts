import {
  appointmentSlots,
  arrivalPin,
  busyUntil,
  canMove,
  cancelFeeCap,
  careLink,
  clientCancelFee,
  containsPhone,
  distanceMeters,
  isSuspended,
  isWithinAvailability,
  mexicoDayTime,
  suspensionAfterStrikes,
} from './presente-job.domain';

describe('etapas del trabajo', () => {
  it('solo avanza en orden', () => {
    expect(canMove('ASSIGNED', 'EN_ROUTE')).toBe(true);
    expect(canMove('EN_ROUTE', 'EN_ROUTE')).toBe(true); // actualizar llegada (retraso)
    expect(canMove('EN_ROUTE', 'ARRIVED')).toBe(true);
    expect(canMove('ARRIVED', 'IN_PROGRESS')).toBe(true);
    expect(canMove('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canMove('ASSIGNED', 'COMPLETED')).toBe(false);
    expect(canMove('COMPLETED', 'EN_ROUTE')).toBe(false);
    expect(canMove('OPEN', 'EN_ROUTE')).toBe(false);
  });
});

describe('PIN de llegada', () => {
  it('es de 4 dígitos, estable por trabajo y distinto entre trabajos', () => {
    const env: NodeJS.ProcessEnv = { YALIKA_PIN_SECRET: 'prueba' };
    expect(arrivalPin('a', env)).toMatch(/^\d{4}$/);
    expect(arrivalPin('a', env)).toBe(arrivalPin('a', env));
    const pins = new Set(
      ['a', 'b', 'c', 'd', 'e'].map((id) => arrivalPin(id, env)),
    );
    expect(pins.size).toBeGreaterThan(1);
  });

  it('en producción exige la clave', () => {
    expect(() => arrivalPin('a', { NODE_ENV: 'production' })).toThrow();
  });
});

describe('cancelación del cliente', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const chosen = new Date('2026-10-19T11:50:00Z');
  const eta = new Date('2026-10-19T12:10:00Z');
  // Casa en Morelia; el trabajador salió a ~10 km (0.09° de latitud).
  const home = { lat: 19.7027, lng: -101.1949 };
  const at = (km: number) => ({ lat: home.lat + km / 111.2, lng: home.lng });
  const onTheWay = (km: number, extra: object = {}) =>
    clientCancelFee(
      {
        status: 'EN_ROUTE',
        closedAt: chosen,
        etaAt: eta,
        priceMxn: 600,
        home,
        start: at(10),
        last: at(10 - km),
        ...extra,
      },
      now,
    );

  it('gratis si nadie ha salido o en los primeros 2 minutos', () => {
    expect(clientCancelFee({ status: 'OPEN', priceMxn: 600 }, now)).toEqual({
      amountMxn: 0,
      advancedKm: 0,
      why: 'NOT_LEFT',
    });
    expect(
      clientCancelFee(
        { status: 'ASSIGNED', closedAt: chosen, priceMxn: 600 },
        now,
      ).amountMxn,
    ).toBe(0);
    expect(
      onTheWay(6, { closedAt: new Date('2026-10-19T11:59:00Z') }),
    ).toMatchObject({ amountMxn: 0, why: 'GRACE' });
  });

  it('$15 por km avanzado, con mínimo de $40', () => {
    expect(onTheWay(1)).toMatchObject({ amountMxn: 40, why: 'ON_THE_WAY' });
    expect(onTheWay(5).amountMxn).toBe(75);
    expect(onTheWay(6)).toMatchObject({ amountMxn: 90, advancedKm: 6 });
    // Sin recorrido (sin GPS) solo el mínimo; alejarse no cobra más.
    expect(onTheWay(0, { start: null }).amountMxn).toBe(40);
    expect(onTheWay(-3).amountMxn).toBe(40);
  });

  it('tope: 25% del precio y nunca más de $250; ya en la puerta, el tope', () => {
    expect(onTheWay(9).amountMxn).toBe(135);
    expect(onTheWay(10, { start: at(30) }).amountMxn).toBe(150);
    expect(
      clientCancelFee(
        { status: 'ARRIVED', closedAt: chosen, priceMxn: 600 },
        now,
      ),
    ).toMatchObject({ amountMxn: 150, why: 'ARRIVED' });
    expect(cancelFeeCap(3000)).toBe(250);
    expect(cancelFeeCap(100)).toBe(40);
  });

  it('gratis si el trabajador va más de 20 minutos tarde', () => {
    expect(
      onTheWay(6, { etaAt: new Date('2026-10-19T11:39:00Z') }),
    ).toMatchObject({ amountMxn: 0, why: 'LATE' });
  });
});

describe('faltas del trabajador', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it('más de 5 faltas en el mes: baja temporal de 30 días', () => {
    expect(suspensionAfterStrikes(5, now)).toBeNull();
    const until = suspensionAfterStrikes(6, now)!;
    expect(until.toISOString()).toBe('2026-11-18T12:00:00.000Z');
    expect(isSuspended({ suspendedUntil: until }, now)).toBe(true);
    expect(
      isSuspended({ suspendedUntil: until }, new Date('2026-11-19T00:00:00Z')),
    ).toBe(false);
    expect(isSuspended({ suspendedUntil: null }, now)).toBe(false);
  });
});

describe('distancias y tiempo ocupado', () => {
  it('mide metros entre dos puntos', () => {
    const a = { lat: 19.7033, lng: -101.192 };
    const b = { lat: 19.7051, lng: -101.192 };
    expect(distanceMeters(a, b)).toBeGreaterThan(180);
    expect(distanceMeters(a, b)).toBeLessThan(220);
  });

  it('calcula hasta cuándo está ocupado el trabajador', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(
      busyUntil(
        { status: 'IN_PROGRESS', startedAt: now, estimatedMinutes: 90 },
        60,
        now,
      )?.toISOString(),
    ).toBe('2026-10-19T13:30:00.000Z');
    expect(
      busyUntil(
        { status: 'EN_ROUTE', etaAt: new Date('2026-10-19T12:20:00Z') },
        40,
        now,
      )?.toISOString(),
    ).toBe('2026-10-19T13:00:00.000Z');
    expect(busyUntil({ status: 'COMPLETED' }, 40, now)).toBeNull();
  });
});

describe('horario del trabajador', () => {
  const at = (iso: string) => new Date(iso);
  const weekdays = {
    days: [1, 2, 3, 4, 5],
    allDay: false,
    from: '08:00',
    to: '20:00',
  };

  it('usa la hora del centro de México', () => {
    // 16:00 UTC = 10:00 en México (martes 20 de octubre de 2026).
    expect(mexicoDayTime(at('2026-10-20T16:00:00Z'))).toEqual({
      day: 2,
      time: '10:00',
    });
  });

  it('acepta solo días y horas del horario', () => {
    expect(isWithinAvailability(weekdays, at('2026-10-19T16:00:00Z'))).toBe(
      true,
    ); // lunes 10:00
    expect(isWithinAvailability(weekdays, at('2026-10-20T03:00:00Z'))).toBe(
      false,
    ); // lunes 21:00
    expect(isWithinAvailability(weekdays, at('2026-10-25T16:00:00Z'))).toBe(
      false,
    ); // domingo
    expect(isWithinAvailability(null, at('2026-10-19T16:00:00Z'))).toBe(false);
    expect(
      isWithinAvailability(
        { days: [7], allDay: true, from: null, to: null },
        at('2026-10-25T16:00:00Z'),
      ),
    ).toBe(true);
  });

  it('turno de noche: la madrugada cuenta del día anterior', () => {
    const nights = { days: [5], allDay: false, from: '22:00', to: '06:00' };
    expect(isWithinAvailability(nights, at('2026-10-24T05:00:00Z'))).toBe(true); // viernes 23:00
    expect(isWithinAvailability(nights, at('2026-10-24T09:00:00Z'))).toBe(true); // sábado 03:00
    expect(isWithinAvailability(nights, at('2026-10-24T13:00:00Z'))).toBe(
      false,
    ); // sábado 07:00
  });
});

describe('salud y avisos', () => {
  it('enlaza trabajos de salud con Salud o Veterinaria', () => {
    expect(careLink(['MEDICO'])).toBe('HEALTH');
    expect(careLink(['ENFERMERIA', 'LIMPIEZA'])).toBe('HEALTH');
    expect(careLink(['VETERINARIO'])).toBe('VET');
    expect(careLink(['PLOMERIA'])).toBeNull();
  });

  it('detecta teléfonos en un mensaje', () => {
    expect(containsPhone('mi cel es 443 123 4567')).toBe(true);
    expect(containsPhone('4431234567')).toBe(true);
    expect(containsPhone('llego en 15 minutos, son $350')).toBe(false);
  });
});

describe('horarios para citas', () => {
  // Miércoles 22 de octubre de 2026, 8:10 a.m. en México (14:10 UTC).
  const now = new Date('2026-10-22T14:10:00Z');
  const office = {
    days: [1, 2, 3, 4, 5],
    allDay: false,
    from: '09:00',
    to: '13:00',
  };

  it('cada hora dentro de su horario, desde una hora adelante', () => {
    const slots = appointmentSlots(office, [], now, 2);
    // 9:00 está a menos de una hora: la primera es 10:00 a.m.
    expect(slots[0].toISOString()).toBe('2026-10-22T16:00:00.000Z');
    expect(slots.map((s) => mexicoDayTime(s).time)).toEqual([
      '10:00',
      '11:00',
      '12:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
    ]);
  });

  it('no choca con sus citas aceptadas ni ofrece la madrugada', () => {
    const busy = [new Date('2026-10-22T16:00:00Z')]; // 10:00 a.m.
    const times = appointmentSlots(office, busy, now, 1).map(
      (s) => mexicoDayTime(s).time,
    );
    expect(times).toEqual(['12:00']);
    const allDay = {
      days: [1, 2, 3, 4, 5, 6, 7],
      allDay: true,
      from: null,
      to: null,
    };
    const hours = appointmentSlots(allDay, [], now, 1).map(
      (s) => mexicoDayTime(s).time,
    );
    expect(hours[0]).toBe('10:00');
    expect(hours.every((t) => t >= '07:00' && t < '21:00')).toBe(true);
    expect(appointmentSlots(null, [], now)).toEqual([]);
  });
});

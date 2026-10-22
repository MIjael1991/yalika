import {
  ageOn,
  buildAvailability,
  checkCurp,
  clinicalTradeAllowed,
  curpCheckDigit,
  detectImageMime,
  effectivePresence,
  hasPresenteAccess,
  isAdultOn,
  isEditableStatus,
  isRequestOpen,
  maskCurp,
  missingForSubmit,
  parseImageDataUrl,
  readAvailability,
  requestStatus,
  serveDistanceKm,
} from './presente.domain';

const jpeg = (size: number) => {
  const bytes = Buffer.alloc(size, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
};

describe('acceso al módulo', () => {
  it('acepta all y presente; rechaza el resto', () => {
    expect(hasPresenteAccess(['all'])).toBe(true);
    expect(hasPresenteAccess(['presente'])).toBe(true);
    expect(hasPresenteAccess(['surveys'])).toBe(false);
    expect(hasPresenteAccess([])).toBe(false);
    expect(hasPresenteAccess(null)).toBe(false);
  });

  it('solo se edita en borrador o rechazado', () => {
    expect(isEditableStatus('DRAFT')).toBe(true);
    expect(isEditableStatus('REJECTED')).toBe(true);
    expect(isEditableStatus('PENDING_REVIEW')).toBe(false);
    expect(isEditableStatus('VERIFIED')).toBe(false);
    expect(isEditableStatus('SUSPENDED')).toBe(false);
  });
});

describe('CURP', () => {
  it('calcula el dígito verificador del ejemplo publicado por RENAPO', () => {
    expect(curpCheckDigit('HEGG560427MVZRRL0')).toBe(4);
  });

  it('acepta una CURP válida, con espacios y minúsculas', () => {
    const result = checkCurp(' hegg560427mvzrrl04 ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.curp).toBe('HEGG560427MVZRRL04');
      expect(result.birthDate.toISOString().slice(0, 10)).toBe('1956-04-27');
    }
  });

  it('distingue los nacidos desde 2000 por la letra de la posición 17', () => {
    const result = checkCurp('LOPM080620MDFPRRA8');
    expect(result.ok && result.birthDate.toISOString().slice(0, 10)).toBe(
      '2008-06-20',
    );
  });

  it('rechaza forma, dígito y fecha imposibles', () => {
    expect(checkCurp('ABC')).toEqual({ ok: false, reason: 'FORMAT' });
    expect(checkCurp('HEGG560427MVZRRL05')).toEqual({
      ok: false,
      reason: 'CHECK_DIGIT',
    });
    expect(checkCurp('HEGG560427MXXRRL04')).toEqual({
      ok: false,
      reason: 'FORMAT',
    });
    const feb30 = 'PEGJ900230HMCRRN0';
    const digit = curpCheckDigit(feb30)!;
    expect(checkCurp(feb30 + digit)).toEqual({
      ok: false,
      reason: 'BIRTH_DATE',
    });
  });

  it('mayoría de edad exacta al día', () => {
    const born = new Date(Date.UTC(2008, 5, 20));
    expect(isAdultOn(born, new Date(Date.UTC(2026, 5, 19)))).toBe(false);
    expect(isAdultOn(born, new Date(Date.UTC(2026, 5, 20)))).toBe(true);
    expect(
      ageOn(new Date(Date.UTC(1956, 3, 27)), new Date(Date.UTC(2026, 9, 18))),
    ).toBe(70);
  });

  it('solo muestra los últimos 4 caracteres', () => {
    expect(maskCurp('RL04')).toBe('**************RL04');
    expect(maskCurp(null)).toBeNull();
  });
});

describe('presencia', () => {
  const now = new Date('2026-10-18T20:00:00Z');
  const verified = { status: 'VERIFIED', presence: 'PRESENT' };

  it('presente solo verificado, marcado y con señal reciente', () => {
    expect(
      effectivePresence(
        { ...verified, lastSeenAt: '2026-10-18T19:45:00Z' },
        now,
      ),
    ).toBe('PRESENT');
    expect(
      effectivePresence(
        { ...verified, lastSeenAt: '2026-10-18T19:29:00Z' },
        now,
      ),
    ).toBe('ABSENT');
    expect(effectivePresence({ ...verified, lastSeenAt: null }, now)).toBe(
      'ABSENT',
    );
    expect(
      effectivePresence(
        { status: 'SUSPENDED', presence: 'PRESENT', lastSeenAt: now },
        now,
      ),
    ).toBe('ABSENT');
    expect(
      effectivePresence(
        { status: 'VERIFIED', presence: 'ABSENT', lastSeenAt: now },
        now,
      ),
    ).toBe('ABSENT');
  });
});

describe('envío a revisión', () => {
  it('lista lo que falta', () => {
    expect(missingForSubmit({}, [])).toEqual([
      'NAME',
      'TRADES',
      'MUNICIPALITY',
      'SCHEDULE',
      'CURP',
      'CONSENT',
      'INE_FRONT',
      'INE_BACK',
      'SELFIE',
    ]);
    expect(
      missingForSubmit(
        {
          displayName: 'Juan',
          trades: ['PLOMERIA'],
          municipalityCode: '16053',
          availability: { days: [1], allDay: true, from: null, to: null },
          curpHash: 'x',
          biometricConsentAt: new Date(),
        },
        ['INE_FRONT', 'INE_BACK', 'SELFIE'],
      ),
    ).toEqual([]);
  });
});

describe('fotos', () => {
  it('reconoce el tipo real por sus bytes', () => {
    expect(detectImageMime(jpeg(20))).toBe('image/jpeg');
    expect(detectImageMime(Buffer.from('hola mundo, no soy foto'))).toBeNull();
  });

  it('valida tamaño y formato del data URL', () => {
    const ok = parseImageDataUrl(
      `data:image/jpeg;base64,${jpeg(20_000).toString('base64')}`,
    );
    expect(ok.ok).toBe(true);
    expect(parseImageDataUrl('data:text/plain;base64,aGVsbG8=')).toEqual({
      ok: false,
      reason: 'FORMAT',
    });
    expect(
      parseImageDataUrl(
        `data:image/jpeg;base64,${jpeg(500).toString('base64')}`,
      ),
    ).toEqual({
      ok: false,
      reason: 'TOO_SMALL',
    });
    expect(
      parseImageDataUrl(
        `data:image/jpeg;base64,${jpeg(1_700_000).toString('base64')}`,
      ),
    ).toEqual({ ok: false, reason: 'TOO_LARGE' });
    const fake = Buffer.alloc(20_000, 0x41);
    expect(
      parseImageDataUrl(`data:image/png;base64,${fake.toString('base64')}`),
    ).toEqual({
      ok: false,
      reason: 'FORMAT',
    });
  });
});

describe('pedidos y rango', () => {
  const now = new Date('2026-10-18T20:00:00Z');
  const provider = {
    status: 'VERIFIED',
    presence: 'PRESENT',
    lastSeenAt: '2026-10-18T19:50:00Z',
    trades: ['PLOMERIA'],
    municipalityCode: '16053',
    radiusKm: 20,
  };

  it('un pedido abierto vence a su hora', () => {
    expect(
      isRequestOpen({ status: 'OPEN', expiresAt: '2026-10-18T21:00:00Z' }, now),
    ).toBe(true);
    expect(
      requestStatus({ status: 'OPEN', expiresAt: '2026-10-18T19:00:00Z' }, now),
    ).toBe('EXPIRED');
    expect(
      requestStatus(
        { status: 'ASSIGNED', expiresAt: '2026-10-18T19:00:00Z' },
        now,
      ),
    ).toBe('ASSIGNED');
  });

  it('solo atiende con su oficio, dentro de su rango y estando Presente', () => {
    expect(
      serveDistanceKm(
        provider,
        { trades: ['PLOMERIA'], municipalityCode: '16053' },
        now,
      ),
    ).toBe(0);
    expect(
      serveDistanceKm(
        provider,
        { trades: ['PLOMERIA'], municipalityCode: '16088' },
        now,
      ),
    ).not.toBeNull();
    expect(
      serveDistanceKm(
        provider,
        { trades: ['PLOMERIA'], municipalityCode: '16102' },
        now,
      ),
    ).toBeNull();
    expect(
      serveDistanceKm(
        provider,
        { trades: ['GRUA'], municipalityCode: '16053' },
        now,
      ),
    ).toBeNull();
    expect(
      serveDistanceKm(
        { ...provider, presence: 'ABSENT' },
        { trades: ['PLOMERIA'], municipalityCode: '16053' },
        now,
      ),
    ).toBeNull();
    expect(
      serveDistanceKm(
        { ...provider, radiusKm: 100 },
        { trades: ['PLOMERIA'], municipalityCode: '16102' },
        now,
      ),
    ).not.toBeNull();
  });
});

describe('días y horario', () => {
  it('ordena días, quita repetidos y acepta 24 horas', () => {
    expect(buildAvailability({ days: [5, 1, 1, 3], allDay: true })).toEqual({
      ok: true,
      value: { days: [1, 3, 5], allDay: true, from: null, to: null },
    });
  });

  it('valida horas y acepta turno de noche', () => {
    expect(
      buildAvailability({
        days: [1],
        allDay: false,
        from: '22:00',
        to: '06:00',
      }).ok,
    ).toBe(true);
    expect(
      buildAvailability({
        days: [1],
        allDay: false,
        from: '08:00',
        to: '08:00',
      }),
    ).toEqual({
      ok: false,
      reason: 'HOURS',
    });
    expect(
      buildAvailability({
        days: [1],
        allDay: false,
        from: '25:00',
        to: '08:00',
      }).ok,
    ).toBe(false);
    expect(buildAvailability({ days: [0, 8], allDay: true })).toEqual({
      ok: false,
      reason: 'DAYS',
    });
  });

  it('lo guardado inválido cuenta como sin horario', () => {
    expect(readAvailability(null)).toBeNull();
    expect(readAvailability({ days: 'lunes' })).toBeNull();
    expect(readAvailability({ days: [2], allDay: true })).toEqual({
      days: [2],
      allDay: true,
      from: null,
      to: null,
    });
  });
});

describe('oficios de salud', () => {
  const lic = (
    profession: string,
    verificationStatus = 'VERIFIED',
    active = true,
  ) => ({
    profession,
    verificationStatus,
    active,
  });

  it('la profesión verificada en Salud debe corresponder al oficio', () => {
    expect(clinicalTradeAllowed('MEDICO', lic('Médico Cirujano'))).toBe(true);
    expect(
      clinicalTradeAllowed('ENFERMERIA', lic('Licenciatura en Enfermería')),
    ).toBe(true);
    expect(
      clinicalTradeAllowed(
        'VETERINARIO',
        lic('Médico Veterinario Zootecnista'),
      ),
    ).toBe(true);
    expect(clinicalTradeAllowed('VETERINARIO', lic('MVZ'))).toBe(true);
    expect(clinicalTradeAllowed('ENFERMERIA', lic('Médico Cirujano'))).toBe(
      false,
    );
    expect(clinicalTradeAllowed('MEDICO', lic('Abogado'))).toBe(false);
  });

  it('sin verificar, inactiva o sin cédula: no', () => {
    expect(clinicalTradeAllowed('MEDICO', lic('Médico', 'PENDING'))).toBe(
      false,
    );
    expect(
      clinicalTradeAllowed('MEDICO', lic('Médico', 'VERIFIED', false)),
    ).toBe(false);
    expect(clinicalTradeAllowed('MEDICO', null)).toBe(false);
    expect(clinicalTradeAllowed('PLOMERIA', lic('Médico'))).toBe(false);
  });
});

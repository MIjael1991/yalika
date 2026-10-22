/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import {
  mercadoPagoSettings,
  paymentOutcome,
  returnBase,
  topupIdFrom,
  topupReference,
} from './presente-mercadopago.domain';
import { PresenteMercadoPagoService } from './presente-mercadopago.service';

const auth = (id = 'w1') => ({ user: { id, modules: ['all'] } }) as any;
const TOPUP = '2b0d3b7e-1111-4222-8333-444455556666';

describe('reglas de recarga con Mercado Pago', () => {
  it('se activa solo con la clave', () => {
    expect(mercadoPagoSettings({}).enabled).toBe(false);
    expect(
      mercadoPagoSettings({ MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-123456789' }),
    ).toMatchObject({ enabled: true, apiUrl: 'https://api.mercadopago.com' });
  });

  it('reconoce sus recargas y nada más', () => {
    expect(topupIdFrom(topupReference(TOPUP))).toBe(TOPUP);
    expect(topupIdFrom('otra-cosa')).toBeNull();
    expect(topupIdFrom('tequio-recarga:../../x')).toBeNull();
  });

  it('regresa a la dirección pública; localhost solo para pruebas', () => {
    expect(returnBase('https://yalika.mx', 'http://evil.com')).toBe(
      'https://yalika.mx',
    );
    expect(returnBase('', 'http://localhost:3001')).toBe(
      'http://localhost:3001',
    );
    expect(returnBase('', 'https://evil.com')).toBe('');
  });

  it('acredita solo pagos aprobados en pesos por el monto completo', () => {
    const ok = {
      id: 1,
      status: 'approved',
      currency_id: 'MXN',
      transaction_amount: 200,
    };
    expect(paymentOutcome(ok, 200)).toBe('CREDIT');
    expect(paymentOutcome({ ...ok, transaction_amount: 100 }, 200)).toBe(
      'REJECTED',
    );
    expect(paymentOutcome({ ...ok, currency_id: 'USD' }, 200)).toBe('REJECTED');
    expect(paymentOutcome({ ...ok, status: 'pending' }, 200)).toBe('WAIT');
    expect(paymentOutcome({ ...ok, status: 'rejected' }, 200)).toBe('REJECTED');
  });
});

function setup(payments: Record<string, any> = {}) {
  const topups: any[] = [];
  const prisma: any = {
    presenteProvider: {
      findUnique: jest.fn(async () => ({
        id: 'p1',
        status: 'VERIFIED',
        userId: 'w1',
      })),
    },
    presenteTopup: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: TOPUP, status: 'PENDING', ...data };
        topups.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          topups.find((t) => t.id === where.id),
          data,
        ),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = topups.find((t) => t.id === where.id);
        const allowed = where.status?.in ?? [where.status];
        if (!row || !allowed.includes(row.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findUnique: jest.fn(
        async ({ where }: any) => topups.find((t) => t.id === where.id) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) =>
        topups.find((t) => t.id === where.id),
      ),
    },
  };
  const wallet: any = { creditOnlineTopup: jest.fn(async () => true) };
  const push: any = { notify: jest.fn(async () => 1) };
  const calls: { url: string; init: any }[] = [];
  const fetchMock = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    if (url.endsWith('/checkout/preferences')) {
      return {
        ok: true,
        json: async () => ({ id: 'pref-1', init_point: 'https://mp/pagar' }),
      };
    }
    if (url.includes('/v1/payments/search')) {
      return {
        ok: true,
        json: async () => ({ results: Object.values(payments) }),
      };
    }
    const id = url.split('/').pop() as string;
    return payments[id]
      ? { ok: true, json: async () => payments[id] }
      : { ok: false, status: 404, json: async () => ({}) };
  });
  global.fetch = fetchMock as any;
  return {
    service: new PresenteMercadoPagoService(prisma, wallet, push),
    topups,
    wallet,
    push,
    calls,
  };
}

describe('recarga con Mercado Pago', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      MERCADOPAGO_ACCESS_TOKEN: 'TEST-1234567890',
      YALIKA_PUBLIC_URL: 'https://yalika.mx',
    };
  });
  afterAll(() => {
    process.env = env;
  });

  it('crea el cobro con regreso y aviso a Yalika', async () => {
    const { service, calls } = setup();
    const result = await service.start(auth(), 200);
    expect(result).toEqual({ id: TOPUP, url: 'https://mp/pagar' });
    const body = JSON.parse(calls[0].init.body);
    expect(body).toMatchObject({
      external_reference: `tequio-recarga:${TOPUP}`,
      auto_return: 'approved',
      notification_url:
        'https://yalika.mx/api/yalika/presente/webhooks/mercadopago',
      items: [{ unit_price: 200, currency_id: 'MXN', quantity: 1 }],
    });
    expect(calls[0].init.headers.Authorization).toBe('Bearer TEST-1234567890');
    await expect(service.start(auth(), 150)).rejects.toThrow('Elige');
  });

  it('sin clave no se puede (se usa la transferencia)', async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const { service } = setup();
    await expect(service.start(auth(), 200)).rejects.toThrow(
      'todavía no está activa',
    );
  });

  it('el aviso no se cree: se pregunta a Mercado Pago y se acredita una sola vez', async () => {
    const payment = {
      id: 987,
      status: 'approved',
      currency_id: 'MXN',
      transaction_amount: 200,
      external_reference: `tequio-recarga:${TOPUP}`,
    };
    const { service, topups, wallet, push } = setup({ '987': payment });
    await service.start(auth(), 200);
    await service.webhook({ type: 'payment', 'data.id': '987' }, {});
    await service.webhook({}, { type: 'payment', data: { id: '987' } });
    expect(wallet.creditOnlineTopup).toHaveBeenCalledTimes(1);
    expect(wallet.creditOnlineTopup).toHaveBeenCalledWith({
      providerId: 'p1',
      amountMxn: 200,
      paymentId: '987',
    });
    expect(topups[0].status).toBe('APPROVED');
    expect(push.notify).toHaveBeenCalledWith(
      ['w1'],
      expect.objectContaining({ title: 'Tu recarga ya está en tu saldo' }),
    );
    // Un aviso de un pago que no existe no suma nada.
    await expect(
      service.webhook({ type: 'payment', 'data.id': '555' }, {}),
    ).rejects.toThrow('Mercado Pago no respondió');
    expect(wallet.creditOnlineTopup).toHaveBeenCalledTimes(1);
  });

  it('al regresar revisa el pago; OXXO pendiente espera y rechazado no suma', async () => {
    const pending = setup({
      a: {
        id: 1,
        status: 'pending',
        external_reference: `tequio-recarga:${TOPUP}`,
      },
    });
    await pending.service.start(auth(), 100);
    expect(await pending.service.check(auth(), TOPUP)).toMatchObject({
      status: 'PENDING',
    });
    const rejected = setup({
      a: {
        id: 2,
        status: 'rejected',
        external_reference: `tequio-recarga:${TOPUP}`,
      },
    });
    await rejected.service.start(auth(), 100);
    expect(await rejected.service.check(auth(), TOPUP)).toMatchObject({
      status: 'REJECTED',
    });
    expect(rejected.wallet.creditOnlineTopup).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- dobles de prueba */
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { cfdi } from './presente-invoice.domain.spec';
import { PresenteInvoicesService } from './presente-invoices.service';

const auth = (id: string) =>
  ({ user: { id, name: 'Ana López', email: 'ana@demo.mx' } }) as any;
const data = {
  rfc: 'LOAA800101AB1',
  name: 'ANA LOPEZ',
  regime: '612',
  zip: '58000',
  use: 'G03',
  email: null,
};
const done = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  clientUserId: 'c1',
  status: 'COMPLETED',
  needsInvoice: true,
  invoiceData: data,
  finalAmountMxn: 500,
  trades: ['PLOMERIA'],
  description: 'Fuga',
  finishedAt: new Date(),
  quotes: [{ amountMxn: 450 }],
  ...over,
});
const file = (mime: string, text: string) =>
  `data:${mime};base64,${Buffer.from(text).toString('base64')}`;

function setup(opts: { request?: any; invoice?: any; client?: any } = {}) {
  const prisma: any = {
    presenteProvider: { findUnique: jest.fn(async () => ({ id: 'p1' })) },
    presenteClient: {
      findUnique: jest.fn(async () => opts.client ?? null),
      upsert: jest.fn(),
    },
    presenteRequest: {
      findUnique: jest.fn(async () => opts.request ?? null),
      findMany: jest.fn(async () => (opts.request ? [opts.request] : [])),
    },
    presenteInvoice: {
      findUnique: jest.fn(async () => opts.invoice ?? null),
      findMany: jest.fn(async () => []),
      create: jest.fn(),
    },
    presenteMessage: { create: jest.fn() },
  };
  const storage: any = {
    newKey: jest.fn((_: string, kind: string) => `k-${kind}`),
    put: jest.fn(),
    get: jest.fn(async () => Buffer.from('%PDF')),
  };
  const push: any = { notify: jest.fn(async () => 1) };
  const reminders: any = { closeInvoice: jest.fn() };
  return {
    service: new PresenteInvoicesService(prisma, storage, push, reminders),
    reminders,
    prisma,
    storage,
    push,
  };
}

describe('Factura por medio de Tequio', () => {
  it('guarda los datos fiscales del cliente y rechaza un RFC mal escrito', async () => {
    const { service, prisma } = setup();
    await service.saveFiscal(auth('c1'), {
      ...data,
      rfc: 'loaa800101ab1',
      name: 'Ana López',
    } as any);
    expect(prisma.presenteClient.upsert.mock.calls[0][0].update).toMatchObject({
      fiscalRfc: 'LOAA800101AB1',
      fiscalName: 'ANA LÓPEZ',
    });
    await expect(
      service.saveFiscal(auth('c1'), { ...data, rfc: 'ABC' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('al pedir con factura sin datos completos, se le pide llenarlos', async () => {
    const { service } = setup();
    await expect(service.snapshot('c1')).rejects.toThrow('datos para factura');
  });

  it('el profesional ve lo pendiente con IVA del 16 %', async () => {
    const { service } = setup({ request: done() });
    const mine = await service.mine(auth('w1'));
    expect(mine.pending[0]).toMatchObject({
      amountMxn: 500,
      ivaMxn: 80,
      totalMxn: 580,
      client: { rfc: 'LOAA800101AB1' },
    });
    expect(mine.pending[0].dueAt).toBeInstanceOf(Date);
  });

  it('sube PDF y XML timbrado para el RFC del cliente; el cliente recibe aviso', async () => {
    const { service, prisma, push, reminders } = setup({ request: done() });
    await service.upload(auth('w1'), 'r1', {
      pdf: file('application/pdf', '%PDF-1.4 factura'),
      xml: file('text/xml', cfdi('LOAA800101AB1')),
    });
    expect(prisma.presenteInvoice.create.mock.calls[0][0].data).toMatchObject({
      requestId: 'r1',
      uuid: 'AAAA1111-2222-3333-4444-555566667777',
      receiverRfc: 'LOAA800101AB1',
      totalMxn: 580,
    });
    expect(push.notify).toHaveBeenCalledWith(['c1'], expect.anything());
    expect(reminders.closeInvoice).toHaveBeenCalledWith('r1');
  });

  it('no acepta una factura para otro RFC, sin timbrar o de un trabajo ajeno', async () => {
    const other = setup({ request: done() });
    await expect(
      other.service.upload(auth('w1'), 'r1', {
        pdf: file('application/pdf', '%PDF-1.4'),
        xml: file('text/xml', cfdi('XAXX010101000')),
      }),
    ).rejects.toThrow('el cliente pidió para LOAA800101AB1');
    const noStamp = setup({ request: done() });
    await expect(
      noStamp.service.upload(auth('w1'), 'r1', {
        pdf: file('application/pdf', '%PDF-1.4'),
        xml: file(
          'text/xml',
          cfdi('LOAA800101AB1').replace(/<tfd:[^>]+\/>/, ''),
        ),
      }),
    ).rejects.toThrow('timbrado');
    const foreign = setup({ request: done({ quotes: [] }) });
    await expect(
      foreign.service.upload(auth('w1'), 'r1', { pdf: '', xml: '' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('solo el cliente de ese pedido descarga su factura', async () => {
    const invoice = { clientUserId: 'c1', pdfKey: 'a', xmlKey: 'b', uuid: 'U' };
    const { service } = setup({ invoice });
    const pdf = await service.clientFile(auth('c1'), 'r1', 'pdf');
    expect(pdf.fileName).toBe('factura-U.pdf');
    await expect(service.clientFile(auth('otro'), 'r1', 'pdf')).rejects.toThrow(
      NotFoundException,
    );
  });
});

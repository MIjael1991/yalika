import {
  fiscalProblems,
  ivaFor,
  readCfdi,
  readFileDataUrl,
  reviewGate,
} from './presente-invoice.domain';

const cfdi = (rfc: string, uuid = 'AAAA1111-2222-3333-4444-555566667777') =>
  `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" Total="580.00" xmlns:cfdi="http://www.sat.gob.mx/cfd/4"><cfdi:Emisor Rfc="PEPJ800101AB1"/><cfdi:Receptor Rfc="${rfc}" Nombre="ANA LOPEZ"/><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"/></cfdi:Complemento></cfdi:Comprobante>`;

describe('factura por medio de Tequio', () => {
  it('IVA del 16 % con centavos', () => {
    expect(ivaFor(500)).toBe(80);
    expect(ivaFor(333)).toBe(53.28);
  });

  it('datos fiscales completos o qué falta', () => {
    expect(
      fiscalProblems({
        rfc: 'loaa800101ab1',
        name: 'Ana López',
        regime: '612',
        zip: '58000',
        use: 'G03',
      }),
    ).toEqual([]);
    expect(
      fiscalProblems({
        rfc: 'XYZ',
        name: '',
        regime: '999',
        zip: '58',
        use: 'Z',
      }),
    ).toEqual(['RFC', 'NOMBRE', 'REGIMEN', 'CP', 'USO']);
  });

  it('lee el folio fiscal, el RFC receptor y el total del XML', () => {
    expect(readCfdi(cfdi('LOAA800101AB1'))).toEqual({
      uuid: 'AAAA1111-2222-3333-4444-555566667777',
      receiverRfc: 'LOAA800101AB1',
      total: 580,
    });
    expect(readCfdi('<html>no</html>')).toBeNull();
  });

  it('solo acepta PDF y XML de verdad y no muy pesados', () => {
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 hola').toString('base64')}`;
    expect(readFileDataUrl(pdf, 'pdf', 1000)?.mime).toBe('application/pdf');
    const fake = `data:application/pdf;base64,${Buffer.from('hola').toString('base64')}`;
    expect(readFileDataUrl(fake, 'pdf', 1000)).toBeNull();
    const xml = `data:text/xml;base64,${Buffer.from(cfdi('X')).toString('base64')}`;
    expect(readFileDataUrl(xml, 'xml', 10)).toBeNull();
    expect(readFileDataUrl(xml, 'xml', 10_000)?.mime).toBe('text/xml');
  });
});

export { cfdi };

describe('calificación ligada a la factura', () => {
  const finishedAt = new Date('2026-10-20T18:00:00Z');
  it('sin factura pedida se califica al terminar', () => {
    expect(reviewGate({ needsInvoice: false, finishedAt }, false)).toEqual({
      open: true,
      invoiceMissing: false,
      opensAt: null,
    });
  });
  it('con factura: abre al llegar, o a los 3 días marcada «No entregó factura»', () => {
    const req = { needsInvoice: true, finishedAt };
    expect(reviewGate(req, true).open).toBe(true);
    const waiting = reviewGate(req, false, new Date('2026-10-22T18:00:00Z'));
    expect(waiting.open).toBe(false);
    expect(waiting.opensAt?.toISOString()).toBe('2026-10-23T18:00:00.000Z');
    expect(
      reviewGate(req, false, new Date('2026-10-23T18:00:01Z')),
    ).toMatchObject({
      open: true,
      invoiceMissing: true,
    });
  });
});

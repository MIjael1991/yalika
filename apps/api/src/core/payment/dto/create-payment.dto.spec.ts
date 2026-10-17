import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePaymentDto } from './create-payment.dto';

/** Lo que el cobro acepta desde la caja o el celular, antes de llegar al servicio. */
async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreatePaymentDto, body));
  return errors.map((error) => error.property).sort();
}

describe('CreatePaymentDto', () => {
  it('acepta un cobro completo en cada método', async () => {
    for (const method of ['cash', 'card', 'transfer', 'other']) {
      await expect(errorsFor({ method })).resolves.toEqual([]);
    }
  });

  it('rechaza métodos que no existen', async () => {
    await expect(errorsFor({ method: 'bitcoin' })).resolves.toEqual(['method']);
    await expect(errorsFor({})).resolves.toEqual(['method']);
  });

  it('acepta centavos pero no fracciones de centavo', async () => {
    await expect(errorsFor({ method: 'card', amount: 99.99 })).resolves.toEqual([]);
    await expect(errorsFor({ method: 'card', amount: 10.005 })).resolves.toEqual(['amount']);
    await expect(errorsFor({ method: 'cash', receivedAmount: 100.123 })).resolves.toEqual(['receivedAmount']);
  });

  it('el monto debe ser al menos un centavo', async () => {
    await expect(errorsFor({ method: 'card', amount: 0 })).resolves.toEqual(['amount']);
    await expect(errorsFor({ method: 'card', amount: -1 })).resolves.toEqual(['amount']);
    await expect(errorsFor({ method: 'card', amount: 0.01 })).resolves.toEqual([]);
  });

  it('no acepta números como texto ni valores raros', async () => {
    await expect(errorsFor({ method: 'card', amount: '100' })).resolves.toEqual(['amount']);
    await expect(errorsFor({ method: 'card', amount: Number.NaN })).resolves.toEqual(['amount']);
    await expect(errorsFor({ method: 'card', amount: Number.POSITIVE_INFINITY })).resolves.toEqual(['amount']);
  });

  it('la cuenta dividida debe ser un UUID', async () => {
    await expect(errorsFor({ method: 'cash', orderSplitId: 'abc' })).resolves.toEqual(['orderSplitId']);
    await expect(errorsFor({ method: 'cash', orderSplitId: 'e6815696-5f34-4497-ac89-817718ed25a2' })).resolves.toEqual([]);
  });

  it('limita el largo de referencia y notas', async () => {
    await expect(errorsFor({ method: 'transfer', reference: 'x'.repeat(201) })).resolves.toEqual(['reference']);
    await expect(errorsFor({ method: 'transfer', notes: 'x'.repeat(1001) })).resolves.toEqual(['notes']);
  });
});

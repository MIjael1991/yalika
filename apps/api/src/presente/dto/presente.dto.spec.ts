import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FinishJobDto, SendQuoteDto } from './presente.dto';

const errors = async (cls: new () => object, data: object) =>
  (await validate(plainToInstance(cls, data))).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

describe('servicios exprés: precio y duración', () => {
  const quote = { amountMxn: 350, etaMinutes: 30, durationMinutes: 90 };

  it('acepta un presupuesto normal', async () => {
    expect(await errors(SendQuoteDto, quote)).toEqual([]);
  });

  it('el precio mínimo es de $300', async () => {
    expect(await errors(SendQuoteDto, { ...quote, amountMxn: 299 })).toContain(
      'El precio mínimo de un servicio es de $300',
    );
    expect(await errors(FinishJobDto, { finalAmountMxn: 250 })).toContain(
      'El precio mínimo de un servicio es de $300',
    );
    expect(await errors(FinishJobDto, {})).toEqual([]);
  });

  it('el trabajo es del mismo día: máximo 12 horas', async () => {
    expect(
      await errors(SendQuoteDto, { ...quote, durationMinutes: 13 * 60 }),
    ).toContain(
      'Los servicios de Tequio son del mismo día: máximo 12 horas de trabajo',
    );
    expect(
      await errors(SendQuoteDto, { amountMxn: 350, etaMinutes: 30 }),
    ).not.toEqual([]);
  });
});

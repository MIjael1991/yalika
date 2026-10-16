import { BusinessAssistantService } from './business-assistant.service';

describe('BusinessAssistantService R8', () => {
  const prisma = {
    product: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
    businessAssistantMemory: { findMany: jest.fn(), upsert: jest.fn() },
  } as any;
  const service = new BusinessAssistantService(prisma);
  const user = { id: 'u1', companyId: 'c1', name: 'A', email: 'a@a.com', role: null, modules: ['all'], homePath: '/' };

  it('rechaza cuentas restringidas antes de consultar datos', async () => {
    await expect(service.interpret({ text: 'Cuánto vendí hoy' }, { ...user, modules: ['surveys'] })).rejects.toThrow();
    await expect(service.listMemory({ ...user, modules: [] })).rejects.toThrow();
    await expect(service.saveMemory({ scope: 'commerce', key: 'margin', value: { percent: 20 } }, { ...user, modules: [] })).rejects.toThrow();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.businessAssistantMemory.upsert).not.toHaveBeenCalled();
  });

  beforeEach(() => jest.clearAllMocks());

  it('asks instead of guessing ambiguous box cost', async () => {
    const result: any = await service.interpret({ text: 'Llegaron 5 cajas de lápices de 24 piezas y costaron 180' }, user);
    expect(result.intent).toBe('inventory_receive');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.draft.totalUnits).toBe(120);
    expect(result.missing).toContain('costMeaning');
  });

  it('does not execute site publication from a design request', async () => {
    const result: any = await service.interpret({ text: 'Quiero una página elegante con video TikTok arriba' }, user);
    expect(result.intent).toBe('site_design');
    expect(result.mode).toBe('proposal');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('answers paid sales today from company data', async () => {
    prisma.order.findMany.mockResolvedValue([{ total: 100 }, { total: 50.25 }]);
    const result: any = await service.interpret({ text: 'Cuánto vendí hoy' }, user);
    expect(result.data).toEqual({ count: 2, total: 150.25 });
  });
});

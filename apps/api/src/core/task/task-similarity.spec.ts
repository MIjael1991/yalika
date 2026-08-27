import {
  buildTaskDedupeKey,
  schedulesMatchExactly,
  taskTitleSimilarity,
} from './task-similarity';

describe('task duplicate protection', () => {
  it('recognizes accent and punctuation variants as the same task', () => {
    expect(
      taskTitleSimilarity('Pagar la luz', '¡Pagar la lúz!'),
    ).toBe(1);
  });

  it('recognizes a task with an added detail as similar', () => {
    expect(
      taskTitleSimilarity(
        'Comprar leche para la casa',
        'Comprar leche y pan para casa',
      ),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('keeps the privacy boundary in the database key', () => {
    const common = {
      companyId: 'company-1',
      actorUserId: 'user-1',
      title: 'Comprar leche',
      dueAt: null,
    };

    expect(
      buildTaskDedupeKey({ ...common, spaceId: 'family-space' }),
    ).not.toBe(
      buildTaskDedupeKey({ ...common, spaceId: 'personal-space' }),
    );
  });

  it('treats times inside a five-minute window as exact', () => {
    expect(
      schedulesMatchExactly(
        new Date('2026-08-25T18:00:00.000Z'),
        new Date('2026-08-25T18:04:00.000Z'),
      ),
    ).toBe(true);
  });
});

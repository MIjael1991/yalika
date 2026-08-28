import {
  inferCaptureIntent,
  rankCaptureActionCandidates,
} from './capture-intent';

describe('capture intent', () => {
  it('recognizes a cancellation instead of creating another task', () => {
    expect(
      inferCaptureIntent(
        'Quiero que elimines la tarea de hoy que debo apagar el servidor',
      ),
    ).toEqual({
      intent: 'cancel',
      scope: 'today',
      query: 'apagar el servidor',
    });
  });

  it('recognizes when the user refers to today and tomorrow', () => {
    const result = inferCaptureIntent(
      'Cancela hoy y mañana la tarea de apagar el servidor',
    );

    expect(result.intent).toBe('cancel');
    expect(result.scope).toBe('today_and_tomorrow');
    expect(result.query).toBe('apagar el servidor');
  });

  it('ranks the matching visible task first', () => {
    const matches = rankCaptureActionCandidates({
      query: 'apagar servidor',
      timezone: 'America/Mexico_City',
      requestedDate: new Date('2026-08-27T22:00:00.000Z'),
      candidates: [
        {
          id: 'other',
          title: 'Comprar leche',
          status: 'pending',
          dueAt: new Date('2026-08-27T22:00:00.000Z'),
          spaceId: 'space-1',
          space: { id: 'space-1', name: 'Negocio', type: 'business' },
          recurrenceId: null,
        },
        {
          id: 'server',
          title: 'Apagar el servidor',
          status: 'pending',
          dueAt: new Date('2026-08-27T22:00:00.000Z'),
          spaceId: 'space-1',
          space: { id: 'space-1', name: 'Negocio', type: 'business' },
          recurrenceId: 'recurrence-1',
        },
      ],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: 'server', score: 1 });
  });
});

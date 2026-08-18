import { calculateNextOccurrence } from './task-recurrence';

describe('task recurrence calendar', () => {
  it('keeps the original day after a short month', () => {
    const startsAt = new Date('2027-01-31T15:00:00.000Z');
    const february = calculateNextOccurrence(
      startsAt,
      startsAt,
      'monthly',
      1,
    );
    const march = calculateNextOccurrence(
      february,
      startsAt,
      'monthly',
      1,
    );

    expect(february.toISOString()).toBe('2027-02-28T15:00:00.000Z');
    expect(march.toISOString()).toBe('2027-03-31T15:00:00.000Z');
  });

  it('handles leap-day yearly schedules without drifting the anchor', () => {
    const startsAt = new Date('2028-02-29T18:30:00.000Z');
    const nextYear = calculateNextOccurrence(
      startsAt,
      startsAt,
      'yearly',
      1,
    );
    const leapYear = calculateNextOccurrence(
      new Date('2031-02-28T18:30:00.000Z'),
      startsAt,
      'yearly',
      1,
    );

    expect(nextYear.toISOString()).toBe('2029-02-28T18:30:00.000Z');
    expect(leapYear.toISOString()).toBe('2032-02-29T18:30:00.000Z');
  });

  it('supports daily and weekly intervals', () => {
    const startsAt = new Date('2027-05-10T09:15:00.000Z');

    expect(
      calculateNextOccurrence(startsAt, startsAt, 'daily', 2).toISOString(),
    ).toBe('2027-05-12T09:15:00.000Z');
    expect(
      calculateNextOccurrence(startsAt, startsAt, 'weekly', 2).toISOString(),
    ).toBe('2027-05-24T09:15:00.000Z');
  });
});

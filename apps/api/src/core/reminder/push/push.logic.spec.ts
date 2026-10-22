import {
  buildPushPayload,
  isAllowedPushEndpoint,
  nextPushDelayMs,
  shouldSendPush,
} from './push.logic';

describe('push logic', () => {
  const now = new Date('2026-10-22T20:00:00.000Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it('only accepts known browser push services over https', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost:3000/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isAllowedPushEndpoint('https://evil.com/fcm.googleapis.com')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('no es una url')).toBe(false);
  });

  it('sends the first push right away', () => {
    expect(shouldSendPush(null, minutesAgo(1), now)).toBe(true);
  });

  it('repeats every 5 minutes at first, then every 30', () => {
    const remindAt = minutesAgo(60);
    expect(nextPushDelayMs(1)).toBe(5 * 60_000);
    expect(nextPushDelayMs(6)).toBe(30 * 60_000);
    expect(shouldSendPush({ sentCount: 1, lastSentAt: minutesAgo(3) }, remindAt, now)).toBe(false);
    expect(shouldSendPush({ sentCount: 1, lastSentAt: minutesAgo(5) }, remindAt, now)).toBe(true);
    expect(shouldSendPush({ sentCount: 7, lastSentAt: minutesAgo(10) }, remindAt, now)).toBe(false);
    expect(shouldSendPush({ sentCount: 7, lastSentAt: minutesAgo(31) }, remindAt, now)).toBe(true);
  });

  it('stops after 18 pushes and ignores reminders older than a day', () => {
    expect(shouldSendPush({ sentCount: 18, lastSentAt: minutesAgo(120) }, minutesAgo(600), now)).toBe(false);
    expect(shouldSendPush(null, minutesAgo(25 * 60), now)).toBe(false);
  });

  it('starts over when the person snoozes the reminder', () => {
    const lastSent = minutesAgo(20);
    const snoozedTo = minutesAgo(1);
    expect(shouldSendPush({ sentCount: 18, lastSentAt: lastSent }, snoozedTo, now)).toBe(true);
  });

  it('hides health details on the lock screen', () => {
    const generic = buildPushPayload(
      { id: 'r1', taskId: 't1' },
      { title: 'Paracetamol a Kaled', space: { type: 'health', name: 'Salud' } },
    );
    expect(generic.title).not.toContain('Paracetamol');
    expect(generic.body).not.toContain('Kaled');

    const normal = buildPushPayload(
      { id: 'r2', taskId: 't2' },
      { title: 'Comprar pan', space: { type: 'personal', name: 'Mi agenda' } },
    );
    expect(normal.title).toContain('Comprar pan');
    expect(normal.tag).toBe('yalika-aviso-r2');
    expect(normal.url).toBe('/inicio');
  });
});

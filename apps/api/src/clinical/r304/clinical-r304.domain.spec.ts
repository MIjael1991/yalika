import { buildEpisodeTitle, canExposeResource, emergencyLinkExpiry } from './clinical-r304.domain';

describe('Clinical R3.0.4 domain', () => {
  it('limpia el nombre del episodio sin inventar diagnosticos', () => {
    expect(buildEpisodeTitle('INFECTION', '  infección   respiratoria  ')).toBe('infección respiratoria');
  });
  it('solo expone emergencia si el paciente lo autorizo para ese recurso', () => {
    expect(canExposeResource({ emergencyShare: false, sensitivity: 'STANDARD' })).toBe(false);
    expect(canExposeResource({ emergencyShare: true, sensitivity: 'SENSITIVE' })).toBe(true);
  });
  it('limita enlaces de emergencia a un maximo corto', () => {
    const before = Date.now();
    const until = emergencyLinkExpiry(999).getTime();
    expect(until - before).toBeLessThanOrEqual(120 * 60_000 + 1000);
  });
});

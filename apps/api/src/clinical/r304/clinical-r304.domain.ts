export const EPISODE_TYPES = ['INFECTION','ACUTE_ILLNESS','INJURY','FRACTURE','HOSPITALIZATION','OTHER'] as const;
export const PRIVACY_LEVELS = ['STANDARD','SENSITIVE','RESTRICTED'] as const;

export function emergencyLinkExpiry(minutes = 30) {
  const safe = Math.min(Math.max(Math.trunc(minutes), 5), 120);
  return new Date(Date.now() + safe * 60_000);
}

export function canExposeResource(input: { emergencyShare: boolean; sensitivity: string }) {
  return Boolean(input.emergencyShare) && ['STANDARD','SENSITIVE','RESTRICTED'].includes(input.sensitivity);
}

export function buildEpisodeTitle(type: string, title: string) {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('El episodio necesita un nombre');
  return clean.slice(0, 180);
}

export type SurveyIneStorageMode = 'temporary' | 'yaleka_cloud';

export function normalizeSurveyIneStorageMode(
  value?: string | null,
): SurveyIneStorageMode {
  return value === 'yaleka_cloud' ? 'yaleka_cloud' : 'temporary';
}

export function canAutomaticallyDeleteSurveyIne(input: {
  backupConfirmedAt?: Date | string | null;
  expiresAt: Date | string;
  now?: Date;
}) {
  if (!input.backupConfirmedAt) return false;
  const now = input.now ?? new Date();
  return new Date(input.expiresAt).getTime() <= now.getTime();
}

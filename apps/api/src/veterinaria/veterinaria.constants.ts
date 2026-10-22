export const VETERINARIA_FEATURE_ENV = 'YALIKA_VETERINARIA_ENABLED';

export const VET_SPECIES = [
  'DOG',
  'CAT',
  'BIRD',
  'RABBIT',
  'REPTILE',
  'LIVESTOCK',
  'OTHER',
] as const;

export const VET_SEX = ['MALE', 'FEMALE', 'UNKNOWN'] as const;

export const VET_CONSULTATION_MODES = [
  'presential',
  'home',
  'online',
  'follow_up',
] as const;

// Estados en los que un veterinario asignado puede emitir receta.
export const VET_PRESCRIBABLE_STATUSES = [
  'scheduled',
  'active',
  'completed',
] as const;

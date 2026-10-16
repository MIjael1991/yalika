export const CLINICAL_FEATURE_ENV = 'CLINICAL_MODULE_ENABLED';
export const CLINICAL_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const CLINICAL_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const CLINICAL_SHARE_PERMISSIONS = new Set(['VIEW', 'DOWNLOAD']);
export const CLINICAL_EVENT_KINDS = new Set([
  'DOCUMENT',
  'PRESCRIPTION',
  'APPOINTMENT',
  'STUDY',
  'FOLLOW_UP',
  'VACCINE',
  'OTHER',
]);

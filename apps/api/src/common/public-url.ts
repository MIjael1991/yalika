/** Dirección pública de Yalika (por ejemplo https://app.midominio.com), sin diagonal final. */
export function publicBaseUrl() {
  const value = (process.env.YALIKA_PUBLIC_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  return /^https?:\/\//i.test(value) ? value : '';
}

/** Menú de Mi cuenta: [clave, título, ayuda, ícono]. */
export const SECTIONS = [
  ['perfil', 'Quién soy', 'Tu nombre y cómo te ve la gente', 'cuidados'],
  ['servicios', 'Lo que sé hacer', 'Activa Tequio: oficios, profesión, clases', 'profesionales'],
  ['verificacion', 'Verificación', 'Identidad, selfie y cédulas', 'escudo'],
  ['desempeno', 'Desempeño e historial', 'Estrellas, trabajos y cambios', 'mensaje'],
  ['acceso', 'Contraseña', 'Cambiarla y cerrar otras sesiones', 'candado'],
  ['recuperacion', 'Correo y recuperación', 'Correo, teléfono y clave de respaldo', 'hogar'],
] as const;

export type SectionKey = (typeof SECTIONS)[number][0];

export const sectionFrom = (value?: string | null): SectionKey | null =>
  SECTIONS.find(([key]) => key === value)?.[0] ?? null;

/** Llamadas del navegador al API de Yalika (con la sesión del usuario). */
function getMessage(value: unknown) {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message: unknown }).message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return 'No fue posible completar la operación';
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) throw new Error(getMessage(body));
  return body as T;
}

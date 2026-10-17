/**
 * Reconoce a un lector de códigos USB/Bluetooth: escribe como teclado, muy rápido,
 * y termina con Enter. Una persona tecleando lento nunca llega a formar un código.
 */
export function createScanBuffer(maxGapMs = 80, minLength = 4) {
  let buffer = '';
  let last = Number.NEGATIVE_INFINITY;

  return {
    /** Devuelve el código cuando llega el Enter de un escaneo; si no, null. */
    push(key: string, now: number): string | null {
      if (now - last > maxGapMs) buffer = '';
      last = now;

      if (key === 'Enter') {
        const code = buffer;
        buffer = '';
        return code.length >= minLength ? code : null;
      }

      if (key.length === 1) buffer += key;
      return null;
    },
  };
}

import { randomInt } from 'node:crypto';
import { hashSurveyIdentity } from './survey-privacy';

/** Sin I, L, O, 0 ni 1 para que nadie confunda letras con números al leer o dictar el código. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

export function newAccessCode() {
  let code = '';
  for (let index = 0; index < LENGTH; index++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** K7M4PQ2X -> K7M4-PQ2X (como se muestra y se entrega). */
export function formatAccessCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Acepta minúsculas, espacios y guion; devuelve el código limpio o null si no tiene forma de código. */
export function normalizeAccessCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '');
  if (clean.length !== LENGTH) return null;
  return [...clean].every((char) => ALPHABET.includes(char)) ? clean : null;
}

/** El código es corto: se guarda con HMAC (clave del servidor) y por encuesta, no con un hash simple. */
export function accessCodeHash(surveyId: string, code: string) {
  return hashSurveyIdentity(`code:${surveyId}:${code}`)!;
}

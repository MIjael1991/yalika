import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

/**
 * Web Push con VAPID, sin librerías: Yalika firma (ES256) un permiso corto para el servicio de
 * avisos del navegador (Google, Mozilla, Apple). El aviso va vacío: el celular, al recibirlo,
 * le pide a Yalika lo pendiente. Así no hace falta cifrar contenido ni sale información.
 */

const b64url = (value: Buffer) => value.toString('base64url');

export type VapidKeys = { publicKey: string; privateKeyPem: string };

/** Llaves nuevas: la pública en el formato que pide el navegador (65 bytes, base64url). */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    publicKey: publicKeyFor(publicKey),
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  };
}

function publicKeyFor(key: KeyObject) {
  const jwk = key.export({ format: 'jwk' });
  return b64url(
    Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x!, 'base64url'),
      Buffer.from(jwk.y!, 'base64url'),
    ]),
  );
}

/** La pública que corresponde a una privada (para revisar que las variables coincidan). */
export function publicKeyFromPrivate(privateKeyPem: string) {
  return publicKeyFor(createPublicKey(createPrivateKey(privateKeyPem)));
}

/** Encabezado Authorization para mandar un aviso a esa dirección (vale 12 horas). */
export function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now = new Date(),
) {
  const audience = new URL(endpoint).origin;
  const header = b64url(
    Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  );
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(keys.privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${header}.${payload}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** Solo direcciones https de servicios de avisos conocidos (no se manda a cualquier lado). */
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

export function isPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      PUSH_HOSTS.some((host) => host.test(url.hostname))
    );
  } catch {
    return false;
  }
}

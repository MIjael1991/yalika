/**
 * Almacenamiento de objetos compatible con S3 (Cloudflare R2), sin dependencias nuevas.
 *
 * Variables que lee (las mismas que ya usa el resto de Yalika):
 *   ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, BUCKET y REGION (por omisión "auto").
 *
 * Las funciones de firma son puras para poder probarlas con los ejemplos oficiales de AWS.
 */
import { createHash, createHmac } from 'node:crypto';

export type ObjectStorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  region: string;
};

/** Devuelve la configuración, o null si falta algo (entonces no se usa la nube). */
export function readObjectStorageConfig(
  env: Record<string, string | undefined> = process.env,
): ObjectStorageConfig | null {
  const accessKeyId = env.ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.SECRET_ACCESS_KEY?.trim();
  const endpoint = env.ENDPOINT?.trim();
  const bucket = env.BUCKET?.trim();

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    return null;
  }

  try {
    new URL(endpoint);
  } catch {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    bucket,
    region: env.REGION?.trim() || 'auto',
  };
}

const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

/** Codificación de URI de AWS (RFC 3986: también escapa ! ' ( ) *). */
const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const encodeObjectPath = (path: string) =>
  path.split('/').map(encodeRfc3986).join('/');

/** "20130524T000000Z" */
export const amzDateOf = (date: Date) =>
  date.toISOString().replace(/[:-]|\.\d{3}/g, '');

function signingKey(secret: string, dateStamp: string, region: string) {
  return hmac(
    hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), 's3'),
    'aws4_request',
  );
}

/** Dirección del objeto en estilo ruta: endpoint/bucket/llave. */
export function objectUrl(config: ObjectStorageConfig, key: string) {
  const base = new URL(config.endpoint);
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodeObjectPath(
    config.bucket,
  )}/${encodeObjectPath(key)}`;
  base.search = '';
  return base;
}

/** Firma una solicitud con encabezados (PUT, DELETE...). Devuelve los encabezados a enviar. */
export function signRequestHeaders(input: {
  config: ObjectStorageConfig;
  method: string;
  url: URL;
  payloadHash: string;
  now: Date;
  /** Encabezados extra que también se firman (en minúsculas). */
  extraHeaders?: Record<string, string>;
}) {
  const { config, method, url, payloadHash, now } = input;
  const amzDate = amzDateOf(now);
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...(input.extraHeaders ?? {}),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString() ? canonicalQuery(url.searchParams) : '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = createHmac(
    'sha256',
    signingKey(config.secretAccessKey, dateStamp, config.region),
  )
    .update(stringToSign)
    .digest('hex');

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

/** Dirección temporal firmada para que el navegador lea el objeto directo de R2. */
export function presignGetUrl(
  config: ObjectStorageConfig,
  key: string,
  expiresSeconds: number,
  now: Date = new Date(),
  /** Para las pruebas con los ejemplos de AWS (estilo subdominio). */
  urlOverride?: URL,
) {
  const url = urlOverride ? new URL(urlOverride.toString()) : objectUrl(config, key);
  const amzDate = amzDateOf(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;

  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', `${config.accessKeyId}/${scope}`);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalRequest = [
    'GET',
    url.pathname,
    canonicalQuery(url.searchParams),
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = createHmac(
    'sha256',
    signingKey(config.secretAccessKey, dateStamp, config.region),
  )
    .update(stringToSign)
    .digest('hex');

  url.searchParams.set('X-Amz-Signature', signature);
  return url.toString();
}

export type FetchLike = (
  url: URL | string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
  },
) => Promise<{ ok: boolean; status: number }>;

/** Cliente mínimo: guardar y borrar. Lo demás (leer) lo hace el navegador con la dirección firmada. */
export class ObjectStorageClient {
  constructor(
    readonly config: ObjectStorageConfig,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async put(
    key: string,
    bytes: Buffer,
    contentType: string,
    cacheControl = 'public, max-age=31536000, immutable',
  ) {
    const url = objectUrl(this.config, key);
    const headers = signRequestHeaders({
      config: this.config,
      method: 'PUT',
      url,
      payloadHash: sha256(bytes),
      now: this.clock(),
    });
    const response = await this.fetchImpl(url, {
      method: 'PUT',
      headers: {
        ...headers,
        'content-type': contentType,
        'cache-control': cacheControl,
      },
      body: new Uint8Array(bytes),
    });

    if (!response.ok) {
      throw new Error(`El almacenamiento respondió ${response.status}`);
    }
  }

  async delete(key: string) {
    const url = objectUrl(this.config, key);
    const headers = signRequestHeaders({
      config: this.config,
      method: 'DELETE',
      url,
      payloadHash: sha256(Buffer.alloc(0)),
      now: this.clock(),
    });
    const response = await this.fetchImpl(url, { method: 'DELETE', headers });

    // 404 al borrar significa que ya no estaba: el resultado es el mismo.
    if (!response.ok && response.status !== 404) {
      throw new Error(`El almacenamiento respondió ${response.status}`);
    }
  }

  presignedGet(key: string, expiresSeconds = 3600, now: Date = this.clock()) {
    return presignGetUrl(this.config, key, expiresSeconds, now);
  }
}

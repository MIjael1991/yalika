import 'reflect-metadata';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { commercePrivateRoots } from '../core/commerce-security/commerce-access.guard';

/**
 * Red de seguridad: ninguna ruta nueva puede quedar abierta por descuido.
 * Cada ruta debe (1) exigir sesión, (2) pertenecer a una raíz comercial que
 * protege CommerceAccessGuard, o (3) estar en esta lista de rutas públicas.
 * Si agregas una ruta pública a propósito, agrégala aquí con su motivo.
 */
const publicRoutes: Array<[RegExp, string]> = [
  [/^GET \/$/, 'saludo del servidor'],
  [/^GET health\/$/, 'estado del servicio'],
  [/^POST auth\/login$/, 'iniciar sesión'],
  [/^(GET|POST) auth\/register(\/status)?$/, 'registro público'],
  [/^GET auth\/recovery\/status$/, 'estado de recuperación'],
  [/^POST auth\/password\/(request|reset)$/, 'recuperar contraseña'],
  [/^(GET|POST) survey\/public\//, 'encuestas públicas por enlace'],
  [/^(GET|POST) reservation\/public\//, 'seguimiento público de apartados'],
  [/^GET mobility\/shared\/:token$/, 'viaje compartido por enlace'],
  [/^GET mobility\/safe-rides\/shared\/:token$/, 'viaje seguro compartido'],
  [
    /^POST presente\/webhooks\/mercadopago$/,
    'aviso de pago de Mercado Pago (cada pago se confirma con su API)',
  ],
];

const METHODS: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
};

function controllerFiles(dir: string, found: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'generated') continue;
    if (statSync(path).isDirectory()) controllerFiles(path, found);
    else if (name.endsWith('.controller.ts')) found.push(path);
  }
  return found;
}

type Controller = { prototype: Record<string, unknown> };

function openRoutes() {
  const open: string[] = [];

  for (const file of controllerFiles(join(__dirname, '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;

    for (const value of Object.values(exported)) {
      if (typeof value !== 'function') continue;
      const controller = value as unknown as Controller;
      const root = Reflect.getMetadata(PATH_METADATA, value) as
        string | undefined;
      if (root === undefined) continue;

      const classGuards: unknown[] =
        (Reflect.getMetadata(GUARDS_METADATA, value) as
          unknown[] | undefined) ?? [];
      const firstSegment = root.split('/').filter(Boolean)[0] ?? '';

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          number | undefined;
        if (method === undefined) continue;

        const handlerGuards: unknown[] =
          (Reflect.getMetadata(GUARDS_METADATA, handler) as
            unknown[] | undefined) ?? [];
        const path = (Reflect.getMetadata(PATH_METADATA, handler) ??
          '') as string;
        const hasSession = [...classGuards, ...handlerGuards].includes(
          SessionAuthGuard,
        );
        if (hasSession || commercePrivateRoots.has(firstSegment)) continue;

        const key = `${METHODS[method] ?? method} ${root}/${path}`
          .replace(/\/+/g, '/')
          .replace(/^(\w+) \//, '$1 /');
        const normalized = key.replace(/^(\w+) \/(.+)$/, '$1 $2');
        const isPublic = publicRoutes.some(([pattern]) =>
          pattern.test(normalized === 'GET /' ? 'GET /' : normalized),
        );
        if (!isPublic) open.push(`${name}: ${normalized}`);
      }
    }
  }

  return open;
}

describe('Protección de rutas', () => {
  it('toda ruta exige sesión, es comercial protegida o está declarada pública', () => {
    expect(openRoutes()).toEqual([]);
  });
});

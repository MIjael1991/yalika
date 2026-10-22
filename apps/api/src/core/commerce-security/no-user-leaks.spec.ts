import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Los servicios del comercio nunca deben traer el usuario completo (contraseña cifrada,
 * intentos de acceso, etc.) cuando solo necesitan saber quién fue. Prisma devuelve toda la
 * fila con `autorizadoPor: true`; hay que pedir solo id y nombre.
 */
const files = [
  'return/return.service.ts',
  'order/order.service.ts',
  'order-discount/order-discount.service.ts',
];
const userRelations = ['authorizedBy', 'voidedBy', 'processedBy', 'appliedBy', 'redeemedBy'];

describe('Comercio: nunca se entrega el usuario completo', () => {
  it.each(files)('%s pide solo id y nombre', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    for (const relation of userRelations) {
      expect(source).not.toMatch(new RegExp(`\\b${relation}:\\s*true\\b`));
    }
  });
});

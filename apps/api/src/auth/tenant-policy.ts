import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from './auth.types';

function normalizedRole(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Authorization is separate from sidebar visibility preferences. */
export function requireCommercialAccount(auth: AuthContext): void {
  if (!auth.user.modules.includes('all')) {
    throw new ForbiddenException('Esta cuenta no tiene acceso comercial');
  }
}

export function requireCompanyAdministrator(auth: AuthContext): void {
  requireCommercialAccount(auth);
  if (normalizedRole(auth.user.role?.name) !== 'administrador') {
    throw new ForbiddenException(
      'Solo un administrador puede realizar esta operación',
    );
  }
}

/** Return 404 so a tenant cannot enumerate another tenant's identifiers. */
export function assertOwnCompany(auth: AuthContext, companyId: string): void {
  if (auth.user.companyId !== companyId) {
    throw new NotFoundException('La empresa o el recurso no existe');
  }
}

export const cashierRoleName = 'cajero';

/** El cajero vende y cobra; no administra el negocio. */
export function isCashier(auth: AuthContext): boolean {
  return normalizedRole(auth.user.role?.name) === cashierRoleName;
}

/** Operaciones de gestión: cualquier cuenta comercial salvo el cajero. */
export function requireNotCashier(auth: AuthContext): void {
  requireCommercialAccount(auth);
  if (isCashier(auth)) {
    throw new ForbiddenException(
      'Esta operación es solo para el administrador',
    );
  }
}

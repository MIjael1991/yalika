import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { VETERINARIA_FEATURE_ENV } from './veterinaria.constants';
import { hasVeterinariaAccess } from './veterinaria.domain';

// Va después de SessionAuthGuard: necesita request.auth.
// Si el módulo no está habilitado para la cuenta, no aparece ni responde (404).
@Injectable()
export class VeterinariaFeatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env[VETERINARIA_FEATURE_ENV]?.trim();

    if (process.env.NODE_ENV !== 'production') {
      if (configured === 'false') {
        throw new NotFoundException('Módulo no habilitado');
      }
    } else if (configured !== 'true') {
      // Producción: deny-by-default. Debe habilitarse explícitamente.
      throw new NotFoundException('Módulo no habilitado');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!hasVeterinariaAccess(request.auth?.user?.modules)) {
      throw new NotFoundException('Módulo no habilitado');
    }
    return true;
  }
}

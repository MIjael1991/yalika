import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from './auth.types';

/**
 * IDs de usuario con rol de operador de la plataforma.
 * Se leen de YALEKA_OPERATOR_USER_IDS (separados por coma).
 * Si la variable no existe o está vacía, nadie es operador.
 */
export function platformOperatorIds(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  return new Set(
    (env.YALEKA_OPERATOR_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/**
 * Para acciones que afectan a todos los usuarios de Yaleka (precios, abonos,
 * pagos, revisiones, conocimiento compartido). Niega por defecto.
 * Debe declararse después de SessionAuthGuard:
 *   @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
 */
@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.user?.id;

    if (!userId || !platformOperatorIds().has(userId)) {
      throw new ForbiddenException(
        'Esta acción solo puede hacerla el operador de la plataforma',
      );
    }

    return true;
  }
}

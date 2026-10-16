import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CLINICAL_FEATURE_ENV } from './clinical.constants';

@Injectable()
export class ClinicalFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const configured = process.env[CLINICAL_FEATURE_ENV]?.trim();

    // Desarrollo/local: Salud queda disponible por defecto para integrarse
    // con la misma Yalika sin depender de un lanzador especial.
    if (process.env.NODE_ENV !== 'production') {
      if (configured === 'false') {
        throw new NotFoundException('Módulo no habilitado');
      }
      return true;
    }

    // Producción: deny-by-default. Debe habilitarse explícitamente.
    if (configured !== 'true') {
      throw new NotFoundException('Módulo no habilitado');
    }

    return true;
  }
}

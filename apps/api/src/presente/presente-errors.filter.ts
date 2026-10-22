import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/** Tabla o columna que no existe: la base de datos está atrasada respecto al código. */
const OUTDATED_DATABASE = new Set(['P2021', 'P2022']);

export const OUTDATED_DATABASE_MESSAGE =
  'Falta actualizar la base de datos de Tequio. Cierra las ventanas de Yalika y abre INICIAR_YALIKA.cmd otra vez.';

export function isOutdatedDatabase(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && OUTDATED_DATABASE.has(code);
}

/**
 * En vez de un "Internal server error" sin explicación, avisa con claridad cuando la base de
 * datos no tiene las tablas nuevas (faltó aplicar migraciones). Lo demás sigue igual.
 */
@Catch()
export class PresenteErrorsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Presente');

  catch(exception: unknown, host: ArgumentsHost) {
    if (isOutdatedDatabase(exception)) {
      this.logger.error(
        `Base de datos atrasada: ${exception instanceof Error ? exception.message : String(exception)}`,
      );
      const response = host.switchToHttp().getResponse<{
        status: (code: number) => { json: (body: unknown) => void };
      }>();
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: OUTDATED_DATABASE_MESSAGE,
      });
      return;
    }
    super.catch(exception, host);
  }
}

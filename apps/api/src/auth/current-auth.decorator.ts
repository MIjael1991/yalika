import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from './auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);

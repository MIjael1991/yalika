import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { type AuthenticatedRequest, sessionCookieName } from './auth.types';

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return '';
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');

    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }

  return '';
}

function getBearerToken(request: Request) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice('Bearer '.length).trim();
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token =
      getCookie(request, sessionCookieName) || getBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }

    request.auth = await this.authService.authenticate(token);
    return true;
  }
}

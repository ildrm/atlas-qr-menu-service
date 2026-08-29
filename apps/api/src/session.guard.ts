import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService } from "./auth.js";
import { type AuthenticatedRequest, IS_PUBLIC } from "./common.js";
import { appConfig } from "./config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeHttpMethod(method: string) {
  return SAFE_METHODS.has(method.toUpperCase());
}

export function isExactRequestOrigin(
  origin: string | string[] | undefined,
  expectedOrigin: string,
) {
  return typeof origin === "string" && origin === expectedOrigin;
}

export function explicitCsrfToken(
  header: string | string[] | undefined,
): string | undefined {
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = (
      request as AuthenticatedRequest & { cookies?: Record<string, string> }
    ).cookies;
    const session = await this.authService.authenticate(
      cookies?.[appConfig.SESSION_COOKIE_NAME],
    );
    if (!session) throw new UnauthorizedException("Sign in to continue");
    request.auth = { userId: session.userId, sessionId: session.sessionId };

    if (!isSafeHttpMethod(request.method)) {
      if (!isExactRequestOrigin(request.headers.origin, appConfig.WEB_ORIGIN)) {
        throw new ForbiddenException("Request origin is not allowed");
      }

      const rawToken = explicitCsrfToken(request.headers["x-csrf-token"]);
      if (
        !rawToken ||
        !(await this.authService.validateCsrf(session.sessionId, rawToken))
      ) {
        throw new ForbiddenException("Security token is invalid or expired");
      }
    }
    return true;
  }
}

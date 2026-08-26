import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService, CSRF_COOKIE } from "./auth.js";
import { type AuthenticatedRequest, IS_PUBLIC } from "./common.js";
import { appConfig } from "./config.js";

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

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const header = request.headers["x-csrf-token"];
      const rawToken =
        typeof header === "string" ? header : cookies?.[CSRF_COOKIE];
      if (!(await this.authService.validateCsrf(session.sessionId, rawToken)))
        throw new ForbiddenException("Security token is invalid or expired");
    }
    return true;
  }
}

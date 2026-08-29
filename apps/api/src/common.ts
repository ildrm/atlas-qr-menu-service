import {
  BadRequestException,
  CanActivate,
  Catch,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@atlas/contracts";
import { ZodError, type ZodType } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { DatabaseService } from "./database.service.js";

export const IS_PUBLIC = Symbol("isPublic");
export const REQUIRED_PERMISSION = Symbol("requiredPermission");
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestAuthContext {
  userId: string;
  sessionId: string;
  businessId?: string;
  membershipId?: string;
  branchScope?: string[] | null;
  permissions?: Permission[];
}

export interface AuthenticatedRequest extends FastifyRequest {
  auth?: RequestAuthContext;
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth)
      throw new ForbiddenException("Authentication context is unavailable");
    return request.auth;
  },
);

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const params = request.params as Record<string, string | undefined>;
    const businessId = params.businessId;
    if (!request.auth || !businessId)
      throw new ForbiddenException("Business context is required");
    if (!UUID_PATTERN.test(businessId))
      throw new BadRequestException("Business ID is invalid");
    const membership = await this.database.findMembership(
      request.auth.userId,
      businessId,
    );
    if (!membership || !membership.permissions.includes(permission))
      throw new ForbiddenException(
        "You do not have permission to perform this action",
      );
    request.auth.businessId = businessId;
    request.auth.membershipId = membership.membershipId;
    request.auth.branchScope = membership.branchScope;
    request.auth.permissions = membership.permissions;
    return true;
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const requestId = String(request.id);

    if (exception instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of exception.issues) {
        const key = issue.path.join(".") || "form";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      return response.status(HttpStatus.UNPROCESSABLE_ENTITY).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Review the highlighted fields.",
          fieldErrors,
          requestId,
        },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const bodyRecord =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : undefined;
      const message =
        typeof body === "string"
          ? body
          : String(
              (body as { message?: string | string[] }).message ??
                "Request failed",
            );
      const defaultCode =
        status === 400
          ? "BAD_REQUEST"
          : status === 401
            ? "UNAUTHENTICATED"
            : status === 403
              ? "FORBIDDEN"
              : status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "CONFLICT"
                  : status === 429
                    ? "RATE_LIMITED"
                    : "REQUEST_FAILED";
      return response.status(status).send({
        error: {
          code:
            typeof bodyRecord?.code === "string"
              ? bodyRecord.code
              : defaultCode,
          message,
          ...(bodyRecord?.fieldErrors
            ? { fieldErrors: bodyRecord.fieldErrors }
            : {}),
          ...(bodyRecord?.details ? { details: bodyRecord.details } : {}),
          requestId,
        },
      });
    }

    request.log.error({ err: exception, requestId }, "Unhandled API exception");
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    });
  }
}

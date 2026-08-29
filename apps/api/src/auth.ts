import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { users, sessions } from "@atlas/database";
import { loginSchema, registerSchema } from "@atlas/contracts";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import * as argon2 from "argon2";
import type { FastifyReply } from "fastify";

import {
  CurrentAuth,
  type AuthenticatedRequest,
  type RequestAuthContext,
  Public,
  parseBody,
} from "./common.js";
import { appConfig } from "./config.js";
import { DatabaseService } from "./database.service.js";

function sessionHash(token: string) {
  return createHmac("sha256", appConfig.SESSION_PEPPER)
    .update(token)
    .digest("hex");
}

function csrfHash(token: string) {
  return createHmac("sha256", appConfig.CSRF_SECRET)
    .update(token)
    .digest("hex");
}

export const CSRF_COOKIE = "atlas_csrf";

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async register(input: unknown) {
    const value = parseBody(registerSchema, input);
    const passwordHash = await argon2.hash(value.password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const [user] = await this.database.db
      .insert(users)
      .values({
        email: value.email.toLowerCase(),
        passwordHash,
        displayName: value.displayName,
        locale: value.locale,
      })
      .onConflictDoNothing()
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        locale: users.locale,
      });
    if (!user)
      throw new ConflictException("An account with that email already exists");
    return user;
  }

  async login(input: unknown, request: AuthenticatedRequest) {
    const value = parseBody(loginSchema, input);
    const [user] = await this.database.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        locale: users.locale,
        passwordHash: users.passwordHash,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(eq(sql`lower(${users.email})`, value.email.toLowerCase()))
      .limit(1);
    if (
      !user?.passwordHash ||
      user.disabledAt ||
      !(await argon2.verify(user.passwordHash, value.password))
    ) {
      throw new UnauthorizedException("Email or password is incorrect");
    }
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("base64url");
    const ttlSeconds = value.rememberMe
      ? appConfig.SESSION_TTL_SECONDS
      : Math.min(appConfig.SESSION_TTL_SECONDS, 86_400);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
    const [session] = await this.database.db
      .insert(sessions)
      .values({
        userId: user.id,
        tokenHash: sessionHash(token),
        csrfHash: csrfHash(csrf),
        expiresAt,
        userAgent: request.headers["user-agent"]?.slice(0, 1_000),
        ipAddress: request.ip,
      })
      .returning({ id: sessions.id });
    if (!session) throw new UnauthorizedException("Could not create session");
    return {
      token,
      csrf,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
      },
    };
  }

  async authenticate(token: string | undefined) {
    if (!token) return null;
    const [session] = await this.database.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        csrfHash: sessions.csrfHash,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, sessionHash(token)),
          gt(sessions.expiresAt, new Date()),
          isNull(sessions.revokedAt),
          isNull(users.disabledAt),
        ),
      )
      .limit(1);
    return session ?? null;
  }

  async validateCsrf(sessionId: string, rawToken: string | undefined) {
    if (!rawToken) return false;
    const [session] = await this.database.db
      .select({ csrfHash: sessions.csrfHash })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!session?.csrfHash) return false;
    const expected = Buffer.from(session.csrfHash, "hex");
    const candidate = Buffer.from(csrfHash(rawToken), "hex");
    return (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    );
  }

  async revoke(sessionId: string) {
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async getUser(userId: string) {
    const [user] = await this.database.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? null;
  }
}

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  async register(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = await this.auth.register(body);
    return { data: user, requestId: String(request.id) };
  }

  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const result = await this.auth.login(body, request);
    const secure = appConfig.NODE_ENV === "production";
    response.setCookie(appConfig.SESSION_COOKIE_NAME, result.token, {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "lax",
      expires: result.expiresAt,
    });
    response.setCookie(CSRF_COOKIE, result.csrf, {
      path: "/",
      ...(appConfig.CSRF_COOKIE_DOMAIN
        ? { domain: appConfig.CSRF_COOKIE_DOMAIN }
        : {}),
      httpOnly: false,
      secure,
      sameSite: "lax",
      expires: result.expiresAt,
    });
    return {
      data: { user: result.user, csrfToken: result.csrf },
      requestId: String(request.id),
    };
  }

  @Get("me")
  async me(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.auth.getUser(context.userId);
    return { data: user, requestId: String(request.id) };
  }

  @Post("logout")
  async logout(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    await this.auth.revoke(context.sessionId);
    response.clearCookie(appConfig.SESSION_COOKIE_NAME, { path: "/" });
    response.clearCookie(CSRF_COOKIE, {
      path: "/",
      ...(appConfig.CSRF_COOKIE_DOMAIN
        ? { domain: appConfig.CSRF_COOKIE_DOMAIN }
        : {}),
    });
    return { data: { loggedOut: true }, requestId: String(request.id) };
  }
}

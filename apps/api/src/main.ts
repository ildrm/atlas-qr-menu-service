import "reflect-metadata";

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import { appConfig } from "./config.js";

const MAX_REQUEST_ID_LENGTH = 100;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function requestIdFromHeader(
  header: string | string[] | undefined,
): string {
  if (
    typeof header === "string" &&
    header.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID.test(header)
  ) {
    return header;
  }
  return randomUUID();
}

const adapter = new FastifyAdapter({
  logger: {
    level: appConfig.NODE_ENV === "production" ? "info" : "warn",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "token",
    ],
  },
  bodyLimit: 1_048_576,
  trustProxy:
    appConfig.TRUST_PROXY_HOPS > 0 ? appConfig.TRUST_PROXY_HOPS : false,
  genReqId: (request: IncomingMessage) =>
    requestIdFromHeader(request.headers["x-request-id"]),
});

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  adapter,
  { bufferLogs: true },
);
await app.register(cookie);
await app.register(helmet, {
  contentSecurityPolicy: {
    directives:
      appConfig.NODE_ENV === "production"
        ? {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'self'"],
          }
        : {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
  },
  frameguard: { action: "deny" },
  hsts:
    appConfig.NODE_ENV === "production"
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});
await app.register(rateLimit, {
  max: 180,
  timeWindow: "1 minute",
  allowList: appConfig.NODE_ENV === "test" ? ["127.0.0.1"] : [],
});

app.enableCors({
  origin: appConfig.WEB_ORIGIN,
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
});
app.enableShutdownHooks();

if (appConfig.NODE_ENV !== "production") {
  const openApiConfig = new DocumentBuilder()
    .setTitle("AtlasQR API")
    .setDescription(
      "Tenant-safe API for businesses, catalogs, public experiences, and dynamic QR resolution.",
    )
    .setVersion("1.0")
    .addCookieAuth(appConfig.SESSION_COOKIE_NAME)
    .build();
  SwaggerModule.setup(
    "docs",
    app,
    SwaggerModule.createDocument(app, openApiConfig),
  );
}

await app.listen(appConfig.API_PORT, "0.0.0.0");

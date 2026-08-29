import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";
import { z } from "zod";

loadEnvironment({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

const optionalCookieDomain = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^\.?[A-Za-z0-9.-]+$/, "Use a cookie domain without a URL or port")
    .optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_PEPPER: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  CSRF_COOKIE_DOMAIN: optionalCookieDomain,
  SESSION_COOKIE_NAME: z.string().min(1).default("atlas_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  PUBLIC_QR_BASE_URL: z.url().default("http://localhost:4000/q"),
  PUBLIC_WEB_BASE_URL: z.url().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof environmentSchema>;
export const appConfig = environmentSchema.parse(process.env);

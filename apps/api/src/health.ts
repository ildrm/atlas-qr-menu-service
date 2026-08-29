import { Controller, Get, HttpStatus, Injectable, Res } from "@nestjs/common";
import { Redis } from "ioredis";
import type { FastifyReply } from "fastify";

import { Public } from "./common.js";
import { appConfig } from "./config.js";
import { DatabaseService } from "./database.service.js";

export type ReadinessChecks = Record<"database" | "redis", "up" | "down">;

export function readinessStatus(
  checks: ReadinessChecks,
): "ready" | "not_ready" {
  return checks.database === "up" && checks.redis === "up"
    ? "ready"
    : "not_ready";
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async readiness() {
    const checks: ReadinessChecks = {
      database: "down",
      redis: "down",
    };
    try {
      await this.database.pool.query("select 1");
      checks.database = "up";
    } catch {
      checks.database = "down";
    }

    const redis = new Redis(appConfig.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 0,
    });
    try {
      await redis.connect();
      await redis.ping();
      checks.redis = "up";
    } catch {
      checks.redis = "down";
    } finally {
      redis.disconnect();
    }
    return { status: readinessStatus(checks), checks };
  }
}

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get("live")
  liveness() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async readiness(@Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.health.readiness();
    if (result.status !== "ready") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}

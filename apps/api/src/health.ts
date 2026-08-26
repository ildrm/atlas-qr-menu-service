import { Controller, Get, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";

import { Public } from "./common.js";
import { appConfig } from "./config.js";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async readiness() {
    const checks: Record<string, "up" | "down"> = {
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
    return { status: checks.database === "up" ? "ready" : "not_ready", checks };
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
  readiness() {
    return this.health.readiness();
  }
}

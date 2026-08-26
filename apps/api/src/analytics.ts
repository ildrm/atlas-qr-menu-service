import { createHmac } from "node:crypto";

import { Body, Controller, Injectable, Post, Req } from "@nestjs/common";
import { businesses, catalogs, items, outboxEvents } from "@atlas/database";
import { ingestAnalyticsSchema } from "@atlas/contracts";
import { and, eq } from "drizzle-orm";

import { parseBody, Public, type AuthenticatedRequest } from "./common.js";
import { appConfig } from "./config.js";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async ingest(body: unknown, request: AuthenticatedRequest) {
    const input = parseBody(ingestAnalyticsSchema, body);
    const [business] = await this.database.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(
        and(eq(businesses.id, input.businessId), eq(businesses.public, true)),
      )
      .limit(1);
    if (!business) return { accepted: false };
    if (input.catalogId) {
      const [catalog] = await this.database.db
        .select({ id: catalogs.id })
        .from(catalogs)
        .where(
          and(
            eq(catalogs.id, input.catalogId),
            eq(catalogs.businessId, input.businessId),
            eq(catalogs.status, "published"),
          ),
        )
        .limit(1);
      if (!catalog) return { accepted: false };
    }
    if (input.itemId) {
      const [item] = await this.database.db
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            eq(items.id, input.itemId),
            eq(items.businessId, input.businessId),
            eq(items.status, "published"),
          ),
        )
        .limit(1);
      if (!item) return { accepted: false };
    }
    const visitorSource =
      input.visitorId ?? `${request.ip}|${request.headers["user-agent"] ?? ""}`;
    const visitorHash = createHmac("sha256", appConfig.SESSION_PEPPER)
      .update(visitorSource)
      .digest("hex");
    await this.database.db.insert(outboxEvents).values({
      businessId: input.businessId,
      eventType: "analytics.ingest",
      aggregateType: "analytics",
      aggregateId: input.catalogId,
      payload: { ...input, visitorHash, visitorId: undefined },
    });
    return { accepted: true };
  }
}

@Controller("api/v1/public/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post()
  async ingest(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return {
      data: await this.analytics.ingest(body, request),
      requestId: String(request.id),
    };
  }
}

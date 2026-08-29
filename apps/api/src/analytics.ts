import { Body, Controller, Injectable, Post, Req } from "@nestjs/common";
import {
  branches,
  businesses,
  catalogBranches,
  catalogs,
  categories,
  items,
  outboxEvents,
  qrCodes,
} from "@atlas/database";
import { ingestAnalyticsSchema } from "@atlas/contracts";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import { parseBody, Public, type AuthenticatedRequest } from "./common.js";
import { appConfig } from "./config.js";
import { DatabaseService } from "./database.service.js";
import { hashPublicVisitor } from "./visitor-privacy.js";

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async ingest(body: unknown, request: AuthenticatedRequest) {
    const input = parseBody(ingestAnalyticsSchema, body);
    const [business] = await this.database.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(
        and(
          eq(businesses.id, input.businessId),
          eq(businesses.public, true),
          isNull(businesses.suspendedAt),
        ),
      )
      .limit(1);
    if (!business) return { accepted: false };

    let referencedCatalogId: string | undefined;
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
      referencedCatalogId = catalog.id;
    }
    if (input.categoryId) {
      const [category] = await this.database.db
        .select({ id: categories.id, catalogId: categories.catalogId })
        .from(categories)
        .innerJoin(catalogs, eq(catalogs.id, categories.catalogId))
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.businessId, input.businessId),
            eq(categories.visible, true),
            eq(catalogs.businessId, input.businessId),
            eq(catalogs.status, "published"),
          ),
        )
        .limit(1);
      if (
        !category ||
        (referencedCatalogId !== undefined &&
          referencedCatalogId !== category.catalogId)
      )
        return { accepted: false };
      referencedCatalogId = category.catalogId;
    }
    if (input.itemId) {
      const [item] = await this.database.db
        .select({
          id: items.id,
          catalogId: items.catalogId,
          categoryId: items.categoryId,
        })
        .from(items)
        .innerJoin(
          catalogs,
          and(
            eq(catalogs.id, items.catalogId),
            eq(catalogs.businessId, items.businessId),
          ),
        )
        .innerJoin(
          categories,
          and(
            eq(categories.id, items.categoryId),
            eq(categories.businessId, items.businessId),
            eq(categories.catalogId, items.catalogId),
          ),
        )
        .where(
          and(
            eq(items.id, input.itemId),
            eq(items.businessId, input.businessId),
            eq(items.status, "published"),
            eq(catalogs.status, "published"),
            eq(categories.visible, true),
          ),
        )
        .limit(1);
      if (
        !item ||
        (referencedCatalogId !== undefined &&
          referencedCatalogId !== item.catalogId) ||
        (input.categoryId !== undefined && input.categoryId !== item.categoryId)
      )
        return { accepted: false };
      referencedCatalogId = item.catalogId;
    }

    if (input.qrCodeId) {
      const [qr] = await this.database.db
        .select({
          id: qrCodes.id,
          branchId: qrCodes.branchId,
          catalogId: qrCodes.targetId,
        })
        .from(qrCodes)
        .innerJoin(
          catalogs,
          and(
            eq(catalogs.id, qrCodes.targetId),
            eq(catalogs.businessId, qrCodes.businessId),
          ),
        )
        .where(
          and(
            eq(qrCodes.id, input.qrCodeId),
            eq(qrCodes.businessId, input.businessId),
            eq(qrCodes.targetType, "catalog"),
            eq(qrCodes.active, true),
            or(isNull(qrCodes.expiresAt), gt(qrCodes.expiresAt, new Date())),
            eq(catalogs.status, "published"),
          ),
        )
        .limit(1);
      if (
        !qr?.catalogId ||
        (referencedCatalogId !== undefined &&
          referencedCatalogId !== qr.catalogId)
      )
        return { accepted: false };

      if (qr.branchId) {
        const [assignment] = await this.database.db
          .select({ branchId: catalogBranches.branchId })
          .from(catalogBranches)
          .innerJoin(branches, eq(branches.id, catalogBranches.branchId))
          .where(
            and(
              eq(catalogBranches.catalogId, qr.catalogId),
              eq(catalogBranches.branchId, qr.branchId),
              eq(branches.businessId, input.businessId),
              eq(branches.visible, true),
            ),
          )
          .limit(1);
        if (!assignment) return { accepted: false };
      }
      referencedCatalogId = qr.catalogId;
    }

    const userAgent = request.headers["user-agent"]?.slice(0, 500) ?? "";
    const visitorSource =
      input.visitorId ?? `${request.ip.slice(0, 64)}|${userAgent}`;
    const visitorHash = hashPublicVisitor(
      appConfig.SESSION_PEPPER,
      "analytics",
      input.businessId,
      visitorSource,
    );
    const { visitorId: _visitorId, ...event } = input;
    await this.database.db.insert(outboxEvents).values({
      businessId: input.businessId,
      eventType: "analytics.ingest",
      aggregateType: "analytics",
      aggregateId: referencedCatalogId,
      payload: { ...event, catalogId: referencedCatalogId, visitorHash },
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

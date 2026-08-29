import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  analyticsEvents,
  auditEvents,
  branches,
  businesses,
  businessTypes,
  catalogs,
  memberships,
  organizations,
  planEntitlements,
  plans,
  qrCodes,
  qrScans,
  roles,
  subscriptions,
  themes,
  items,
  users,
} from "@atlas/database";
import {
  allPermissions,
  createBusinessSchema,
  createBranchSchema,
  type Permission,
  updateThemeSchema,
} from "@atlas/contracts";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import {
  CurrentAuth,
  parseBody,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
  type RequestAuthContext,
} from "./common.js";
import { DatabaseService } from "./database.service.js";

const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "grace"] as const;

type PlanLimitConfiguration = {
  status: string;
  planActive: boolean;
  value: boolean | number | string | null;
};

function throwEntitlementConfigurationError(
  entitlementKey: string,
  message = `The ${entitlementKey} entitlement is not configured.`,
): never {
  throw new HttpException(
    {
      code: "ENTITLEMENT_CONFIGURATION_ERROR",
      message,
      details: { entitlementKey },
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export function assertPlanLimit(
  configuration: PlanLimitConfiguration | undefined,
  entitlementKey: string,
  currentUsage: number,
) {
  if (
    !configuration ||
    !configuration.planActive ||
    !ACTIVE_SUBSCRIPTION_STATUSES.includes(
      configuration.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    throw new HttpException(
      {
        code: "SUBSCRIPTION_INACTIVE",
        message: "An active subscription is required for this operation.",
        details: {
          entitlementKey,
          subscriptionStatus: configuration?.status ?? "missing",
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  if (configuration.value === "unlimited") return;
  if (
    typeof configuration.value !== "number" ||
    !Number.isSafeInteger(configuration.value) ||
    configuration.value < 0
  ) {
    throwEntitlementConfigurationError(entitlementKey);
  }
  if (currentUsage >= configuration.value)
    throwLimitReached(entitlementKey, currentUsage, configuration.value);
}

function throwLimitReached(
  entitlementKey: string,
  currentUsage: number,
  limit: number,
): never {
  throw new HttpException(
    {
      code: "LIMIT_REACHED",
      message: `The ${entitlementKey} plan limit has been reached.`,
      details: { entitlementKey, currentUsage, limit },
    },
    HttpStatus.CONFLICT,
  );
}

@Injectable()
export class BusinessService {
  constructor(private readonly database: DatabaseService) {}

  async listBusinessTypes() {
    return this.database.db
      .select({
        code: businessTypes.code,
        name: businessTypes.name,
        terminology: businessTypes.terminology,
      })
      .from(businessTypes)
      .where(eq(businessTypes.active, true))
      .orderBy(businessTypes.name);
  }

  async listForUser(userId: string) {
    return this.database.db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        currency: businesses.currency,
        defaultLocale: businesses.defaultLocale,
        role: roles.name,
      })
      .from(memberships)
      .innerJoin(businesses, eq(businesses.id, memberships.businessId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(eq(memberships.userId, userId), eq(memberships.status, "active")),
      )
      .orderBy(businesses.name);
  }

  async create(userId: string, body: unknown, requestId: string) {
    const input = parseBody(createBusinessSchema, body);
    return this.database.db.transaction(async (transaction) => {
      const [businessType] = await transaction
        .select({ id: businessTypes.id })
        .from(businessTypes)
        .where(eq(businessTypes.code, input.businessTypeCode))
        .limit(1);
      if (!businessType) throw new Error("Business type is not available");
      const [organization] = await transaction
        .insert(organizations)
        .values({ name: input.name })
        .returning({ id: organizations.id });
      if (!organization) throw new Error("Could not create organization");
      const [business] = await transaction
        .insert(businesses)
        .values({
          organizationId: organization.id,
          businessTypeId: businessType.id,
          name: input.name,
          slug: input.slug,
          countryCode: input.countryCode,
          city: input.city,
          address: input.address,
          phone: input.phone,
          email: input.email,
          website: input.website,
          timezone: input.timezone,
          currency: input.currency,
          defaultLocale: input.defaultLocale,
          supportedLocales: [input.defaultLocale],
        })
        .returning();
      if (!business) throw new Error("Could not create business");
      const [ownerRole] = await transaction
        .insert(roles)
        .values({
          businessId: business.id,
          code: "owner",
          name: "Owner",
          permissions: [...allPermissions],
          system: true,
        })
        .returning({ id: roles.id });
      if (!ownerRole) throw new Error("Could not create owner role");
      await transaction.insert(memberships).values({
        userId,
        businessId: business.id,
        roleId: ownerRole.id,
        status: "active",
      });
      const [freePlan] = await transaction
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.code, "free"))
        .limit(1);
      if (!freePlan)
        throwEntitlementConfigurationError(
          "plan.free",
          "The default plan is not configured.",
        );
      await transaction.insert(subscriptions).values({
        businessId: business.id,
        planId: freePlan.id,
        status: "active",
      });
      await transaction.insert(themes).values({
        businessId: business.id,
        name: "Atlas Editorial",
        active: true,
        tokens: {
          background: "#FFFFFF",
          text: "#111714",
          primary: "#14352B",
          accent: "#F26A3D",
          muted: "#EFF7F3",
          radius: 12,
        },
      });
      await transaction.insert(auditEvents).values({
        businessId: business.id,
        actorUserId: userId,
        action: "business.created",
        entityType: "business",
        entityId: business.id,
        requestId,
        metadata: { businessType: input.businessTypeCode },
      });
      return business;
    });
  }

  async createBranch(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(createBranchSchema, body);
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${businessId}:max.branches`}))`,
      );
      const [business] = await transaction
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);
      if (!business) throw new Error("Business not found");
      const [usage] = await transaction
        .select({ value: count() })
        .from(branches)
        .where(eq(branches.businessId, businessId));
      const [entitlement] = await transaction
        .select({
          status: subscriptions.status,
          planActive: plans.active,
          value: planEntitlements.value,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .leftJoin(
          planEntitlements,
          and(
            eq(planEntitlements.planId, subscriptions.planId),
            eq(planEntitlements.key, "max.branches"),
          ),
        )
        .where(eq(subscriptions.businessId, businessId))
        .limit(1);
      assertPlanLimit(entitlement, "max.branches", usage?.value ?? 0);
      const [branch] = await transaction
        .insert(branches)
        .values({
          businessId,
          name: input.name,
          slug: input.slug,
          address: input.address,
          phone: input.phone,
          timezone: input.timezone,
        })
        .returning();
      if (!branch) throw new Error("Could not create branch");
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "branch.created",
        entityType: "branch",
        entityId: branch.id,
        requestId,
      });
      return branch;
    });
  }

  async listBranches(businessId: string) {
    return this.database.db
      .select({
        id: branches.id,
        name: branches.name,
        slug: branches.slug,
        address: branches.address,
        timezone: branches.timezone,
        visible: branches.visible,
      })
      .from(branches)
      .where(eq(branches.businessId, businessId))
      .orderBy(branches.sortOrder, branches.name);
  }

  async listTeam(businessId: string) {
    return this.database.db
      .select({
        id: memberships.id,
        displayName: users.displayName,
        email: users.email,
        locale: users.locale,
        role: roles.name,
        status: memberships.status,
        branchScope: memberships.branchScope,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(
        roles,
        and(eq(roles.id, memberships.roleId), eq(roles.businessId, businessId)),
      )
      .where(eq(memberships.businessId, businessId))
      .orderBy(users.displayName);
  }

  async getTheme(businessId: string) {
    const [theme] = await this.database.db
      .select({
        id: themes.id,
        name: themes.name,
        template: themes.template,
        version: themes.version,
        tokens: themes.tokens,
        updatedAt: themes.updatedAt,
      })
      .from(themes)
      .where(and(eq(themes.businessId, businessId), eq(themes.active, true)))
      .limit(1);
    return theme ?? null;
  }

  async updateTheme(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(updateThemeSchema, body);
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(themes)
        .where(and(eq(themes.businessId, businessId), eq(themes.active, true)))
        .limit(1)
        .for("update");
      const tokens = { ...(current?.tokens ?? {}), ...input };
      const [theme] = current
        ? await transaction
            .update(themes)
            .set({
              tokens,
              version: current.version + 1,
              updatedAt: new Date(),
            })
            .where(
              and(eq(themes.id, current.id), eq(themes.businessId, businessId)),
            )
            .returning()
        : await transaction
            .insert(themes)
            .values({
              businessId,
              name: "Atlas Editorial",
              active: true,
              tokens,
            })
            .returning();
      if (!theme) throw new Error("Could not save theme");
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "theme.updated",
        entityType: "theme",
        entityId: theme.id,
        requestId,
        metadata: { version: theme.version },
      });
      return theme;
    });
  }

  async dashboard(businessId: string, permissions: readonly Permission[] = []) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const canViewAnalytics = permissions.includes("analytics.view");
    const canReadQr = permissions.includes("qr.read");
    const [business] = await this.database.db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        defaultLocale: businesses.defaultLocale,
        currency: businesses.currency,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!business) return null;

    const [metric] = canViewAnalytics
      ? await this.database.db
          .select({
            catalogViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'catalog_viewed')::int`,
            itemOpens: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'item_viewed')::int`,
            shares: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'item_shared')::int`,
          })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.businessId, businessId),
              gte(analyticsEvents.occurredAt, since),
            ),
          )
      : [];
    const [scanMetric] = canViewAnalytics
      ? await this.database.db
          .select({ scans: count() })
          .from(qrScans)
          .where(
            and(
              eq(qrScans.businessId, businessId),
              gte(qrScans.occurredAt, since),
            ),
          )
      : [];

    const activityRows = canViewAnalytics
      ? await this.database.pool.query<{
          day: string;
          catalog_views: number;
          qr_scans: number;
        }>(
          `with days as (
         select generate_series(current_date - interval '6 days', current_date, interval '1 day')::date as day
       ), views as (
         select occurred_at::date as day, count(*)::int as value
         from analytics_events
         where business_id = $1 and event_name = 'catalog_viewed' and occurred_at >= current_date - interval '6 days'
         group by occurred_at::date
       ), scans as (
         select occurred_at::date as day, count(*)::int as value
         from qr_scans
         where business_id = $1 and occurred_at >= current_date - interval '6 days'
         group by occurred_at::date
       )
       select days.day::text, coalesce(views.value, 0)::int as catalog_views, coalesce(scans.value, 0)::int as qr_scans
       from days left join views using (day) left join scans using (day) order by days.day`,
          [businessId],
        )
      : { rows: [] };

    const popularRows = canViewAnalytics
      ? await this.database.db
          .select({
            id: items.id,
            name: items.name,
            imageUrl: items.primaryImageUrl,
            opens: count(analyticsEvents.id),
          })
          .from(items)
          .leftJoin(
            analyticsEvents,
            and(
              eq(analyticsEvents.itemId, items.id),
              eq(analyticsEvents.eventName, "item_viewed"),
              gte(analyticsEvents.occurredAt, since),
            ),
          )
          .where(eq(items.businessId, businessId))
          .groupBy(items.id)
          .orderBy(desc(count(analyticsEvents.id)), items.name)
          .limit(3)
      : [];

    const catalogRows = await this.database.db
      .select({
        id: catalogs.id,
        name: catalogs.name,
        slug: catalogs.slug,
        status: catalogs.status,
        publishedAt: catalogs.publishedAt,
      })
      .from(catalogs)
      .where(eq(catalogs.businessId, businessId))
      .orderBy(desc(catalogs.updatedAt))
      .limit(5);
    const branchRows = await this.listBranches(businessId);
    const recent = await this.database.db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        occurredAt: auditEvents.occurredAt,
        actor: users.displayName,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(eq(auditEvents.businessId, businessId))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(8);
    const qrRows = canReadQr
      ? await this.database.db
          .select({
            id: qrCodes.id,
            name: qrCodes.name,
            token: qrCodes.publicToken,
            active: qrCodes.active,
          })
          .from(qrCodes)
          .where(eq(qrCodes.businessId, businessId))
          .limit(10)
      : [];

    return {
      business,
      capabilities: { analytics: canViewAnalytics, qr: canReadQr },
      metrics: {
        catalogViews: metric?.catalogViews ?? 0,
        qrScans: scanMetric?.scans ?? 0,
        itemOpens: metric?.itemOpens ?? 0,
        shares: metric?.shares ?? 0,
      },
      catalogs: catalogRows,
      branches: branchRows,
      qrCodes: qrRows,
      activity: activityRows.rows.map((row) => ({
        day: row.day,
        catalogViews: Number(row.catalog_views),
        qrScans: Number(row.qr_scans),
      })),
      popularItems: popularRows,
      recentActivity: recent,
    };
  }
}

@Injectable()
export class EntitlementService {
  constructor(private readonly database: DatabaseService) {}

  async configuration(businessId: string, key: string) {
    const [row] = await this.database.db
      .select({
        status: subscriptions.status,
        planActive: plans.active,
        value: planEntitlements.value,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(
        planEntitlements,
        and(
          eq(planEntitlements.planId, subscriptions.planId),
          eq(planEntitlements.key, key),
        ),
      )
      .where(eq(subscriptions.businessId, businessId))
      .limit(1);
    return row;
  }

  async assertWithinLimit(
    businessId: string,
    entitlementKey: string,
    currentCount: number,
  ) {
    const configuration = await this.configuration(businessId, entitlementKey);
    assertPlanLimit(configuration, entitlementKey, currentCount);
  }
}

@Controller("api/v1")
export class BusinessController {
  constructor(private readonly businesses: BusinessService) {}

  @Public()
  @Get("business-types")
  async businessTypes(@Req() request: AuthenticatedRequest) {
    return {
      data: await this.businesses.listBusinessTypes(),
      requestId: String(request.id),
    };
  }

  @Get("businesses")
  async list(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.listForUser(context.userId),
      requestId: String(request.id),
    };
  }

  @Post("businesses")
  async create(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.create(
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("business.read")
  @Get("businesses/:businessId/dashboard")
  async dashboard(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.dashboard(
        context.businessId!,
        context.permissions ?? [],
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("branch.read")
  @Get("businesses/:businessId/branches")
  async branches(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.listBranches(context.businessId!),
      requestId: String(request.id),
    };
  }

  @RequirePermission("branch.create")
  @Post("businesses/:businessId/branches")
  async createBranch(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.createBranch(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("team.read")
  @Get("businesses/:businessId/team")
  async team(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.listTeam(context.businessId!),
      requestId: String(request.id),
    };
  }

  @RequirePermission("business.read")
  @Get("businesses/:businessId/theme")
  async theme(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.getTheme(context.businessId!),
      requestId: String(request.id),
    };
  }

  @RequirePermission("settings.manage")
  @Patch("businesses/:businessId/theme")
  async updateTheme(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.businesses.updateTheme(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }
}

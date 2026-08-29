import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  auditEvents,
  businesses,
  catalogBranches,
  catalogs,
  categories,
  items,
  variants,
} from "@atlas/database";
import {
  createCatalogSchema,
  createCategorySchema,
  createItemSchema,
  createVariantSchema,
} from "@atlas/contracts";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  CurrentAuth,
  parseBody,
  RequirePermission,
  type AuthenticatedRequest,
  type RequestAuthContext,
} from "./common.js";
import { EntitlementService } from "./business.js";
import { DatabaseService } from "./database.service.js";

const availabilityUpdateSchema = z.object({
  availability: z.enum([
    "available",
    "unavailable",
    "temporarily_unavailable",
    "sold_out",
    "hidden",
  ]),
});

const catalogFilterSchema = z.object({
  catalogId: z.uuid().optional(),
});

@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementService,
  ) {}

  async list(businessId: string) {
    return this.database.db
      .select({
        id: catalogs.id,
        name: catalogs.name,
        slug: catalogs.slug,
        description: catalogs.description,
        status: catalogs.status,
        currency: catalogs.currency,
        publishedAt: catalogs.publishedAt,
        updatedAt: catalogs.updatedAt,
      })
      .from(catalogs)
      .where(eq(catalogs.businessId, businessId))
      .orderBy(catalogs.sortOrder, catalogs.name);
  }

  async create(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(createCatalogSchema, body);
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${businessId}:max.catalogs`}))`,
      );
      const [usage] = await transaction
        .select({ value: count() })
        .from(catalogs)
        .where(eq(catalogs.businessId, businessId));
      await this.entitlements.assertWithinLimit(
        businessId,
        "max.catalogs",
        usage?.value ?? 0,
      );
      const [catalog] = await transaction
        .insert(catalogs)
        .values({
          businessId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          currency: input.currency,
        })
        .returning();
      if (!catalog) throw new Error("Could not create catalog");
      if (input.branchIds.length > 0) {
        const validBranches = await transaction.query.branches.findMany({
          where: (table, operators) =>
            operators.and(
              operators.eq(table.businessId, businessId),
              operators.inArray(table.id, input.branchIds),
            ),
        });
        if (validBranches.length !== input.branchIds.length)
          throw new BadRequestException(
            "A selected branch does not belong to this business",
          );
        await transaction.insert(catalogBranches).values(
          input.branchIds.map((branchId) => ({
            catalogId: catalog.id,
            branchId,
          })),
        );
      }
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "catalog.created",
        entityType: "catalog",
        entityId: catalog.id,
        requestId,
      });
      return catalog;
    });
  }

  async categories(businessId: string, catalogId?: string) {
    return this.database.db
      .select({
        id: categories.id,
        catalogId: categories.catalogId,
        parentId: categories.parentId,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        visible: categories.visible,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(
        catalogId
          ? and(
              eq(categories.businessId, businessId),
              eq(categories.catalogId, catalogId),
            )
          : eq(categories.businessId, businessId),
      )
      .orderBy(categories.sortOrder, categories.name);
  }

  async createCategory(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(createCategorySchema, body);
    return this.database.db.transaction(async (transaction) => {
      const [catalog] = await transaction
        .select({ id: catalogs.id })
        .from(catalogs)
        .where(
          and(
            eq(catalogs.id, input.catalogId),
            eq(catalogs.businessId, businessId),
          ),
        )
        .limit(1);
      if (!catalog) throw new NotFoundException("Catalog not found");
      if (input.parentId) {
        const [parent] = await transaction
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.id, input.parentId),
              eq(categories.catalogId, input.catalogId),
              eq(categories.businessId, businessId),
            ),
          )
          .limit(1);
        if (!parent) throw new NotFoundException("Parent category not found");
      }
      const [category] = await transaction
        .insert(categories)
        .values({
          businessId,
          catalogId: input.catalogId,
          parentId: input.parentId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          sortOrder: input.sortOrder,
        })
        .returning();
      if (!category) throw new Error("Could not create category");
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "category.created",
        entityType: "category",
        entityId: category.id,
        requestId,
      });
      return category;
    });
  }

  async items(businessId: string, catalogId?: string) {
    return this.database.db
      .select({
        id: items.id,
        catalogId: items.catalogId,
        categoryId: items.categoryId,
        name: items.name,
        slug: items.slug,
        shortDescription: items.shortDescription,
        priceMinor: items.priceMinor,
        promotionalPriceMinor: items.promotionalPriceMinor,
        currency: items.currency,
        imageUrl: items.primaryImageUrl,
        tags: items.tags,
        badges: items.badges,
        status: items.status,
        availability: items.availability,
        featured: items.featured,
        popular: items.popular,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .where(
        catalogId
          ? and(
              eq(items.businessId, businessId),
              eq(items.catalogId, catalogId),
            )
          : eq(items.businessId, businessId),
      )
      .orderBy(items.sortOrder, items.name);
  }

  async createItem(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(createItemSchema, body);
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${businessId}:max.items`}))`,
      );
      const [usage] = await transaction
        .select({ value: count() })
        .from(items)
        .where(eq(items.businessId, businessId));
      await this.entitlements.assertWithinLimit(
        businessId,
        "max.items",
        usage?.value ?? 0,
      );
      const [category] = await transaction
        .select({ id: categories.id })
        .from(categories)
        .innerJoin(catalogs, eq(catalogs.id, categories.catalogId))
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.catalogId, input.catalogId),
            eq(categories.businessId, businessId),
            eq(catalogs.businessId, businessId),
          ),
        )
        .limit(1);
      if (!category)
        throw new NotFoundException("Category or catalog not found");
      const [item] = await transaction
        .insert(items)
        .values({
          businessId,
          catalogId: input.catalogId,
          categoryId: input.categoryId,
          name: input.name,
          slug: input.slug,
          shortDescription: input.shortDescription,
          description: input.description,
          sku: input.sku,
          primaryImageUrl: input.primaryImageUrl,
          priceMinor: input.priceMinor,
          promotionalPriceMinor: input.promotionalPriceMinor,
          currency: input.currency,
          durationMinutes: input.durationMinutes,
          tags: input.tags,
          badges: input.badges,
          featured: input.featured,
          popular: input.popular,
          sortOrder: input.sortOrder,
        })
        .returning();
      if (!item) throw new Error("Could not create item");
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "item.created",
        entityType: "item",
        entityId: item.id,
        requestId,
        metadata: { priceMinor: item.priceMinor, currency: item.currency },
      });
      return item;
    });
  }

  async createVariant(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(createVariantSchema, body);
    return this.database.db.transaction(async (transaction) => {
      const [item] = await transaction
        .select({ id: items.id })
        .from(items)
        .where(
          and(eq(items.id, input.itemId), eq(items.businessId, businessId)),
        )
        .limit(1);
      if (!item) throw new NotFoundException("Item not found");
      const [variant] = await transaction
        .insert(variants)
        .values({
          businessId,
          itemId: input.itemId,
          label: input.label,
          sku: input.sku,
          priceMinor: input.priceMinor,
          promotionalPriceMinor: input.promotionalPriceMinor,
          sortOrder: input.sortOrder,
        })
        .returning();
      if (!variant) throw new Error("Could not create variant");
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "variant.created",
        entityType: "variant",
        entityId: variant.id,
        requestId,
      });
      return variant;
    });
  }

  async updateAvailability(
    businessId: string,
    itemId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(availabilityUpdateSchema, body);
    return this.database.db.transaction(async (transaction) => {
      const [item] = await transaction
        .update(items)
        .set({ availability: input.availability, updatedAt: new Date() })
        .where(and(eq(items.id, itemId), eq(items.businessId, businessId)))
        .returning();
      if (!item) throw new NotFoundException("Item not found");
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "item.availability_updated",
        entityType: "item",
        entityId: item.id,
        requestId,
        metadata: { availability: input.availability },
      });
      return item;
    });
  }

  async publish(
    businessId: string,
    catalogId: string,
    userId: string,
    requestId: string,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: catalogs.id })
        .from(catalogs)
        .where(
          and(eq(catalogs.id, catalogId), eq(catalogs.businessId, businessId)),
        )
        .limit(1);
      if (!existing) throw new NotFoundException("Catalog not found");
      const [eligible] = await transaction
        .select({ value: count() })
        .from(items)
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
            eq(items.catalogId, catalogId),
            eq(items.businessId, businessId),
            eq(categories.visible, true),
          ),
        );
      if ((eligible?.value ?? 0) === 0)
        throw new UnprocessableEntityException(
          "Add at least one item in a visible category before publishing",
        );
      const [catalog] = await transaction
        .update(catalogs)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedRevision: sql`${catalogs.publishedRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(catalogs.id, catalogId), eq(catalogs.businessId, businessId)),
        )
        .returning();
      if (!catalog) throw new NotFoundException("Catalog not found");
      await transaction
        .update(businesses)
        .set({ public: true, updatedAt: new Date() })
        .where(eq(businesses.id, businessId));
      await transaction
        .update(items)
        .set({ status: "published", updatedAt: new Date() })
        .where(
          and(eq(items.catalogId, catalogId), eq(items.businessId, businessId)),
        );
      await transaction.insert(auditEvents).values({
        businessId,
        actorUserId: userId,
        action: "catalog.published",
        entityType: "catalog",
        entityId: catalog.id,
        requestId,
        metadata: { revision: catalog.publishedRevision },
      });
      return catalog;
    });
  }
}

@Controller("api/v1/businesses/:businessId")
export class CatalogController {
  constructor(private readonly catalogs: CatalogService) {}

  @RequirePermission("catalog.read")
  @Get("catalogs")
  async list(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.list(context.businessId!),
      requestId: String(request.id),
    };
  }

  @RequirePermission("catalog.create")
  @Post("catalogs")
  async create(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.create(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("catalog.publish")
  @Post("catalogs/:catalogId/publish")
  async publish(
    @Param("catalogId", new ParseUUIDPipe()) catalogId: string,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.publish(
        context.businessId!,
        catalogId,
        context.userId,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("catalog.read")
  @Get("categories")
  async categories(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    const { catalogId } = parseBody(catalogFilterSchema, request.query);
    return {
      data: await this.catalogs.categories(context.businessId!, catalogId),
      requestId: String(request.id),
    };
  }

  @RequirePermission("category.manage")
  @Post("categories")
  async createCategory(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.createCategory(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("item.read")
  @Get("items")
  async items(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    const { catalogId } = parseBody(catalogFilterSchema, request.query);
    return {
      data: await this.catalogs.items(context.businessId!, catalogId),
      requestId: String(request.id),
    };
  }

  @RequirePermission("item.create")
  @Post("items")
  async createItem(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.createItem(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("item.create")
  @Post("variants")
  async createVariant(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.createVariant(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("item.update")
  @Patch("items/:itemId/availability")
  async availability(
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.catalogs.updateAvailability(
        context.businessId!,
        itemId,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }
}

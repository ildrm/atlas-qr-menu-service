import { Controller, Get, Injectable, Param, Query, Req } from "@nestjs/common";
import {
  branchItemOverrides,
  branches,
  businesses,
  catalogs,
  categories,
  categoryTranslations,
  items,
  itemTranslations,
  themes,
  variants,
} from "@atlas/database";
import type { PublicCatalog } from "@atlas/contracts";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { Public, type AuthenticatedRequest } from "./common.js";
import { DatabaseService } from "./database.service.js";

interface PublicCatalogQuery {
  locale?: string;
  branch?: string;
  category?: string;
  search?: string;
}

@Injectable()
export class PublicCatalogService {
  constructor(private readonly database: DatabaseService) {}

  async get(
    businessSlug: string,
    catalogSlug: string,
    query: PublicCatalogQuery,
  ): Promise<PublicCatalog | null> {
    const [base] = await this.database.db
      .select({
        businessId: businesses.id,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        businessDescription: businesses.shortDescription,
        businessPhone: businesses.phone,
        businessAddress: businesses.address,
        defaultLocale: businesses.defaultLocale,
        supportedLocales: businesses.supportedLocales,
        timezone: businesses.timezone,
        catalogId: catalogs.id,
        catalogName: catalogs.name,
        catalogSlug: catalogs.slug,
        catalogDescription: catalogs.description,
        currency: catalogs.currency,
        publishedRevision: catalogs.publishedRevision,
      })
      .from(businesses)
      .innerJoin(catalogs, eq(catalogs.businessId, businesses.id))
      .where(
        and(
          eq(businesses.slug, businessSlug),
          eq(catalogs.slug, catalogSlug),
          eq(businesses.public, true),
          eq(catalogs.status, "published"),
        ),
      )
      .limit(1);
    if (!base) return null;

    const locale = base.supportedLocales.includes(query.locale ?? "")
      ? query.locale!
      : base.defaultLocale;
    const [branch] = query.branch
      ? await this.database.db
          .select({
            id: branches.id,
            name: branches.name,
            slug: branches.slug,
            address: branches.address,
            openingHours: branches.openingHours,
          })
          .from(branches)
          .where(
            and(
              eq(branches.businessId, base.businessId),
              eq(branches.slug, query.branch),
              eq(branches.visible, true),
            ),
          )
          .limit(1)
      : [null];

    const categoryRows = await this.database.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: sql<string>`coalesce(${categoryTranslations.name}, ${categories.name})`,
        description: sql<
          string | null
        >`coalesce(${categoryTranslations.description}, ${categories.description})`,
      })
      .from(categories)
      .leftJoin(
        categoryTranslations,
        and(
          eq(categoryTranslations.categoryId, categories.id),
          eq(categoryTranslations.locale, locale),
        ),
      )
      .where(
        and(
          eq(categories.businessId, base.businessId),
          eq(categories.catalogId, base.catalogId),
          eq(categories.visible, true),
        ),
      )
      .orderBy(categories.sortOrder, categories.name);

    const selectedCategory = query.category
      ? categoryRows.find((category) => category.slug === query.category)
      : null;
    const itemConditions = [
      eq(items.businessId, base.businessId),
      eq(items.catalogId, base.catalogId),
      eq(items.status, "published"),
      sql`${items.availability} <> 'hidden'`,
    ];
    if (selectedCategory)
      itemConditions.push(eq(items.categoryId, selectedCategory.id));
    if (query.search?.trim()) {
      const search = `%${query.search.trim().slice(0, 100)}%`;
      itemConditions.push(
        or(
          ilike(items.name, search),
          ilike(items.shortDescription, search),
          sql`${items.tags}::text ilike ${search}`,
        )!,
      );
    }

    const itemRows = await this.database.db
      .select({
        id: items.id,
        categoryId: items.categoryId,
        slug: items.slug,
        name: sql<string>`coalesce(${itemTranslations.name}, ${items.name})`,
        shortDescription: sql<
          string | null
        >`coalesce(${itemTranslations.shortDescription}, ${items.shortDescription})`,
        priceMinor: sql<number>`coalesce(${branchItemOverrides.priceMinor}, ${items.priceMinor})`,
        promotionalPriceMinor: sql<
          number | null
        >`coalesce(${branchItemOverrides.promotionalPriceMinor}, ${items.promotionalPriceMinor})`,
        currency: items.currency,
        imageUrl: items.primaryImageUrl,
        badges: items.badges,
        availability: sql<string>`coalesce(${branchItemOverrides.availability}, ${items.availability})`,
        visibleOverride: branchItemOverrides.visible,
        featured: items.featured,
        popular: items.popular,
      })
      .from(items)
      .leftJoin(
        itemTranslations,
        and(
          eq(itemTranslations.itemId, items.id),
          eq(itemTranslations.locale, locale),
        ),
      )
      .leftJoin(
        branchItemOverrides,
        branch
          ? and(
              eq(branchItemOverrides.itemId, items.id),
              eq(branchItemOverrides.branchId, branch.id),
            )
          : sql`false`,
      )
      .where(and(...itemConditions))
      .orderBy(items.sortOrder, items.name);

    const visibleItems = itemRows.filter(
      (item) =>
        item.visibleOverride !== false && item.availability !== "hidden",
    );
    const itemIds = visibleItems.map((item) => item.id);
    const variantRows = itemIds.length
      ? await this.database.db
          .select({
            id: variants.id,
            itemId: variants.itemId,
            label: variants.label,
            priceMinor: variants.priceMinor,
          })
          .from(variants)
          .where(
            and(
              eq(variants.businessId, base.businessId),
              inArray(variants.itemId, itemIds),
              eq(variants.available, true),
            ),
          )
          .orderBy(variants.sortOrder, variants.label)
      : [];
    const [theme] = await this.database.db
      .select({ tokens: themes.tokens })
      .from(themes)
      .where(
        and(eq(themes.businessId, base.businessId), eq(themes.active, true)),
      )
      .limit(1);

    return {
      business: {
        id: base.businessId,
        name: base.businessName,
        slug: base.businessSlug,
        description: base.businessDescription,
        phone: base.businessPhone,
        address: base.businessAddress,
        defaultLocale: base.defaultLocale,
        supportedLocales: base.supportedLocales,
        timezone: base.timezone,
        theme: theme?.tokens ?? {},
      },
      branch: branch ?? null,
      catalog: {
        id: base.catalogId,
        name: base.catalogName,
        slug: base.catalogSlug,
        description: base.catalogDescription,
        currency: base.currency,
        publishedRevision: base.publishedRevision,
      },
      categories: categoryRows,
      items: visibleItems.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        shortDescription: item.shortDescription,
        priceMinor: Number(item.priceMinor),
        promotionalPriceMinor:
          item.promotionalPriceMinor === null
            ? null
            : Number(item.promotionalPriceMinor),
        currency: item.currency,
        imageUrl: item.imageUrl,
        badges: item.badges,
        available: item.availability === "available",
        featured: item.featured,
        popular: item.popular,
        categoryId: item.categoryId,
        variants: variantRows
          .filter((variant) => variant.itemId === item.id)
          .map(({ id, label, priceMinor }) => ({ id, label, priceMinor })),
      })),
    };
  }
}

@Controller("api/v1/public")
export class PublicCatalogController {
  constructor(private readonly publicCatalog: PublicCatalogService) {}

  @Public()
  @Get("businesses/:businessSlug/catalogs/:catalogSlug")
  async get(
    @Param("businessSlug") businessSlug: string,
    @Param("catalogSlug") catalogSlug: string,
    @Query() query: PublicCatalogQuery,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.publicCatalog.get(businessSlug, catalogSlug, query),
      requestId: String(request.id),
    };
  }
}

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
]);
export const catalogStatus = pgEnum("catalog_status", [
  "draft",
  "pending_review",
  "scheduled",
  "published",
  "archived",
]);
export const publicationStatus = pgEnum("publication_status", [
  "draft",
  "published",
  "archived",
]);
export const availabilityStatus = pgEnum("availability_status", [
  "available",
  "unavailable",
  "temporarily_unavailable",
  "sold_out",
  "hidden",
]);
export const qrTargetType = pgEnum("qr_target_type", [
  "business",
  "branch",
  "catalog",
  "category",
  "item",
  "promotion",
  "table",
  "room",
  "campaign",
  "custom_url",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "grace",
  "canceled",
  "expired",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "processing",
  "delivered",
  "failed",
  "dead_letter",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash"),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    locale: varchar("locale", { length: 35 }).default("en").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${table.email})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: inet("ip_address"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_active_idx").on(table.userId, table.expiresAt),
  ],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 30 }).default("business").notNull(),
  ...timestamps,
});

export const businessTypes = pgTable("business_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  terminology: jsonb("terminology")
    .$type<{ catalog: string; category: string; item: string }>()
    .notNull(),
  attributeTemplate: jsonb("attribute_template")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    businessTypeId: uuid("business_type_id").references(
      () => businessTypes.id,
      { onDelete: "set null" },
    ),
    name: varchar("name", { length: 160 }).notNull(),
    legalName: varchar("legal_name", { length: 200 }),
    slug: varchar("slug", { length: 120 }).notNull(),
    shortDescription: varchar("short_description", { length: 280 }),
    description: text("description"),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    city: varchar("city", { length: 120 }),
    address: text("address"),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    website: text("website"),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    defaultLocale: varchar("default_locale", { length: 35 }).notNull(),
    supportedLocales: jsonb("supported_locales")
      .$type<string[]>()
      .default(["en"])
      .notNull(),
    socialLinks: jsonb("social_links")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    seo: jsonb("seo").$type<Record<string, unknown>>().default({}).notNull(),
    public: boolean("public").default(false).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("businesses_slug_idx").on(table.slug),
    index("businesses_organization_idx").on(table.organizationId),
  ],
);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "cascade",
  }),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  system: boolean("system").default(false).notNull(),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    status: membershipStatus("status").default("active").notNull(),
    branchScope: jsonb("branch_scope").$type<string[] | null>().default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("memberships_user_business_idx").on(
      table.userId,
      table.businessId,
    ),
    index("memberships_business_idx").on(table.businessId),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 40 }),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    currencyOverride: varchar("currency_override", { length: 3 }),
    latitudeE6: integer("latitude_e6"),
    longitudeE6: integer("longitude_e6"),
    openingHours: jsonb("opening_hours")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    visible: boolean("visible").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branches_business_slug_idx").on(table.businessId, table.slug),
    index("branches_business_idx").on(table.businessId),
  ],
);

export const catalogs = pgTable(
  "catalogs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: text("description"),
    status: catalogStatus("status").default("draft").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    schedule: jsonb("schedule")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    seo: jsonb("seo").$type<Record<string, unknown>>().default({}).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedRevision: integer("published_revision").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("catalogs_business_slug_idx").on(table.businessId, table.slug),
    index("catalogs_business_status_idx").on(table.businessId, table.status),
  ],
);

export const catalogBranches = pgTable(
  "catalog_branches",
  {
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => catalogs.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.catalogId, table.branchId] })],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => catalogs.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").default(0).notNull(),
    visible: boolean("visible").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_catalog_slug_idx").on(table.catalogId, table.slug),
    index("categories_business_catalog_idx").on(
      table.businessId,
      table.catalogId,
    ),
  ],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => catalogs.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    shortDescription: varchar("short_description", { length: 320 }),
    description: text("description"),
    sku: varchar("sku", { length: 120 }),
    primaryImageUrl: text("primary_image_url"),
    videoUrl: text("video_url"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    promotionalPriceMinor: bigint("promotional_price_minor", {
      mode: "number",
    }),
    currency: varchar("currency", { length: 3 }).notNull(),
    durationMinutes: integer("duration_minutes"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    badges: jsonb("badges").$type<string[]>().default([]).notNull(),
    status: publicationStatus("status").default("draft").notNull(),
    availability: availabilityStatus("availability")
      .default("available")
      .notNull(),
    featured: boolean("featured").default(false).notNull(),
    popular: boolean("popular").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    seo: jsonb("seo").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("items_catalog_slug_idx").on(table.catalogId, table.slug),
    index("items_business_catalog_category_idx").on(
      table.businessId,
      table.catalogId,
      table.categoryId,
    ),
    check("items_price_nonnegative", sql`${table.priceMinor} >= 0`),
    check(
      "items_promo_price_nonnegative",
      sql`${table.promotionalPriceMinor} is null or ${table.promotionalPriceMinor} >= 0`,
    ),
  ],
);

export const itemTranslations = pgTable(
  "item_translations",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 35 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    shortDescription: varchar("short_description", { length: 320 }),
    description: text("description"),
    seo: jsonb("seo").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.locale] })],
);

export const categoryTranslations = pgTable(
  "category_translations",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 35 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.locale] })],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    sku: varchar("sku", { length: 120 }),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    promotionalPriceMinor: bigint("promotional_price_minor", {
      mode: "number",
    }),
    available: boolean("available").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("variants_business_item_idx").on(table.businessId, table.itemId),
    check("variants_price_nonnegative", sql`${table.priceMinor} >= 0`),
  ],
);

export const optionGroups = pgTable("option_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  selectionMode: varchar("selection_mode", { length: 16 }).notNull(),
  required: boolean("required").default(false).notNull(),
  minSelections: integer("min_selections").default(0).notNull(),
  maxSelections: integer("max_selections"),
  freeSelections: integer("free_selections").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps,
});

export const options = pgTable("options", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  optionGroupId: uuid("option_group_id")
    .notNull()
    .references(() => optionGroups.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  priceAdjustmentMinor: bigint("price_adjustment_minor", { mode: "number" })
    .default(0)
    .notNull(),
  available: boolean("available").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps,
});

export const attributeDefinitions = pgTable("attribute_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  scopeType: varchar("scope_type", { length: 30 }).notNull(),
  scopeId: uuid("scope_id"),
  key: varchar("key", { length: 80 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  dataType: varchar("data_type", { length: 30 }).notNull(),
  validation: jsonb("validation")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  required: boolean("required").default(false).notNull(),
  public: boolean("public").default(true).notNull(),
  searchable: boolean("searchable").default(false).notNull(),
  filterable: boolean("filterable").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps,
});

export const attributeValues = pgTable(
  "attribute_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 30 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("attribute_values_entity_idx").on(
      table.definitionId,
      table.entityType,
      table.entityId,
    ),
    index("attribute_values_business_idx").on(table.businessId),
  ],
);

export const branchItemOverrides = pgTable(
  "branch_item_overrides",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    priceMinor: bigint("price_minor", { mode: "number" }),
    promotionalPriceMinor: bigint("promotional_price_minor", {
      mode: "number",
    }),
    availability: availabilityStatus("availability"),
    visible: boolean("visible"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.itemId] }),
    index("branch_item_overrides_tenant_idx").on(
      table.businessId,
      table.branchId,
    ),
  ],
);

export const availabilityRules = pgTable("availability_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  branchId: uuid("branch_id").references(() => branches.id, {
    onDelete: "cascade",
  }),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().default([]).notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  startTime: time("start_time"),
  endTime: time("end_time"),
  status: availabilityStatus("status").notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  priority: integer("priority").default(0).notNull(),
  ...timestamps,
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: varchar("alt_text", { length: 240 }),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  variants: jsonb("variants")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const themes = pgTable("themes", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  template: varchar("template", { length: 60 }).default("editorial").notNull(),
  version: integer("version").default(1).notNull(),
  tokens: jsonb("tokens").$type<Record<string, string | number>>().notNull(),
  active: boolean("active").default(false).notNull(),
  ...timestamps,
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 140 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 140 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    publicToken: varchar("public_token", { length: 43 }).notNull(),
    targetType: qrTargetType("target_type").notNull(),
    targetId: uuid("target_id"),
    targetUrl: text("target_url"),
    context: jsonb("context")
      .$type<{ table?: string; room?: string; locale?: string }>()
      .default({})
      .notNull(),
    style: jsonb("style")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    active: boolean("active").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("qr_codes_public_token_idx").on(table.publicToken),
    uniqueIndex("qr_codes_token_hash_idx").on(table.tokenHash),
    index("qr_codes_business_idx").on(table.businessId),
  ],
);

export const qrScans = pgTable(
  "qr_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    qrCodeId: uuid("qr_code_id")
      .notNull()
      .references(() => qrCodes.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    visitorHash: varchar("visitor_hash", { length: 64 }),
    countryCode: varchar("country_code", { length: 2 }),
    city: varchar("city", { length: 120 }),
    deviceClass: varchar("device_class", { length: 30 }),
    browserFamily: varchar("browser_family", { length: 60 }),
    osFamily: varchar("os_family", { length: 60 }),
    locale: varchar("locale", { length: 35 }),
  },
  (table) => [
    index("qr_scans_business_time_idx").on(table.businessId, table.occurredAt),
    index("qr_scans_qr_time_idx").on(table.qrCodeId, table.occurredAt),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    eventName: varchar("event_name", { length: 80 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    visitorHash: varchar("visitor_hash", { length: 64 }),
    catalogId: uuid("catalog_id").references(() => catalogs.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    itemId: uuid("item_id").references(() => items.id, {
      onDelete: "set null",
    }),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id, {
      onDelete: "set null",
    }),
    properties: jsonb("properties")
      .$type<Record<string, string | number | boolean | null>>()
      .default({})
      .notNull(),
  },
  (table) => [
    index("analytics_business_event_time_idx").on(
      table.businessId,
      table.eventName,
      table.occurredAt,
    ),
  ],
);

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  active: boolean("active").default(true).notNull(),
  monthlyPriceMinor: bigint("monthly_price_minor", { mode: "number" })
    .default(0)
    .notNull(),
  annualPriceMinor: bigint("annual_price_minor", { mode: "number" })
    .default(0)
    .notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  ...timestamps,
});

export const planEntitlements = pgTable(
  "plan_entitlements",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 100 }).notNull(),
    value: jsonb("value").$type<boolean | number | string>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.planId, table.key] })],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" })
    .unique(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "restrict" }),
  status: subscriptionStatus("status").default("active").notNull(),
  provider: varchar("provider", { length: 40 }),
  providerCustomerRef: text("provider_customer_ref"),
  providerSubscriptionRef: text("provider_subscription_ref"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  ...timestamps,
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    branchScope: jsonb("branch_scope").$type<string[] | null>().default(null),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_idx").on(table.tokenHash),
    index("invitations_business_email_idx").on(table.businessId, table.email),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: uuid("entity_id"),
    requestId: varchar("request_id", { length: 100 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_business_time_idx").on(table.businessId, table.occurredAt),
    index("audit_actor_time_idx").on(table.actorUserId, table.occurredAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 60 }).notNull(),
    aggregateId: uuid("aggregate_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: deliveryStatus("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("outbox_pending_idx").on(table.status, table.availableAt)],
);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  prefix: varchar("prefix", { length: 16 }).notNull(),
  secretHash: varchar("secret_hash", { length: 64 }).notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  endpointUrl: text("endpoint_url").notNull(),
  secretHash: varchar("secret_hash", { length: 64 }).notNull(),
  events: jsonb("events").$type<string[]>().notNull(),
  active: boolean("active").default(true).notNull(),
  failureCount: integer("failure_count").default(0).notNull(),
  ...timestamps,
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "cascade",
  }),
  category: varchar("category", { length: 60 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  actionUrl: text("action_url"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const domains = pgTable("domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  hostname: varchar("hostname", { length: 253 }).notNull().unique(),
  verificationTokenHash: varchar("verification_token_hash", {
    length: 64,
  }).notNull(),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
});

export const featureFlags = pgTable("feature_flags", {
  key: varchar("key", { length: 100 }).primaryKey(),
  description: text("description").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  rules: jsonb("rules").$type<Record<string, unknown>>().default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

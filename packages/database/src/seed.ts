import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { allPermissions } from "@atlas/contracts";
import * as argon2 from "argon2";
import { eq } from "drizzle-orm";
import { config as loadEnvironment } from "dotenv";

import { createDatabase } from "./index.js";
import {
  analyticsEvents,
  auditEvents,
  attributeDefinitions,
  attributeValues,
  branches,
  businesses,
  businessTypes,
  campaigns,
  catalogBranches,
  catalogs,
  categories,
  categoryTranslations,
  items,
  itemTranslations,
  memberships,
  organizations,
  planEntitlements,
  plans,
  qrCodes,
  qrScans,
  roles,
  subscriptions,
  themes,
  users,
  variants,
} from "./schema.js";

loadEnvironment({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.NODE_ENV === "production")
  throw new Error(
    "Refusing to load demo fixtures when NODE_ENV=production. Use an explicit production data migration instead.",
  );

const { db, pool } = createDatabase(databaseUrl);

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  cafeOrganization: "00000000-0000-4000-8000-000000000100",
  cafeBusiness: "00000000-0000-4000-8000-000000000200",
  cafeBranch: "00000000-0000-4000-8000-000000000300",
  cafeCatalog: "00000000-0000-4000-8000-000000000400",
  coffee: "00000000-0000-4000-8000-000000000501",
  drinks: "00000000-0000-4000-8000-000000000502",
  food: "00000000-0000-4000-8000-000000000503",
  espresso: "00000000-0000-4000-8000-000000000601",
  pistachio: "00000000-0000-4000-8000-000000000602",
  citrus: "00000000-0000-4000-8000-000000000603",
  coldBrew: "00000000-0000-4000-8000-000000000604",
  croissant: "00000000-0000-4000-8000-000000000605",
  cafeQr: "00000000-0000-4000-8000-000000000700",
  cafeCampaign: "00000000-0000-4000-8000-000000000710",
  freePlan: "00000000-0000-4000-8000-000000000800",
  proPlan: "00000000-0000-4000-8000-000000000801",
  cafeOwnerRole: "00000000-0000-4000-8000-000000000900",
  cafeMembership: "00000000-0000-4000-8000-000000000910",
  salonOrganization: "10000000-0000-4000-8000-000000000100",
  salonBusiness: "10000000-0000-4000-8000-000000000200",
  salonBranch: "10000000-0000-4000-8000-000000000300",
  salonCatalog: "10000000-0000-4000-8000-000000000400",
  salonCategory: "10000000-0000-4000-8000-000000000500",
  haircut: "10000000-0000-4000-8000-000000000600",
  durationDefinition: "10000000-0000-4000-8000-000000000610",
  salonOwnerRole: "10000000-0000-4000-8000-000000000900",
  salonMembership: "10000000-0000-4000-8000-000000000910",
};

const businessTypeRows = [
  {
    code: "cafe",
    name: "Café or restaurant",
    terminology: { catalog: "Menu", category: "Category", item: "Dish" },
  },
  {
    code: "beauty",
    name: "Beauty or wellness",
    terminology: {
      catalog: "Services",
      category: "Service category",
      item: "Service",
    },
  },
  {
    code: "retail",
    name: "Retail or showroom",
    terminology: {
      catalog: "Catalog",
      category: "Collection",
      item: "Product",
    },
  },
  {
    code: "services",
    name: "Professional services",
    terminology: { catalog: "Services", category: "Category", item: "Service" },
  },
  {
    code: "hotel",
    name: "Hotel or accommodation",
    terminology: {
      catalog: "Guest catalog",
      category: "Section",
      item: "Offering",
    },
  },
];

for (const businessType of businessTypeRows) {
  await db
    .insert(businessTypes)
    .values(businessType)
    .onConflictDoUpdate({
      target: businessTypes.code,
      set: {
        name: businessType.name,
        terminology: businessType.terminology,
        active: true,
      },
    });
}

await db
  .insert(plans)
  .values([
    {
      id: ids.freePlan,
      code: "free",
      name: "Free",
      monthlyPriceMinor: 0,
      annualPriceMinor: 0,
      currency: "USD",
    },
    {
      id: ids.proPlan,
      code: "professional",
      name: "Professional",
      monthlyPriceMinor: 1900,
      annualPriceMinor: 19000,
      currency: "USD",
    },
  ])
  .onConflictDoNothing();

const freeEntitlements: Array<{ key: string; value: number | boolean }> = [
  { key: "max.businesses", value: 2 },
  { key: "max.branches", value: 2 },
  { key: "max.catalogs", value: 3 },
  { key: "max.items", value: 50 },
  { key: "max.qr_codes", value: 5 },
  { key: "max.team_members", value: 2 },
  { key: "max.languages", value: 2 },
  { key: "feature.analytics", value: true },
  { key: "feature.custom_domain", value: false },
  { key: "feature.ai", value: false },
];
const professionalEntitlements: Array<{
  key: string;
  value: string | boolean;
}> = [
  { key: "max.businesses", value: "unlimited" },
  { key: "max.branches", value: "unlimited" },
  { key: "max.catalogs", value: "unlimited" },
  { key: "max.items", value: "unlimited" },
  { key: "max.qr_codes", value: "unlimited" },
  { key: "max.team_members", value: "unlimited" },
  { key: "max.languages", value: "unlimited" },
  { key: "feature.analytics", value: true },
  { key: "feature.custom_domain", value: true },
  { key: "feature.ai", value: false },
];
for (const [planId, entitlements] of [
  [ids.freePlan, freeEntitlements],
  [ids.proPlan, professionalEntitlements],
] as const) {
  for (const entitlement of entitlements) {
    await db
      .insert(planEntitlements)
      .values({ planId, ...entitlement })
      .onConflictDoUpdate({
        target: [planEntitlements.planId, planEntitlements.key],
        set: { value: entitlement.value },
      });
  }
}

const [existingCafe] = await db
  .select({ id: businesses.id })
  .from(businesses)
  .where(eq(businesses.id, ids.cafeBusiness))
  .limit(1);
if (!existingCafe) {
  const [cafeType] = await db
    .select({ id: businessTypes.id })
    .from(businessTypes)
    .where(eq(businessTypes.code, "cafe"))
    .limit(1);
  if (!cafeType) throw new Error("Café business type missing");
  const passwordHash = await argon2.hash("AtlasDemo!2026", {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values({
        id: ids.user,
        email: "mina@atlasqr.local",
        passwordHash,
        displayName: "Mina Rahimi",
        locale: "en",
        emailVerifiedAt: new Date(),
      })
      .onConflictDoNothing();
    await transaction
      .insert(organizations)
      .values({ id: ids.cafeOrganization, name: "Brew & Bloom" });
    await transaction.insert(businesses).values({
      id: ids.cafeBusiness,
      organizationId: ids.cafeOrganization,
      businessTypeId: cafeType.id,
      name: "Brew & Bloom",
      slug: "brew-bloom",
      shortDescription:
        "Thoughtful coffee, bright flavors, and pastry baked fresh each morning.",
      countryCode: "US",
      city: "Portland",
      address: "128 Bloom Street, Portland",
      phone: "+15035550128",
      email: "hello@brew-bloom.local",
      timezone: "America/Los_Angeles",
      currency: "USD",
      defaultLocale: "en",
      supportedLocales: ["en", "fa", "ar"],
      public: true,
    });
    await transaction.insert(roles).values({
      id: ids.cafeOwnerRole,
      businessId: ids.cafeBusiness,
      code: "owner",
      name: "Owner",
      permissions: [...allPermissions],
      system: true,
    });
    await transaction.insert(memberships).values({
      id: ids.cafeMembership,
      userId: ids.user,
      businessId: ids.cafeBusiness,
      roleId: ids.cafeOwnerRole,
      status: "active",
    });
    await transaction.insert(branches).values({
      id: ids.cafeBranch,
      businessId: ids.cafeBusiness,
      name: "Downtown",
      slug: "downtown",
      address: "128 Bloom Street, Portland",
      phone: "+15035550128",
      timezone: "America/Los_Angeles",
      openingHours: {
        mon: ["07:00", "20:00"],
        tue: ["07:00", "20:00"],
        wed: ["07:00", "20:00"],
        thu: ["07:00", "20:00"],
        fri: ["07:00", "21:00"],
        sat: ["08:00", "21:00"],
        sun: ["08:00", "19:00"],
      },
    });
    await transaction.insert(catalogs).values({
      id: ids.cafeCatalog,
      businessId: ids.cafeBusiness,
      name: "All day menu",
      slug: "all-day-menu",
      description: "Coffee, bright seasonal drinks, and pastry baked daily.",
      status: "published",
      currency: "USD",
      publishedAt: new Date(),
      publishedRevision: 1,
    });
    await transaction
      .insert(catalogBranches)
      .values({ catalogId: ids.cafeCatalog, branchId: ids.cafeBranch });
    await transaction.insert(categories).values([
      {
        id: ids.coffee,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        name: "Coffee",
        slug: "coffee",
        sortOrder: 0,
      },
      {
        id: ids.drinks,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        name: "Drinks",
        slug: "drinks",
        sortOrder: 1,
      },
      {
        id: ids.food,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        name: "Food",
        slug: "food",
        sortOrder: 2,
      },
    ]);
    await transaction.insert(categoryTranslations).values([
      { categoryId: ids.coffee, locale: "fa", name: "قهوه" },
      { categoryId: ids.drinks, locale: "fa", name: "نوشیدنی‌ها" },
      { categoryId: ids.food, locale: "fa", name: "خوراکی" },
      { categoryId: ids.coffee, locale: "ar", name: "قهوة" },
      { categoryId: ids.drinks, locale: "ar", name: "مشروبات" },
      { categoryId: ids.food, locale: "ar", name: "طعام" },
    ]);
    await transaction.insert(items).values([
      {
        id: ids.espresso,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        categoryId: ids.coffee,
        name: "Espresso",
        slug: "espresso",
        shortDescription: "Bold and smooth single shot of our house blend.",
        primaryImageUrl: "/images/brew-bloom-cover.png",
        priceMinor: 250,
        currency: "USD",
        status: "published",
        featured: true,
        sortOrder: 0,
      },
      {
        id: ids.pistachio,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        categoryId: ids.coffee,
        name: "Pistachio latte",
        slug: "pistachio-latte",
        shortDescription:
          "Creamy latte with real pistachio and a hint of honey.",
        primaryImageUrl: "/images/brew-bloom-cover.png",
        priceMinor: 525,
        currency: "USD",
        status: "published",
        popular: true,
        badges: ["popular"],
        sortOrder: 1,
      },
      {
        id: ids.citrus,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        categoryId: ids.drinks,
        name: "Citrus tonic",
        slug: "citrus-tonic",
        shortDescription:
          "Sparkling tonic with citrus and a touch of rosemary.",
        primaryImageUrl: "/images/citrus-tonic.png",
        priceMinor: 475,
        currency: "USD",
        status: "published",
        badges: ["vegan"],
        sortOrder: 2,
      },
      {
        id: ids.coldBrew,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        categoryId: ids.drinks,
        name: "Cardamom cold brew",
        slug: "cardamom-cold-brew",
        shortDescription: "Smooth cold brew infused with cardamom and vanilla.",
        primaryImageUrl: "/images/cardamom-cold-brew.png",
        priceMinor: 495,
        currency: "USD",
        status: "published",
        sortOrder: 3,
      },
      {
        id: ids.croissant,
        businessId: ids.cafeBusiness,
        catalogId: ids.cafeCatalog,
        categoryId: ids.food,
        name: "Butter croissant",
        slug: "butter-croissant",
        shortDescription:
          "Buttery, flaky, golden perfection. Baked fresh daily.",
        primaryImageUrl: "/images/butter-croissant.png",
        priceMinor: 375,
        currency: "USD",
        status: "published",
        sortOrder: 4,
      },
    ]);
    await transaction.insert(itemTranslations).values([
      {
        itemId: ids.espresso,
        locale: "fa",
        name: "اسپرسو",
        shortDescription: "یک شات غلیظ و نرم از ترکیب ویژه ما.",
      },
      {
        itemId: ids.pistachio,
        locale: "fa",
        name: "لاته پسته",
        shortDescription: "لاته خامه‌ای با پسته واقعی و کمی عسل.",
      },
      {
        itemId: ids.citrus,
        locale: "fa",
        name: "تونیک مرکبات",
        shortDescription: "تونیک گازدار با مرکبات و رزماری.",
      },
      {
        itemId: ids.espresso,
        locale: "ar",
        name: "إسبريسو",
        shortDescription: "جرعة واحدة قوية وناعمة من مزيجنا الخاص.",
      },
    ]);
    await transaction.insert(variants).values([
      {
        businessId: ids.cafeBusiness,
        itemId: ids.espresso,
        label: "Small",
        priceMinor: 250,
        sortOrder: 0,
      },
      {
        businessId: ids.cafeBusiness,
        itemId: ids.espresso,
        label: "Medium",
        priceMinor: 325,
        sortOrder: 1,
      },
      {
        businessId: ids.cafeBusiness,
        itemId: ids.espresso,
        label: "Large",
        priceMinor: 375,
        sortOrder: 2,
      },
    ]);
    await transaction.insert(themes).values({
      businessId: ids.cafeBusiness,
      name: "Atlas Editorial",
      template: "editorial",
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
    await transaction.insert(campaigns).values({
      id: ids.cafeCampaign,
      businessId: ids.cafeBusiness,
      name: "Table tent",
      active: true,
    });
    const publicToken = "BrewBloomQR2026DemoToken";
    await transaction.insert(qrCodes).values({
      id: ids.cafeQr,
      businessId: ids.cafeBusiness,
      branchId: ids.cafeBranch,
      campaignId: ids.cafeCampaign,
      name: "Table 12",
      publicToken,
      tokenHash: createHash("sha256").update(publicToken).digest("hex"),
      targetType: "catalog",
      targetId: ids.cafeCatalog,
      context: { table: "12", locale: "en" },
      style: {
        foreground: "#14352B",
        background: "#FFFFFF",
        errorCorrection: "M",
      },
      createdBy: ids.user,
    });
    await transaction.insert(subscriptions).values({
      businessId: ids.cafeBusiness,
      planId: ids.freePlan,
      status: "active",
    });
  });

  const eventRows = [];
  const scanRows = [];
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const occurredAt = new Date(Date.now() - dayOffset * 86_400_000);
    const views = 18 + (6 - dayOffset) * 7;
    const scans = 8 + (6 - dayOffset) * 3;
    for (let index = 0; index < views; index += 1) {
      eventRows.push({
        businessId: ids.cafeBusiness,
        eventName: index % 3 === 0 ? "item_viewed" : "catalog_viewed",
        occurredAt,
        catalogId: ids.cafeCatalog,
        itemId:
          index % 3 === 0
            ? [ids.espresso, ids.pistachio, ids.citrus][index % 3]
            : null,
        visitorHash: createHash("sha256")
          .update(`visitor-${dayOffset}-${index}`)
          .digest("hex"),
      });
    }
    for (let index = 0; index < scans; index += 1)
      scanRows.push({
        businessId: ids.cafeBusiness,
        qrCodeId: ids.cafeQr,
        occurredAt,
        visitorHash: createHash("sha256")
          .update(`scan-${dayOffset}-${index}`)
          .digest("hex"),
        deviceClass: index % 4 === 0 ? "desktop" : "mobile",
        locale: "en",
      });
  }
  await db.insert(analyticsEvents).values(eventRows);
  await db.insert(qrScans).values(scanRows);
}

const [existingAudit] = await db
  .select({ id: auditEvents.id })
  .from(auditEvents)
  .where(eq(auditEvents.businessId, ids.cafeBusiness))
  .limit(1);
if (!existingAudit) {
  await db.insert(auditEvents).values([
    {
      businessId: ids.cafeBusiness,
      actorUserId: ids.user,
      action: "catalog.published",
      entityType: "catalog",
      entityId: ids.cafeCatalog,
      requestId: "seed-catalog-published",
      occurredAt: new Date(Date.now() - 2 * 3_600_000),
    },
    {
      businessId: ids.cafeBusiness,
      actorUserId: ids.user,
      action: "qr.updated",
      entityType: "qr_code",
      entityId: ids.cafeQr,
      requestId: "seed-qr-updated",
      occurredAt: new Date(Date.now() - 26 * 3_600_000),
    },
    {
      businessId: ids.cafeBusiness,
      actorUserId: ids.user,
      action: "item.updated",
      entityType: "item",
      entityId: ids.pistachio,
      requestId: "seed-item-updated",
      occurredAt: new Date(Date.now() - 30 * 3_600_000),
    },
  ]);
}

const [existingSalon] = await db
  .select({ id: businesses.id })
  .from(businesses)
  .where(eq(businesses.id, ids.salonBusiness))
  .limit(1);
if (!existingSalon) {
  const [beautyType] = await db
    .select({ id: businessTypes.id })
    .from(businessTypes)
    .where(eq(businessTypes.code, "beauty"))
    .limit(1);
  if (!beautyType) throw new Error("Beauty business type missing");
  await db.transaction(async (transaction) => {
    await transaction
      .insert(organizations)
      .values({ id: ids.salonOrganization, name: "Studio Nila" });
    await transaction.insert(businesses).values({
      id: ids.salonBusiness,
      organizationId: ids.salonOrganization,
      businessTypeId: beautyType.id,
      name: "Studio Nila",
      slug: "studio-nila",
      shortDescription: "Considered hair and beauty services.",
      countryCode: "US",
      city: "Portland",
      timezone: "America/Los_Angeles",
      currency: "USD",
      defaultLocale: "en",
      supportedLocales: ["en"],
      public: true,
    });
    await transaction.insert(roles).values({
      id: ids.salonOwnerRole,
      businessId: ids.salonBusiness,
      code: "owner",
      name: "Owner",
      permissions: [...allPermissions],
      system: true,
    });
    await transaction.insert(memberships).values({
      id: ids.salonMembership,
      userId: ids.user,
      businessId: ids.salonBusiness,
      roleId: ids.salonOwnerRole,
      status: "active",
    });
    await transaction.insert(branches).values({
      id: ids.salonBranch,
      businessId: ids.salonBusiness,
      name: "Pearl District",
      slug: "pearl-district",
      timezone: "America/Los_Angeles",
    });
    await transaction.insert(catalogs).values({
      id: ids.salonCatalog,
      businessId: ids.salonBusiness,
      name: "Services",
      slug: "services",
      status: "published",
      currency: "USD",
      publishedAt: new Date(),
      publishedRevision: 1,
    });
    await transaction.insert(categories).values({
      id: ids.salonCategory,
      businessId: ids.salonBusiness,
      catalogId: ids.salonCatalog,
      name: "Hair",
      slug: "hair",
    });
    await transaction.insert(items).values({
      id: ids.haircut,
      businessId: ids.salonBusiness,
      catalogId: ids.salonCatalog,
      categoryId: ids.salonCategory,
      name: "Haircut",
      slug: "haircut",
      shortDescription: "A tailored cut, finish, and home-care consultation.",
      priceMinor: 6500,
      currency: "USD",
      durationMinutes: 45,
      status: "published",
    });
    await transaction.insert(variants).values([
      {
        businessId: ids.salonBusiness,
        itemId: ids.haircut,
        label: "Standard",
        priceMinor: 6500,
        sortOrder: 0,
      },
      {
        businessId: ids.salonBusiness,
        itemId: ids.haircut,
        label: "Premium",
        priceMinor: 8500,
        sortOrder: 1,
      },
    ]);
    await transaction.insert(attributeDefinitions).values({
      id: ids.durationDefinition,
      businessId: ids.salonBusiness,
      scopeType: "business",
      key: "service_duration",
      label: "Service duration",
      dataType: "duration",
      required: true,
      public: true,
      searchable: false,
      filterable: true,
    });
    await transaction.insert(attributeValues).values({
      businessId: ids.salonBusiness,
      definitionId: ids.durationDefinition,
      entityType: "item",
      entityId: ids.haircut,
      value: { minutes: 45 },
    });
    await transaction.insert(themes).values({
      businessId: ids.salonBusiness,
      name: "Quiet Luxury",
      template: "luxury",
      active: true,
      tokens: {
        background: "#FFFFFF",
        text: "#1A1714",
        primary: "#46382F",
        accent: "#B7815D",
        radius: 8,
      },
    });
    await transaction.insert(subscriptions).values({
      businessId: ids.salonBusiness,
      planId: ids.freePlan,
      status: "active",
    });
  });
}

process.stdout.write(
  "Seed complete. Demo login: mina@atlasqr.local / AtlasDemo!2026\n",
);
await pool.end();

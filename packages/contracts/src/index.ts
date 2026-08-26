import { z } from "zod";

export const permissions = [
  "business.read",
  "business.update",
  "branch.read",
  "branch.create",
  "branch.update",
  "branch.delete",
  "catalog.read",
  "catalog.create",
  "catalog.update",
  "catalog.publish",
  "catalog.delete",
  "category.manage",
  "item.read",
  "item.create",
  "item.update",
  "item.delete",
  "item.publish",
  "qr.read",
  "qr.create",
  "qr.update",
  "qr.delete",
  "campaign.manage",
  "analytics.view",
  "team.read",
  "team.invite",
  "team.manage",
  "team.remove",
  "billing.view",
  "billing.manage",
  "domain.manage",
  "settings.manage",
] as const;

export type Permission = (typeof permissions)[number];

export const allPermissions: readonly Permission[] = permissions;
export const managerPermissions: readonly Permission[] = permissions.filter(
  (permission) =>
    !["billing.manage", "domain.manage", "team.remove"].includes(permission),
);
export const editorPermissions: readonly Permission[] = [
  "business.read",
  "branch.read",
  "catalog.read",
  "catalog.create",
  "catalog.update",
  "category.manage",
  "item.read",
  "item.create",
  "item.update",
  "qr.read",
];

export const localeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "Use a valid BCP 47 locale");
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use a valid ISO 4217 currency code");
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and hyphens",
  );

export const registerSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(120),
  locale: localeSchema.default("en"),
});

export const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().default(false),
});

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  businessTypeCode: z.string().trim().min(2).max(60),
  countryCode: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase()),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().max(320).optional(),
  website: z.url().max(2_000).optional(),
  timezone: z.string().trim().min(3).max(80),
  currency: currencySchema,
  defaultLocale: localeSchema,
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: slugSchema,
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().trim().min(3).max(80),
});

export const createCatalogSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  description: z.string().trim().max(2_000).optional(),
  currency: currencySchema,
  branchIds: z.array(z.uuid()).default([]),
});

export const createCategorySchema = z.object({
  catalogId: z.uuid(),
  parentId: z.uuid().optional(),
  name: z.string().trim().min(1).max(160),
  slug: slugSchema,
  description: z.string().trim().max(1_000).optional(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

export const createItemSchema = z.object({
  catalogId: z.uuid(),
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(180),
  slug: slugSchema,
  shortDescription: z.string().trim().max(320).optional(),
  description: z.string().trim().max(20_000).optional(),
  sku: z.string().trim().max(120).optional(),
  primaryImageUrl: z.string().trim().max(2_000).optional(),
  priceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  promotionalPriceMinor: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  currency: currencySchema,
  durationMinutes: z.number().int().positive().max(100_000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  badges: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  featured: z.boolean().default(false),
  popular: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

export const createVariantSchema = z.object({
  itemId: z.uuid(),
  label: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(120).optional(),
  priceMinor: z.number().int().min(0),
  promotionalPriceMinor: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const createQrSchema = z.object({
  name: z.string().trim().min(2).max(140),
  targetType: z.enum([
    "business",
    "branch",
    "catalog",
    "category",
    "item",
    "promotion",
    "table",
    "room",
    "campaign",
  ]),
  targetId: z.uuid(),
  branchId: z.uuid().optional(),
  campaignId: z.uuid().optional(),
  context: z
    .object({
      table: z.string().trim().max(80).optional(),
      room: z.string().trim().max(80).optional(),
      locale: localeSchema.optional(),
    })
    .default({}),
  style: z
    .object({
      foreground: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .default("#14352B"),
      background: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .default("#FFFFFF"),
      errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
    })
    .default({
      foreground: "#14352B",
      background: "#FFFFFF",
      errorCorrection: "M",
    }),
});

export const analyticsEventNames = [
  "business_viewed",
  "catalog_viewed",
  "category_viewed",
  "item_viewed",
  "search_performed",
  "filter_applied",
  "item_shared",
  "item_favorited",
  "language_changed",
  "branch_changed",
  "cta_clicked",
] as const;

export const ingestAnalyticsSchema = z.object({
  eventName: z.enum(analyticsEventNames),
  businessId: z.uuid(),
  catalogId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  itemId: z.uuid().optional(),
  qrCodeId: z.uuid().optional(),
  visitorId: z.string().max(100).optional(),
  properties: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
});

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a six-digit hex color");

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

export const updateThemeSchema = z
  .object({
    primary: hexColorSchema,
    accent: hexColorSchema,
    background: hexColorSchema.default("#FFFFFF"),
    text: hexColorSchema.default("#111714"),
    muted: hexColorSchema.default("#EFF7F3"),
    radius: z.number().int().min(0).max(32).default(12),
  })
  .superRefine((tokens, context) => {
    if (contrastRatio(tokens.primary, "#FFFFFF") < 4.5)
      context.addIssue({
        code: "custom",
        path: ["primary"],
        message: "Primary must reach WCAG AA contrast against white",
      });
    if (contrastRatio(tokens.text, tokens.background) < 4.5)
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Text and background must reach WCAG AA contrast",
      });
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type CreateCatalogInput = z.infer<typeof createCatalogSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type CreateQrInput = z.infer<typeof createQrSchema>;
export type IngestAnalyticsInput = z.infer<typeof ingestAnalyticsSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

export type ApiSuccess<T> = { data: T; requestId: string };
export type ApiError = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    requestId: string;
  };
};

export interface PublicCatalogItem {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  priceMinor: number;
  promotionalPriceMinor: number | null;
  currency: string;
  imageUrl: string | null;
  badges: string[];
  available: boolean;
  featured: boolean;
  popular: boolean;
  categoryId: string;
  variants: Array<{ id: string; label: string; priceMinor: number }>;
}

export interface PublicCatalog {
  business: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    address: string | null;
    defaultLocale: string;
    supportedLocales: string[];
    timezone: string;
    theme: Record<string, string | number>;
  };
  branch: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
    openingHours: Record<string, unknown>;
  } | null;
  catalog: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    currency: string;
    publishedRevision: number;
  };
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }>;
  items: PublicCatalogItem[];
}

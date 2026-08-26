import type { PublicCatalog } from "@atlas/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCatalogExperience } from "../../../../components/public-catalog-experience";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface PageProps {
  params: Promise<{ businessSlug: string; catalogSlug: string }>;
  searchParams: Promise<{
    locale?: string;
    branch?: string;
    table?: string;
    room?: string;
    qr?: string;
  }>;
}

async function loadCatalog(
  businessSlug: string,
  catalogSlug: string,
  locale?: string,
  branch?: string,
) {
  const query = new URLSearchParams();
  if (locale) query.set("locale", locale);
  if (branch) query.set("branch", branch);
  const response = await fetch(
    `${API_URL}/public/businesses/${encodeURIComponent(businessSlug)}/catalogs/${encodeURIComponent(catalogSlug)}?${query}`,
    {
      next: {
        revalidate: 60,
        tags: [`catalog:${businessSlug}:${catalogSlug}`],
      },
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { data: PublicCatalog | null };
  return body.data;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const route = await params;
  const query = await searchParams;
  const catalog = await loadCatalog(
    route.businessSlug,
    route.catalogSlug,
    query.locale,
    query.branch,
  );
  if (!catalog)
    return {
      title: "Catalog unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: `${catalog.catalog.name} · ${catalog.business.name}`,
    description:
      catalog.catalog.description ??
      catalog.business.description ??
      `Browse ${catalog.business.name}`,
    alternates: { canonical: `/b/${route.businessSlug}/${route.catalogSlug}` },
    openGraph: {
      title: `${catalog.catalog.name} · ${catalog.business.name}`,
      description:
        catalog.catalog.description ??
        catalog.business.description ??
        "Browse this catalog",
      images: ["/images/brew-bloom-cover.png"],
    },
  };
}

export default async function PublicCatalogPage({
  params,
  searchParams,
}: PageProps) {
  const route = await params;
  const query = await searchParams;
  const catalog = await loadCatalog(
    route.businessSlug,
    route.catalogSlug,
    query.locale,
    query.branch,
  );
  if (!catalog) notFound();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: catalog.business.name,
    address: catalog.branch?.address ?? catalog.business.address,
    telephone: catalog.business.phone,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: catalog.catalog.name,
      itemListElement: catalog.items.map((item) => ({
        "@type": "Offer",
        price: (item.priceMinor / 100).toFixed(2),
        priceCurrency: item.currency,
        itemOffered: {
          "@type": "Product",
          name: item.name,
          description: item.shortDescription,
        },
      })),
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <PublicCatalogExperience
        initialCatalog={catalog}
        initialLocale={query.locale ?? catalog.business.defaultLocale}
        context={{
          ...(query.table ? { table: query.table } : {}),
          ...(query.room ? { room: query.room } : {}),
          ...(query.qr ? { qr: query.qr } : {}),
        }}
      />
    </>
  );
}

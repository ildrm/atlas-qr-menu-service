"use client";

import type { PublicCatalog, PublicCatalogItem } from "@atlas/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CloudOff,
  Filter,
  Heart,
  Languages,
  MapPin,
  Phone,
  Search,
  Share2,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import { Brand } from "./brand";
import { ServiceWorkerRegistration } from "./service-worker";
import { publicApiUrl } from "../lib/api";

function formatMoney(minor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 100,
  );
}

function fallbackImage(item: PublicCatalogItem) {
  if (item.slug.includes("espresso") || item.slug.includes("pistachio"))
    return "/images/brew-bloom-cover.png";
  if (item.slug.includes("citrus")) return "/images/citrus-tonic.png";
  if (item.slug.includes("cold-brew")) return "/images/cardamom-cold-brew.png";
  if (item.slug.includes("croissant")) return "/images/butter-croissant.png";
  return "/images/brew-bloom-cover.png";
}

export function PublicCatalogExperience({
  initialCatalog,
  initialLocale,
  context,
}: {
  initialCatalog: PublicCatalog;
  initialLocale: string;
  context: { table?: string; room?: string; qr?: string };
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [locale, setLocale] = useState(initialLocale);
  const [localeLoading, setLocaleLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PublicCatalogItem | null>(
    null,
  );
  const [online, setOnline] = useState(true);
  const isRtl = ["fa", "ar", "he", "ur"].includes(
    locale.split("-")[0] ?? locale,
  );

  const track = useCallback(
    async (
      eventName: string,
      properties: Record<string, string | number | boolean | null> = {},
      itemId?: string,
      categoryId?: string,
    ) => {
      const visitorIdKey = "atlasqr:visitor";
      let visitorId = localStorage.getItem(visitorIdKey);
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem(visitorIdKey, visitorId);
      }
      await fetch(publicApiUrl("/public/analytics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          businessId: catalog.business.id,
          catalogId: catalog.catalog.id,
          categoryId,
          itemId,
          visitorId,
          properties,
        }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [catalog.business.id, catalog.catalog.id],
  );

  useEffect(() => {
    const saved = localStorage.getItem(
      `atlasqr:favorites:${catalog.business.id}`,
    );
    queueMicrotask(() => {
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (
            Array.isArray(parsed) &&
            parsed.every((entry): entry is string => typeof entry === "string")
          ) {
            setFavorites(new Set(parsed));
          }
        } catch {
          // Ignore corrupt client-only preferences and keep the catalog usable.
        }
      }
      setOnline(navigator.onLine);
    });
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [catalog.business.id]);

  useEffect(() => {
    void track("catalog_viewed", {
      qr: Boolean(context.qr),
      table: context.table ?? null,
      room: context.room ?? null,
    });
  }, [context.qr, context.room, context.table, track]);

  useEffect(() => {
    const openLinkedItem = () => {
      let slug: string;
      try {
        slug = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!slug) {
        setSelectedItem(null);
        return;
      }
      const item = catalog.items.find((entry) => entry.slug === slug);
      setSelectedItem(item ?? null);
    };

    openLinkedItem();
    window.addEventListener("hashchange", openLinkedItem);
    return () => window.removeEventListener("hashchange", openLinkedItem);
  }, [catalog.items]);

  const visibleItems = useMemo(
    () =>
      catalog.items.filter((item) => {
        const categoryMatch =
          search.trim().length > 0 ||
          activeCategory === "all" ||
          item.categoryId === activeCategory;
        const searchMatch =
          `${item.name} ${item.shortDescription ?? ""} ${item.badges.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase());
        return (
          categoryMatch &&
          searchMatch &&
          (!availableOnly || item.available) &&
          (!favoritesOnly || favorites.has(item.id))
        );
      }),
    [
      activeCategory,
      availableOnly,
      catalog.items,
      favorites,
      favoritesOnly,
      search,
    ],
  );

  function toggleFavorite(item: PublicCatalogItem) {
    const next = new Set(favorites);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    setFavorites(next);
    localStorage.setItem(
      `atlasqr:favorites:${catalog.business.id}`,
      JSON.stringify([...next]),
    );
    void track("item_favorited", { favorited: next.has(item.id) }, item.id);
  }

  async function share(item?: PublicCatalogItem) {
    const url = item
      ? `${location.origin}${location.pathname}#${item.slug}`
      : location.href;
    const shareData = {
      title: item
        ? `${item.name} · ${catalog.business.name}`
        : catalog.business.name,
      text: item?.shortDescription ?? catalog.catalog.name,
      url,
    };
    let method = "copy";
    try {
      await navigator.share(shareData);
      method = "native";
    } catch {
      await navigator.clipboard.writeText(url).catch(() => undefined);
    }
    void track(item ? "item_shared" : "cta_clicked", { method }, item?.id);
  }

  function openItem(item: PublicCatalogItem) {
    setSelectedItem(item);
    history.replaceState(null, "", `#${item.slug}`);
    void track("item_viewed", {}, item.id);
  }

  async function changeLocale(nextLocale: string) {
    setLocale(nextLocale);
    setLocaleLoading(true);
    setSelectedItem(null);
    const query = new URLSearchParams({ locale: nextLocale });
    if (catalog.branch?.slug) query.set("branch", catalog.branch.slug);
    try {
      const response = await fetch(
        publicApiUrl(
          `/public/businesses/${encodeURIComponent(catalog.business.slug)}/catalogs/${encodeURIComponent(catalog.catalog.slug)}?${query}`,
        ),
      );
      if (response.ok) {
        const body = (await response.json()) as { data: PublicCatalog };
        setCatalog(body.data);
      }
    } finally {
      setLocaleLoading(false);
    }
    void track("language_changed", { locale: nextLocale });
  }

  return (
    <main
      className="public-catalog"
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      style={
        {
          "--business-primary": String(
            catalog.business.theme.primary ?? "#14352B",
          ),
          "--business-accent": String(
            catalog.business.theme.accent ?? "#F26A3D",
          ),
        } as CSSProperties
      }
    >
      <ServiceWorkerRegistration />
      <header className="public-topbar">
        <Brand />
        <nav aria-label="Catalog controls">
          {catalog.business.supportedLocales.length > 1 ? (
            <label className="language-select">
              <Languages />
              <select
                value={locale}
                disabled={localeLoading}
                onChange={(event) => {
                  void changeLocale(event.target.value);
                }}
                aria-label="Language"
              >
                {catalog.business.supportedLocales.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.toUpperCase()}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </label>
          ) : (
            <span className="single-locale">{locale.toUpperCase()}</span>
          )}
          <button onClick={() => void share()} aria-label="Share catalog">
            <Share2 />
          </button>
          <button
            onClick={() => {
              setActiveCategory("all");
              setSearch("");
              setFavoritesOnly((value) => !value);
            }}
            aria-label={favoritesOnly ? "Show all items" : "Show favorites"}
            aria-pressed={favoritesOnly}
          >
            <Heart
              className={favoritesOnly || favorites.size ? "filled" : ""}
            />
          </button>
          <button
            className="public-search-button"
            onClick={() => document.getElementById("catalog-search")?.focus()}
            aria-label="Search"
          >
            <Search />
          </button>
        </nav>
      </header>
      <div className="public-cover">
        <Image
          src="/images/brew-bloom-cover.png"
          fill
          priority
          sizes="100vw"
          alt="Espresso and pistachio latte in morning light"
        />
      </div>
      <section className="business-intro">
        <div>
          <h1>{catalog.business.name}</h1>
          {catalog.branch?.name || catalog.business.address ? (
            <p>
              <MapPin /> {catalog.branch?.name ?? catalog.business.address}
            </p>
          ) : null}
          <p className="open-status">
            <span /> Open until 8:00 PM
          </p>
          {context.table ? (
            <p className="qr-context">Table {context.table}</p>
          ) : context.room ? (
            <p className="qr-context">Room {context.room}</p>
          ) : null}
        </div>
        <div className="contact-actions">
          {catalog.business.phone ? (
            <a
              href={`tel:${catalog.business.phone}`}
              onClick={() => void track("cta_clicked", { action: "call" })}
            >
              <Phone /> Call
            </a>
          ) : null}
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(catalog.branch?.address ?? catalog.business.address ?? catalog.business.name)}`}
            onClick={() => void track("cta_clicked", { action: "directions" })}
          >
            <MapPin /> Directions
          </a>
        </div>
      </section>
      <section className="catalog-content">
        <h2>{catalog.catalog.name}</h2>
        <label className="catalog-search">
          <Search />
          <input
            id="catalog-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                void track("search_performed", { queryLength: search.length });
            }}
            placeholder="Search the menu"
          />
        </label>
        <div className="catalog-filter-row">
          <div className="category-tabs" role="tablist" aria-label="Categories">
            <button
              role="tab"
              aria-selected={activeCategory === "all"}
              className={activeCategory === "all" ? "active" : ""}
              onClick={() => setActiveCategory("all")}
            >
              All
            </button>
            {catalog.categories.map((category) => (
              <button
                key={category.id}
                role="tab"
                aria-selected={activeCategory === category.id}
                className={activeCategory === category.id ? "active" : ""}
                onClick={() => {
                  setActiveCategory(category.id);
                  void track(
                    "category_viewed",
                    { category: category.slug },
                    undefined,
                    category.id,
                  );
                }}
              >
                {category.name}
              </button>
            ))}
          </div>
          <button
            className={
              availableOnly ? "available-filter selected" : "available-filter"
            }
            onClick={() => {
              setAvailableOnly((value) => !value);
              void track("filter_applied", { availableOnly: !availableOnly });
            }}
          >
            <Filter /> Available now
          </button>
        </div>
        <div className="public-item-list" aria-live="polite">
          {visibleItems.map((item, index) => (
            <article
              id={item.slug}
              className={index % 2 ? "public-item reverse" : "public-item"}
              key={item.id}
            >
              <button
                className="item-image-button"
                onClick={() => openItem(item)}
                aria-label={`Open details for ${item.name}`}
              >
                <Image
                  src={item.imageUrl ?? fallbackImage(item)}
                  fill
                  sizes="(max-width: 700px) 42vw, 300px"
                  alt={item.name}
                />
              </button>
              <button className="item-copy" onClick={() => openItem(item)}>
                <span className="item-title-row">
                  <h3>{item.name}</h3>
                  {item.popular ? (
                    <em className="popular-marker">Popular</em>
                  ) : null}
                  {item.badges.includes("vegan") ? (
                    <em className="vegan-marker">Vegan</em>
                  ) : null}
                </span>
                <p>{item.shortDescription}</p>
              </button>
              <div className="item-price-action">
                <strong>
                  {formatMoney(
                    item.promotionalPriceMinor ?? item.priceMinor,
                    item.currency,
                    locale,
                  )}
                </strong>
                <button
                  className={
                    favorites.has(item.id)
                      ? "favorite-button selected"
                      : "favorite-button"
                  }
                  onClick={() => toggleFavorite(item)}
                  aria-label={`${favorites.has(item.id) ? "Remove" : "Add"} ${item.name} ${favorites.has(item.id) ? "from" : "to"} favorites`}
                >
                  {favorites.has(item.id) ? (
                    <Heart fill="currentColor" />
                  ) : isRtl ? (
                    <ArrowLeft />
                  ) : (
                    <ArrowRight />
                  )}
                </button>
              </div>
            </article>
          ))}
          {!visibleItems.length ? (
            <div className="public-empty">
              <Search />
              <h3>No items match</h3>
              <p>Try another category or clear your search.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setActiveCategory("all");
                  setAvailableOnly(false);
                  setFavoritesOnly(false);
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
        <p className="tax-note">Prices include tax</p>
      </section>
      {!online ? (
        <div className="offline-banner" role="status">
          <CloudOff /> Offline — showing the latest saved catalog
        </div>
      ) : null}
      {selectedItem ? (
        <ItemDetail
          item={selectedItem}
          locale={locale}
          favorite={favorites.has(selectedItem.id)}
          onFavorite={() => toggleFavorite(selectedItem)}
          onShare={() => void share(selectedItem)}
          onClose={() => {
            setSelectedItem(null);
            history.replaceState(null, "", location.pathname + location.search);
          }}
        />
      ) : null}
    </main>
  );
}

function ItemDetail({
  item,
  locale,
  favorite,
  onFavorite,
  onShare,
  onClose,
}: {
  item: PublicCatalogItem;
  locale: string;
  favorite: boolean;
  onFavorite: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="item-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article
        className="item-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-detail-title"
      >
        <div className="item-detail-image">
          <Image
            src={item.imageUrl ?? fallbackImage(item)}
            fill
            sizes="600px"
            alt={item.name}
          />
          <button onClick={onClose} aria-label="Close item details">
            <X />
          </button>
        </div>
        <div className="item-detail-body">
          <div>
            <h2 id="item-detail-title">{item.name}</h2>
            <strong>
              {formatMoney(
                item.promotionalPriceMinor ?? item.priceMinor,
                item.currency,
                locale,
              )}
            </strong>
          </div>
          <p>{item.shortDescription}</p>
          {item.variants.length ? (
            <fieldset>
              <legend>Choose a variant</legend>
              {item.variants.map((variant, index) => (
                <label key={variant.id}>
                  <input
                    type="radio"
                    name="variant"
                    defaultChecked={index === 0}
                  />
                  <span>
                    <Check />
                    {variant.label}
                  </span>
                  <strong>
                    {formatMoney(variant.priceMinor, item.currency, locale)}
                  </strong>
                </label>
              ))}
            </fieldset>
          ) : null}
          <footer>
            <button onClick={onFavorite}>
              <Heart fill={favorite ? "currentColor" : "none"} />{" "}
              {favorite ? "Saved" : "Save"}
            </button>
            <button onClick={onShare}>
              <Share2 /> Share
            </button>
          </footer>
        </div>
      </article>
    </div>
  );
}

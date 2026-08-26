"use client";

/* QR SVGs are authenticated same-site API resources, so they intentionally use native img elements. */
/* eslint-disable @next/next/no-img-element */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Palette,
  Plus,
  QrCode,
  Search,
  Settings,
  Share2,
  Store,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Brand } from "./brand";
import { ApiClientError, apiFetch, publicApiUrl } from "../lib/api";

type NavKey =
  | "overview"
  | "catalogs"
  | "items"
  | "qr"
  | "analytics"
  | "appearance"
  | "team"
  | "settings";

interface Business {
  id: string;
  name: string;
  slug: string;
  currency: string;
  defaultLocale: string;
  role: string;
}

interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
}

interface Catalog {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "pending_review" | "scheduled" | "published" | "archived";
  currency: string;
  publishedAt: string | null;
  updatedAt: string;
}

interface Item {
  id: string;
  catalogId: string;
  categoryId: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  priceMinor: number;
  promotionalPriceMinor: number | null;
  currency: string;
  imageUrl: string | null;
  tags: string[];
  badges: string[];
  status: string;
  availability: string;
  featured: boolean;
  popular: boolean;
}

interface Category {
  id: string;
  catalogId: string;
  name: string;
  slug: string;
}
interface QrRecord {
  id: string;
  name: string;
  publicToken: string;
  targetType: string;
  targetId: string;
  context: Record<string, string>;
  active: boolean;
  createdAt: string;
}
interface ThemeRecord {
  id: string;
  name: string;
  template: string;
  version: number;
  tokens: Record<string, string | number>;
  updatedAt: string;
}
interface TeamMember {
  id: string;
  displayName: string;
  email: string;
  locale: string;
  role: string;
  status: string;
  branchScope: string[] | null;
  joinedAt: string;
}

interface DashboardData {
  business: Pick<
    Business,
    "id" | "name" | "slug" | "currency" | "defaultLocale"
  >;
  metrics: {
    catalogViews: number;
    qrScans: number;
    itemOpens: number;
    shares: number;
  };
  catalogs: Catalog[];
  branches: Array<{
    id: string;
    name: string;
    slug: string;
    address: string | null;
  }>;
  qrCodes: Array<{ id: string; name: string; token: string; active: boolean }>;
  activity: Array<{ day: string; catalogViews: number; qrScans: number }>;
  popularItems: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    opens: number;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    occurredAt: string;
    actor: string | null;
  }>;
}

const navigation: Array<{
  key: NavKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "catalogs", label: "Catalogs", icon: BookOpen },
  { key: "items", label: "Items", icon: Package },
  { key: "qr", label: "QR codes", icon: QrCode },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "team", label: "Team", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
];

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    minor / 100,
  );
}

function titleCaseAction(action: string) {
  return action
    .replaceAll(".", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof BookOpen;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon aria-hidden="true" />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function DashboardApp() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [view, setView] = useState<NavKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [createQrOpen, setCreateQrOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me"),
  });
  const businessesQuery = useQuery({
    queryKey: ["businesses"],
    queryFn: () => apiFetch<Business[]>("/businesses"),
  });
  const requestedBusiness = params.get("business");
  const activeBusiness =
    businessesQuery.data?.find(
      (business) => business.id === requestedBusiness,
    ) ?? businessesQuery.data?.[0];

  useEffect(() => {
    if (
      (businessesQuery.error instanceof ApiClientError &&
        businessesQuery.error.status === 401) ||
      (userQuery.error instanceof ApiClientError &&
        userQuery.error.status === 401)
    )
      router.replace("/login");
    if (businessesQuery.data?.length === 0) router.replace("/onboarding");
    if (activeBusiness && activeBusiness.id !== requestedBusiness)
      router.replace(`/dashboard?business=${activeBusiness.id}`);
  }, [
    activeBusiness,
    businessesQuery.data,
    businessesQuery.error,
    requestedBusiness,
    router,
    userQuery.error,
  ]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", activeBusiness?.id],
    enabled: Boolean(activeBusiness),
    queryFn: () =>
      apiFetch<DashboardData>(`/businesses/${activeBusiness!.id}/dashboard`),
  });
  const catalogsQuery = useQuery({
    queryKey: ["catalogs", activeBusiness?.id],
    enabled: Boolean(activeBusiness),
    queryFn: () =>
      apiFetch<Catalog[]>(`/businesses/${activeBusiness!.id}/catalogs`),
  });
  const itemsQuery = useQuery({
    queryKey: ["items", activeBusiness?.id],
    enabled: Boolean(activeBusiness),
    queryFn: () => apiFetch<Item[]>(`/businesses/${activeBusiness!.id}/items`),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", activeBusiness?.id],
    enabled: Boolean(activeBusiness),
    queryFn: () =>
      apiFetch<Category[]>(`/businesses/${activeBusiness!.id}/categories`),
  });
  const qrQuery = useQuery({
    queryKey: ["qr", activeBusiness?.id],
    enabled: Boolean(activeBusiness),
    queryFn: () =>
      apiFetch<QrRecord[]>(`/businesses/${activeBusiness!.id}/qr-codes`),
  });
  const logout = useMutation({
    mutationFn: () =>
      apiFetch<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["dashboard", activeBusiness?.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["catalogs", activeBusiness?.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["items", activeBusiness?.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["qr", activeBusiness?.id] }),
    ]);
  };

  if (
    businessesQuery.isLoading ||
    userQuery.isLoading ||
    !userQuery.data ||
    !activeBusiness ||
    dashboardQuery.isLoading
  ) {
    return (
      <main className="loading-screen" aria-busy="true">
        <span className="spinner" /> Loading your workspace…
      </main>
    );
  }
  if (dashboardQuery.error || userQuery.error) {
    return (
      <main className="error-screen">
        <Activity aria-hidden="true" />
        <h1>We couldn’t load your workspace</h1>
        <p>{dashboardQuery.error?.message ?? userQuery.error?.message}</p>
        <button
          className="button button-primary"
          onClick={() => void dashboardQuery.refetch()}
        >
          Try again
        </button>
      </main>
    );
  }

  const data = dashboardQuery.data!;
  const catalogs = catalogsQuery.data ?? data.catalogs;
  const items = itemsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const qrs = qrQuery.data ?? [];
  const primaryCatalog =
    catalogs.find((catalog) => catalog.status === "published") ?? catalogs[0];
  const firstName =
    userQuery.data.displayName.trim().split(/\s+/)[0] ??
    userQuery.data.displayName;

  function navigate(key: NavKey) {
    setView(key);
    setSidebarOpen(false);
  }

  return (
    <div
      className={
        collapsed ? "dashboard-shell sidebar-collapsed" : "dashboard-shell"
      }
    >
      <aside
        className={sidebarOpen ? "dashboard-sidebar open" : "dashboard-sidebar"}
      >
        <div className="sidebar-brand">
          <Brand light />
          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Workspace navigation">
          {navigation.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => navigate(key)}
              title={collapsed ? label : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button
          className="sidebar-collapse"
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronRight aria-hidden="true" />
          <span>{collapsed ? "Expand" : "Collapse"}</span>
        </button>
        <button
          className="sidebar-help"
          onClick={() => window.open("/help", "_blank")}
        >
          <CircleHelp aria-hidden="true" />
          <span>Help</span>
        </button>
      </aside>
      <div className="dashboard-stage">
        <header className="dashboard-topbar">
          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <label className="business-select">
            <Store aria-hidden="true" />
            <select
              value={activeBusiness.id}
              onChange={(event) =>
                router.push(`/dashboard?business=${event.target.value}`)
              }
              aria-label="Active business"
            >
              {businessesQuery.data?.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <span className="topbar-divider">/</span>
          <label className="business-select branch-select">
            <Building2 aria-hidden="true" />
            <select aria-label="Active branch">
              <option>{data.branches[0]?.name ?? "All branches"}</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <div className="topbar-spacer" />
          <button
            className="command-trigger"
            onClick={() => setCommandOpen(true)}
          >
            <Search aria-hidden="true" />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            className="avatar-button"
            aria-label="Open account menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((value) => !value)}
          >
            <span>{firstName.charAt(0).toUpperCase()}</span>
            <b>{firstName}</b>
            <ChevronDown />
          </button>
          {accountOpen ? (
            <div className="account-menu" role="menu">
              <span>
                <strong>{userQuery.data.displayName}</strong>
                <small>{userQuery.data.email}</small>
              </span>
              <button
                role="menuitem"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                <LogOut /> {logout.isPending ? "Signing out…" : "Sign out"}
              </button>
              {logout.error ? (
                <small className="form-error">{logout.error.message}</small>
              ) : null}
            </div>
          ) : null}
        </header>
        <main className="dashboard-main">
          {view === "overview" ? (
            <Overview
              data={data}
              userName={firstName}
              primaryCatalog={primaryCatalog}
              items={items}
              categories={categories}
              qrs={qrs}
              onAddItem={() => setAddItemOpen(true)}
              onManage={() => setView("catalogs")}
            />
          ) : null}
          {view === "catalogs" ? (
            <CatalogsView
              businessId={activeBusiness.id}
              businessSlug={activeBusiness.slug}
              catalogs={catalogs}
              categories={categories}
              items={items}
              onChanged={invalidate}
            />
          ) : null}
          {view === "items" ? (
            <ItemsView
              businessId={activeBusiness.id}
              items={items}
              categories={categories}
              onAdd={() => setAddItemOpen(true)}
              onChanged={invalidate}
            />
          ) : null}
          {view === "qr" ? (
            <QrView
              businessId={activeBusiness.id}
              qrs={qrs}
              onCreate={() => setCreateQrOpen(true)}
            />
          ) : null}
          {view === "analytics" ? <AnalyticsView data={data} /> : null}
          {view === "appearance" ? (
            <AppearanceView businessId={activeBusiness.id} />
          ) : null}
          {view === "team" ? (
            <TeamView
              businessId={activeBusiness.id}
              role={activeBusiness.role}
            />
          ) : null}
          {view === "settings" ? (
            <SettingsView business={activeBusiness} branches={data.branches} />
          ) : null}
        </main>
      </div>
      {addItemOpen ? (
        <AddItemDialog
          businessId={activeBusiness.id}
          catalogs={catalogs}
          categories={categories}
          onClose={() => setAddItemOpen(false)}
          onCreated={async () => {
            setAddItemOpen(false);
            await invalidate();
          }}
        />
      ) : null}
      {createQrOpen ? (
        <CreateQrDialog
          businessId={activeBusiness.id}
          catalogs={catalogs}
          onClose={() => setCreateQrOpen(false)}
          onCreated={async () => {
            setCreateQrOpen(false);
            await invalidate();
          }}
        />
      ) : null}
      {commandOpen ? (
        <CommandPalette
          items={items}
          onClose={() => setCommandOpen(false)}
          onNavigate={(key) => {
            navigate(key);
            setCommandOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Overview({
  data,
  userName,
  primaryCatalog,
  items,
  categories,
  qrs,
  onAddItem,
  onManage,
}: {
  data: DashboardData;
  userName: string;
  primaryCatalog: Catalog | undefined;
  items: Item[];
  categories: Category[];
  qrs: QrRecord[];
  onAddItem: () => void;
  onManage: () => void;
}) {
  const previewItems = items.slice(0, 3);
  return (
    <div className="overview-layout">
      <section className="overview-content">
        <header className="page-heading">
          <div>
            <h1>Good morning, {userName}</h1>
            <p>Your catalog is live and ready for today.</p>
          </div>
          <div className="heading-actions">
            <button className="button button-primary" onClick={onAddItem}>
              <Plus /> Add item
            </button>
            {primaryCatalog ? (
              <a
                className="button button-secondary"
                target="_blank"
                rel="noreferrer"
                href={`/b/${data.business.slug}/${primaryCatalog.slug}`}
              >
                <Eye /> Preview catalog
              </a>
            ) : null}
          </div>
        </header>
        <div className="metric-rail" aria-label="Last seven days metrics">
          <Metric
            icon={Eye}
            label="Catalog views"
            value={data.metrics.catalogViews}
          />
          <Metric icon={QrCode} label="QR scans" value={data.metrics.qrScans} />
          <Metric
            icon={BookOpen}
            label="Item opens"
            value={data.metrics.itemOpens}
          />
          <Metric icon={Share2} label="Shares" value={data.metrics.shares} />
        </div>
        {primaryCatalog ? (
          <button className="live-catalog-row" onClick={onManage}>
            <span className="catalog-image">
              <Image
                src="/images/brew-bloom-cover.png"
                fill
                sizes="80px"
                alt=""
              />
            </span>
            <span className="live-catalog-name">
              <small>Live catalog</small>
              <strong>{primaryCatalog.name}</strong>
              <em>
                <span />{" "}
                {primaryCatalog.status === "published" ? "Published" : "Draft"}
              </em>
            </span>
            <span className="catalog-count">
              <strong>
                {new Set(items.map((item) => item.categoryId)).size}
              </strong>
              <small>Categories</small>
            </span>
            <span className="catalog-count">
              <strong>{items.length}</strong>
              <small>Items</small>
            </span>
            <span className="manage-catalog">
              Manage catalog <ChevronRight />
            </span>
          </button>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Create your first catalog"
            body="Group products or services into a public collection, then publish it when it is ready."
            action={
              <button className="button button-primary" onClick={onManage}>
                Create catalog
              </button>
            }
          />
        )}
        <section className="activity-section">
          <header>
            <h2>Activity</h2>
            <button className="date-filter">
              <CalendarDays /> Last 7 days <ChevronDown />
            </button>
          </header>
          <div className="chart-panel">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart
                data={data.activity}
                margin={{ top: 18, right: 12, left: -18, bottom: 0 }}
              >
                <CartesianGrid stroke="#E5E9E7" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(value: string) =>
                    new Intl.DateTimeFormat("en", { weekday: "short" }).format(
                      new Date(`${value}T12:00:00`),
                    )
                  }
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#66716C", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tick={{ fill: "#66716C", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #DCE2DF",
                    borderRadius: 10,
                    boxShadow: "none",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="catalogViews"
                  name="Catalog views"
                  stroke="#14352B"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#14352B" }}
                />
                <Line
                  type="monotone"
                  dataKey="qrScans"
                  name="QR scans"
                  stroke="#29A68A"
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: "#29A68A" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <table className="sr-only">
              <caption>Activity over the last seven days</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Catalog views</th>
                  <th>QR scans</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((row) => (
                  <tr key={row.day}>
                    <th>{row.day}</th>
                    <td>{row.catalogViews}</td>
                    <td>{row.qrScans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="overview-lists">
          <section>
            <h2>Popular today</h2>
            {data.popularItems.map((item, index) => (
              <div className="rank-row" key={item.id}>
                <span>{index + 1}</span>
                <ItemThumb item={items.find((entry) => entry.id === item.id)} />
                <strong>{item.name}</strong>
                <small>{item.opens} opens</small>
                <ChevronRight />
              </div>
            ))}
          </section>
          <section>
            <h2>Recent activity</h2>
            {data.recentActivity.slice(0, 3).map((event) => (
              <div className="event-row" key={event.id}>
                <span className="event-icon">
                  <Activity />
                </span>
                <span>
                  <strong>{titleCaseAction(event.action)}</strong>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.occurredAt))}
                  </small>
                </span>
                <small>{event.actor ?? "System"}</small>
                <ChevronRight />
              </div>
            ))}
          </section>
        </div>
      </section>
      <PhonePreview
        business={data.business}
        branchName={data.branches[0]?.name ?? "All locations"}
        catalog={primaryCatalog}
        items={previewItems}
        categories={categories.filter(
          (category) => category.catalogId === primaryCatalog?.id,
        )}
        qr={qrs[0]}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">
        <Icon />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value.toLocaleString()}</strong>
        <em>Live data</em>
      </span>
    </div>
  );
}

function PhonePreview({
  business,
  branchName,
  catalog,
  items,
  categories,
  qr,
}: {
  business: DashboardData["business"];
  branchName: string;
  catalog: Catalog | undefined;
  items: Item[];
  categories: Category[];
  qr: QrRecord | undefined;
}) {
  return (
    <aside className="preview-column">
      <header>
        <span>
          <strong>Public catalog preview</strong>
          <small>{catalog?.name ?? "No published catalog"}</small>
        </span>
        {catalog ? (
          <a
            href={`/b/${business.slug}/${catalog.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open catalog"
          >
            <ArrowRight />
          </a>
        ) : null}
      </header>
      <div className="phone-frame">
        <div className="phone-top">
          <span>9:41</span>
          <i />
        </div>
        <div className="phone-brand">
          {business.name}
          <small>{branchName}</small>
        </div>
        <h3>{catalog?.name ?? "Your catalog"}</h3>
        <div className="phone-tabs">
          {categories.slice(0, 3).map((category) => (
            <span key={category.id}>{category.name}</span>
          ))}
        </div>
        {items.length ? (
          items.map((item) => (
            <div className="phone-item" key={item.id}>
              <ItemThumb item={item} />
              <span>
                <strong>{item.name}</strong>
                <small>{formatMoney(item.priceMinor, item.currency)}</small>
                <em>{item.shortDescription}</em>
              </span>
              <Plus />
            </div>
          ))
        ) : (
          <p className="phone-empty">Add items to see them here.</p>
        )}
        {catalog ? (
          <a
            href={`/b/${business.slug}/${catalog.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            View full catalog
          </a>
        ) : null}
      </div>
      {qr ? (
        <div className="preview-qr">
          <span>Scan to open catalog</span>
          <img
            src={publicApiUrl(
              `/businesses/${business.id}/qr-codes/${qr.id}.svg`,
            )}
            alt={`QR code for ${catalog?.name ?? "catalog"}`}
          />
        </div>
      ) : null}
    </aside>
  );
}

function ItemThumb({ item }: { item: Item | undefined }) {
  if (!item?.imageUrl)
    return (
      <span className="item-thumb placeholder">
        <ImageIcon />
      </span>
    );
  return (
    <span className="item-thumb">
      <Image src={item.imageUrl} fill sizes="72px" alt="" />
    </span>
  );
}

function CatalogsView({
  businessId,
  businessSlug,
  catalogs,
  categories,
  items,
  onChanged,
}: {
  businessId: string;
  businessSlug: string;
  catalogs: Catalog[];
  categories: Category[];
  items: Item[];
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const publish = useMutation({
    mutationFn: (catalogId: string) =>
      apiFetch(`/businesses/${businessId}/catalogs/${catalogId}/publish`, {
        method: "POST",
      }),
    onSuccess: onChanged,
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : "Could not publish catalog",
      ),
  });
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>Catalogs</h1>
          <p>Organize, schedule, review, and publish what customers see.</p>
        </div>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="catalog-list">
        {catalogs.map((catalog) => (
          <article key={catalog.id}>
            <div className="catalog-art">
              <BookOpen />
            </div>
            <div>
              <span className={`status-dot ${catalog.status}`} />{" "}
              <small>{catalog.status.replaceAll("_", " ")}</small>
              <h2>{catalog.name}</h2>
              <p>
                {catalog.description ??
                  "A public catalog for your current offerings."}
              </p>
            </div>
            <dl>
              <div>
                <dt>Categories</dt>
                <dd>
                  {
                    categories.filter(
                      (category) => category.catalogId === catalog.id,
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>
                  {items.filter((item) => item.catalogId === catalog.id).length}
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(catalog.updatedAt))}
                </dd>
              </div>
            </dl>
            <div className="catalog-actions">
              {catalog.status !== "published" ? (
                <button
                  className="button button-primary"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate(catalog.id)}
                >
                  {publish.isPending ? "Publishing…" : "Publish"}
                </button>
              ) : (
                <a
                  className="button button-secondary"
                  href={`/b/${businessSlug}/${catalog.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Eye /> Preview
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ItemsView({
  businessId,
  items,
  categories,
  onAdd,
  onChanged,
}: {
  businessId: string;
  items: Item[];
  categories: Category[];
  onAdd: () => void;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const visible = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function toggle(item: Item) {
    try {
      await apiFetch(
        `/businesses/${businessId}/items/${item.id}/availability`,
        {
          method: "PATCH",
          body: JSON.stringify({
            availability:
              item.availability === "available"
                ? "temporarily_unavailable"
                : "available",
          }),
        },
      );
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update availability",
      );
    }
  }
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>Items</h1>
          <p>
            Products, services, packages, and experiences in one adaptable
            library.
          </p>
        </div>
        <button className="button button-primary" onClick={onAdd}>
          <Plus /> Add item
        </button>
      </header>
      <div className="table-toolbar">
        <label>
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items"
          />
        </label>
        <span>{visible.length} items</span>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {visible.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
                <th>Availability</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>
                    <ItemThumb item={item} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.shortDescription}</small>
                    </span>
                  </td>
                  <td>
                    {categories.find(
                      (category) => category.id === item.categoryId,
                    )?.name ?? "—"}
                  </td>
                  <td>
                    {formatMoney(
                      item.promotionalPriceMinor ?? item.priceMinor,
                      item.currency,
                    )}
                  </td>
                  <td>
                    <span className={`status-text ${item.status}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className={
                        item.availability === "available"
                          ? "availability-toggle available"
                          : "availability-toggle"
                      }
                      onClick={() => void toggle(item)}
                      aria-label={`Mark ${item.name} ${item.availability === "available" ? "unavailable" : "available"}`}
                    >
                      <span />
                      {item.availability.replaceAll("_", " ")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Package}
          title="Add your first item"
          body="Items can be products, services, experiences, packages, or menu entries."
          action={
            <button className="button button-primary" onClick={onAdd}>
              Add item
            </button>
          }
        />
      )}
    </section>
  );
}

function QrView({
  businessId,
  qrs,
  onCreate,
}: {
  businessId: string;
  qrs: QrRecord[];
  onCreate: () => void;
}) {
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>QR codes</h1>
          <p>
            Dynamic codes keep working even when the catalog behind them
            changes.
          </p>
        </div>
        <button className="button button-primary" onClick={onCreate}>
          <Plus /> Create QR
        </button>
      </header>
      {qrs.length ? (
        <div className="qr-grid">
          {qrs.map((qr) => (
            <article key={qr.id}>
              <img
                src={publicApiUrl(
                  `/businesses/${businessId}/qr-codes/${qr.id}.svg`,
                )}
                alt={`QR code named ${qr.name}`}
              />
              <div>
                <small>{qr.targetType}</small>
                <h2>{qr.name}</h2>
                <p>
                  {qr.context.table
                    ? `Table ${qr.context.table}`
                    : qr.context.room
                      ? `Room ${qr.context.room}`
                      : "Dynamic destination"}
                </p>
                <span className={qr.active ? "active-state" : "inactive-state"}>
                  {qr.active ? "Active" : "Inactive"}
                </span>
              </div>
              <a
                className="icon-button"
                href={publicApiUrl(
                  `/businesses/${businessId}/qr-codes/${qr.id}.svg`,
                )}
                download
                aria-label={`Download ${qr.name} as SVG`}
              >
                <Download />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={QrCode}
          title="Create a reusable QR code"
          body="Point one secure code at any published catalog, branch, table, room, or campaign."
          action={
            <button className="button button-primary" onClick={onCreate}>
              Create QR
            </button>
          }
        />
      )}
    </section>
  );
}

function AnalyticsView({ data }: { data: DashboardData }) {
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>Analytics</h1>
          <p>
            Privacy-conscious signals from scans and public catalog
            interactions.
          </p>
        </div>
        <button className="date-filter">
          <CalendarDays /> Last 7 days <ChevronDown />
        </button>
      </header>
      <div className="analytics-hero">
        <Metric
          icon={Eye}
          label="Catalog views"
          value={data.metrics.catalogViews}
        />
        <Metric icon={QrCode} label="QR scans" value={data.metrics.qrScans} />
        <Metric
          icon={BookOpen}
          label="Item opens"
          value={data.metrics.itemOpens}
        />
        <Metric icon={Share2} label="Shares" value={data.metrics.shares} />
      </div>
      <div className="analytics-chart">
        <h2>Views and scans</h2>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart
            data={data.activity}
            margin={{ top: 20, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#E5E9E7" vertical={false} />
            <XAxis dataKey="day" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="catalogViews"
              stroke="#14352B"
              strokeWidth={3}
            />
            <Line
              type="monotone"
              dataKey="qrScans"
              stroke="#F26A3D"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function AppearanceView({ businessId }: { businessId: string }) {
  const themeQuery = useQuery({
    queryKey: ["theme", businessId],
    queryFn: () =>
      apiFetch<ThemeRecord | null>(`/businesses/${businessId}/theme`),
  });
  if (themeQuery.isLoading)
    return (
      <section className="workspace-view">
        <div className="loading-inline">
          <span className="spinner" /> Loading appearance…
        </div>
      </section>
    );
  if (themeQuery.error)
    return (
      <section className="workspace-view">
        <p className="form-error" role="alert">
          {themeQuery.error.message}
        </p>
      </section>
    );
  const theme = themeQuery.data;
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>Appearance</h1>
          <p>
            Semantic brand tokens keep every catalog readable and consistent.
          </p>
        </div>
      </header>
      <AppearanceEditor
        key={theme?.id ?? "new-theme"}
        businessId={businessId}
        initialPrimary={String(theme?.tokens.primary ?? "#14352B")}
        initialAccent={String(theme?.tokens.accent ?? "#F26A3D")}
      />
    </section>
  );
}

function AppearanceEditor({
  businessId,
  initialPrimary,
  initialAccent,
}: {
  businessId: string;
  initialPrimary: string;
  initialAccent: string;
}) {
  const [primary, setPrimary] = useState(initialPrimary);
  const [accent, setAccent] = useState(initialAccent);
  const [message, setMessage] = useState("");
  const updateTheme = useMutation({
    mutationFn: () =>
      apiFetch<ThemeRecord>(`/businesses/${businessId}/theme`, {
        method: "PATCH",
        body: JSON.stringify({
          primary,
          accent,
          background: "#FFFFFF",
          text: "#111714",
          muted: "#EFF7F3",
          radius: 12,
        }),
      }),
    onSuccess: (theme) => setMessage(`Saved theme version ${theme.version}.`),
    onError: (caught) =>
      setMessage(
        caught instanceof Error ? caught.message : "Could not save theme",
      ),
  });
  return (
    <div className="appearance-layout">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");
          updateTheme.mutate();
        }}
      >
        <h2>Brand colors</h2>
        <label>
          <span>Primary</span>
          <input
            type="color"
            value={primary}
            onChange={(event) => setPrimary(event.target.value)}
          />
          <code>{primary}</code>
        </label>
        <label>
          <span>Accent</span>
          <input
            type="color"
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
          />
          <code>{accent}</code>
        </label>
        <div className="contrast-note">
          <Check /> Primary actions and body text are validated for WCAG AA
          contrast when saved.
        </div>
        <button
          className="button button-primary"
          disabled={updateTheme.isPending}
          type="submit"
        >
          {updateTheme.isPending ? "Saving…" : "Save appearance"}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </form>
      <div
        className="theme-preview"
        style={
          {
            "--preview-primary": primary,
            "--preview-accent": accent,
          } as CSSProperties
        }
      >
        <small>Live preview</small>
        <h2>Your catalog</h2>
        <p>Clean typography and clear product hierarchy.</p>
        <button>Primary action</button>
      </div>
    </div>
  );
}

function TeamView({ businessId }: { businessId: string; role: string }) {
  const teamQuery = useQuery({
    queryKey: ["team", businessId],
    queryFn: () => apiFetch<TeamMember[]>(`/businesses/${businessId}/team`),
  });
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>Team</h1>
          <p>
            Roles are permission collections, so access stays explicit and
            auditable.
          </p>
        </div>
      </header>
      {teamQuery.isLoading ? (
        <div className="loading-inline">
          <span className="spinner" /> Loading team…
        </div>
      ) : teamQuery.error ? (
        <p className="form-error" role="alert">
          {teamQuery.error.message}
        </p>
      ) : (
        <div className="team-list">
          {teamQuery.data?.map((member) => (
            <article key={member.id}>
              <span className="team-avatar">
                {member.displayName.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{member.displayName}</strong>
                <small>{member.email}</small>
              </span>
              <span className="role-label">{member.role}</span>
              <span
                className={
                  member.status === "active" ? "active-state" : "inactive-state"
                }
              >
                {member.status}
              </span>
            </article>
          ))}
        </div>
      )}
      <p className="workspace-note">
        Invitation delivery stays disabled until an email provider is
        configured, while membership and permission data remain fully
        tenant-scoped.
      </p>
    </section>
  );
}

function SettingsView({
  business,
  branches,
}: {
  business: Business;
  branches: DashboardData["branches"];
}) {
  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <h1>Settings</h1>
          <p>
            Workspace identity, locale, currency, branch structure, and account
            controls.
          </p>
        </div>
      </header>
      <dl className="settings-list">
        <div>
          <dt>Business</dt>
          <dd>{business.name}</dd>
        </div>
        <div>
          <dt>Public slug</dt>
          <dd>{business.slug}</dd>
        </div>
        <div>
          <dt>Default locale</dt>
          <dd>{business.defaultLocale}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{business.currency}</dd>
        </div>
        <div>
          <dt>Branches</dt>
          <dd>
            {branches.map((branch) => branch.name).join(", ") || "No branches"}
          </dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>{business.role}</dd>
        </div>
      </dl>
    </section>
  );
}

function AddItemDialog({
  businessId,
  catalogs,
  categories,
  onClose,
  onCreated,
}: {
  businessId: string;
  catalogs: Catalog[];
  categories: Category[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const name = String(form.get("name"));
      await apiFetch(`/businesses/${businessId}/items`, {
        method: "POST",
        body: JSON.stringify({
          catalogId,
          categoryId: String(form.get("categoryId")),
          name,
          slug: name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          shortDescription: String(form.get("description")),
          primaryImageUrl: String(form.get("imageUrl")) || undefined,
          priceMinor: Math.round(Number(form.get("price")) * 100),
          currency: String(form.get("currency")),
          tags: [],
          badges: [],
          featured: false,
          popular: false,
          sortOrder: 99,
        }),
      });
      await onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create item",
      );
    } finally {
      setSubmitting(false);
    }
  }
  const availableCategories = categories.filter(
    (category) => category.catalogId === catalogId,
  );
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-item-title"
      >
        <header>
          <div>
            <h2 id="add-item-title">Add an item</h2>
            <p>Create a product, service, package, or experience.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>Name</span>
            <input
              ref={nameRef}
              name="name"
              required
              placeholder="Pistachio latte"
            />
          </label>
          <div className="form-grid">
            <label>
              <span>Catalog</span>
              <select
                value={catalogId}
                onChange={(event) => setCatalogId(event.target.value)}
              >
                {catalogs.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {catalog.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Category</span>
              <select name="categoryId" required>
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Price</span>
              <input
                name="price"
                required
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                placeholder="5.25"
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                name="currency"
                required
                maxLength={3}
                defaultValue={
                  catalogs.find((catalog) => catalog.id === catalogId)
                    ?.currency ?? "USD"
                }
              />
            </label>
          </div>
          <label>
            <span>Short description</span>
            <textarea
              name="description"
              maxLength={320}
              placeholder="A clear description customers can scan quickly."
            />
          </label>
          <label>
            <span>Image path or URL</span>
            <input name="imageUrl" placeholder="/images/citrus-tonic.png" />
          </label>
          {!availableCategories.length ? (
            <p className="form-error" role="alert">
              Create a category in this catalog before adding an item.
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <button
              className="button button-secondary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={submitting || !availableCategories.length}
            >
              {submitting ? "Adding…" : "Add item"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function CreateQrDialog({
  businessId,
  catalogs,
  onClose,
  onCreated,
}: {
  businessId: string;
  catalogs: Catalog[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/businesses/${businessId}/qr-codes`, {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name")),
          targetType: "catalog",
          targetId: String(form.get("catalogId")),
          context: { table: String(form.get("table")) || undefined },
          style: {
            foreground: String(form.get("foreground")),
            background: "#FFFFFF",
            errorCorrection: "M",
          },
        }),
      });
      await onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create QR code",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog qr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-qr-title"
      >
        <header>
          <div>
            <h2 id="create-qr-title">Create a dynamic QR</h2>
            <p>The destination can change without reprinting.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>Name</span>
            <input name="name" required autoFocus placeholder="Table 12" />
          </label>
          <label>
            <span>Catalog</span>
            <select name="catalogId">
              {catalogs.map((catalog) => (
                <option key={catalog.id} value={catalog.id}>
                  {catalog.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              <span>Table (optional)</span>
              <input name="table" placeholder="12" />
            </label>
            <label>
              <span>Foreground</span>
              <input name="foreground" type="color" defaultValue="#14352B" />
            </label>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <button
              className="button button-secondary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create QR"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function CommandPalette({
  items,
  onClose,
  onNavigate,
}: {
  items: Item[];
  onClose: () => void;
  onNavigate: (key: NavKey) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      items
        .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5),
    [items, query],
  );
  return (
    <div
      className="dialog-backdrop command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <label>
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items or go to a workspace…"
          />
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </label>
        <div className="command-results">
          <small>Go to</small>
          {navigation
            .slice(0, 5)
            .filter((item) =>
              item.label.toLowerCase().includes(query.toLowerCase()),
            )
            .map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => onNavigate(key)}>
                <Icon />
                <span>{label}</span>
                <ArrowRight />
              </button>
            ))}
          {results.length ? (
            <>
              <small>Items</small>
              {results.map((item) => (
                <button key={item.id} onClick={() => onNavigate("items")}>
                  <Package />
                  <span>{item.name}</span>
                  <ArrowRight />
                </button>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

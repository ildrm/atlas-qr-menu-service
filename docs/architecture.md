# Architecture

## System shape

AtlasQR is a modular monolith with a separate asynchronous worker. This keeps tenant rules and publication transactions in one deployable API while allowing scan/analytics work to scale independently.

```text
Browser / QR scanner
        │
        ├── Next.js web (SSR public catalog, owner UI, PWA)
        │        │
        │        └── versioned JSON API
        │
        └── QR resolver ───────────────┐
                                      ▼
                             NestJS/Fastify API
                               │           │
                               │           └── Redis / BullMQ
                               ▼                    │
                           PostgreSQL               ▼
                          + DB outbox       background worker
```

## Workspace responsibilities

- `apps/web`: public and authenticated presentation, SSR metadata/structured data, client caching, local favorites, service worker.
- `apps/api`: session/authentication, permission enforcement, tenant-aware business/catalog/item/QR/public/analytics services, OpenAPI, health checks.
- `apps/worker`: leases durable outbox rows, writes normalized analytics/scan rows and marks delivery in one database transaction, retries transient failures, and dead-letters terminal failures.
- `packages/contracts`: Zod inputs, permission vocabulary, analytics allowlist, and shared public response types.
- `packages/database`: Drizzle schema, connection factory, migration runner, migrations, and idempotent seed.

## Request boundaries

Authenticated requests pass through:

1. request ID and security middleware;
2. opaque-session lookup by token hash;
3. CSRF/origin enforcement for state changes;
4. membership lookup for the route `businessId`;
5. named-permission evaluation;
6. tenant-scoped service query/mutation;
7. audit writes for privileged effects and outbox writes for supported asynchronous analytics/QR effects.

Public catalog queries start from public business and published catalog identity, then fetch only published child rows. QR resolution validates token format/hash, active/expiry state, published destination, branch ownership, and business visibility.

## Data and tenant isolation

The schema contains 38 tables. Tenant-owned tables include `business_id` directly or link through a constrained owner. Hot paths have compound business/status/slug indexes. Hardening migrations add cross-tenant integrity triggers and partial PostgreSQL row-level security policies based on `app.current_business_id`.

Application `businessId` predicates are the active tenant boundary. The API and worker do not yet set transaction-local tenant context, local development uses the owner role that bypasses RLS, and indirect/root tenant tables still need a complete restricted-role policy design. Restricted-role RLS integration and isolation tests are therefore production gates, not implemented defense in depth. Membership branch scopes are persisted and loaded but are likewise not enforced by every service.

## Publication and caching

Draft and public state are distinct. Publication runs in one database transaction, increments a revision, publishes eligible items, makes the business public, and writes an audit event. The public Next.js route uses a bounded 60-second revalidation window and identity tags. On-demand invalidation is not implemented; adding an authenticated invalidation consumer is future work.

## Analytics path

Public interactions are schema-validated and reference checked before insertion into the outbox. QR redirects enqueue scan intent before returning a 307. The worker normalizes these events into `analytics_events` and `qr_scans`; dashboards query seven-day persisted values. This keeps redirect/public response latency independent from downstream aggregation work.

## Extensibility

Business types supply terminology, while catalogs/categories/items remain universal. JSONB is used only for bounded extension surfaces such as semantic theme tokens, structured attributes, QR context/style, opening hours, provider configuration, and analytics properties. Query-critical ownership, state, money, time, and relationships remain typed columns.

Provider-backed modules—object storage, email, billing, custom domains, external AI/translation, telemetry exporters—have schema/config boundaries but are not represented as successful UI actions until an adapter is configured.

## Key tradeoffs

- Drizzle was selected over the original prompt’s Prisma default because it exposes SQL migrations and PostgreSQL/RLS behavior directly while preserving typed queries.
- A modular monolith was selected over microservices because publication and entitlement workflows are transactional and the current scale does not justify distributed consistency costs.
- REST and Zod were selected for a small, explicit client contract. OpenAPI provides discovery for other consumers.
- Opaque cookies were selected over browser-stored JWTs to make revocation and credential exposure boundaries straightforward.

# AtlasQR Master Implementation Prompt v2

This is an optimized, execution-ready successor to the attached 269-part prompt. It preserves the product intent while removing repeated role-play, resolving ambiguous requirements, defining system boundaries, adding measurable acceptance criteria, and separating core behavior from provider-backed extensions.

## 1. Mission

Build **AtlasQR**, a production-oriented, multi-tenant SaaS platform that lets any physical or service business create, publish, and measure multilingual QR-accessible content: menus, catalogs, price lists, service lists, packages, experiences, and location-specific offers.

The same product must work for cafés, restaurants, salons, clinics, hotels, retail showrooms, professional services, events, education, and future business types without duplicating the core data model.

Success means:

1. An owner can register, onboard a business, create a branch and catalog, add content, publish it, generate a dynamic QR code, and see real analytics.
2. A visitor can scan, immediately view the correct published catalog and context, search/filter, change language, use RTL layouts, inspect variants, favorite/share items, and recover gracefully when offline.
3. Tenant boundaries, permissions, publication state, limits, and auditability are enforced on the server and in the database—not merely hidden in the UI.
4. The repository can be installed, migrated, seeded, tested, built, and operated from documented commands.

## 2. Execution contract

Act as a senior cross-functional product engineering team. Make reasonable, documented assumptions. Prefer a complete vertical slice over disconnected scaffolding. Do not present static mockups, hardcoded metrics, nonfunctional buttons, silent failures, or `TODO` placeholders as finished features.

For each capability:

- define the user outcome and acceptance criteria;
- define the tenant ownership and authorization rule;
- model persistence and audit events;
- expose a validated API contract;
- implement loading, empty, success, error, and permission-denied states;
- add tests proportional to its risk;
- document external-provider dependencies and keep unavailable actions disabled or hidden.

Before completion, publish a traceability matrix with `Implemented`, `Foundation`, `Provider-gated`, or `Deferred` status. Never claim provider-backed behavior without a configured provider and an integration test.

## 3. Product principles

- Universal nouns in the domain (`catalog`, `category`, `item`) with business-type terminology at the presentation layer.
- One source of truth; public views never read draft content.
- Dynamic QR codes resolve through a secure indirection layer.
- Mobile-first public experience; efficient desktop owner workspace.
- Accessible and international by construction, including RTL and locale-aware money.
- Privacy-conscious analytics with data minimization and configurable retention.
- Entitlements are server-enforced policy, not scattered plan-name conditionals.
- No destructive tenant action without scope checks, confirmation, and an audit trail.

## 4. Required architecture

Use a pnpm/Turborepo monorepo:

```text
apps/web       Next.js App Router web and PWA
apps/api       NestJS REST API on Fastify
apps/worker    BullMQ/outbox background processing
packages/contracts  Zod request/response contracts and shared types
packages/database   Drizzle schema, migrations, seed, and DB helpers
```

Default stack:

- Node.js 22+, strict TypeScript, pnpm, Turborepo
- Next.js 16+, React 19+, Tailwind CSS, TanStack Query
- NestJS + Fastify + OpenAPI
- PostgreSQL + Drizzle ORM; Redis + BullMQ
- S3-compatible object storage; SMTP/email adapter; billing adapter
- Vitest, Playwright, ESLint, Prettier, CI

Architectural constraints:

- Layer HTTP, application/domain, persistence, and provider adapters.
- All tenant-owned rows carry or derive an immutable `business_id`.
- Use transactions for multi-row state transitions.
- Use an outbox for analytics, webhook, email, and other asynchronous side effects.
- Add request IDs, structured logs, health/readiness endpoints, and graceful shutdown.
- Avoid distributed services until independent scaling or failure isolation is justified.

## 5. Identity, tenancy, and authorization

Implement:

- email/password registration and login;
- Argon2id password hashing;
- opaque session tokens stored only as hashes;
- secure HttpOnly SameSite cookies, CSRF protection, rotation/revocation, expiry, logout;
- organizations containing one or more businesses;
- users with multiple business memberships;
- system and custom roles made of named permissions;
- optional branch scope per membership;
- invitations with expiry, single use, resend, revoke, and audit events;
- API keys with prefix display, one-time secret reveal, hashing, scopes, expiry, and revocation.

Every authenticated tenant route must derive the active business from a validated membership. Reject cross-tenant IDs even when the caller knows a valid UUID. Defense in depth should include tenant-aware queries, ownership constraints, and PostgreSQL RLS policies where practical.

## 6. Core domain

Model at minimum:

- users, sessions, organizations, business types, businesses;
- roles, memberships, invitations;
- branches and branch-local hours/contact/currency overrides;
- catalogs and catalog-to-branch assignments;
- categories with hierarchy and ordering;
- items with type, status, pricing, tax/display metadata, tags, badges, and media;
- translations for business/catalog/category/item/variant text;
- variants, option groups/options, attribute definitions/values;
- availability schedules and branch-level item overrides;
- media assets and derived variants;
- themes with versioned semantic tokens;
- campaigns and dynamic QR codes;
- scans, behavioral analytics, daily aggregates;
- plans, entitlements, subscriptions, usage counters;
- domains, webhooks, notifications, audit events, outbox events, feature flags.

Use integer minor units for money, ISO 4217 currency codes, IANA time zones, BCP 47 locales, UTC timestamps, UUID primary keys, normalized slugs, explicit status enums, and database uniqueness/index constraints.

Prevent category cycles and cross-business parent/category/catalog references.

## 7. Publication model

Content states: `draft`, `pending_review`, `scheduled`, `published`, `archived`.

Publishing must:

- validate required public fields and ownership;
- atomically update status, timestamp, and monotonically increasing revision;
- publish eligible children consistently;
- create an audit event and outbox event;
- invalidate public caches by catalog identity;
- never break an existing QR URL.

Public queries return only visible businesses, published catalogs/items, applicable branch assignments, and currently effective availability. Preview and draft access require explicit authenticated permission.

## 8. Owner experience

Required routes and flows:

- `/login`: register, sign in, remember-device option, accessible errors.
- `/onboarding`: business type, identity/location, catalog starter, publish-and-QR launch.
- `/dashboard`: real metrics, live catalog summary, seven-day activity, popular items, recent audit activity, public preview.
- Catalogs: list, create, status, counts, preview, publish.
- Items: search, create, price/media/category, availability toggle, variants.
- QR codes: create, list, context, active state, preview/export.
- Analytics: scans, catalog views, item opens, shares, trend chart.
- Appearance: load, preview, validate contrast, and persist semantic theme tokens.
- Team: tenant-scoped members, roles, status, branch scope; provider-gated invitations.
- Settings: business identity, locale, currency, branches, domains, billing boundaries.

Every screen must be responsive and keyboard usable, with meaningful empty/loading/error states. Destructive or provider-backed controls remain absent until functional.

## 9. Public catalog experience

Route: `/b/:businessSlug/:catalogSlug` with optional `branch`, `locale`, `qr`, `table`, `room`, and campaign context.

Implement:

- server-rendered public data, SEO metadata, canonical URL, Open Graph, and schema.org JSON-LD;
- business cover, name, branch, contact and directions;
- category tabs, global search, availability filter;
- item media, descriptions, badges, price/promotion, variants/options/attributes;
- item detail dialog/deep link;
- favorites in local storage and Web Share/clipboard fallback;
- language selection that fetches translated content;
- automatic RTL direction for RTL locales;
- branch/table/room context preservation;
- locale-aware money formatting;
- PWA manifest, service worker, cached shell/catalog, and truthful offline banner;
- anonymous, privacy-minimized analytics events.

Target WCAG 2.2 AA. Use semantic HTML, visible focus, adequate touch targets, reduced-motion support, alt text, live regions, and no color-only status communication.

## 10. QR system

- Generate at least 144 bits of random URL-safe token entropy.
- Store both a public token and its SHA-256 integrity hash; validate token shape before lookup.
- Resolve only active, nonexpired codes whose target is public and published.
- Support catalog target plus branch/campaign/table/room/locale context.
- Return a temporary redirect and a clear 404/unavailable response.
- Produce scalable SVG with configurable foreground/background/error correction and safe contrast.
- Record scan intent through the outbox so redirects remain fast.
- Permit future destination changes without changing the printed URL.

## 11. Analytics and privacy

Track a versioned allowlist such as catalog viewed, category viewed, item viewed, search, filter, share, favorite, language, branch, CTA, and QR scan.

- Validate referenced tenant entities and publication state.
- Hash/pseudonymize visitor/network identifiers with a rotating secret where needed.
- Never collect raw payment data or arbitrary client properties.
- Queue ingestion; make duplicate handling and retry behavior explicit.
- Provide retention, deletion/export boundaries, consent hooks, and bot/internal-traffic filters.
- Aggregate for dashboard queries and preserve raw events only as long as required.

## 12. Plans, billing, and limits

Represent plan capabilities as entitlement keys and typed values, including limits for businesses, branches, catalogs, items, QR codes, team members, languages, analytics, domains, and AI features.

Enforce limits in the service that creates the resource inside a race-safe transaction. Return a typed `LIMIT_REACHED` error with current usage and limit.

Billing must be an adapter with idempotent webhook processing, signed-event verification, event replay protection, subscription lifecycle mapping, audit history, and no client-trusted plan state. Until configured, billing actions are provider-gated.

## 13. Provider-backed extensions

Define explicit interfaces and safe states for:

- object storage upload/sign/transform/delete;
- SMTP or transactional email;
- billing checkout/portal/webhooks;
- custom-domain DNS verification and certificate lifecycle;
- external translation or AI content assistance;
- analytics/telemetry exporters.

Local development may use MinIO and Mailpit. Production credentials must be secret-managed. UI actions cannot imply success when a provider is absent.

## 14. API contract

- Versioned REST under `/api/v1`; QR resolver and health endpoints may be unversioned.
- Zod validation shared across client/server where useful.
- Consistent success envelope: `{ data, requestId }`.
- Consistent error envelope: `{ error: { code, message, fieldErrors?, requestId } }`.
- Correct 401/403/404/409/422/429 semantics without leaking cross-tenant existence.
- Cursor pagination for large lists; bounded filters/sorts; UTC ISO timestamps.
- OpenAPI docs generated from the live application.
- Idempotency keys for externally retried mutations and webhook ingestion.

## 15. Security baseline

- Threat-model identity, tenant isolation, QR enumeration, stored XSS, SSRF, upload abuse, webhook forgery, cache leakage, analytics poisoning, and privilege escalation.
- Helmet/CSP, restrictive CORS, secure cookie flags, origin/CSRF checks, rate limits, payload limits.
- Parameterized database access and strict server-side validation.
- Sanitize or prohibit arbitrary HTML; constrain external URLs and media types.
- Hash passwords, sessions, API keys, and invitation tokens with appropriate algorithms.
- Encrypt transport; use managed key/secret storage; rotate secrets.
- Audit privileged mutations without secrets or sensitive request bodies.
- Automated dependency, secret, static, and container scanning in release pipelines.

## 16. Reliability and operations

Targets for the initial production tier:

- public catalog availability: 99.9% monthly;
- API availability: 99.9% monthly;
- public catalog p95 server response under 500 ms at normal load;
- QR resolution p95 under 200 ms excluding client/network latency;
- error-rate alert above 1% for five minutes;
- restore test proving documented RPO/RTO before launch.

Provide liveness/readiness checks, structured logs with request IDs, metrics/traces hooks, background-job retry/dead-letter behavior, graceful shutdown, migration/rollback runbooks, database backups, and incident ownership.

## 17. Testing gates

Required:

- schema/contract unit tests;
- domain tests for publication, availability, entitlements, and tenant ownership;
- API integration tests with real PostgreSQL/Redis for critical flows;
- Playwright desktop and mobile tests for login, onboarding, dashboard, catalog search/filter/detail/favorite, QR resolution, locale/RTL, and permission boundaries;
- accessibility automation plus keyboard/manual checks;
- production builds and type checks for every workspace;
- migration-up test on a clean database;
- visual acceptance at the concept images’ native dimensions.

No flaky retries may hide a deterministic failure.

## 18. Seed acceptance scenario

Seed an idempotent demonstration with:

- owner `mina@atlasqr.local`;
- a café, **Brew & Bloom**, Downtown branch, published **All day menu**;
- Coffee, Drinks, Food categories and five illustrated items;
- English plus Persian/Arabic translations and RTL coverage;
- variants, attributes, theme, campaign, dynamic Table 12 QR;
- seven days of realistic analytics and audit history;
- a second non-food business (for example a salon) proving the universal model.

## 19. Required deliverables

- runnable monorepo and lockfile;
- environment template with no live secrets;
- Docker Compose for local dependencies;
- schema, generated migration, hardening migration, and seed;
- OpenAPI and endpoint guide;
- optimized design concepts and implementation screenshots;
- architecture, security, runbook, and traceability docs;
- CI workflow;
- test/build evidence and demo credentials;
- completion report listing deviations and provider-gated capabilities.

## 20. Definition of done

The task is done only when a clean checkout can install, start dependencies, migrate, seed, build, and run tests from documentation; the seeded owner can complete core flows against real persistence; the public catalog is accessible on desktop/mobile in LTR and RTL; QR resolution is dynamic and measured asynchronously; tenant access is enforced; and the final report distinguishes working behavior from foundations and external integrations.

# Requirements traceability

Status meanings:

- **Implemented**: working end-to-end behavior with persistence and verification.
- **Foundation**: schema/contracts/architecture exist, but the complete owner/provider workflow is not exposed.
- **Provider-gated**: deliberately unavailable until an external provider and credentials are configured.
- **Deferred**: not included in this release and not represented as complete.

The attached master prompt is intentionally broader than one safe release. This matrix prevents foundation code from being misrepresented as working product behavior.

## Product and experience

| Capability                                | Status                      | Evidence / boundary                                                                                |
| ----------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| Universal business types and terminology  | Implemented                 | `business_types` schema/seed; café and salon fixtures prove food and non-food use                  |
| Registration, login, logout, current user | Implemented                 | Auth API and `/login`; Argon2id and opaque sessions                                                |
| Guided onboarding                         | Implemented                 | Four-step `/onboarding` creates business, branch, catalog/category/item, publishes, and creates QR |
| Multi-business switcher                   | Implemented                 | Membership-backed `/businesses` list and dashboard selector                                        |
| Owner overview                            | Implemented                 | Persisted metrics, activity, popular items, audit activity, live catalog and public preview        |
| Catalog create/list/publish               | Implemented                 | Validated API, UI listing/preview/publish, transaction/revision/audit/outbox                       |
| Category create/list                      | Implemented                 | Validated tenant-scoped API; onboarding consumes it                                                |
| Item create/list/search/availability      | Implemented                 | Owner UI plus validated API and audit events                                                       |
| Variants                                  | Implemented                 | Schema, validated create API, public item detail display, seeded sizes                             |
| Option groups/options                     | Foundation                  | Tenant-aware schema exists; owner CRUD/detail rendering not yet exposed                            |
| Custom attribute definitions/values       | Foundation                  | Generic schema plus seeded salon duration proves model; owner CRUD not exposed                     |
| Category hierarchy/reordering             | Foundation                  | Parent/order model and hardening constraints; no drag/drop owner UI                                |
| Availability schedules/branch overrides   | Foundation                  | Full schema; immediate base availability toggle is implemented                                     |
| Draft/review/schedule/archive lifecycle   | Foundation                  | Enum/schema and public-state boundary; create/publish are exposed, review scheduler is not         |
| Localization and RTL                      | Implemented                 | Translation tables/public COALESCE, language refetch, Persian/Arabic seed, RTL browser test        |
| Translation management workspace          | Deferred                    | No owner translation editor/import/export in this release                                          |
| Theme preview and persistence             | Implemented                 | Tenant API/UI, version increment, audit record, server-side WCAG validation                        |
| Media library/upload/transforms           | Provider-gated              | Asset schema and generated local seed images exist; MinIO config only, no upload UI/API            |
| Team member read/RBAC enforcement         | Implemented                 | Tenant-scoped member API/UI and named permission guard                                             |
| Invitations/custom-role editor            | Provider-gated / Foundation | Invitation/role schema exists; email delivery and management UI are not enabled                    |
| Settings read view                        | Implemented                 | Business, slug, locale, currency, branches, current role                                           |
| Settings mutation/deletion/export         | Deferred                    | No destructive controls are shown                                                                  |

## Public catalog

| Capability                                  | Status      | Evidence / boundary                                                                |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| SSR public catalog and published-only reads | Implemented | Dynamic Next.js route and public API publication predicates                        |
| Branch/table/room/QR context                | Implemented | Public query, QR redirect parameters, visible context badge                        |
| Search/category/availability filters        | Implemented | Global case-insensitive search and responsive controls                             |
| Item detail, variants, pricing, badges      | Implemented | Accessible dialog, locale money, promotional price support                         |
| Favorites and share                         | Implemented | Local storage, Web Share with clipboard fallback, analytics                        |
| Language switching with translated data     | Implemented | Locale API refetch, translated content, `dir=rtl`                                  |
| Contact and directions                      | Implemented | `tel:` and maps link with analytics                                                |
| SEO/Open Graph/JSON-LD                      | Implemented | Server metadata and escaped LocalBusiness/OfferCatalog data                        |
| PWA and offline state                       | Implemented | Manifest, service worker, offline route, network-derived banner                    |
| Favorites-only view                         | Foundation  | Favorites persist and control is visible; dedicated list filtering is not complete |
| Live opening-hours calculation              | Deferred    | Hours are persisted; demo currently displays seeded presentation copy              |

## QR and analytics

| Capability                                  | Status      | Evidence / boundary                                                           |
| ------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Dynamic secure QR creation/list/export      | Implemented | 144-bit random token, SHA-256 check, SVG preview/export, plan limit           |
| Active/expiry/public destination validation | Implemented | Resolver guards and 307 redirect                                              |
| Branch/campaign/table/room/locale context   | Implemented | Stored context and branch-aware redirect; campaign schema/seed                |
| Destination editing and bulk templates      | Foundation  | Indirection and style JSON support future updates; edit/bulk UI not exposed   |
| Public behavioral analytics                 | Implemented | Allowlisted Zod ingestion, entity checks, outbox, worker, dashboard           |
| QR scan analytics                           | Implemented | Fast resolver outbox and worker-normalized `qr_scans`                         |
| Retention/consent/bot management UI         | Deferred    | Privacy boundary documented; operational policy/control plane not implemented |
| CSV/report export and funnels               | Deferred    | Current analytics screen provides seven-day core KPIs/trend                   |

## Platform, security, and operations

| Capability                           | Status                   | Evidence / boundary                                                             |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| Multi-tenant PostgreSQL model        | Implemented              | 38 tables, ownership FKs/indexes, RLS hardening migration                       |
| RBAC and branch scope model          | Implemented / Foundation | Named permissions enforced; branch scope persisted but not used by every route  |
| Plans and entitlement checks         | Implemented              | Plan/entitlement/subscription schema and server limits on core creates          |
| Billing checkout/portal/webhooks     | Provider-gated           | Subscription/webhook foundation; no billing provider is configured              |
| Custom domains/DNS/TLS               | Provider-gated           | Domain model exists; no DNS/certificate provider workflow                       |
| API keys/webhook delivery            | Foundation               | Secure-capable schema exists; issuance/signing/delivery APIs not enabled        |
| Notifications/email                  | Provider-gated           | Notification/invitation schema and Mailpit compose service; no provider adapter |
| Feature flags                        | Foundation               | Tenant/environment flag schema exists; no management UI                         |
| CSRF, CORS, CSP, Helmet, rate limits | Implemented              | API/web configuration and browser-compatible QR image policy                    |
| Audit trail and outbox               | Implemented              | Privileged mutations and background event pipeline                              |
| Health/readiness                     | Implemented              | Database and Redis readiness checks                                             |
| OpenAPI                              | Implemented              | Swagger UI from live Nest application                                           |
| Docker local dependencies            | Implemented              | PostgreSQL, Redis, MinIO, Mailpit Compose services                              |
| Application container images         | Deferred                 | Build/start commands and CI exist; production Dockerfiles are not included      |
| CI                                   | Implemented              | Install, typecheck, test, build, and Playwright workflow                        |
| Observability export/alerts          | Provider-gated           | Request IDs/health/OTel config boundary; no exporter/backend credentials        |
| Backups/restore/DR automation        | Provider-gated           | Runbook and production gate; infrastructure provider is not in repository scope |

## Verification evidence

- Contracts: Vitest schema tests.
- API: publication/availability/tenant domain-rule tests.
- TypeScript: contracts, database, API, worker, and web type checks.
- Builds: contracts/database/API/worker TypeScript builds and Next.js production build.
- Browser: ten Playwright tests across desktop/mobile for auth dashboard, team/theme persistence, contextual QR redirects, public interaction, and Persian RTL/translation.
- Runtime: PostgreSQL/Redis readiness, seeded authentication/business/dashboard/public-catalog requests, QR 307 resolution, and worker processing.
- Visual: generated concepts compared with live native-size screenshots through image inspection; see the fidelity ledger.

## Release boundary

This repository is a working core SaaS release, not a claim that every third-party or enterprise extension in the original 6,000-line prompt is live. Provider-gated and foundation rows are intentionally documented and do not expose false-success UI. The optimized prompt defines the acceptance gates for completing those subsequent releases.

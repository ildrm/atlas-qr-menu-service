# Engineering review report

Review date: 2026-08-29

## Review roles

The project scope and documentation require these complementary review roles:

1. Product requirements and traceability reviewer
2. Solution and domain architect
3. PostgreSQL, integrity, multitenancy, and RLS reviewer
4. Backend API and contract reviewer
5. Security and privacy reviewer
6. Asynchronous processing and reliability reviewer
7. Frontend, PWA, internationalization, and accessibility reviewer
8. QA and test-automation reviewer
9. CI, build, release, and SRE reviewer
10. UX and design-fidelity reviewer
11. Provider-integration boundary reviewer

## Problems corrected

| Area                     | Review finding                                                                                                              | Correction                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean-checkout CI        | Database lint imported `@atlas/contracts` from an unbuilt `dist` directory                                                  | Turbo lint, typecheck, test, dev, and seed tasks now build workspace dependencies first; the root commands are clean-checkout safe                                     |
| Test discovery           | Bare Vitest scripts in packages without unit suites failed with “no tests” and could discover browser tests                 | Only packages with maintained unit suites expose a unit-test task; browser tests remain under Playwright                                                               |
| Browser CI               | Playwright installation used the wrong package context, local fallback ports disagreed, and worker startup was not verified | Chromium installs through `@atlas/web`; ports are consistently 3000/4000, failure logs are retained, and a marked outbox event must produce a delivered analytics fact |
| Readiness                | Redis failure did not make the API unready and readiness still returned 200                                                 | PostgreSQL and Redis both gate readiness; dependency failure returns HTTP 503                                                                                          |
| Browser request security | Unsafe requests accepted a readable cookie fallback without exact-origin enforcement                                        | Unsafe authenticated requests require an explicit session-bound header and exact `WEB_ORIGIN`; optional shared-domain CSRF cookie support is documented                |
| Request/proxy hardening  | Request IDs were not tightly bounded and all proxies could be trusted                                                       | Request IDs are length/character bounded with UUID fallback; proxy hops are explicit configuration                                                                     |
| Tenant integrity         | Several cross-tenant relationships were application-only checks                                                             | Database triggers now protect membership roles, catalog branches, item hierarchy, QR references, analytics references, and QR scans; category cycles are rejected      |
| Catalog publication      | Publishing did not make a business public and allowed empty public catalogs                                                 | Publish is transactional, requires an item in a visible category, increments revision atomically, publishes eligible items, and enables business visibility            |
| Public catalog           | Branch assignments, hidden categories, suspension, and publication boundaries were incomplete                               | Public reads validate business/catalog state, assigned visible branches, visible categories, and tenant-correct overrides; unavailable catalogs return 404             |
| QR creation/resolution   | Unsupported targets and cross-tenant branch/campaign references were accepted or surfaced as 500s                           | Creation is limited to catalog targets, validates tenant assignments and campaign ownership, returns client-safe 404s, and preserves only validated context            |
| Anonymous analytics      | Entity-specific events could omit entity IDs and raw request attributes entered the asynchronous payload                    | Contracts require event-appropriate references; the service validates the published hierarchy and stores tenant/domain-scoped pseudonyms and coarse device/locale data |
| Entitlements             | Inactive/missing subscriptions or missing entitlement rows silently became unlimited                                        | Limits fail closed, malformed configuration returns a service error, counts are serialized, and unlimited plans require the explicit `"unlimited"` value               |
| Outbox reliability       | Rows had no durable lease/idempotent transaction and unsupported events could be silently acknowledged                      | Claims use leases, fact insertion and delivery marking share a transaction, failures retry/dead-letter, and unknown event types fail visibly                           |
| Public UX                | The favorites control did not filter and shared item hashes did not reopen details                                          | Favorites-only filtering, persisted favorite state, safe hash decoding, and direct item deep links are covered in the public browser scenario                          |
| Repository hygiene       | Local env files and migration line endings were insufficiently guarded                                                      | `.env*` is ignored except `.env.example`, production seeding is refused, and text/SQL line endings are pinned to LF                                                    |

## Explicit remaining production gates

These are documented boundaries, not claims of completed behavior:

- Complete restricted database roles and RLS policies for tenant-root and indirect tables, set `app.current_business_id` transaction-locally, and design the worker's controlled cross-tenant role. Application tenant predicates are the active boundary today.
- Enforce persisted membership branch scopes across every relevant list, mutation, catalog, item, QR, and reporting path.
- Add database-backed tenant-isolation, trigger, publication/concurrency, entitlement, QR-resolver, and worker lease/idempotency integration suites. Current API coverage is primarily unit/harness coverage.
- Add authenticated on-demand catalog cache invalidation if the bounded 60-second public revalidation window is insufficient.
- Provide dual-key session/CSRF secret rotation, distributed rate limiting, production access-log IP controls, dependency/SBOM/provenance scanning, immutable CI action/image pinning, backups/restore drills, and observability exporters.
- Configure and verify same-host routing or `CSRF_COOKIE_DOMAIN` for the production web/API topology.
- Keep storage, email, billing, custom-domain, webhook delivery, and external AI/translation behavior provider-gated until real adapters and credentials exist.

## Verification contract

The CI-equivalent order is:

```text
frozen install -> migrate -> format -> lint -> typecheck -> unit tests -> build
-> seed -> install Chromium -> start API/worker/web -> readiness -> Playwright
```

Use the root Turbo commands for clean-checkout checks. Direct filtered package lint/typecheck/seed commands may still expect prebuilt workspace `dist` artifacts and are not the supported CI entrypoints.

## Verification results

The reviewed workspace passed:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`: 5 contract tests and 26 API unit/harness tests
- `pnpm build`: contracts, database, API, worker, and Next.js production build
- `pnpm db:migrate` and an idempotent `pnpm db:seed` against local PostgreSQL 17
- API readiness with PostgreSQL and Redis both up, plus a live HTTP 200 `/docs` response with a Swagger-compatible non-production CSP
- `pnpm test:e2e`: five scenarios in desktop and mobile Chromium, 10/10 passed
- live worker processing: the post-browser-test outbox contained only delivered rows, with analytics and QR facts present; CI now repeats this with a uniquely marked smoke event

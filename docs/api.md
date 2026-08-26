# API guide

Base URL: `/api/v1`. Responses use `{ "data": ..., "requestId": "..." }`. Errors use `{ "error": { "code", "message", "fieldErrors?", "requestId" } }`.

Interactive OpenAPI is served from `/docs` by the running API.

## Authentication

| Method | Route            | Purpose                                 |
| ------ | ---------------- | --------------------------------------- |
| POST   | `/auth/register` | Create a user and opaque session        |
| POST   | `/auth/login`    | Verify credentials and create a session |
| GET    | `/auth/me`       | Return the current session user         |
| POST   | `/auth/logout`   | Revoke the current session              |

Authenticated browser requests use the HttpOnly session cookie. State-changing requests also send `x-csrf-token`, derived from the readable CSRF cookie by the web client. CORS only permits the configured web origin with credentials.

## Businesses and onboarding

| Method    | Route                               | Permission                          |
| --------- | ----------------------------------- | ----------------------------------- |
| GET       | `/business-types`                   | Public                              |
| GET       | `/businesses`                       | Authenticated membership list       |
| POST      | `/businesses`                       | Authenticated                       |
| GET       | `/businesses/:businessId/dashboard` | `business.read`                     |
| GET/POST  | `/businesses/:businessId/branches`  | `branch.read` / `branch.create`     |
| GET       | `/businesses/:businessId/team`      | `team.read`                         |
| GET/PATCH | `/businesses/:businessId/theme`     | `business.read` / `settings.manage` |

## Catalog content

| Method   | Route                                                 | Permission                         |
| -------- | ----------------------------------------------------- | ---------------------------------- |
| GET/POST | `/businesses/:businessId/catalogs`                    | `catalog.read` / `catalog.create`  |
| POST     | `/businesses/:businessId/catalogs/:catalogId/publish` | `catalog.publish`                  |
| GET/POST | `/businesses/:businessId/categories`                  | `catalog.read` / `category.manage` |
| GET/POST | `/businesses/:businessId/items`                       | `item.read` / `item.create`        |
| POST     | `/businesses/:businessId/variants`                    | `item.create`                      |
| PATCH    | `/businesses/:businessId/items/:itemId/availability`  | `item.update`                      |

Every service verifies both resource ID and `businessId`. Cross-tenant identifiers are returned as not found or rejected without exposing the other tenant.

## QR codes

| Method   | Route                                            | Purpose                                   |
| -------- | ------------------------------------------------ | ----------------------------------------- |
| GET/POST | `/businesses/:businessId/qr-codes`               | List/create dynamic codes                 |
| GET      | `/businesses/:businessId/qr-codes/:qrCodeId.svg` | Tenant-authorized scalable preview/export |
| GET      | `/q/:token`                                      | Public validated 307 resolver             |

Tokens are 24 URL-safe characters (144 random bits). The resolver preserves branch, locale, table, and room context and records scan intent through the outbox.

## Public catalog and analytics

| Method | Route                                                    | Purpose                                                    |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/public/businesses/:businessSlug/catalogs/:catalogSlug` | Published localized catalog; accepts `locale` and `branch` |
| POST   | `/public/analytics`                                      | Allowlisted, reference-validated anonymous event           |

Public endpoints return only visible businesses and published content. Price values are integer minor units at persistence boundaries and numbers in the public JSON contract.

## Health

- `GET /health/live`: process liveness.
- `GET /health/ready`: PostgreSQL and Redis dependency readiness.

## Example public request

```bash
curl 'http://localhost:4000/api/v1/public/businesses/brew-bloom/catalogs/all-day-menu?locale=fa&branch=downtown'
```

## Contract evolution

Additive response fields are permitted inside a version. Renames, removals, semantic changes, or enum narrowing require a new API version or a documented compatibility window. Update Zod schemas, OpenAPI, frontend types, tests, and this guide together.

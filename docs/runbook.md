# Operations runbook

## Local bootstrap

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres redis
pnpm db:migrate
pnpm format:check
pnpm db:seed
pnpm dev
```

MinIO and Mailpit are optional until storage/email adapters are enabled:

```bash
docker compose up -d minio mailpit
```

## Normal checks

```bash
docker compose ps
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

`/health/ready` must report both PostgreSQL and Redis as up. Liveness alone does not mean the service is ready for traffic.

## Database changes

1. Change `packages/database/src/schema.ts`.
2. Run `pnpm db:generate` and review the SQL.
3. Add explicit hardening SQL where the ORM cannot express an invariant or RLS policy.
4. Test `pnpm db:migrate` against a fresh database and a representative backup.
5. Back up production, run migration as a single release job, then deploy compatible code.

Migrations are forward-only. Roll back application code only when it is compatible with the migrated schema. For destructive schema changes, use expand/migrate/contract across separate releases.

## Seed behavior

`pnpm db:seed` is safe to rerun for stable fixtures and creates demo credentials listed in the README. The command programmatically refuses to run when `NODE_ENV=production` because it uses a known password and synthetic analytics.

## Outbox and worker

The worker polls unprocessed outbox rows and writes QR/analytics facts. If dashboards stop changing while the API remains healthy:

1. confirm the worker process is alive;
2. confirm Redis readiness;
3. query the count/age of `outbox_events.processed_at IS NULL`;
4. inspect the most recent worker error with its event ID/request context;
5. repair the dependency or poison event; for a reviewed `dead_letter` row, reset only that row to `pending`, clear `last_error`, and set `available_at = now()`;
6. verify the backlog drains and no duplicate facts were created.

Restarting the worker does not replay `dead_letter` rows. Never delete the outbox backlog as a first response. Preserve failed payloads for diagnosis and replay, and verify the selected event type is one of the supported `analytics.ingest` or `qr.scanned` handlers.

## QR incident

For a code that does not resolve:

- validate the 24-character token and use the resolver directly;
- check `active`, `expires_at`, target type/ID, business visibility, catalog publication, and branch ownership;
- confirm `PUBLIC_QR_BASE_URL` and `PUBLIC_WEB_BASE_URL` match the public deployment;
- use the request ID/log entry to distinguish not-found, target state, and dependency failures.

Deactivating a compromised QR is recoverable. Deleting printed-code records is not recommended; retain the record and return an explicit unavailable state.

## Public catalog incident

If owner data is correct but public content is stale, compare the catalog `published_revision` with the public response and wait through the current bounded 60-second Next.js revalidation window. There is no on-demand purge endpoint or `catalog.published` invalidation consumer in this release. Do not disable authorization or expose drafts to work around a cache problem.

## Backup and restore

Production baseline:

- encrypted continuous database backups plus daily snapshots;
- object-storage versioning/lifecycle policies after media is enabled;
- Redis treated as rebuildable, not the source of truth;
- quarterly restore exercise into an isolated environment;
- recorded RPO/RTO, restore duration, row counts, and application smoke-test result.

## Deployment checklist

- CI typecheck, lint, unit, build, and browser tests green.
- Migration reviewed and fresh/upgrade paths tested.
- Secrets and provider configuration present; demo credentials absent.
- Trusted proxy, TLS, secure cookies, CSP/CORS origins, and `CSRF_COOKIE_DOMAIN`/same-host topology verified.
- Restricted database role and RLS context validated.
- Readiness gates traffic; graceful shutdown drains requests/jobs.
- Metrics, logs, traces, alerts, backups, and rollback owner confirmed.
- Public catalog, QR redirect, sign-in, tenant boundary, publish, and analytics smoke tests pass.

## Incident priorities

1. Protect tenant confidentiality and stop unauthorized access.
2. Preserve evidence and durable data.
3. Restore QR/public catalog availability.
4. Restore owner mutations and background processing.
5. Communicate impact and record a blameless follow-up with concrete actions.

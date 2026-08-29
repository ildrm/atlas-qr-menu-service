# Security model

## Trust boundaries

- Public browsers and QR scanners are untrusted.
- Authenticated users may still be malicious or members of a different tenant.
- PostgreSQL and Redis are private infrastructure; only API/worker identities should connect.
- Email, storage, billing, DNS, and telemetry vendors are separate trust boundaries and remain disabled until configured.

## Implemented controls

### Identity and sessions

- Passwords use Argon2id with explicit memory/time/parallelism cost.
- Session secrets are random, stored in cookies, and persisted only as hashes.
- Cookies are HttpOnly, SameSite=Lax, scoped, expiring, and Secure in production.
- Logout revokes the server-side session.
- Authentication endpoints and the API are rate limited.
- Mutating cookie-authenticated requests require an explicit session-bound CSRF header and exact `Origin === WEB_ORIGIN`; the readable CSRF cookie alone is rejected.

### Tenant authorization

- Business routes load an active membership for the current user and route business.
- Named permissions are evaluated by a guard before controllers run.
- Service queries include `businessId` alongside resource IDs.
- Foreign ownership checks prevent cross-business catalog/item/QR relationships.
- PostgreSQL hardening adds tenant indexes and integrity triggers. RLS policies are partial schema foundations; runtime restricted-role enforcement is a production gate.
- Privileged mutations create audit records with actor, entity, action, request ID, timestamp, and bounded metadata.

### Public and QR boundaries

- Public content requires `business.public` and `catalog.status = published`; items also require published state.
- QR tokens contain 144 random bits, are shape checked, integrity checked with SHA-256, and require active/nonexpired state.
- QR context is built from allowlisted keys and branch ownership is verified.
- Analytics event names and property value types are allowlisted; referenced published entities are verified.
- The analytics path stores hashes/pseudonyms rather than raw visitor identity in reporting tables.

### Web and API hardening

- Helmet, restrictive CORS, CSP, frame denial, MIME sniffing prevention, referrer policy, and permissions policy.
- Zod validation for externally supplied bodies and strict TypeScript internally.
- Drizzle parameterizes SQL values; raw reporting SQL uses positional parameters.
- React escapes content and the product does not accept arbitrary public HTML.
- Public JSON-LD escapes `<` before script insertion.
- Request IDs are returned for incident correlation without exposing stack traces.

## Threat review

| Threat                   | Control                                                               | Residual work before internet production                                            |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Credential stuffing      | Argon2id, rate limiting, generic auth errors                          | Add breached-password check, MFA/passkeys, anomaly alerts                           |
| Session theft            | HttpOnly/Secure cookie, server revocation, CSP                        | Rotate on privilege change; device/session management UI                            |
| CSRF                     | SameSite cookie, explicit session-bound header, exact origin check    | Validate the production same-host/shared-cookie-domain topology in staging          |
| Cross-tenant IDOR        | membership guard, permission guard, ownership predicates, DB triggers | Complete restricted-role RLS and branch-scope enforcement; run isolation/fuzz tests |
| QR enumeration/tampering | high entropy, token regex, integrity hash, expiry/active checks       | Add abuse telemetry and optional signed campaign context                            |
| Stored XSS               | no arbitrary HTML, React escaping, CSP                                | Sanitize any future rich-text feature with an allowlist                             |
| SSRF                     | no generic fetch/import endpoint                                      | Add URL allowlist and egress controls before remote media import/webhooks           |
| Upload malware           | upload UI/API not enabled                                             | Enforce MIME sniffing, size/quota, AV scan, image re-encode, private staging bucket |
| Analytics poisoning      | event allowlist and entity checks                                     | Bot filtering, per-visitor quotas, replay/idempotency keys                          |
| Webhook forgery          | webhook schema only; delivery not enabled                             | Signed delivery/ingestion, timestamp tolerance, replay table                        |
| Cache leakage            | public cache only contains published content                          | Never cache authenticated responses; test surrogate-key isolation                   |
| Supply-chain compromise  | lockfile and CI checks                                                | Add SCA, provenance/SBOM, container signing, secret scanning                        |

## Secret handling

`.env.example` contains development placeholders only. Production must inject secrets from a managed secret store. The runtime currently accepts one session pepper and one CSRF secret, so non-disruptive dual-key rotation is still required work; an immediate cutover intentionally invalidates sessions. Fastify redacts authorization/cookie headers, response cookies, passwords, and tokens, and analytics/outbox records retain pseudonyms instead of raw IP/user-agent values. Explicit access-log IP redaction must be verified in the production logging stack.

## Data lifecycle

Before launch, define retention by data class: sessions, raw analytics, aggregated analytics, audit events, notifications, provider events, and deleted tenant backups. Implement verified export and deletion workflows, legal holds where applicable, and backup expiry. Audit events should be immutable to tenant users but still subject to documented legal/privacy policy.

## Production gate

Do not expose the deployment publicly until TLS, trusted-proxy configuration, a verified same-host or shared-domain CSRF topology, complete restricted database roles/RLS context, branch-scope enforcement, secret management/rotation, backups/restore tests, monitoring/alerting, email-domain controls, distributed rate-limit storage, dependency scanning, and a tenant-isolation integration suite are active.

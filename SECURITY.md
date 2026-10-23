# 🔒 Security Policy

This document describes the security controls of the **Learning Management
System API**, the deployment checklist, and the credential-rotation steps that
are required after the initial security review.

---

## 📌 Supported versions

| Version | Supported |
| --- | --- |
| `main` (latest) | ✅ |
| older commits / forks | ❌ — rebase on `main` before reporting |

---

## 🚨 Rotate the exposed credentials first

The original `.env` contained a **real MongoDB Atlas URI (username + password)**
and a **real `SECRET_JWT`**, and both were shared in plain text during the
security review. Treat them as compromised even though `.env` is git-ignored —
the project lives in a cloud-synced OneDrive folder.

1. **MongoDB Atlas**
   - Create a new database user (or change the password of the existing one).
   - Grant it only the roles it needs on the `lms_api` database
     (`readWrite` — not `Atlas admin`).
   - Restrict *Network Access* to the IPs that actually need it (never
     `0.0.0.0/0` in production).
   - Put the new connection string in `MONGODB_URI` (or `MONGODB_ATLAS`).
2. **JWT secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Paste the output into `SECRET_JWT`. Rotating the secret invalidates **every**
   token signed with the old one (all users have to log in again).
3. **Deployment environment** — update the secret store / dashboard variables of
   your host as well, then restart the service.
4. **Check the git history** — if `.env` was ever committed:
   ```bash
   git log --all -- .env
   git grep -n "mongodb+srv" $(git rev-list --all)
   ```
   Purge it from history (`git filter-repo` / BFG) and rotate again afterwards:
   history rewriting does not un-leak a secret.
5. **Do not keep secrets in a cloud-synced folder.** Move `.env` to an unsynced
   location (or a secret manager) and keep only `.env.example` in the repo.

> The demo seed password (`SEED_PASSWORD`) is **not** a production credential.
> Never create real accounts with it, and delete the demo accounts before going
> live.

---

## ✅ Production checklist

| Setting | Required value |
| --- | --- |
| `NODE_ENV` | `production` (enables fail-fast validation, generic 5xx, HTTPS redirect, safe logs, Swagger off) |
| `MONGODB_URI` / `MONGODB_ATLAS` | a least-privilege Atlas/local URI with a **new** password |
| `SECRET_JWT` | random, **≥ 32 characters**, not a placeholder (`change-me`, `secret`, …) |
| `JWT_EXPIRES_IN` | `2h` (default) or shorter — revocation is handled by `tokenVersion` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | keep the defaults (`lms-api` / `lms-client`) unless you change both sign **and** verify |
| `CORS_ORIGINS` | explicit `https://…` origins, comma separated — never `*` |
| `TRUST_PROXY` | number of proxy hops (`1` behind nginx/Render/Heroku, `0` when directly exposed) |
| `FORCE_HTTPS` | `true` when your own proxy terminates TLS but does not redirect; `false` on Render (its edge already redirects HTTP → HTTPS) |
| `ENABLE_SWAGGER` | `false` (leave unset) |
| `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` | tune to your traffic; defaults are `300` / `10` per 15 min per IP |
| `SEED_PASSWORD`, `SEED_ALLOW_REMOTE` | never set in production — `npm run seed` refuses to run there |
| `BCRYPT_SALT_ROUNDS` | `10`+ (raise it if login latency allows) |

Also: terminate TLS at the proxy, keep Node.js and dependencies patched
(`npm audit --omit=dev`), and run the database with authentication enabled.

---

## 🛡️ Implemented controls

### Authentication & sessions

- **Registration** always creates a `student`; roles can only be changed by an
  admin (`PATCH /api/users/:id`). No self-promotion.
- **Passwords** are hashed with **bcrypt** (`pre('save')` hook); the hash is
  `select: false` and never appears in responses.
- **JWT** is signed **and** verified with a pinned algorithm (`HS256`), plus
  `issuer` and `audience` claims. Tokens signed for another algorithm or service
  are rejected.
- **Revocation without a session store:** every token carries `tv`
  (`tokenVersion`). `POST /auth/logout`, `PATCH /auth/password` and
  `POST /auth/reset-password` increment the counter, so every previously issued
  token becomes invalid immediately — on all devices.
- `authenticate` reloads the user from MongoDB on every request, so deleted or
  deactivated accounts lose access even if their token has not expired.
- Login answers with a generic `Invalid email or password` (no account
  enumeration); a deactivated account is only revealed **after** the password
  was verified (`403`).

### Password policy

Defined once in `src/config/security.js` and enforced by the API validators and
the Mongoose schema:

- 10–72 characters (bcrypt truncates after 72 bytes)
- at least one lowercase letter, one uppercase letter and one digit
- applied to register, change password, reset password and admin user updates

### Password reset

- 32 random bytes (`crypto.randomBytes`) → 64 hex characters.
- Only the **SHA-256 hash** is stored (`passwordResetToken`), with a 15 minute
  `passwordResetExpires` TTL; the token is cleared after a successful reset
  (single use).
- Unknown, expired, already-used and deactivated accounts all return the same
  `400 Invalid or expired password reset token`.
- `POST /auth/forgot-password` always returns the same `200` message.
- **Development only:** the raw token is included in the response so the flow is
  testable. In production it is never returned or logged — configure an email
  provider to deliver it.

### Authorization

Route-level RBAC (`authorize('teacher','admin')`) plus ownership checks
(`assertCanManageCourse`) and enrollment checks for lesson content, progress and
reviews.


### Transport & headers

- **helmet** sets CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, …
  `X-Powered-By` is disabled.
- **CORS** uses an explicit allow-list (`CORS_ORIGINS`); requests without an
  `Origin` header (curl, mobile, server-to-server) are allowed, but browser
  origins must match. `credentials` is **off** — authentication uses the
  `Authorization` header, not cookies, so there is no CSRF surface.
- **HTTPS:** in production `forceHttps` redirects plain HTTP with `308`
  (keeping method and body), honouring `X-Forwarded-Proto` when `TRUST_PROXY` is
  configured. Disable deliberately with `FORCE_HTTPS=false`.
- Request bodies are capped at **1 MB** (`express.json` / `urlencoded`).

### Input & NoSQL-injection defence

- `app.set('query parser', 'simple')` and `express.urlencoded({ extended: false })`
  prevent `?filter[$ne]=…` from becoming an object.
- `sanitizeRequest` removes keys starting with `$` and keys containing `.` from
  `body`, `query` and `params` (defence in depth; every route is also validated
  with express-validator).
- ObjectId casts, Mongoose validation and duplicate keys are mapped to `400`,
  `422` and `409` without echoing attacker-controlled values.

### Rate limiting

| Limiter | Default | Applies to |
| --- | --- | --- |
| `apiLimiter` | 300 requests / 15 min / IP | every `/api` route |
| `authLimiter` | 10 **failed** requests / 15 min / IP | register, login, change password, forgot password, reset password |

Successful logins are not counted (`skipSuccessfulRequests`), so normal users are
never locked out by their own activity. Limiters return `429` with a JSON body and
the standard `RateLimit` headers.

> ⚠️ The store is **in-memory**, i.e. per Node.js process. Behind multiple
> instances/replicas, use a shared store (`rate-limit-redis`) so the limits apply
> across the fleet.

### Error handling & logging

- Unexpected 5xx errors return a **generic message** in production
  (`Something went wrong on the server…`); messages and stack traces are never
  sent to clients there.
- `CastError` no longer echoes the offending value; JWT failures are `401`;
  MongoDB outages are `503`.
- morgan logs the **path without the query string** (no tokens, emails or search
  terms), and 5xx errors are logged with a stack trace server-side only.
- Swagger UI is **not mounted in production** unless `ENABLE_SWAGGER=true`; its
  relaxed CSP applies only to `/api-docs`.

### Operational guards

- `validateEnv()` runs at boot: in production a missing MongoDB URI, a missing
  `SECRET_JWT`, a placeholder secret or a secret shorter than 32 characters is
  **fatal**. Missing `TRUST_PROXY` / `CORS_ORIGINS` produce loud warnings.
- `npm run seed` refuses `NODE_ENV=production`, refuses a non-local MongoDB
  unless `SEED_ALLOW_REMOTE=true`, requires a password of at least 10 characters
  and no longer contains a hardcoded password (random when `SEED_PASSWORD` is
  unset).
- `.env` is git-ignored; `.env.example` documents every variable.

### Render deployment notes

- [`render.yaml`](render.yaml) contains **no secrets**: `MONGODB_URI` and
  `SECRET_JWT` use `sync: false` and are entered in the Render dashboard.
- Render sets `NODE_ENV=production` and `PORT` automatically. Keep
  `TRUST_PROXY=1` so `req.ip` and the rate limiter see the real client IP, and
  leave `FORCE_HTTPS=false` because Render's edge redirects HTTP → HTTPS and
  terminates TLS before forwarding the request.
- `API_BASE_URL` defaults to Render's `RENDER_EXTERNAL_URL`, so the CORS
  allow-list automatically contains the service's own public origin.
- Render **Free** egress IPs are dynamic: Atlas must allow `0.0.0.0/0`, or use
  dedicated outbound IPs on a paid plan and allow only those. Use a dedicated,
  least-privilege Atlas user for the database.
- Free web services sleep after 15 minutes without traffic (cold start ≈ 30–60 s);
  the API itself is stateless and stores everything in MongoDB.
- `npm run seed` refuses to run in production — create the first admin by
  registering a user and promoting `role` to `admin` in Atlas.
- Rotating `SECRET_JWT` invalidates every issued token. Do it deliberately,
  then restart/redeploy the service.

---


## ⚠️ Known limitations / accepted risks

- **No e-mail provider** — password-reset tokens are generated but not delivered
  in production. Wire up SES/SendGrid/etc. before relying on the flow.
- **No refresh tokens** — access tokens live 2 hours; users log in again after
  expiry. Revocation is immediate via `tokenVersion`.
- **In-memory rate limiting** — see the note above.
- **bcryptjs** is pure JavaScript and slower than native `bcrypt`; cost 10 is a
  deliberate trade-off (raise it if login latency allows).
- **The seed creates demo accounts** if someone runs it against a shared
  database. Delete them (`admin@lms.dev`, `teacher@lms.dev`, `student@lms.dev`,
  `nina@lms.dev`) before going live.
- **No audit log** of security-relevant events yet (login, role changes,
  deletions); only HTTP access logs exist.
- Security headers are only as good as the TLS setup in front of the API — the
  app assumes a correctly configured reverse proxy.

---

## 🧪 Verifying the controls

```bash
# unit/integration tests (auth flows include revocation + reset-token replay)
npm test

# exercise the rate limiter as well
$env:RATE_LIMIT_ENABLED="true"; npx vitest run tests/auth.test.js

# dependency vulnerabilities (production tree)
npm audit --omit=dev
```

---

## 📬 Reporting a vulnerability

Please **do not open a public issue**. Use the repository's private security
advisory or contact the maintainer directly with:

- a description of the issue and its impact,
- reproduction steps (request, payload, headers),
- the affected version/commit.

You can expect an acknowledgement within a few days. Please give us a reasonable
window to release a fix before public disclosure.


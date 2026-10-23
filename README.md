# 🎓 Learning Management System API

A complete **REST API for a Learning Management System** built with **Node.js / Express.js**, **MongoDB / Mongoose** and **JWT authentication**, fully tested with **Vitest + Supertest** and documented with **Swagger (OpenAPI 3)**.

```text
Teacher → create course → sections → lessons → publish
                                              ↓
Student → finds course → enrolls → studies lessons → completes them
                                              ↓
                                    progress % grows → course completed
                                              ↓
                                        writes a review ⭐ (1-5)
```

---

## 📋 Table of contents

- [Features](#-features)
- [Tech stack](#-tech-stack)
- [Getting started](#-getting-started)
- [Environment variables](#-environment-variables)
- [Project structure](#-project-structure)
- [Roles & permissions](#-roles--permissions)
- [Business rules](#-business-rules)
- [API reference](#-api-reference)
- [Authorization pipeline](#-authorization-pipeline)
- [Security hardening](#-security-hardening)
- [Testing](#-testing)
- [Mongoose concepts used](#-mongoose-concepts-used)
- [What this project practises](#-what-this-project-practises)
- [Troubleshooting](#-troubleshooting)
- [Possible next steps](#-possible-next-steps-advanced-features)
- [Swagger / OpenAPI](#-swagger--openapi)

---

## ✨ Features

| Area | What is implemented |
| --- | --- |
| 🔐 **Auth** | register (always `student`), login, **logout with token revocation**, **change password**, **forgot / reset password** (single-use SHA-256 hashed tokens), bcrypt hashing, JWT bearer tokens (pinned HS256 + issuer/audience), deactivated accounts refused |
| 🛡️ **Security** | per-IP rate limiting (global + stricter auth), CORS origin allow-list, NoSQL-injection sanitisation, strong password policy, generic 5xx messages, HTTPS redirect + `trust proxy` support, Swagger disabled in production by default |
| 👤 **Users** | admin-only CRUD, role changes, activate/deactivate, guarded self-modification, cascading delete |
| 📂 **Categories** | public read, admin write, duplicate protection, **cannot delete a category that still has courses**, `courseCount` per category (aggregation) |
| 📚 **Courses** | CRUD with **ownership checks**, `draft → published → archived`, search, category/level/price filters, 6 sort modes, pagination, rating + reviewCount, course statistics |
| 📖 **Sections** | CRUD under a course, automatic `order`, nested read with its lessons |
| 📝 **Lessons** | CRUD under a section, automatic `order`, **content gating** (lesson bodies only for enrolled students / the owner / admins) |
| 🎓 **Enrollments** | 4 business rules enforced, my courses, course students, cancel + reactivate |
| ✅ **Progress** | per-lesson completion, live percentage, automatic `completed` status + `completedAt`, per-lesson breakdown, teacher can inspect their students |
| ⭐ **Reviews** | one review per student per course, rating 1-5, average rating & distribution via **aggregation** |
| 📊 **Dashboards** | student / teacher / admin statistics built with `$facet`, `$group`, `$lookup`, `distinct` |
| 🧪 **Tests** | 100+ integration tests (Vitest + Supertest) against a real MongoDB test database |
| 📖 **Docs** | full Swagger UI with a `bearerAuth` scheme so every protected route can be tested in the browser |
| 🌱 **Seed** | `npm run seed` creates demo admin/teacher/student accounts (password from `SEED_PASSWORD`, random when unset) + a published course with sections, lessons, enrollment, progress and a review. Refuses to run in production or against a remote database unless explicitly allowed |

---

## 🧰 Tech stack

- **Node.js** ≥ 18 (developed on Node 24) — CommonJS (`require`)
- **Express 4** — routing, middleware pipeline
- **MongoDB Atlas** + **Mongoose 8** — schemas, indexes, populate, aggregation
- **jsonwebtoken** + **bcryptjs** — authentication and hashing
- **express-validator** — request validation (422 responses)
- **Swagger** (`swagger-jsdoc` + `swagger-ui-express`) — OpenAPI 3 documentation
- **Vitest + Supertest** — integration testing
- **helmet**, **cors**, **express-rate-limit**, **morgan** — security headers, CORS allow-list, rate limiting, request logging

---

## 🚀 Getting started

```bash
# 1. install the dependencies
npm install

# 2. create your environment file
cp .env.example .env      # then edit the MongoDB URI + JWT secret

# 3. (optional) fill the database with demo data
$env:SEED_PASSWORD="ChooseAStrongOne1"   # optional — a random one is generated otherwise
npm run seed
#    → admin@lms.dev / teacher@lms.dev / student@lms.dev
#      (the password is the one printed by the script: SEED_PASSWORD or a random value)

# 4. start the API
npm run dev               # nodemon, or: npm start
```

| URL | Description |
| --- | --- |
| `http://localhost:4000/` | API landing page (quick endpoint list) |
| `http://localhost:4000/health` | health check incl. the database state |
| `http://localhost:4000/api-docs` | **Swagger UI** (all endpoints, try them out) |

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | start the API |
| `npm run dev` | start the API with nodemon (auto restart) |
| `npm test` | run the whole Vitest/Supertest suite |
| `npm run test:watch` | tests in watch mode |
| `npm run seed` | insert the demo data |

---

## 🔑 Environment variables

```ini
NODE_ENV=development
PORT1=4000                 # main API port (PORT is also supported and wins over PORT1)
PORT2=5000                 # kept as a spare port (2nd instance)
API_BASE_URL=http://localhost:4000

MONGODB_ATLAS=mongodb+srv://user:pass@cluster/?appName=App   # used when MONGODB_URI is empty
MONGODB_URI=mongodb+srv://user:pass@cluster/?appName=App     # wins over MONGODB_ATLAS
DB_NAME=lms_api            # database used by the API
DB_NAME_TEST=lms_api_test  # ⚠️ the test suite uses this one (never your dev data)

# 💡 Optional: run the test suite against a LOCAL mongod → the whole suite in ~20s
#    (instead of several minutes over the network). Comment it out to use Atlas.
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/lms_api_test

# ── 🔐 JWT ────────────────────────────────────────────────────────────────────
# Generate a secret with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
SECRET_JWT=replace-with-a-random-64-char-secret   # required (min 32 chars in production)
JWT_EXPIRES_IN=2h          # short-lived tokens; logout/password change revoke them
JWT_ISSUER=lms-api
JWT_AUDIENCE=lms-client
BCRYPT_SALT_ROUNDS=10

# ── 🌍 HTTP / proxy ───────────────────────────────────────────────────────────
# Comma-separated list of browser origins allowed to call the API.
# Empty in development → every origin is allowed; required in production.
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
TRUST_PROXY=0              # 1 behind nginx/Render/Heroku, 0 when directly exposed
FORCE_HTTPS=false          # true → redirect http:// to https:// (use behind a TLS proxy)

# ── 🚦 Rate limiting (optional, sensible defaults) ────────────────────────────
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX=300            # requests / window / IP for the whole API
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10        # failed login/register/reset attempts / window / IP
# RATE_LIMIT_ENABLED=true     # uncomment to exercise the limiter in the test suite

# ── 📖 Swagger ───────────────────────────────────────────────────────────────
ENABLE_SWAGGER=false       # docs are always on outside production; opt-in inside production

# ── 🌱 Demo seed (`npm run seed`) ─────────────────────────────────────────────
SEED_PASSWORD=             # leave empty for a random strong password printed once
SEED_ALLOW_REMOTE=false    # must be true to seed a non-local MongoDB
# SEED_DB_NAME=lms_demo    # seed a throwaway database instead of DB_NAME
```

---

## 📁 Project structure

```text
LearningManagementSystemNodejs/
├── src/
│   ├── config/
│   │   ├── db.js                 # Mongoose connection (dev / test database)
│   │   ├── env.js                # fail-fast environment validation
│   │   ├── cors.js               # CORS origin allow-list
│   │   └── security.js           # password policy + token lifetime constants
│   ├── controllers/              # one file per resource (business logic)
│   │   ├── auth.controller.js  user.controller.js  category.controller.js
│   │   ├── course.controller.js  section.controller.js  lesson.controller.js
│   │   └── enrollment.controller.js  progress.controller.js
│   │       review.controller.js  dashboard.controller.js
│   ├── models/                   # 8 Mongoose models (+ indexes, virtuals, statics)
│   │   ├── User.js  Category.js  Course.js  Section.js
│   │   └── Lesson.js  Enrollment.js  Progress.js  Review.js
│   ├── routes/                   # routers + Swagger `@openapi` comments
│   │   ├── auth.routes.js  user.routes.js  category.routes.js  course.routes.js
│   │   ├── section.routes.js  lesson.routes.js  enrollment.routes.js
│   │   └── progress.routes.js  review.routes.js  dashboard.routes.js
│   ├── middleware/
│   │   ├── authenticate.js       # JWT → req.user (+ authenticateOptional, tokenVersion check)
│   │   ├── authorize.js          # role based access control
│   │   ├── validate.js           # express-validator → 422
│   │   ├── rateLimit.js          # global + auth rate limiters
│   │   ├── sanitize.js           # strips $ / dotted keys from user input (NoSQL injection)
│   │   ├── forceHttps.js         # http → https redirect (FORCE_HTTPS)
│   │   ├── notFound.js           # 404 for unknown routes
│   │   └── errorHandler.js       # ⚠️ single place where errors become responses
│   ├── validators/
│   │   ├── auth.validator.js  user.validator.js  category.validator.js
│   │   ├── course.validator.js  section.validator.js
│   │   ├── lesson.validator.js  review.validator.js
│   │   └── password.js            # shared password-policy rule (validator + schema)
│   ├── utils/
│   │   ├── ApiError.js           # one error class for the whole API
│   │   ├── asyncHandler.js       # async controllers without try/catch
│   │   ├── generateToken.js      # JWT sign/verify helpers
│   │   ├── access.js             # 404 lookups + ownership + enrollment helpers
│   │   ├── progress.js           # progress % + enrollment sync (core LMS logic)
│   │   ├── resetToken.js         # SHA-256 hashed, single-use password reset tokens
│   │   └── cascade.js            # deleting a document deletes its children
│   ├── docs/
│   │   └── swagger.js            # OpenAPI 3 definition + reusable schemas
│   └── seed/
│       └── seed.js               # `npm run seed` demo data
├── tests/                        # Vitest + Supertest integration tests
│   ├── setup.js  helpers.js
│   └── auth / category / course / section-lesson / enrollment
│       progress / review / dashboard .test.js
├── .env  .env.example  .gitignore
├── server.js                     # express app + bootstrap (exports `app` for tests)
├── package.json
├── SECURITY.md                   # threat model, hardening checklist, credential rotation
└── README.md
```

---

## 👥 Roles & permissions

| Endpoint | Anonymous | Student | Teacher | Admin |
| --- | --- | --- | --- | --- |
| `GET /api/courses`, `/courses/:id`, `/categories`, `/sections`, `/lessons`, `/reviews` | ✅ (published only) | ✅ | ✅ | ✅ |
| `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/auth/me`, `POST /api/auth/logout`, `PATCH /api/auth/password` | ❌ 401 | ✅ | ✅ | ✅ |
| `POST/PATCH/DELETE /api/categories` | ❌ | ❌ 403 | ❌ 403 | ✅ |
| `POST /api/courses` | ❌ | ❌ 403 | ✅ | ✅ (any instructor) |
| `PATCH/DELETE /api/courses/:id` | ❌ | ❌ 403 | ✅ **own** | ✅ any |
| `POST /api/courses/:courseId/sections` · `PATCH/DELETE /api/sections/:id` | ❌ | ❌ 403 | ✅ **own course** | ✅ any |
| `POST /api/sections/:sectionId/lessons` · `PATCH/DELETE /api/lessons/:id` | ❌ | ❌ 403 | ✅ **own course** | ✅ any |
| `POST /api/lessons/:lessonId/complete` | ❌ | ✅ **if enrolled** | ❌ 403 | ❌ 403 |
| `POST /api/courses/:courseId/enroll` | ❌ | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/enrollments/me` | ❌ | ✅ | ✅ (empty) | ✅ (empty) |
| `GET /api/courses/:courseId/students` | ❌ | ❌ 403 | ✅ **own course** | ✅ any |
| `GET /api/courses/:courseId/progress` | ❌ | ✅ own | ✅ own course (`?studentId`) | ✅ any |
| `POST /api/courses/:courseId/reviews` | ❌ | ✅ **if enrolled** | ❌ 403 | ❌ 403 |
| `PATCH/DELETE /api/reviews/:id` | ❌ | ✅ own | ❌ 403 | ✅ any (moderation) |
| `GET /api/dashboard/student` | ❌ | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/dashboard/teacher` | ❌ | ❌ 403 | ✅ | ✅ (whole platform) |
| `GET /api/dashboard/admin` | ❌ | ❌ 403 | ❌ 403 | ✅ |
| `GET/PATCH/DELETE /api/users*` | ❌ | ❌ 403 | ❌ 403 | ✅ |

---

## 🧠 Business rules

**Enrollment**

1. a student cannot enroll twice in the same course → `409`
2. only `published` courses can be joined (draft/archived → `400`)
3. the instructor cannot enroll in their own course → `403`
4. only students can enroll (teacher/admin → `403`)
5. cancelling keeps the row as `cancelled`; enrolling again **reactivates** it

**Progress**

1. only enrolled students can complete a lesson (`403` otherwise)
2. a lesson can only be completed once → `409` (unique index `{student, course, lesson}`)
3. `progress = completedLessons / totalLessons`, rounded to a percentage
4. when every lesson is done the enrollment becomes `completed` and gets `completedAt`
5. deleting a lesson also deletes its progress rows → percentages stay honest

**Reviews**

1. must be enrolled (active or completed) → otherwise `403`
2. one review per student per course → `409` (unique index `{student, course}`)
3. rating must be an integer between 1 and 5 → `422`
4. the average rating is always **derived** with an aggregation (never stored → never stale)

**Courses & categories**

1. a category has to be empty before it can be deleted → `409`
2. `draft`/`archived` courses are only visible to their owner and admins → `403`
3. only the owner (or an admin) can modify/delete a course and everything below it
4. deleting a course cascades to sections, lessons, enrollments, progress and reviews
5. lesson **bodies** are only returned to the owner, admins and enrolled students
   (everybody else receives titles only — see `hasAccessToContent` in the response)

---

## 🗺️ API reference

```text
AUTH
──────────────────────────────────────────────
POST   /api/auth/register                  public   → creates a STUDENT + JWT
POST   /api/auth/login                     public   → JWT (rate limited)
POST   /api/auth/logout                    private  → revokes all current tokens
GET    /api/auth/me                        private  → current user
PATCH  /api/auth/password                  private  → change password (revokes tokens)
POST   /api/auth/forgot-password           public   → reset link (rate limited, no enumeration)
POST   /api/auth/reset-password            public   → new password from a single-use token

USERS (admin only)
──────────────────────────────────────────────
GET    /api/users                          ?role&isActive&search&sort&page&limit
GET    /api/users/:id
PATCH  /api/users/:id                      name, email, role, isActive, avatar
DELETE /api/users/:id                      cascades to their courses/data

CATEGORIES
──────────────────────────────────────────────
POST   /api/categories                     admin
GET    /api/categories                     public   (+ courseCount)
GET    /api/categories/:id                 public
PATCH  /api/categories/:id                 admin
DELETE /api/categories/:id                 admin    (409 if courses exist)

COURSES
──────────────────────────────────────────────
POST   /api/courses                        teacher | admin
GET    /api/courses                        public   search/filter/sort/pagination
GET    /api/courses/:id                    public   (403 for drafts you don't own)
PATCH  /api/courses/:id                    owner | admin
DELETE /api/courses/:id                    owner | admin (cascading)

SECTIONS
──────────────────────────────────────────────
POST   /api/courses/:courseId/sections     owner | admin
GET    /api/courses/:courseId/sections     public   (sections + lessons)
GET    /api/sections/:id                   public
PATCH  /api/sections/:id                   owner | admin
DELETE /api/sections/:id                   owner | admin (cascading)

LESSONS
──────────────────────────────────────────────
POST   /api/sections/:sectionId/lessons    owner | admin
GET    /api/sections/:sectionId/lessons    public   (content gated)
GET    /api/lessons/:id                    public   (content gated)
PATCH  /api/lessons/:id                    owner | admin
DELETE /api/lessons/:id                    owner | admin (cascading)
POST   /api/lessons/:lessonId/complete     student enrolled ⭐

ENROLLMENTS
──────────────────────────────────────────────
POST   /api/courses/:courseId/enroll       student
GET    /api/enrollments/me                  student (with progress %)
GET    /api/courses/:courseId/students      owner | admin (+ progress %)
DELETE /api/courses/:courseId/enroll        student (?studentId for owner/admin)

PROGRESS
──────────────────────────────────────────────
GET    /api/courses/:courseId/progress      student own (?studentId for owner/admin, ?details=true)

REVIEWS
──────────────────────────────────────────────
POST   /api/courses/:courseId/reviews       student enrolled
GET    /api/courses/:courseId/reviews       public (reviews + summary + distribution)
PATCH  /api/reviews/:id                     author | admin
DELETE /api/reviews/:id                     author | admin

DASHBOARD
──────────────────────────────────────────────
GET    /api/dashboard/student               student
GET    /api/dashboard/teacher               teacher | admin
GET    /api/dashboard/admin                 admin
```

### Query parameters of `GET /api/courses`

| Parameter | Example | Description |
| --- | --- | --- |
| `search` | `?search=node` | case-insensitive match on title **and** description |
| `category` | `?category=<id>` | category id |
| `instructor` | `?instructor=<id>` | teacher id |
| `level` | `?level=beginner` | `beginner` \| `intermediate` \| `advanced` |
| `price` | `?price=20` | exact price |
| `price_from` / `price_to` | `?price_from=10&price_to=50` | price range |
| `status` | `?status=draft` | teacher/admin only (a teacher only sees their own drafts) |
| `sort` | `?sort=price_asc` | `newest`, `oldest`, `price_asc`, `price_desc`, `title_asc`, `title_desc` |
| `page` / `limit` | `?page=2&limit=10` | pagination (limit is capped at 100) |

Example response envelope:

```json
{
  "success": true,
  "count": 10,
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "hasNextPage": true,
  "data": [
    {
      "title": "Node.js REST API",
      "rating": 4.5,
      "reviewCount": 125,
      "instructor": { "name": "Tom Teacher" },
      "category": { "name": "Web Development" }
    }
  ]
}
```

### Error envelope

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "price", "message": "Price must be a number greater than or equal to 0" }]
}
```

| Status | When |
| --- | --- |
| `400` | malformed input (broken JSON, `price_from > price_to`, enrolling in a non-published course) |
| `401` | missing / invalid / expired token, wrong credentials |
| `403` | wrong role, not the owner, not enrolled, deactivated account |
| `404` | unknown resource or route |
| `409` | duplicate email / enrollment / review, non-empty category |
| `413` | payload too large |
| `422` | express-validator or Mongoose validation failure |
| `500` | unexpected bug (stack trace only in development) |

---

## 🛡️ Authorization pipeline

Every protected request walks through the same four steps — that is the backbone
of the API:

```text
authenticate          →  authorize('teacher','admin')  →  resource ownership        →  controller
(who are you?)           (may you use this route?)        (do you own THIS document?)
JWT → User (401)         403 on wrong role                assertCanManageCourse()  →  403
```

* **`authenticate`** verifies the JWT **and re-loads the user** from MongoDB —
  so deleting or deactivating an account invalidates existing tokens.
* **`authorize(...roles)`** is a route-level guard (`src/middleware/authorize.js`).
* **Ownership** cannot be checked in middleware (it needs a database read), so
  `src/utils/access.js` exposes `assertCanManageCourse(user, course)` and the
  controllers call it. That is why *Teacher B* editing *Teacher A*'s course gets
  **403** while an admin passes.

```js
// src/controllers/course.controller.js
const updateCourse = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.id, { populate: false }); // → 404
  assertCanManageCourse(req.user, course);                                  // → 403
  ...
});
```

---

## 🔒 Security hardening

The controls below are implemented in code; the full threat model, deployment
checklist and **credential rotation instructions** live in [`SECURITY.md`](SECURITY.md).

| Control | Where |
| --- | --- |
| Security headers (`helmet`, HSTS, no `X-Powered-By`) | `server.js` |
| CORS **origin allow-list** (`CORS_ORIGINS`, no `*` with credentials) | `src/config/cors.js` |
| Rate limiting — 300 req/15 min per IP on `/api`, 10 failed auth attempts per IP | `src/middleware/rateLimit.js` |
| Body size cap (1 MB) + `simple` query parser + `$`/dot-key sanitisation | `server.js`, `src/middleware/sanitize.js` |
| Password policy (10–72 chars, upper/lower/digit) enforced by validator **and** schema | `src/config/security.js`, `src/models/User.js` |
| bcrypt hashing (`BCRYPT_SALT_ROUNDS`, default 10) | `src/models/User.js` |
| JWT pinned to **HS256** with `issuer` + `audience`, 2 h lifetime | `src/utils/generateToken.js` |
| **Token revocation** via `tokenVersion` on logout / password change / password reset | `src/middleware/authenticate.js` |
| Reset tokens: 32 random bytes, stored **SHA-256 hashed**, 15 min TTL, single use | `src/utils/resetToken.js` |
| No account enumeration (forgot password always answers the same) | `src/controllers/auth.controller.js` |
| Generic 5xx messages, no stack traces in production | `src/middleware/errorHandler.js` |
| Fail-fast env validation + production guards | `src/config/env.js` |
| HTTPS redirect (`FORCE_HTTPS`) + `trust proxy` awareness | `src/middleware/forceHttps.js`, `server.js` |
| Swagger UI disabled in production unless `ENABLE_SWAGGER=true` | `server.js` |
| Demo seed refuses production / remote databases | `src/seed/seed.js` |

> ⚠️ **Before deploying:** rotate the real Atlas URI and `SECRET_JWT` that were
> previously committed or shared in plain text, and never reuse the demo seed
> password. See [`SECURITY.md`](SECURITY.md) for the step-by-step checklist.

---

## 🧪 Testing

```bash
npm test                                  # whole suite
npx vitest run tests/progress.test.js     # one file
npm run test:watch                        # watch mode
```

* **Vitest + Supertest** hit the real Express app (`server.js` exports `app`, so
  no HTTP port is opened).
* **114 tests** in 8 files — the whole suite takes **~20 s** against a local
  MongoDB and a few minutes against Atlas.
* The tests run against a **real MongoDB** but in an isolated database
  (`MONGODB_URI_TEST` / `DB_NAME_TEST`, default `lms_api_test`) that is dropped
  before/after the run — your development data is never touched.
* Every test file starts from an empty database
  (`beforeEach(resetDatabase)` — see `tests/helpers.js`).
* bcrypt uses 4 rounds inside the tests to keep the suite fast (production uses
  the value from `.env`).

```bash
# fast: local MongoDB
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/lms_api_test  → npm test   (~20s)

# or simply comment MONGODB_URI_TEST out to run against Atlas
```

Fully offline alternative (no MongoDB at all): install `mongodb-memory-server`
and set `USE_MEMORY_DB=true`.

```powershell
npm i -D mongodb-memory-server
$env:USE_MEMORY_DB="true"; npm test
```

| File | Coverage |
| --- | --- |
| `auth.test.js` | register, login, wrong password, duplicate email, deactivated account, `/me`, password policy, `logout` + token revocation, change password, forgot/reset flow (single-use hashed token), health, 404 |
| `category.test.js` | admin-only writes, duplicate name, `courseCount` aggregation, delete guard |
| `course.test.js` | draft by default, role guard, admin-as-instructor, search, filters, price range, sorts, pagination, query validation, ownership 403, cascade delete |
| `section-lesson.test.js` | auto ordering, ownership, nested reads, content gating, validation |
| `enrollment.test.js` | all four enrollment rules, my courses, students + progress, cancel/reactivate |
| `progress.test.js` | completion, percentage, duplicate 409, not-enrolled 403, teacher/admin 403, `?details`, teacher reads their students, recalculation after a lesson delete |
| `review.test.js` | create, duplicates, invalid ratings, not enrolled, aggregation summary, rating on the course, update/delete rules |
| `dashboard.test.js` | student/teacher/admin statistics, role guards |

---

## 🍃 Mongoose concepts used

| Concept | Where it is used |
| --- | --- |
| `populate()` | course → instructor/category, enrollment → course/student, review → student, section → lessons |
| virtual populate | `course.sections`, `course.reviews`, `section.lessons`, `category.courses` |
| `find` / `findById` / `findOne` | everywhere, with `.select()`, `.sort()`, `.skip()`, `.limit()`, `.lean()` |
| `save()` vs `findByIdAndUpdate` | `save()` for validated partial updates, `findByIdAndUpdate`/`deleteMany` in the cascade helpers |
| **aggregation** | course rating (`$group` + `$avg` + `$round`), rating distribution, `courseCount` per category (`$lookup`), teacher dashboard (`$group`/`$cond`/`$max`), admin dashboard (`$facet`, `$lookup`, `$unwind`), `distinct()` |
| **indexes** | `email` (unique), `{student, course}` (unique), `{student, course, lesson}` (unique), title/text index on courses, `{course, order}`, `{section, order}`, compound filter indexes |
| hooks | password hashing (`pre('save')` + `isModified`) |
| validation | schema rules (enum, min/max, custom integer validators) + express-validator at the edge |

---

## 🧠 What this project practises

```text
Express.js → REST design → routers & nested routers → middleware pipeline
          → MongoDB → Mongoose schemas → relationships → populate()
          → JWT authentication → role authorization → resource ownership
          → validation → central error handling → search/filter/sort/pagination
          → aggregation → indexes → cascading deletes → integration testing
          → OpenAPI documentation
```

Each phase of the brief is implemented and tested:

| Phase | Feature | Test file |
| --- | --- | --- |
| 1 | Authentication (register / login / me) | `auth.test.js` |
| 2 | Categories + Courses (CRUD, search, filters, sorts, pagination) | `category.test.js`, `course.test.js` |
| 3 | Sections + Lessons (ordering, ownership, content gating) | `section-lesson.test.js` |
| 4 | Enrollment (4 business rules) | `enrollment.test.js` |
| 5 | Progress (completion, %, auto-complete course) | `progress.test.js` |
| 6 | Reviews (rating, one per student, aggregation) | `review.test.js` |
| 7 | Dashboards (student / teacher / admin aggregations) | `dashboard.test.js` |
| 8 | Testing + Swagger | all files + `/api-docs` |
| 9 | Advanced features | planned — see below |

---

## 🔧 Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MongoDB connection string is missing` | create `.env` (copy `.env.example`) and fill `MONGODB_URI` / `MONGODB_ATLAS` |
| `MongooseServerSelectionError` / connection timeout | your IP is not on the Atlas allow-list → add it in *Network Access* |
| `EADDRINUSE :4000` | the port is taken → change `PORT1` or run `$env:PORT=5000; npm start` |
| `401` right after logging in | send `Authorization: Bearer <token>` (no quotes, no double spaces) |
| Tests feel slow | they default to your **local MongoDB** (`MONGODB_URI_TEST`). If you comment that out they talk to Atlas — the suite then takes a few minutes. Use `USE_MEMORY_DB=true` for a fully offline run |
| Tests cannot connect | the local `MongoDB` service is not running → start it, or comment `MONGODB_URI_TEST` out to use Atlas |
| Swagger shows no operations | start the server from the project root so `swagger-jsdoc` can resolve `src/routes/*.js` |

---

## 🚀 Possible next steps (advanced features)

Intentionally left out of the core scope:

- 📤 image upload (course thumbnail, user avatar) with Multer + Cloudinary
- 📧 e-mail delivery for the **forgot password** flow (the reset token is already implemented and returned in development)
- 🔁 **refresh tokens** (short-lived access token + long-lived refresh token; logout already revokes via `tokenVersion`)
- 💳 payments / paid enrollment
- 📑 PDF certificate when a course is completed
- 🔔 notifications (new lesson in a course you follow)
- 🧾 audit logs (rate limiting is already implemented)

---

## 📖 Swagger / OpenAPI

Swagger UI: **`http://localhost:4000/api-docs`**

1. `POST /api/auth/login` with `admin@lms.dev` and the password printed by `npm run seed`
   (`SEED_PASSWORD`, or the random value in the seed output).
2. Copy the `token` from the response.
3. Click **Authorize 🔓** and paste the token (without the word `Bearer`).
4. Every protected endpoint can now be executed from the browser —
   `persistAuthorization` keeps the token after a page reload.

The routes document themselves with `@openapi` comments (`src/routes/*.js`);
the reusable schemas (`User`, `Course`, `Lesson`, `Error`, ...) and the
`bearerAuth` scheme live in `src/docs/swagger.js`.

---

Made as a full-stack learning project: **Express.js + Mongoose + JWT + Vitest + Swagger** 🎓


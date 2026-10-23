/**
 * ============================================================================
 *  🧪 tests/helpers.js — factories & shortcuts shared by the test files
 * ============================================================================
 *  💡 `registerUser` uses the public HTTP API (real end-to-end path).
 *  💡 `createUser(role)` seeds a teacher/admin/student fixture directly with
 *     `User.create()` (so the password hook still runs) and signs the JWT with
 *     `generateToken()` — one database round trip instead of two.
 *  💡 `createCourse` / `createSection` / `createLesson` / `createFullCourse` use
 *     the HTTP API so the tests exercise the real endpoints and middlewares.
 *  💡 `resetDatabase()` is called by every test file: see its comment below.
 * ============================================================================
 */
import request from 'supertest';
import mongoose from 'mongoose';
import serverModule from '../server.js';
import User from '../src/models/User.js';
import { generateToken } from '../src/utils/generateToken.js';

export const { app } = serverModule;

/**
 * 🔐 Password used by every test fixture — it satisfies the production policy
 *    (10-72 chars, lower + upper + digit), so the tests exercise the same rules
 *    as real clients instead of a legacy weak default.
 */
export const TEST_PASSWORD = 'TestPass123!';

/**
 * ⚡ Lighter bcrypt cost in the test suite (4 rounds instead of 10).
 * createUser() hashes a password for every fixture, and a full suite creates
 * hundreds of users — this keeps the tests fast without changing anything in
 * production (`.env` defines 10 there).
 */
process.env.BCRYPT_SALT_ROUNDS = '4';

/**
 * 🧹 Empty every collection of the test database.
 * 💡 Each test file calls this at the top of its own `beforeEach`:
 *
 *      beforeEach(resetDatabase);          // file level  → runs first
 *      describe('x', () => {
 *        beforeEach(createFixtures);       // suite level → runs after
 *
 *    Doing it from `tests/setup.js` would be unsafe: Vitest can run hooks of the
 *    same type in parallel, so the wipe could delete the fixtures of the very
 *    test that just created them.
 */
export const resetDatabase = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

/** Unique suffix so emails/titles never clash inside one test. */
let counter = 0;
export const uniq = (prefix = 'x') => `${prefix}${Date.now()}_${++counter}`;

/** `POST /api/auth/register` → `{ user, token }` */
export const registerUser = async (overrides = {}) => {
  const email = overrides.email || `${uniq('user')}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: overrides.name || 'Test User', email, password: overrides.password || TEST_PASSWORD });

  return { res, user: res.body.user, token: res.body.token, email };
};

/**
 * Create a user with a specific role.
 * 💡 The role cannot be chosen at registration (by design), so teacher/admin
 *    accounts are created directly in the database — that is exactly what an
 *    admin does through PATCH /api/users/:id anyway. `User.create()` still runs
 *    the password-hashing hook, so the account can log in for real.
 * 💡 The token is signed locally instead of calling `POST /api/auth/login`:
 *    the login endpoint is already covered by auth.test.js and skipping the
 *    extra round trip keeps the integration suite fast.
 */
export const createUser = async (role = 'student', overrides = {}) => {
  const email = overrides.email || `${uniq(role)}@example.com`;
  const password = overrides.password || TEST_PASSWORD;

  const user = await User.create({
    name: overrides.name || `${role[0].toUpperCase()}${role.slice(1)} User`,
    email,
    password,
    role,
  });

  return {
    user: user.toAuthJSON(),
    token: generateToken(user),
    email,
    password,
  };
};

/** Bearer header shortcut: `.set(auth(token))` */
export const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** `POST /api/categories` (admin only) */
export const createCategory = async (adminToken, overrides = {}) => {
  const res = await request(app)
    .post('/api/categories')
    .set(auth(adminToken))
    .send({ name: overrides.name || `Category ${uniq('c')}`, description: 'Test category' });
  return res.body.data;
};

/** `POST /api/courses` → the created course document */
export const createCourse = async (token, categoryId, overrides = {}) => {
  const res = await request(app)
    .post('/api/courses')
    .set(auth(token))
    .send({
      title: overrides.title || `Course ${uniq('c')}`,
      description: overrides.description || 'A complete test course about testing.',
      category: categoryId,
      price: overrides.price ?? 20,
      level: overrides.level || 'beginner',
      status: overrides.status || 'published',
      ...overrides,
    });
  return res.body.data;
};

/** `POST /api/courses/:courseId/sections` */
export const createSection = async (token, courseId, overrides = {}) => {
  const res = await request(app)
    .post(`/api/courses/${courseId}/sections`)
    .set(auth(token))
    .send({ title: overrides.title || 'Introduction', ...overrides });
  return res.body.data;
};

/** `POST /api/sections/:sectionId/lessons` */
export const createLesson = async (token, sectionId, overrides = {}) => {
  const res = await request(app)
    .post(`/api/sections/${sectionId}/lessons`)
    .set(auth(token))
    .send({
      title: overrides.title || 'Lesson',
      content: overrides.content || 'Lesson content for the test suite.',
      duration: overrides.duration ?? 10,
      ...overrides,
    });
  return res.body.data;
};

/**
 * ⚡ One call to build a complete course:
 *   `{ course, section, lessons }` with 3 lessons by default.
 */
export const createFullCourse = async (teacherToken, categoryId, { lessons = 3, ...overrides } = {}) => {
  const course = await createCourse(teacherToken, categoryId, overrides);
  const section = await createSection(teacherToken, course._id);
  const createdLessons = [];
  for (let i = 1; i <= lessons; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- ordered creation keeps `order` predictable
    createdLessons.push(await createLesson(teacherToken, section._id, { title: `Lesson ${i}` }));
  }
  return { course, section, lessons: createdLessons };
};

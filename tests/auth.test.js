/**
 * ============================================================================
 *  🧪 auth.test.js — Phase 1 (Authentication)
 * ============================================================================
 *  Register / Login / me + invalid password + duplicate email + validation.
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, auth, registerUser, createUser, resetDatabase, TEST_PASSWORD } from './helpers.js';
import User from '../src/models/User.js';

// 🔐 New passwords used by the password-management tests (they satisfy the policy).
const NEW_PASSWORD = 'BrandNew456!';
const RESET_PASSWORD = 'ResetPass789!';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('🔐 Authentication', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user as student and returns a JWT', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Long',
        email: 'long@example.com',
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeTypeOf('string');
      expect(res.body.user).toMatchObject({
        name: 'Long',
        email: 'long@example.com',
        role: 'student', // ⚠️ never teacher/admin through self-registration
      });
      expect(res.body.user.password).toBeUndefined(); // 🔒 the hash is never returned
      expect(res.body.user.id).toBeTypeOf('string');
    });

    it('refuses to register as teacher or admin', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Wannabe Teacher',
        email: 'teacher@example.com',
        password: TEST_PASSWORD,
        role: 'teacher',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors.some((e) => e.field === 'role')).toBe(true);
    });

    it('rejects a duplicate email with 409', async () => {
      await registerUser({ email: 'duplicate@example.com' });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Someone Else',
        email: 'duplicate@example.com',
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('rejects an invalid email and a too short password with 422', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'X', email: 'not-an-email', password: '123' });

      expect(res.status).toBe(422);
      const fields = res.body.errors.map((e) => e.field);
      expect(fields).toContain('email');
      expect(fields).toContain('password');
      expect(fields).toContain('name'); // 1 character < 2
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs an existing user in', async () => {
      const { email } = await registerUser({ email: 'login@example.com', password: TEST_PASSWORD });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTypeOf('string');
      expect(res.body.user.email).toBe(email);
    });

    it('rejects a wrong password with 401', async () => {
      const { email } = await registerUser({ email: 'wrongpass@example.com' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'not-my-password' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it('rejects an unknown email with 401 (same generic message)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: TEST_PASSWORD });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it('refuses a deactivated account with 403', async () => {
      const { email } = await registerUser({ email: 'inactive@example.com' });
      await User.updateOne({ email }, { isActive: false });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: TEST_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/deactivated/i);
    });
  });

  describe('GET /api/auth/me', () => {
    it("returns the authenticated user's profile", async () => {
      const { user, token } = await registerUser();

      const res = await request(app).get('/api/auth/me').set(auth(token));

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(user.id);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const res = await request(app).get('/api/auth/me').set(auth('not.a.jwt'));
      expect(res.status).toBe(401);
    });

    it('returns 401 when the token belongs to a deleted user', async () => {
      const { token, user } = await registerUser();
      await User.findByIdAndDelete(user.id);

      const res = await request(app).get('/api/auth/me').set(auth(token));
      expect(res.status).toBe(401);
    });
  });

  describe('🔒 Password policy', () => {
    it('rejects a weak password on registration', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Weak Password',
        email: 'weak@example.com',
        password: 'password',
      });

      expect(res.status).toBe(422);
      expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the token that was used to log out', async () => {
      const { token } = await registerUser();

      const res = await request(app).post('/api/auth/logout').set(auth(token));
      expect(res.status).toBe(200);

      const me = await request(app).get('/api/auth/me').set(auth(token));
      expect(me.status).toBe(401);
      expect(me.body.message).toMatch(/no longer valid/i);
    });
  });

  describe('PATCH /api/auth/password', () => {
    it('changes the password, revokes old tokens and returns a fresh one', async () => {
      const { email, token } = await registerUser({ email: 'change@example.com' });

      const res = await request(app)
        .patch('/api/auth/password')
        .set(auth(token))
        .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTypeOf('string');
      expect(res.body.token).not.toBe(token);

      // 💡 tokenVersion was bumped → the old token is dead, the new one works.
      expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
      expect((await request(app).get('/api/auth/me').set(auth(res.body.token))).status).toBe(200);

      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: TEST_PASSWORD });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: NEW_PASSWORD });
      expect(newLogin.status).toBe(200);
    });

    it('refuses a wrong current password', async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .patch('/api/auth/password')
        .set(auth(token))
        .send({ currentPassword: 'WrongPass123', newPassword: NEW_PASSWORD });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/current password is incorrect/i);
    });

    it('rejects a new password that does not satisfy the policy', async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .patch('/api/auth/password')
        .set(auth(token))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'weak' });

      expect(res.status).toBe(422);
      expect(res.body.errors.some((e) => e.field === 'newPassword')).toBe(true);
    });
  });

  describe('🔑 Forgot / reset password', () => {
    it('issues a single-use token and lets the user log in with the new password', async () => {
      const { email } = await registerUser({ email: 'reset@example.com' });

      const forgot = await request(app).post('/api/auth/forgot-password').send({ email });
      expect(forgot.status).toBe(200);
      // 💡 Development only: the raw token is returned so the flow is testable.
      expect(forgot.body.resetToken).toMatch(/^[a-f0-9]{64}$/);

      const reset = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: RESET_PASSWORD });

      expect(reset.status).toBe(200);
      expect(reset.body.token).toBeTypeOf('string');

      // 💡 Single use: replaying the same token must fail.
      const replay = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: forgot.body.resetToken, newPassword: NEW_PASSWORD });
      expect(replay.status).toBe(400);
      expect(replay.body.message).toMatch(/invalid or expired/i);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email, password: RESET_PASSWORD });
      expect(login.status).toBe(200);
    });

    it('answers identically for an unknown email (no account enumeration)', async () => {
      const known = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(known.status).toBe(200);
      expect(known.body.resetToken).toBeUndefined();
      expect(known.body.message).toMatch(/if an account exists/i);
    });
  });

  describe('🧭 API basics', () => {
    it('GET /health answers with the database state', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, status: 'ok', database: 'connected' });
    });

    it('unknown routes return a 404 JSON error', async () => {
      const res = await request(app).get('/api/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('all three roles can be created (student/teacher/admin)', async () => {
      const student = await createUser('student');
      const teacher = await createUser('teacher');
      const admin = await createUser('admin');

      expect(student.user.role).toBe('student');
      expect(teacher.user.role).toBe('teacher');
      expect(admin.user.role).toBe('admin');
      expect(admin.token).toBeTypeOf('string');
    });
  });
});


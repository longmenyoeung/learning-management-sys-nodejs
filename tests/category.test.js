/**
 * ============================================================================
 *  🧪 category.test.js — Phase 2 (Categories)
 * ============================================================================
 *  Categories are public to read and **admin-only** to write.
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, auth, createUser, createCategory, createCourse, resetDatabase } from './helpers.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('📂 Categories', () => {
  let admin;
  let teacher;
  let student;

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    student = await createUser('student');
  });

  it('lets an admin create a category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(auth(admin.token))
      .send({ name: 'Web Development', description: 'Everything about the web' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Web Development' });
  });

  it('refuses a duplicate category name with 409', async () => {
    await createCategory(admin.token, { name: 'Programming' });

    const res = await request(app)
      .post('/api/categories')
      .set(auth(admin.token))
      .send({ name: 'programming' }); // 💡 the check is case-insensitive

    expect(res.status).toBe(409);
  });

  it('forbids teacher and student from creating a category (403)', async () => {
    const asTeacher = await request(app)
      .post('/api/categories')
      .set(auth(teacher.token))
      .send({ name: 'Nope' });
    const asStudent = await request(app)
      .post('/api/categories')
      .set(auth(student.token))
      .send({ name: 'Nope' });

    expect(asTeacher.status).toBe(403);
    expect(asStudent.status).toBe(403);
  });

  it('rejects an invalid body with 422', async () => {
    const res = await request(app).post('/api/categories').set(auth(admin.token)).send({ name: 'A' });
    expect(res.status).toBe(422);
  });

  it('lists categories publicly with a course count (aggregation)', async () => {
    const category = await createCategory(admin.token, { name: 'Database' });
    await createCourse(teacher.token, category._id);
    await createCourse(teacher.token, category._id, { status: 'draft' });

    const res = await request(app).get('/api/categories?search=datab');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].courseCount).toBe(2); // 👈 counted with $lookup + $size
    expect(res.body.data[0].publishedCourseCount).toBe(1);
  });

  it('returns 404 for an unknown category and 422 for a malformed id', async () => {
    const notFound = await request(app).get('/api/categories/66f1f5b2c9d3a4b5e6f7a8b9');
    const badId = await request(app).get('/api/categories/not-an-id');

    expect(notFound.status).toBe(404);
    // 💡 express-validator rejects the id before the controller, so this is a 422
    //    (a bad ObjectId reaching Mongoose would instead become a 400 CastError).
    expect(badId.status).toBe(422);
    expect(badId.body.errors[0].field).toBe('id');
  });

  it('updates a category (admin only)', async () => {
    const category = await createCategory(admin.token);

    const forbidden = await request(app)
      .patch(`/api/categories/${category._id}`)
      .set(auth(teacher.token))
      .send({ name: 'Hacked' });
    const ok = await request(app)
      .patch(`/api/categories/${category._id}`)
      .set(auth(admin.token))
      .send({ name: 'Renamed category' });

    expect(forbidden.status).toBe(403);
    expect(ok.status).toBe(200);
    expect(ok.body.data.name).toBe('Renamed category');
  });

  it('refuses to delete a category that still has courses (409)', async () => {
    const category = await createCategory(admin.token);
    await createCourse(teacher.token, category._id);

    const res = await request(app).delete(`/api/categories/${category._id}`).set(auth(admin.token));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cannot be deleted/i);
  });

  it('deletes an empty category', async () => {
    const category = await createCategory(admin.token);

    const res = await request(app).delete(`/api/categories/${category._id}`).set(auth(admin.token));

    expect(res.status).toBe(200);
    const after = await request(app).get('/api/categories');
    expect(after.body.data.some((c) => c._id === category._id)).toBe(false);
  });
});

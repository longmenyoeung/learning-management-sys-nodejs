/**
 * ============================================================================
 *  🌱 seed.js — fill the database with demo data (`npm run seed`)
 * ============================================================================
 *  💡 Handy to try the API (and Swagger UI) without clicking through the whole
 *     learning flow by hand. It is **idempotent**: existing demo accounts are
 *     reused and the demo course is recreated.
 *
 *  Demo accounts (all share the same password):
 *     admin@lms.dev    → admin
 *     teacher@lms.dev  → teacher
 *     student@lms.dev  → student
 *     nina@lms.dev     → student
 *
 *  🔑 The password is read from `SEED_PASSWORD` (min 10 characters). When the
 *     variable is not set a strong random one is generated and printed once at
 *     the end of the run — there is no hardcoded default anymore.
 *
 *  ⚠️ Development only: refuses to run with NODE_ENV=production and refuses a
 *     non-local MongoDB unless SEED_ALLOW_REMOTE=true is set explicitly.
 * ============================================================================
 */
require('dotenv').config();

const crypto = require('crypto');

const connectDB = require('../config/db');
const { disconnectDB, resolveConfig } = require('../config/db');
const { isProduction } = require('../config/env');
const { deleteCoursesCascade } = require('../utils/cascade');

const User = require('../models/User');
const Category = require('../models/Category');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const Progress = require('../models/Progress');
const Review = require('../models/Review');

/**
 * 🚫 Hard guard: this script deletes and recreates demo data. It must never run
 * against a production database by accident.
 */
const refuse = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

if (isProduction()) {
  refuse('The demo seed script refuses to run when NODE_ENV=production. Nothing was changed.');
}

/**
 * 🔑 A strong random password is generated when SEED_PASSWORD is not set. The
 *    old hardcoded `password123` was a credential-stuffing gift.
 */
const DEMO_PASSWORD = process.env.SEED_PASSWORD || crypto.randomBytes(18).toString('base64url');

if (DEMO_PASSWORD.length < 10) {
  refuse('SEED_PASSWORD must be at least 10 characters long (see the password policy in SECURITY.md).');
}

/** Create the user if the email is free, otherwise return the existing one. */
const upsertUser = async ({ name, email, role }) => {
  const existing = await User.findOne({ email });
  if (existing) return { user: existing, created: false };
  const user = await User.create({ name, email, password: DEMO_PASSWORD, role });
  return { user, created: true };
};

const run = async () => {
  // ── 🛡️ Refuse remote databases unless explicitly allowed ──────────────────
  // 💡 The seed deletes the demo course (and its sections/lessons/enrollments).
  //    Pointing it at an Atlas cluster by accident is exactly how data is lost.
  const { uri, dbName } = resolveConfig(process.env.NODE_ENV);
  const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(uri || '');

  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'true') {
    refuse(
      'Refusing to seed a non-local MongoDB database. Set SEED_ALLOW_REMOTE=true if you are absolutely sure.'
    );
  }

  // 💡 `SEED_DB_NAME` lets you seed a throwaway database: `SEED_DB_NAME=lms_demo npm run seed`
  await connectDB(process.env.NODE_ENV, { dbName: process.env.SEED_DB_NAME || dbName });

  console.log('🌱 Seeding demo data...');
  if (!isLocal) console.warn(`⚠️  Seeding the REMOTE database "${process.env.SEED_DB_NAME || dbName}"`);

  // ── 👥 Users ──────────────────────────────────────────────────────────────
  const admin = await upsertUser({ name: 'Alice Admin', email: 'admin@lms.dev', role: 'admin' });
  const teacher = await upsertUser({ name: 'Tom Teacher', email: 'teacher@lms.dev', role: 'teacher' });
  const student = await upsertUser({ name: 'Sam Student', email: 'student@lms.dev', role: 'student' });
  const second = await upsertUser({ name: 'Nina Learner', email: 'nina@lms.dev', role: 'student' });

  const accounts = [admin, teacher, student, second];

  // ── 📂 Categories ─────────────────────────────────────────────────────────
  const categoryNames = [
    'Programming',
    'Web Development',
    'Database',
    'Mobile Development',
    'DevOps',
    'Design',
    'Business',
  ];
  const categories = await Promise.all(
    categoryNames.map(async (name) => {
      const found = await Category.findOne({ name });
      return found || Category.create({ name, description: `${name} courses` });
    })
  );
  const webDev = categories[1];

  // ── 📚 Course + sections + lessons (the demo course is recreated) ──────────
  // 💡 Cascade delete: removing only the course would leave orphaned sections,
  //    lessons, enrollments, progress and reviews behind on every re-seed.
  const previousCourses = await Course.find({ title: 'Node.js REST API' }).select('_id');
  if (previousCourses.length > 0) {
    await deleteCoursesCascade(previousCourses.map((c) => c._id));
  }

  const course = await Course.create({
    title: 'Node.js REST API',
    description:
      'Learn how to build a production-ready REST API with Node.js, Express and MongoDB.',
    instructor: teacher.user._id,
    category: webDev._id,
    price: 20,
    level: 'beginner',
    status: 'published', // ✅ published → students can enroll right away
    thumbnail: '',
  });

  const outline = [
    { title: 'Introduction', lessons: [['What is a REST API?', 8], ['Setting up the project', 12]] },
    {
      title: 'Express.js',
      lessons: [['What is Express?', 10], ['Routes and controllers', 18], ['Middleware', 15]],
    },
    { title: 'MongoDB', lessons: [['Mongoose models', 20], ['Relationships and populate', 22]] },
    {
      title: 'Authentication',
      lessons: [['JWT in 15 minutes', 15], ['Roles and ownership', 17]],
    },
  ];

  let lessonOrder = 0;
  const createdLessons = [];

  for (const [index, sectionData] of outline.entries()) {
    const section = await Section.create({
      course: course._id,
      title: sectionData.title,
      description: `Section ${index + 1} of the demo course`,
      order: index + 1,
    });

    for (const [title, duration] of sectionData.lessons) {
      lessonOrder += 1;
      // eslint-disable-next-line no-await-in-loop -- sequential writes keep the order readable
      const lesson = await Lesson.create({
        section: section._id,
        title,
        description: `Notes for "${title}"`,
        content: `# ${title}\n\nThis is the demo content of the lesson "${title}".`,
        videoUrl: '',
        duration,
        order: lessonOrder,
      });
      createdLessons.push(lesson);
    }
  }

  console.log(
    `📚 Course "${course.title}" created with ${outline.length} sections and ${createdLessons.length} lessons`
  );
  // ── 🎓 Enrollments ────────────────────────────────────────────────────────
  const enrollments = await Enrollment.insertMany([
    { student: student.user._id, course: course._id, status: 'active' },
    { student: second.user._id, course: course._id, status: 'active' },
  ]);

  // 💡 The first student already completed half of the course (progress demo).
  const doneCount = Math.ceil(createdLessons.length / 2);
  await Progress.insertMany(
    createdLessons.slice(0, doneCount).map((lesson) => ({
      student: student.user._id,
      course: course._id,
      lesson: lesson._id,
      completed: true,
      completedAt: new Date(),
    }))
  );

  // ── ⭐ A review from the second student ───────────────────────────────────
  await Review.create({
    student: second.user._id,
    course: course._id,
    rating: 5,
    comment: 'Great demo course, the progress tracking works perfectly!',
  });

  // ── ✅ Summary ────────────────────────────────────────────────────────────
  // 💡 Existing accounts keep their current password → show "(unchanged)".
  console.table(
    accounts.map(({ user, created }) => ({
      role: user.role,
      email: user.email,
      password: created ? DEMO_PASSWORD : '(unchanged)',
    }))
  );
  console.log(
    `🎓 ${enrollments.length} enrollment(s), ${doneCount} completed lesson(s), 1 review`
  );
  console.log(`📚 demo course id : ${course._id}`);
  console.log('✅ Seeding done → `npm run dev` then open http://localhost:4000/api-docs');

  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  console.error('❌ Seeding failed:', error.message);
  await disconnectDB();
  process.exit(1);
});


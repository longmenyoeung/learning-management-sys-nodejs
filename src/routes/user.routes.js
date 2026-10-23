/**
 * ============================================================================
 *  🛣️  user.routes.js  →  mounted at /api/users
 * ============================================================================
 *  💡 The whole router is admin-only: `authenticate` proves *who* the caller is,
 *     `authorize('admin')` proves they are allowed to manage users.
 * ============================================================================
 */
const express = require('express');
const { getUsers, getUser, updateUser, deleteUser } = require('../controllers/user.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const userValidators = require('../validators/user.validator');

const router = express.Router();

router.use(authenticate, authorize('admin')); // 🔒 every route below is admin only

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: role, schema: { type: string, enum: [admin, teacher, student] } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: search, schema: { type: string }, description: Matches name or email }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, name_asc, name_desc] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Pagination'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', userValidators.listUsers, validate, getUsers);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get one user (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, example: 66f1f5b2c9d3a4b5e6f7a8b9 }
 *     responses:
 *       200:
 *         description: The user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/User' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     coursesTaught: { type: integer }
 *                     coursesFollowed: { type: integer }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Users]
 *     summary: Update a user's role / profile (admin)
 *     description: An admin cannot change their own role nor deactivate/delete themselves.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: Long Nguyen }
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [admin, teacher, student] }
 *               isActive: { type: boolean }
 *               avatar: { type: string }
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user and all their data (admin)
 *     description: |
 *       Cascading delete — a teacher's courses (with their sections, lessons,
 *       enrollments, progress rows and reviews) are removed too.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted (with a summary of the cascade)
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', userValidators.userId, validate, getUser);
router.patch('/:id', userValidators.updateUser, validate, updateUser);
router.delete('/:id', userValidators.userId, validate, deleteUser);

module.exports = router;

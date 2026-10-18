const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate with email & password
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR'
      });
    }

    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.team_id, t.name AS team_name
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.id
       WHERE u.email = ?`,
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      token,
      user: safeUser
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Return current authenticated user profile
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

/**
 * GET /api/auth/demo-users
 * List seeded demo users for 1-click evaluation login
 */
router.get('/demo-users', async (req, res, next) => {
  try {
    const users = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.team_id, t.name AS team_name
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.id
       ORDER BY FIELD(u.role, 'ADMIN', 'LEAD', 'MEMBER', 'VIEWER'), u.name ASC`
    );

    res.json({
      success: true,
      demoPassword: 'password123',
      users
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

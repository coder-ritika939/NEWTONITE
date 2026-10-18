const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/db');

/**
 * Authentication middleware verifying JWT Bearer token
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token required (Bearer format)',
        code: 'UNAUTHORIZED'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token',
        code: 'TOKEN_INVALID'
      });
    }

    // Fetch fresh user data from database to verify active status and current role/team
    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.team_id, t.name AS team_name
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.id
       WHERE u.id = ?`,
      [decoded.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Helper to generate JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      teamId: user.team_id
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = {
  authenticate,
  generateToken
};

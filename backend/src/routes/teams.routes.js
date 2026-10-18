const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { canAccessTeam } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/teams
 * List all teams accessible to user
 */
router.get('/', async (req, res, next) => {
  try {
    let teams;
    if (req.user.role === 'ADMIN') {
      teams = await db.query(`SELECT id, name, description, created_at FROM teams ORDER BY name ASC`);
    } else {
      teams = await db.query(
        `SELECT id, name, description, created_at FROM teams WHERE id = ? ORDER BY name ASC`,
        [req.user.team_id]
      );
    }

    res.json({
      success: true,
      teams
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/teams/:id/members
 * List members belonging to a team
 */
router.get('/:id/members', async (req, res, next) => {
  try {
    const teamId = Number(req.params.id);
    if (!canAccessTeam(req.user, teamId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to team member list',
        code: 'FORBIDDEN_TEAM'
      });
    }

    const members = await db.query(
      `SELECT id, name, email, role, team_id
       FROM users
       WHERE team_id = ?
       ORDER BY FIELD(role, 'LEAD', 'MEMBER', 'VIEWER'), name ASC`,
      [teamId]
    );

    res.json({
      success: true,
      members
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

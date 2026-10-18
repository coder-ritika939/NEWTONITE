/**
 * Role-Based Access Control (RBAC) and Team Permission Guards
 */

/**
 * Restrict route to specific roles
 * @param  {...string} allowedRoles - e.g. 'ADMIN', 'LEAD', 'MEMBER', 'VIEWER'
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Role '${req.user.role}' is not authorized for this action. Allowed: ${allowedRoles.join(', ')}`,
        code: 'FORBIDDEN_ROLE'
      });
    }

    next();
  };
}

/**
 * Guard against mutations by read-only VIEWER role
 */
function disallowViewer(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
  }

  if (req.user.role === 'VIEWER') {
    return res.status(403).json({
      success: false,
      error: 'Viewers have read-only permissions and cannot create or modify resources',
      code: 'VIEWER_READ_ONLY'
    });
  }

  next();
}

/**
 * Check if the user has access to a given team ID
 * ADMIN has access across all teams.
 * Others only have access if user.team_id === targetTeamId.
 */
function canAccessTeam(user, targetTeamId) {
  if (user.role === 'ADMIN') return true;
  return Number(user.team_id) === Number(targetTeamId);
}

/**
 * Check if the user is authorized to approve items in the given team
 * Only LEAD of that team or ADMIN can approve items.
 */
function canApproveItem(user, itemTeamId) {
  if (user.role === 'ADMIN') return true;
  return user.role === 'LEAD' && Number(user.team_id) === Number(itemTeamId);
}

module.exports = {
  requireRoles,
  disallowViewer,
  canAccessTeam,
  canApproveItem
};

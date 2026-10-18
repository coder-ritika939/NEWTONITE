/**
 * Server-validated workflow state machine for Newtonite Ops
 */

const VALID_TYPES = ['Incident', 'Customer Issue', 'Payment', 'Compliance', 'Task'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const VALID_STATUSES = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'PENDING_APPROVAL',
  'RESOLVED',
  'CLOSED',
  'CANCELLED'
];

/**
 * State Transition Rules
 * Maps currentStatus -> Array of allowed targetStatuses
 */
const TRANSITIONS = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'DRAFT', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_APPROVAL', 'RESOLVED', 'OPEN', 'CANCELLED'],
  PENDING_APPROVAL: ['RESOLVED', 'IN_PROGRESS', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'], // Only ADMIN can reopen
  CANCELLED: ['OPEN']     // Only ADMIN can revive
};

/**
 * Validates whether a status transition is permitted given the work item, target status, and acting user
 * @param {Object} item - Current work item from DB
 * @param {string} targetStatus - Desired new status
 * @param {Object} user - Acting authenticated user
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTransition(item, targetStatus, user) {
  if (item.status === targetStatus) {
    return { valid: true };
  }

  if (!VALID_STATUSES.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid status '${targetStatus}'. Allowed: ${VALID_STATUSES.join(', ')}`
    };
  }

  // Viewers cannot change status
  if (user.role === 'VIEWER') {
    return {
      valid: false,
      error: 'Viewers have read-only access and cannot change work item status'
    };
  }

  // Check state machine transitions
  const allowedNext = TRANSITIONS[item.status] || [];
  if (!allowedNext.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid status transition from '${item.status}' to '${targetStatus}'. Allowed transitions: ${allowedNext.join(', ') || 'None'}`
    };
  }

  const isItemTeamLead = user.role === 'LEAD' && Number(user.team_id) === Number(item.team_id);
  const isAdmin = user.role === 'ADMIN';
  const isAssignee = item.assignee_id && Number(item.assignee_id) === Number(user.id);
  const isCreator = Number(item.created_by) === Number(user.id);

  // Requirement 5: Only authorized team Leads or Admins can approve items (PENDING_APPROVAL -> RESOLVED)
  if (item.status === 'PENDING_APPROVAL' && targetStatus === 'RESOLVED') {
    if (!isItemTeamLead && !isAdmin) {
      return {
        valid: false,
        error: 'Only the authorized Team Lead or an Admin can approve this item'
      };
    }
  }

  // Direct resolution from IN_PROGRESS without approval is only permitted for 'Task' type or by LEAD/ADMIN
  if (item.status === 'IN_PROGRESS' && targetStatus === 'RESOLVED') {
    if (item.type !== 'Task' && !isItemTeamLead && !isAdmin) {
      return {
        valid: false,
        error: `${item.type} items require formal Lead approval. Please transition to PENDING_APPROVAL instead.`
      };
    }
  }

  // Closing or Cancelling items requires LEAD or ADMIN authority
  if (targetStatus === 'CLOSED' || targetStatus === 'CANCELLED') {
    if (!isItemTeamLead && !isAdmin && !(targetStatus === 'CANCELLED' && isCreator && item.status === 'DRAFT')) {
      return {
        valid: false,
        error: `Only Team Leads or Admins can transition items to ${targetStatus}`
      };
    }
  }

  // Reopening closed or cancelled items requires ADMIN
  if ((item.status === 'CLOSED' || item.status === 'CANCELLED') && !isAdmin) {
    return {
      valid: false,
      error: 'Only Admins can reopen closed or cancelled items'
    };
  }

  return { valid: true };
}

module.exports = {
  VALID_TYPES,
  VALID_PRIORITIES,
  VALID_STATUSES,
  TRANSITIONS,
  validateTransition
};

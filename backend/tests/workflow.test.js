import { describe, it, expect } from 'vitest';
const { validateTransition, VALID_STATUSES, VALID_TYPES, VALID_PRIORITIES } = require('../src/services/workflow.service');

describe('Workflow State Machine & Permissions', () => {
  const viewerUser = { id: 4, role: 'VIEWER', team_id: 1 };
  const memberUser = { id: 3, role: 'MEMBER', team_id: 1 };
  const leadUser = { id: 2, role: 'LEAD', team_id: 1 };
  const adminUser = { id: 1, role: 'ADMIN', team_id: 1 };
  const otherTeamLead = { id: 5, role: 'LEAD', team_id: 2 };

  const sampleIncident = {
    id: 101,
    title: 'Database connection spike',
    type: 'Incident',
    priority: 'URGENT',
    status: 'OPEN',
    team_id: 1,
    created_by: 1,
    assignee_id: 3,
    version: 1
  };

  it('rejects any status transition attempted by a VIEWER', () => {
    const result = validateTransition(sampleIncident, 'IN_PROGRESS', viewerUser);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/viewers have read-only access/i);
  });

  it('allows valid transition OPEN -> IN_PROGRESS for assigned member', () => {
    const result = validateTransition(sampleIncident, 'IN_PROGRESS', memberUser);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid state leap (e.g. DRAFT -> RESOLVED)', () => {
    const draftItem = { ...sampleIncident, status: 'DRAFT' };
    const result = validateTransition(draftItem, 'RESOLVED', leadUser);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid status transition/i);
  });

  it('requires Lead or Admin approval for PENDING_APPROVAL -> RESOLVED', () => {
    const pendingItem = { ...sampleIncident, status: 'PENDING_APPROVAL' };

    // Regular member attempt -> must be rejected
    const memberAttempt = validateTransition(pendingItem, 'RESOLVED', memberUser);
    expect(memberAttempt.valid).toBe(false);
    expect(memberAttempt.error).toMatch(/only the authorized team lead or an admin can approve/i);

    // Lead from a different team attempt -> must be rejected
    const otherLeadAttempt = validateTransition(pendingItem, 'RESOLVED', otherTeamLead);
    expect(otherLeadAttempt.valid).toBe(false);
    expect(otherLeadAttempt.error).toMatch(/only the authorized team lead or an admin can approve/i);

    // Authorized Team Lead attempt -> must succeed
    const authorizedLeadAttempt = validateTransition(pendingItem, 'RESOLVED', leadUser);
    expect(authorizedLeadAttempt.valid).toBe(true);

    // Admin attempt -> must succeed
    const adminAttempt = validateTransition(pendingItem, 'RESOLVED', adminUser);
    expect(adminAttempt.valid).toBe(true);
  });

  it('rejects direct resolution from IN_PROGRESS for Incident/Payment without approval', () => {
    const inProgressIncident = { ...sampleIncident, status: 'IN_PROGRESS', type: 'Incident' };
    const memberAttempt = validateTransition(inProgressIncident, 'RESOLVED', memberUser);
    expect(memberAttempt.valid).toBe(false);
    expect(memberAttempt.error).toMatch(/require formal lead approval/i);
  });

  it('allows direct resolution from IN_PROGRESS for Task type by assigned member', () => {
    const inProgressTask = { ...sampleIncident, status: 'IN_PROGRESS', type: 'Task' };
    const memberAttempt = validateTransition(inProgressTask, 'RESOLVED', memberUser);
    expect(memberAttempt.valid).toBe(true);
  });

  it('restricts closing items to Team Lead or Admin', () => {
    const resolvedItem = { ...sampleIncident, status: 'RESOLVED' };

    const memberAttempt = validateTransition(resolvedItem, 'CLOSED', memberUser);
    expect(memberAttempt.valid).toBe(false);

    const leadAttempt = validateTransition(resolvedItem, 'CLOSED', leadUser);
    expect(leadAttempt.valid).toBe(true);

    const adminAttempt = validateTransition(resolvedItem, 'CLOSED', adminUser);
    expect(adminAttempt.valid).toBe(true);
  });
});

import { describe, it, expect, vi } from 'vitest';
const workItemService = require('../src/services/workItem.service');
const db = require('../src/config/db');

describe('Concurrency & Optimistic Locking Behaviour', () => {
  it('prevents two users from claiming the same unassigned item (Atomic Race Condition Protection)', async () => {
    const unassignedItem = {
      id: 50,
      team_id: 1,
      status: 'OPEN',
      assignee_id: null,
      version: 1
    };

    let currentAssignee = null;
    let currentVersion = 1;

    // Mock withTransaction simulating DB transaction
    vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
      const mockConn = {
        query: vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('FOR UPDATE')) {
            return [[{ ...unassignedItem, assignee_id: currentAssignee, version: currentVersion }]];
          }
          if (sql.includes('SELECT wi.*')) {
            return [[{ ...unassignedItem, assignee_id: currentAssignee, version: currentVersion }]];
          }
          return [[]];
        }),
        execute: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('UPDATE work_items')) {
            // If already claimed by another transaction, 0 rows affected
            if (currentAssignee !== null) {
              return [{ affectedRows: 0 }];
            }
            // First one wins
            currentAssignee = params[0]; // assignee_id
            currentVersion += 1;
            return [{ affectedRows: 1 }];
          }
          if (sql.includes('INSERT INTO work_item_activity')) {
            return [{ insertId: 1 }];
          }
          return [{ affectedRows: 1 }];
        })
      };
      return await callback(mockConn);
    });

    const user1 = { id: 10, role: 'MEMBER', team_id: 1 };
    const user2 = { id: 20, role: 'MEMBER', team_id: 1 };

    // User 1 and User 2 race to claim item 50 concurrently
    const claimAttempt1 = workItemService.claimWorkItem(50, user1);
    const claimAttempt2 = workItemService.claimWorkItem(50, user2);

    const results = await Promise.allSettled([claimAttempt1, claimAttempt2]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // Exactly one user must successfully claim the item
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // The failing user must receive an HTTP 409 Conflict
    const rejection = failures[0].reason;
    expect(rejection.statusCode).toBe(409);
    expect(rejection.code).toMatch(/ALREADY_CLAIMED|CONCURRENCY_CONFLICT/);

    vi.restoreAllMocks();
  });

  it('rejects stale updates with HTTP 409 using version-based optimistic locking', async () => {
    const itemInDb = {
      id: 60,
      title: 'Original Title',
      description: 'Original Desc',
      type: 'Task',
      priority: 'MEDIUM',
      status: 'OPEN',
      team_id: 1,
      created_by: 1,
      assignee_id: null,
      version: 2 // Currently at version 2 in DB
    };

    vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
      const mockConn = {
        query: vi.fn().mockResolvedValue([[itemInDb]]),
        execute: vi.fn().mockResolvedValue([{ affectedRows: 0 }])
      };
      return await callback(mockConn);
    });

    const user = { id: 10, role: 'MEMBER', team_id: 1 };

    // Client sends an update with stale version 1 (while DB is at version 2)
    const staleUpdateCall = workItemService.updateWorkItem(
      60,
      { title: 'Stale Edit Title' },
      1, // expectedVersion is stale (1 instead of 2)
      user
    );

    await expect(staleUpdateCall).rejects.toMatchObject({
      statusCode: 409,
      code: 'OPTIMISTIC_LOCK_CONFLICT'
    });

    vi.restoreAllMocks();
  });

  it('allows updates when expected version matches current DB version', async () => {
    let currentVersion = 3;

    vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
      const mockConn = {
        query: vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('FOR UPDATE')) {
            return [[{
              id: 70,
              title: 'Current Title',
              description: 'Desc',
              type: 'Task',
              priority: 'MEDIUM',
              status: 'OPEN',
              team_id: 1,
              created_by: 1,
              assignee_id: null,
              version: currentVersion
            }]];
          }
          return [[{
            id: 70,
            title: 'Updated Title',
            version: currentVersion
          }]];
        }),
        execute: vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('UPDATE work_items')) {
            currentVersion += 1;
            return [{ affectedRows: 1 }];
          }
          return [{ affectedRows: 1 }];
        })
      };
      return await callback(mockConn);
    });

    const user = { id: 10, role: 'MEMBER', team_id: 1 };

    const result = await workItemService.updateWorkItem(
      70,
      { title: 'Updated Title' },
      3, // Matches current version 3
      user
    );

    expect(result).toBeDefined();
    expect(result.version).toBe(4);

    vi.restoreAllMocks();
  });
});

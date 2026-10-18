import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
const express = require('express');
const idempotency = require('../src/middleware/idempotency');
const { disallowViewer, canAccessTeam, canApproveItem } = require('../src/middleware/rbac');
const db = require('../src/config/db');

describe('Security, RBAC, and Idempotency Protection', () => {
  describe('Idempotency Middleware', () => {
    it('returns cached response and sets Idempotent-Replay header for duplicate key', async () => {
      const app = express();
      app.use(express.json());

      // Mock user authentication
      app.use((req, res, next) => {
        req.user = { id: 42, role: 'MEMBER', team_id: 1 };
        next();
      });

      let hitCount = 0;

      // Mock db query
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM idempotency_keys') && sql.includes('SELECT')) {
          // If first call, not found; if second call, simulate found
          if (hitCount > 0) {
            return [{
              response_status: 201,
              response_body: JSON.stringify({ success: true, item: { id: 99, title: 'Idempotent Item' } })
            }];
          }
          return [];
        }
        if (sql.includes('INSERT INTO idempotency_keys')) {
          return [{ affectedRows: 1 }];
        }
        return [];
      });

      app.post('/api/test-mutation', idempotency, (req, res) => {
        hitCount++;
        res.status(201).json({ success: true, item: { id: 99, title: 'Idempotent Item' } });
      });

      // 1. First request with Idempotency-Key
      const res1 = await request(app)
        .post('/api/test-mutation')
        .set('Idempotency-Key', 'unique-key-abc-123')
        .send({ title: 'New Item' });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(hitCount).toBe(1);

      // 2. Duplicate second request with same Idempotency-Key
      const res2 = await request(app)
        .post('/api/test-mutation')
        .set('Idempotency-Key', 'unique-key-abc-123')
        .send({ title: 'New Item' });

      expect(res2.status).toBe(201);
      expect(res2.headers['idempotent-replay']).toBe('true');
      expect(res2.body.item.id).toBe(99);
      // Ensure business logic handler was NOT invoked again
      expect(hitCount).toBe(1);

      vi.restoreAllMocks();
    });
  });

  describe('RBAC & Team Isolation Helpers', () => {
    it('blocks VIEWER role from mutation routes with HTTP 403', async () => {
      const app = express();
      app.use(express.json());

      app.post('/api/mutate', (req, res, next) => {
        req.user = { id: 9, role: 'VIEWER', team_id: 1 };
        next();
      }, disallowViewer, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/api/mutate').send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VIEWER_READ_ONLY');
    });

    it('enforces team isolation: member cannot access items of other teams', () => {
      const memberTeam1 = { id: 10, role: 'MEMBER', team_id: 1 };
      const leadTeam1 = { id: 11, role: 'LEAD', team_id: 1 };
      const adminUser = { id: 1, role: 'ADMIN', team_id: 1 };

      // Member/Lead of Team 1 accessing Team 1 -> OK
      expect(canAccessTeam(memberTeam1, 1)).toBe(true);
      expect(canAccessTeam(leadTeam1, 1)).toBe(true);

      // Member/Lead of Team 1 accessing Team 2 -> DENIED
      expect(canAccessTeam(memberTeam1, 2)).toBe(false);
      expect(canAccessTeam(leadTeam1, 2)).toBe(false);

      // Admin accessing any team -> ALLOWED
      expect(canAccessTeam(adminUser, 1)).toBe(true);
      expect(canAccessTeam(adminUser, 2)).toBe(true);
      expect(canAccessTeam(adminUser, 999)).toBe(true);
    });

    it('enforces lead approval: only Lead of item team or Admin can approve', () => {
      const leadTeam1 = { id: 11, role: 'LEAD', team_id: 1 };
      const memberTeam1 = { id: 10, role: 'MEMBER', team_id: 1 };
      const leadTeam2 = { id: 22, role: 'LEAD', team_id: 2 };
      const admin = { id: 1, role: 'ADMIN', team_id: 1 };

      expect(canApproveItem(leadTeam1, 1)).toBe(true);
      expect(canApproveItem(memberTeam1, 1)).toBe(false);
      expect(canApproveItem(leadTeam2, 1)).toBe(false);
      expect(canApproveItem(admin, 1)).toBe(true);
    });
  });
});

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../config/env');

async function runSeed() {
  console.log(`[Seed] Connecting to MySQL database '${config.db.database}'...`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database
    });

    console.log(`[Seed] Hashing demo passwords...`);
    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Seed Teams
    console.log(`[Seed] Seeding teams...`);
    const teams = [
      { name: 'Engineering', description: 'Core product engineering and infrastructure' },
      { name: 'Operations & Support', description: 'Customer operations, ticketing, and payments' },
      { name: 'Compliance & Risk', description: 'Regulatory, audit, and risk compliance' }
    ];

    for (const team of teams) {
      await connection.execute(
        `INSERT INTO teams (name, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [team.name, team.description]
      );
    }

    const [teamRows] = await connection.execute(`SELECT id, name FROM teams`);
    const teamMap = {};
    for (const row of teamRows) {
      teamMap[row.name] = row.id;
    }

    // 2. Seed Demo Users
    console.log(`[Seed] Seeding demo users with roles (VIEWER, MEMBER, LEAD, ADMIN)...`);
    const users = [
      {
        name: 'Alice Admin',
        email: 'admin@newtonite.io',
        role: 'ADMIN',
        team_id: teamMap['Engineering']
      },
      {
        name: 'Laura Lead',
        email: 'lead.eng@newtonite.io',
        role: 'LEAD',
        team_id: teamMap['Engineering']
      },
      {
        name: 'Mike Member',
        email: 'member.eng@newtonite.io',
        role: 'MEMBER',
        team_id: teamMap['Engineering']
      },
      {
        name: 'Victor Viewer',
        email: 'viewer.eng@newtonite.io',
        role: 'VIEWER',
        team_id: teamMap['Engineering']
      },
      {
        name: 'Sarah Ops Lead',
        email: 'lead.ops@newtonite.io',
        role: 'LEAD',
        team_id: teamMap['Operations & Support']
      },
      {
        name: 'Carlos Ops Member',
        email: 'member.ops@newtonite.io',
        role: 'MEMBER',
        team_id: teamMap['Operations & Support']
      }
    ];

    for (const u of users) {
      await connection.execute(
        `INSERT INTO users (name, email, password_hash, role, team_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), team_id = VALUES(team_id), password_hash = VALUES(password_hash)`,
        [u.name, u.email, passwordHash, u.role, u.team_id]
      );
    }

    const [userRows] = await connection.execute(`SELECT id, email FROM users`);
    const userMap = {};
    for (const row of userRows) {
      userMap[row.email] = row.id;
    }

    // 3. Seed Initial Work Items
    console.log(`[Seed] Seeding sample work items...`);
    const workItems = [
      {
        item_key: 'NEWT-1001',
        title: 'Production API latency spike on payment gateway',
        description: 'Payment requests taking over 4.5 seconds to acknowledge. Unassigned and requires immediate investigation.',
        type: 'Incident',
        priority: 'URGENT',
        status: 'OPEN',
        team_id: teamMap['Engineering'],
        created_by: userMap['admin@newtonite.io'],
        assignee_id: null
      },
      {
        item_key: 'NEWT-1002',
        title: 'Customer account lockout after password reset loop',
        description: 'Enterprise client unable to complete SSO auth callback.',
        type: 'Customer Issue',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        team_id: teamMap['Engineering'],
        created_by: userMap['lead.eng@newtonite.io'],
        assignee_id: userMap['member.eng@newtonite.io']
      },
      {
        item_key: 'NEWT-1003',
        title: 'Disputed refund approval for invoice #INV-88219',
        description: 'Customer requested full refund of $4,800 due to service downtime. Requires Team Lead sign-off.',
        type: 'Payment',
        priority: 'HIGH',
        status: 'PENDING_APPROVAL',
        team_id: teamMap['Engineering'],
        created_by: userMap['member.eng@newtonite.io'],
        assignee_id: userMap['member.eng@newtonite.io']
      },
      {
        item_key: 'NEWT-1004',
        title: 'Quarterly SOC2 audit compliance evidence collection',
        description: 'Export access control logs, MFA enforcement reports, and backup verification hashes.',
        type: 'Compliance',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        team_id: teamMap['Operations & Support'],
        created_by: userMap['lead.ops@newtonite.io'],
        assignee_id: userMap['member.ops@newtonite.io']
      },
      {
        item_key: 'NEWT-1005',
        title: 'Upgrade Node runtime in deployment pipeline',
        description: 'Prepare staging cluster for Node 24 compatibility verification.',
        type: 'Task',
        priority: 'LOW',
        status: 'DRAFT',
        team_id: teamMap['Engineering'],
        created_by: userMap['member.eng@newtonite.io'],
        assignee_id: null
      }
    ];

    for (const item of workItems) {
      await connection.execute(
        `INSERT INTO work_items (item_key, title, description, type, priority, status, team_id, created_by, assignee_id, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), priority = VALUES(priority), status = VALUES(status)`,
        [item.item_key, item.title, item.description, item.type, item.priority, item.status, item.team_id, item.created_by, item.assignee_id]
      );
    }

    const [itemRows] = await connection.execute(`SELECT id, item_key FROM work_items`);
    const itemMap = {};
    for (const row of itemRows) {
      itemMap[row.item_key] = row.id;
    }

    // 4. Seed Initial Activity History
    console.log(`[Seed] Seeding activity logs...`);
    const activities = [
      {
        work_item_id: itemMap['NEWT-1001'],
        user_id: userMap['admin@newtonite.io'],
        action: 'CREATED',
        details: JSON.stringify({ note: 'Urgent incident reported from Datadog alert' })
      },
      {
        work_item_id: itemMap['NEWT-1002'],
        user_id: userMap['lead.eng@newtonite.io'],
        action: 'ASSIGNED',
        details: JSON.stringify({ assigned_to: 'member.eng@newtonite.io', status: 'IN_PROGRESS' })
      },
      {
        work_item_id: itemMap['NEWT-1003'],
        user_id: userMap['member.eng@newtonite.io'],
        action: 'STATUS_CHANGED',
        details: JSON.stringify({ from: 'IN_PROGRESS', to: 'PENDING_APPROVAL', reason: 'Refund exceeds member threshold' })
      }
    ];

    for (const act of activities) {
      await connection.execute(
        `INSERT INTO work_item_activity (work_item_id, user_id, action, details) VALUES (?, ?, ?, ?)`,
        [act.work_item_id, act.user_id, act.action, act.details]
      );
    }

    // 5. Seed Initial Comments
    console.log(`[Seed] Seeding initial comments...`);
    const comments = [
      {
        work_item_id: itemMap['NEWT-1001'],
        user_id: userMap['admin@newtonite.io'],
        content: 'Investigating database connection pool saturation. Anyone available to claim?'
      },
      {
        work_item_id: itemMap['NEWT-1003'],
        user_id: userMap['member.eng@newtonite.io'],
        content: 'Customer provided bank transaction receipts. Submitted for Lead approval.'
      }
    ];

    for (const c of comments) {
      await connection.execute(
        `INSERT INTO comments (work_item_id, user_id, content) VALUES (?, ?, ?)`,
        [c.work_item_id, c.user_id, c.content]
      );
    }

    console.log(`\n[Seed Success] Database '${config.db.database}' seeded successfully!`);
    console.log(`Demo Users seeded (all with password: 'password123'):`);
    for (const u of users) {
      console.log(`  - [${u.role.padEnd(6)}] ${u.email}`);
    }
  } catch (error) {
    console.error(`\n[Seed Error] Failed to seed database:`, error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = runSeed;

-- Newtonite Ops Database Schema (MySQL 8.0)
-- Strict InnoDB tables with foreign key constraints, indexes, and concurrency support

-- 1. Teams Table
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('VIEWER', 'MEMBER', 'LEAD', 'ADMIN') NOT NULL DEFAULT 'MEMBER',
  team_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  INDEX idx_users_team_role (team_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Work Items Table
CREATE TABLE IF NOT EXISTS work_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_key VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  type ENUM('Incident', 'Customer Issue', 'Payment', 'Compliance', 'Task') NOT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('DRAFT', 'OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  team_id INT NOT NULL,
  created_by INT NOT NULL,
  assignee_id INT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_work_items_team (team_id),
  INDEX idx_work_items_assignee (assignee_id),
  INDEX idx_work_items_status (status),
  INDEX idx_work_items_priority (priority),
  INDEX idx_work_items_unassigned_urgent (status, priority, assignee_id),
  INDEX idx_work_items_approval (status, team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Work Item Activity (Append-only Audit Log)
CREATE TABLE IF NOT EXISTS work_item_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_item_id INT NOT NULL,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_activity_work_item (work_item_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_item_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_comments_work_item (work_item_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key VARCHAR(128) PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INT NOT NULL,
  response_body JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_idempotency_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

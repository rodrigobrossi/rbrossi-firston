-- Migration: pipeline_columns — user-configurable kanban stages
-- Run once against existing firston_crm databases

CREATE TABLE IF NOT EXISTS pipeline_columns (
  id         CHAR(36)     PRIMARY KEY,
  owner_id   CHAR(36)     NOT NULL,
  key_name   VARCHAR(50)  NOT NULL,
  label      VARCHAR(100) NOT NULL,
  color      VARCHAR(20)  NOT NULL DEFAULT '#60A5FA',
  position   TINYINT      NOT NULL DEFAULT 0,
  visible    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_owner_key (owner_id, key_name),
  INDEX idx_owner_pos (owner_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

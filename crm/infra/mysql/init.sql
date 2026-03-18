-- ============================================================
-- FirstOn CRM — MySQL 8.0 Schema
-- UTF8MB4 | Timezone: America/Sao_Paulo
-- PII fields stored encrypted (AES-256-GCM via app layer)
-- ============================================================
SET NAMES utf8mb4;
SET time_zone = 'America/Sao_Paulo';

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36)      PRIMARY KEY,
  email_hash      CHAR(64)      NOT NULL,
  email_enc       TEXT          NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  oauth_provider  ENUM('google','microsoft','apple','email') NOT NULL DEFAULT 'email',
  oauth_id        VARCHAR(255)  NOT NULL,
  plan_id         VARCHAR(50)   NOT NULL DEFAULT 'pro',
  active          TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,
  UNIQUE KEY uq_email_hash (email_hash),
  UNIQUE KEY uq_oauth (oauth_provider, oauth_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── COMPANIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id          CHAR(36)     PRIMARY KEY,
  owner_id    CHAR(36)     NOT NULL,
  name        VARCHAR(300) NOT NULL,
  cnpj_enc    TEXT         NULL,
  sector      VARCHAR(100) NULL,
  size        ENUM('micro','pequena','media','grande','enterprise') NULL,
  address_enc TEXT         NULL,
  website     VARCHAR(300) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,
  INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CONTACTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                  CHAR(36)      PRIMARY KEY,
  owner_id            CHAR(36)      NOT NULL,
  company_id          CHAR(36)      NULL,
  first_name          VARCHAR(100)  NOT NULL,
  last_name           VARCHAR(100)  NULL,
  title               VARCHAR(200)  NULL,
  -- PII — all encrypted with AES-256-GCM (app layer; KMS data key in prod)
  email_hash          CHAR(64)      NULL,
  email_enc           TEXT          NULL,
  phone_enc           TEXT          NULL,
  phone2_enc          TEXT          NULL,
  cpf_enc             TEXT          NULL,
  date_of_birth_enc   TEXT          NULL,
  preferred_name_enc  TEXT          NULL,
  address_enc         TEXT          NULL,
  -- Non-PII identity
  sex                 ENUM('male','female','intersex','not_informed') NULL,
  gender              VARCHAR(100)  NULL,
  address_lat         DECIMAL(10,8) NULL,
  address_lng         DECIMAL(11,8) NULL,
  -- Photo stored in S3 (firston-assets bucket)
  photo_key           VARCHAR(500)  NULL,
  -- CRM fields
  linkedin_url        VARCHAR(500)  NULL,
  profile_score       TINYINT       NOT NULL DEFAULT 0,
  tags                JSON          NULL,
  source              VARCHAR(100)  NULL DEFAULT 'manual',
  preferred_channel   ENUM('whatsapp','email','phone','sms') NOT NULL DEFAULT 'whatsapp',
  sector              VARCHAR(100)  NULL,
  budget_brl          DECIMAL(12,2) NULL,
  buy_cycle_days      INT           NULL,
  temperature         ENUM('hot','warm','cold','customer') NOT NULL DEFAULT 'cold',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME      NULL,
  INDEX idx_owner (owner_id),
  INDEX idx_company (company_id),
  INDEX idx_email_hash (email_hash),
  INDEX idx_temperature (owner_id, temperature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── EVENTS / CALENDAR ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id               CHAR(36)     PRIMARY KEY,
  owner_id         CHAR(36)     NOT NULL,
  contact_id       CHAR(36)     NULL,
  title            VARCHAR(300) NOT NULL,
  description      TEXT         NULL,
  start_at         DATETIME     NOT NULL,
  end_at           DATETIME     NOT NULL,
  type             ENUM('meeting','call','demo','follow_up','contract','other') NOT NULL DEFAULT 'meeting',
  status           ENUM('scheduled','done','cancelled','rescheduled') NOT NULL DEFAULT 'scheduled',
  win_odds         TINYINT      NULL,
  location         VARCHAR(500) NULL,
  notes            TEXT         NULL,
  google_event_id  VARCHAR(255) NULL,
  outlook_event_id VARCHAR(255) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_owner_start (owner_id, start_at),
  INDEX idx_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── OPPORTUNITIES (PIPELINE) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunities (
  id             CHAR(36)      PRIMARY KEY,
  owner_id       CHAR(36)      NOT NULL,
  contact_id     CHAR(36)      NOT NULL,
  title          VARCHAR(300)  NOT NULL,
  stage          ENUM('lead','qualification','proposal','negotiation','won','lost') NOT NULL DEFAULT 'lead',
  value_brl      DECIMAL(14,2) NULL,
  win_odds       TINYINT       NOT NULL DEFAULT 0,
  notes          TEXT          NULL,
  expected_close DATE          NULL,
  closed_at      DATETIME      NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_owner_stage (owner_id, stage),
  INDEX idx_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CONTRACTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id             CHAR(36)     PRIMARY KEY,
  opportunity_id CHAR(36)     NOT NULL,
  owner_id       CHAR(36)     NOT NULL,
  title          VARCHAR(300) NOT NULL,
  template_id    CHAR(36)     NULL,
  s3_key         VARCHAR(500) NULL,
  status         ENUM('draft','sent','signed','cancelled') NOT NULL DEFAULT 'draft',
  d4sign_uuid    VARCHAR(255) NULL,
  signed_at      DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_opportunity (opportunity_id),
  INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CONTRACT TEMPLATES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_templates (
  id         CHAR(36)   PRIMARY KEY,
  owner_id   CHAR(36)   NOT NULL,
  name       VARCHAR(200) NOT NULL,
  body_html  LONGTEXT   NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CONVERSATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id              CHAR(36)    PRIMARY KEY,
  contact_id      CHAR(36)    NOT NULL,
  owner_id        CHAR(36)    NOT NULL,
  channel         ENUM('whatsapp','email','sms','phone') NOT NULL,
  started_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME    NULL,
  avg_sentiment   FLOAT       NULL,
  stress_level    FLOAT       NULL,
  INDEX idx_contact (contact_id),
  INDEX idx_owner_last (owner_id, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── MESSAGES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              CHAR(36)    PRIMARY KEY,
  conversation_id CHAR(36)    NOT NULL,
  contact_id      CHAR(36)    NOT NULL,
  owner_id        CHAR(36)    NOT NULL,
  channel         ENUM('whatsapp','email','sms','phone') NOT NULL,
  direction       ENUM('in','out') NOT NULL,
  body_enc        TEXT        NOT NULL,
  sentiment_score FLOAT       NULL,
  stress_level    FLOAT       NULL,
  external_id     VARCHAR(255) NULL,
  sent_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversation (conversation_id),
  INDEX idx_contact_sent (contact_id, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── SUBSCRIPTIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id           CHAR(36)      PRIMARY KEY,
  user_id      CHAR(36)      NOT NULL,
  plan         VARCHAR(50)   NOT NULL DEFAULT 'pro',
  price_brl    DECIMAL(8,2)  NOT NULL DEFAULT 39.90,
  status       ENUM('trialing','pending','active','past_due','cancelled') NOT NULL DEFAULT 'trialing',
  pix_txid     VARCHAR(255)  NULL,
  starts_at    DATETIME      NULL,
  next_billing DATE          NULL,
  cancelled_at DATETIME      NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── PIPELINE COLUMNS (user-configurable kanban stages) ───────
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

-- ── AUDIT LOG (LGPD) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
  user_id    CHAR(36)     NULL,
  action     VARCHAR(100) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id  CHAR(36)     NULL,
  ip_hash    CHAR(64)     NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

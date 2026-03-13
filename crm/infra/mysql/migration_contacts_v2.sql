-- ============================================================
-- Migration: contacts v2 — rich profile fields
-- MySQL 8.0 compatible (no IF NOT EXISTS on ADD COLUMN)
-- Run on an already-running DB; skip if using bash reset.sh
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN phone2_enc         TEXT          NULL AFTER phone_enc,
  ADD COLUMN date_of_birth_enc  TEXT          NULL AFTER cpf_enc,
  ADD COLUMN preferred_name_enc TEXT          NULL AFTER date_of_birth_enc,
  ADD COLUMN address_enc        TEXT          NULL AFTER preferred_name_enc,
  ADD COLUMN sex                ENUM('male','female','intersex','not_informed') NULL AFTER address_enc,
  ADD COLUMN gender             VARCHAR(100)  NULL AFTER sex,
  ADD COLUMN address_lat        DECIMAL(10,8) NULL AFTER gender,
  ADD COLUMN address_lng        DECIMAL(11,8) NULL AFTER address_lat,
  ADD COLUMN photo_key          VARCHAR(500)  NULL AFTER address_lng;

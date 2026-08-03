-- ============================================================
-- Migration: Role-Based Access Control (app_users)
-- Run once in the Supabase SQL editor.
--
-- Roles:
--   admin    — full access (all pages + user management + settings + manual fetch)
--   reviewer — QC audits + view all dashboards/agents/scorecard; no user mgmt/settings
--   agent    — read-only: full team dashboard + agent profiles only
--
-- Any signed-in @nextventures.io user who is NOT listed here defaults to 'agent'.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'reviewer', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app_users (
  email       TEXT PRIMARY KEY,
  role        app_role NOT NULL DEFAULT 'agent',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_users_updated ON app_users;
CREATE TRIGGER trg_app_users_updated
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the initial admins.
INSERT INTO app_users (email, role) VALUES
  ('bdev@nextventures.io', 'admin'),
  ('sayedsakib@nextventures.io', 'admin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- Seed the known CR agents as 'agent' (idempotent; won't downgrade an admin/reviewer).
INSERT INTO app_users (email, role) VALUES
  ('ukyaching.utsha@nextventures.io', 'agent'),
  ('tasnim.hasan@nextventures.io',    'agent'),
  ('aqib@nextventures.io',            'agent'),
  ('anika.mehjaben@nextventures.io',  'agent'),
  ('joshua@nextventures.io',          'agent'),
  ('nuzhat.tabassum@nextventures.io', 'agent'),
  ('vihagi@nextventures.io',          'agent'),
  ('ridah.faisel@nextventures.io',    'agent')
ON CONFLICT (email) DO NOTHING;

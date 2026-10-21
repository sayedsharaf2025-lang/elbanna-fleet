-- 21. دخول تطبيق السائق: رقم سري لكل سائق (مخزّن مشفّر SHA-256 + salt) — بيتحدد من شاشة متابعة السائقين
CREATE TABLE IF NOT EXISTS driver_app_access (
  driver_id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(150)
);
ALTER TABLE driver_app_access DISABLE ROW LEVEL SECURITY;

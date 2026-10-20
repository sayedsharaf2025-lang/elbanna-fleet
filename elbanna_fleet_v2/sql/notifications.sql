-- 20. الإشعارات (طلبات النقل والصيانة) — read_by = معرّفات المستخدمين اللي قرأوا الإشعار
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  kind VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type VARCHAR(20) NOT NULL,
  entity_id TEXT NOT NULL,
  target_screens JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(150),
  read_by JSONB DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

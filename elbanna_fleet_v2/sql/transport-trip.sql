-- 19. رحلة السائق على طلبات النقل (تطبيق السائق + متابعة السائقين)
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS destinations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS execution_date DATE;
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS trip_status VARCHAR(30);
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS trip_leg INTEGER;
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS trip_log JSONB DEFAULT '[]'::jsonb;
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS finish_odometer NUMERIC(12,0);
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS expected_smoke NUMERIC(12,2);

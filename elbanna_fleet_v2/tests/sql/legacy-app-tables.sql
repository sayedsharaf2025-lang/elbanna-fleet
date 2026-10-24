-- جداول التطبيق القديمة (مبسّطة) بالشكل اللي كان عليه: RLS مقفول ومفتوح لـ anon
CREATE TABLE IF NOT EXISTS public.system_settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS public.drivers (id TEXT PRIMARY KEY, driver_code TEXT, name TEXT);
CREATE TABLE IF NOT EXISTS public.cars (id TEXT PRIMARY KEY, car_number TEXT);
CREATE TABLE IF NOT EXISTS public.officials (id TEXT PRIMARY KEY, name TEXT, password TEXT);
CREATE TABLE IF NOT EXISTS public.transport_requests (id TEXT PRIMARY KEY, request_number TEXT);
CREATE TABLE IF NOT EXISTS public.notifications (id TEXT PRIMARY KEY, title TEXT);
ALTER TABLE public.system_settings DISABLE ROW LEVEL SECURITY;
INSERT INTO public.system_settings VALUES
 ('system_users', '[{"id":"sysuser_admin","username":"admin","password":"admin","display_name":"أدمن النظام","role_tag":"admin","allowed_screens":["dashboard","users_settings"]},
                    {"id":"u2","username":"Mona","password":"sha256$ab$cd","display_name":"منى","role_tag":"custom","allowed_screens":["driver_tracking"],"linked_official_id":"o1"},
                    {"id":"u3","username":"mona ","password":"x","display_name":"dup","role_tag":"weird","allowed_screens":[]},
                    {"id":"u4","username":"Reader","password":"x","display_name":"قارئ","role_tag":"custom","allowed_screens":["reports"]}]'),
 ('admin_password','admin'), ('farms','["مزرعة 1"]'), ('role_permissions','{"admin":[]}');
INSERT INTO public.drivers VALUES ('d1','17060','سائق 1'), ('d2','17061','سائق 2');
INSERT INTO public.cars VALUES ('c1','أ ب ج 123');
INSERT INTO public.officials VALUES ('o1','منى','sha256$aa$bb');
INSERT INTO public.transport_requests VALUES ('t1','2610-0001');

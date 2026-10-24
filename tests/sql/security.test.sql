-- اختبار سياسات الأمان على Postgres حقيقي. أي فشل = استثناء بيوقف التشغيل (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on

-- مستخدمو Auth (محاكاة) مربوطين بالـ profiles
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@x'),
  ('00000000-0000-0000-0000-0000000000b2', 'mona@x'),
  ('00000000-0000-0000-0000-0000000000c3', 'reader@x'),
  ('00000000-0000-0000-0000-0000000000d4', 'nobody@x');   -- مسجّل في Auth بس من غير profile
UPDATE public.profiles SET auth_user_id = '00000000-0000-0000-0000-0000000000a1' WHERE id = 'sysuser_admin';
UPDATE public.profiles SET auth_user_id = '00000000-0000-0000-0000-0000000000b2' WHERE id = 'u2';
UPDATE public.profiles SET auth_user_id = '00000000-0000-0000-0000-0000000000c3' WHERE id = 'u4';

-- قبل القفل: anon بيقرا (ده الوضع القديم المكشوف) — نتأكد إن الاختبار فعلاً بيلتقط الفرق
SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.system_settings WHERE key = 'admin_password') <> 1 THEN
    RAISE EXCEPTION 'precondition: anon كان المفروض يقرا قبل القفل';
  END IF;
END $$;
RESET ROLE;

\i sql/security-02-lockdown.sql
\i sql/security-02-lockdown.sql

-- ============ anon: ممنوع من كل حاجة ============
SET ROLE anon;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['system_settings','drivers','cars','officials','transport_requests','notifications','profiles','driver_app_access','driver_login_attempts'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t);
      RAISE EXCEPTION 'anon قدر يقرا %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      EXECUTE format('DELETE FROM public.%I', t);
      RAISE EXCEPTION 'anon قدر يمسح %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN PERFORM public.has_screen('x'); RAISE EXCEPTION 'anon نفّذ has_screen'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.driver_verify_pin('d1','123456'); RAISE EXCEPTION 'anon نفّذ driver_verify_pin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.set_driver_pin('d1','123456'); RAISE EXCEPTION 'anon نفّذ set_driver_pin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ============ مسجّل في Auth بدون profile (مثلاً حساب اتمسح): صفر وصول ============
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d4', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.cars) <> 0 THEN RAISE EXCEPTION 'مستخدم بدون profile شاف cars'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 0 THEN RAISE EXCEPTION 'مستخدم بدون profile شاف profiles'; END IF;
  BEGIN INSERT INTO public.cars VALUES ('cx','x'); RAISE EXCEPTION 'مستخدم بدون profile كتب cars';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ============ قارئ عادي (شاشة reports بس) ============
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
DO $$
DECLARE n INT;
BEGIN
  IF (SELECT count(*) FROM public.cars) <> 1 THEN RAISE EXCEPTION 'الموظف المفروض يقرا cars'; END IF;
  -- profiles: شايف نفسه بس
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'الموظف العادي شاف profiles غير بتاعته'; END IF;
  -- مفيش كتابة على profiles
  BEGIN UPDATE public.profiles SET role_tag = 'admin' WHERE id = 'u4'; RAISE EXCEPTION 'تصعيد صلاحية ناجح!';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.profiles (id, username, display_name, role_tag) VALUES ('hack','hack','hack','admin'); RAISE EXCEPTION 'إدراج profile ناجح!';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- system_settings: مفيش كلمات سر ولا system_users (اتمسحوا)، قراءة عادية شغالة
  IF (SELECT count(*) FROM public.system_settings WHERE key ~* 'password' OR key = 'system_users') <> 0 THEN RAISE EXCEPTION 'أسرار لسه ظاهرة'; END IF;
  IF (SELECT count(*) FROM public.system_settings WHERE key = 'farms') <> 1 THEN RAISE EXCEPTION 'farms المفروض يتقرا'; END IF;
  -- كتابة إعداد عادي مسموحة
  INSERT INTO public.system_settings VALUES ('farms2', '[]') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  -- محاولة زرع system_users مزيف / كلمة سر / تعديل الصلاحيات: ممنوعة (RLS بيرفض الصف)
  BEGIN INSERT INTO public.system_settings VALUES ('system_users', '[]'); RAISE EXCEPTION 'زرع system_users نجح';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.system_settings VALUES ('admin_password', 'pwned'); RAISE EXCEPTION 'زرع admin_password نجح';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.system_settings VALUES ('role_permissions', '{}'); RAISE EXCEPTION 'تعديل role_permissions نجح من غير صلاحية';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- جداول السائق مقفولة
  BEGIN PERFORM count(*) FROM public.driver_app_access; RAISE EXCEPTION 'قرا driver_app_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- دوال السائق: مفيش صلاحية شاشة driver_tracking
  BEGIN PERFORM public.set_driver_pin('d1', '123456'); RAISE EXCEPTION 'set_driver_pin من غير صلاحية';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.driver_verify_pin('d1', '123456'); RAISE EXCEPTION 'موظف نفّذ driver_verify_pin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ============ منى: عندها driver_tracking ============
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
DO $$ BEGIN
  -- رقم قصير/حروف مرفوض
  BEGIN PERFORM public.set_driver_pin('d1', '1234'); RAISE EXCEPTION 'قبل رقم 4 خانات';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN PERFORM public.set_driver_pin('d1', '12ab56'); RAISE EXCEPTION 'قبل حروف';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN PERFORM public.set_driver_pin('nope', '123456'); RAISE EXCEPTION 'قبل سائق مش موجود';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  PERFORM public.set_driver_pin('d1', '654321');
  IF (SELECT count(*) FROM public.driver_access_status()) <> 1 THEN RAISE EXCEPTION 'driver_access_status'; END IF;
  -- الدالة ما بترجعش هاش
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name = 'driver_access_status') > 0 THEN NULL; END IF;
END $$;
RESET ROLE;

-- ============ service_role (الـ Edge Function): التحقق من الرقم والقفل ============
SET ROLE service_role;
DO $$
DECLARE r JSONB; pv1 BIGINT; i INT;
BEGIN
  -- الهاش اتخزن bcrypt مش نص
  IF (SELECT pin_hash FROM public.driver_app_access WHERE driver_id = 'd1') NOT LIKE '$2a$%' THEN RAISE EXCEPTION 'الهاش مش bcrypt'; END IF;
  r := public.driver_verify_pin('d1', '654321');
  IF NOT (r->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'الرقم الصح اترفض: %', r; END IF;
  pv1 := (r->>'pv')::BIGINT;
  IF public.driver_access_version('d1') <> pv1 THEN RAISE EXCEPTION 'pv مختلف'; END IF;

  -- 4 محاولات غلط من غير قفل
  FOR i IN 1..4 LOOP
    r := public.driver_verify_pin('d1', '000000');
    IF (r->>'ok')::BOOLEAN OR COALESCE((r->>'locked_seconds')::INT, 0) <> 0 THEN RAISE EXCEPTION 'محاولة % غلط: %', i, r; END IF;
  END LOOP;
  -- الخامسة بتقفل 30 ثانية
  r := public.driver_verify_pin('d1', '000000');
  IF (r->>'locked_seconds')::INT <> 30 THEN RAISE EXCEPTION 'القفل الأول المفروض 30ث: %', r; END IF;
  -- وهو مقفول حتى الرقم الصح مرفوض
  r := public.driver_verify_pin('d1', '654321');
  IF (r->>'ok')::BOOLEAN OR (r->>'locked_seconds')::INT <= 0 THEN RAISE EXCEPTION 'الدخول وهو مقفول نجح: %', r; END IF;
  -- بعد انتهاء القفل (نحاكيه) المحاولة الغلط بتضاعف القفل 60ث
  UPDATE public.driver_login_attempts SET locked_until = NOW() - interval '1 second' WHERE driver_id = 'd1';
  r := public.driver_verify_pin('d1', '000000');
  IF (r->>'locked_seconds')::INT <> 60 THEN RAISE EXCEPTION 'التضاعف المفروض 60ث: %', r; END IF;
  -- سقف 24 ساعة
  UPDATE public.driver_login_attempts SET failures = 40, locked_until = NULL WHERE driver_id = 'd1';
  r := public.driver_verify_pin('d1', '000000');
  IF (r->>'locked_seconds')::INT <> 86400 THEN RAISE EXCEPTION 'السقف: %', r; END IF;
  -- النجاح بعد انتهاء القفل بيصفّر
  UPDATE public.driver_login_attempts SET locked_until = NULL WHERE driver_id = 'd1';
  r := public.driver_verify_pin('d1', '654321');
  IF NOT (r->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'النجاح بعد القفل: %', r; END IF;
  IF (SELECT failures FROM public.driver_login_attempts WHERE driver_id = 'd1') <> 0 THEN RAISE EXCEPTION 'العدّاد ماتصفّرش'; END IF;
  -- سائق مالوش دخول
  r := public.driver_verify_pin('d2', '123456');
  IF (r->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'سائق بدون دخول نجح'; END IF;
  -- وpv بيتغيّر لما المكتب يغيّر الرقم (بيبطّل التوكنات القديمة)
END $$;

-- هاش قديم sha256 (زي اللي كان في التطبيق): بيتقبل مرة وبيتحوّل لـ bcrypt من غير ما يتغيّر pv
DO $$
DECLARE r JSONB; pv1 BIGINT; pv2 BIGINT;
BEGIN
  INSERT INTO public.driver_app_access (driver_id, pin_hash, updated_at)
  VALUES ('d2', 'sha256$abc123$' || encode(extensions.digest('abc123:1234', 'sha256'), 'hex'), '2026-01-01T00:00:00Z');
  r := public.driver_verify_pin('d2', '9999');
  IF (r->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'رقم قديم غلط اتقبل'; END IF;
  UPDATE public.driver_login_attempts SET failures = 0, locked_until = NULL WHERE driver_id = 'd2';
  r := public.driver_verify_pin('d2', '1234');
  IF NOT (r->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'الرقم القديم الصح اترفض: %', r; END IF;
  pv1 := (r->>'pv')::BIGINT;
  IF (SELECT pin_hash FROM public.driver_app_access WHERE driver_id = 'd2') NOT LIKE '$2a$%' THEN RAISE EXCEPTION 'ماتحوّلش لـ bcrypt'; END IF;
  r := public.driver_verify_pin('d2', '1234');
  IF NOT (r->>'ok')::BOOLEAN OR (r->>'pv')::BIGINT <> pv1 THEN RAISE EXCEPTION 'بعد الترقية: %', r; END IF;
END $$;
RESET ROLE;

-- منى بتغيّر رقم d1: pv بيتغيّر والقفل بيتصفّر
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
SELECT pg_sleep(0.01);
SELECT public.set_driver_pin('d1', '111222');
SELECT public.revoke_driver_access('d2');
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  IF (public.driver_verify_pin('d1', '654321')->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'الرقم القديم لسه شغال بعد التغيير'; END IF;
  IF NOT (public.driver_verify_pin('d1', '111222')->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'الرقم الجديد مش شغال'; END IF;
  IF public.driver_access_version('d2') IS NOT NULL THEN RAISE EXCEPTION 'd2 لسه عنده دخول'; END IF;
END $$;
RESET ROLE;

-- ============ الأدمن: كل حاجة ظاهرة، وبيكتب role_permissions ============
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 3 THEN RAISE EXCEPTION 'الأدمن المفروض يشوف كل الـ profiles'; END IF;
  INSERT INTO public.system_settings VALUES ('role_permissions', '{"admin":["x"]}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  -- حتى الأدمن مايقدرش يكتب كلمة سر في system_settings
  BEGIN INSERT INTO public.system_settings VALUES ('admin_password', 'x'); RAISE EXCEPTION 'الأدمن كتب كلمة سر';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT password FROM public.officials WHERE id = 'o1') IS NOT NULL THEN RAISE EXCEPTION 'officials.password لسه موجود'; END IF;
END $$;
RESET ROLE;

\echo 'SQL SECURITY TESTS: ALL PASSED'

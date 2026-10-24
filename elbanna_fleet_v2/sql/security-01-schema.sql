-- ============================================================================
-- security-01-schema.sql — المرحلة 1 من تأمين النظام (آمن: مايكسرش التطبيق القديم)
--
-- بينشئ:
--   * جدول profiles: بيانات المستخدمين (الاسم/الدور/الشاشات) — كلمات السر عند Supabase Auth بس.
--   * دوال الصلاحيات is_staff / is_admin / has_screen اللي هتعتمد عليها سياسات RLS.
--   * حماية تطبيق السائق: جدول محاولات الدخول (قفل من السيرفر) + دوال الرقم السري (bcrypt).
--
-- مابيفعّلش RLS ومابيسحبش أي صلاحية — ده في security-02-lockdown.sql بعد نشر التطبيق الجديد.
-- آمن إنك تشغّله أكتر من مرة.
-- ============================================================================

-- الإضافات: Supabase بتحط pgcrypto في schema اسمه extensions
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1) المستخدمين
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id               TEXT PRIMARY KEY,                       -- نفس SystemUser.id في التطبيق
  auth_user_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username         TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  role_tag         TEXT NOT NULL DEFAULT 'custom'
                   CHECK (role_tag IN ('admin', 'manager', 'movement_supervisor', 'requests_agent', 'custom')),
  allowed_screens  JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_official_id TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(btrim(username)));

-- ----------------------------------------------------------------------------
-- 2) دوال الصلاحيات (SECURITY DEFINER عشان تقرا profiles من غير ما RLS يلفّ على نفسه)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id = auth.uid() AND p.active)
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id = auth.uid() AND p.active AND p.role_tag = 'admin')
$$;

-- الأدمن بيعدّي على أي شاشة؛ غيره لازم تكون الشاشة في allowed_screens بتاعته
CREATE OR REPLACE FUNCTION public.has_screen(p_screen TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.active
      AND (p.role_tag = 'admin' OR p.allowed_screens ? p_screen)
  )
$$;

REVOKE ALL ON FUNCTION public.is_staff(), public.is_admin(), public.has_screen(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(), public.is_admin(), public.has_screen(TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) ترحيل المستخدمين الحاليين من system_settings (بدون كلمات السر — دي بتتعمل من جديد في Auth)
--    بتتنادى هنا وتتنادى تاني في security-02 قبل مسح النسخة القديمة.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._migrate_legacy_system_users() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw TEXT;
  v_json JSONB;
  v_count INTEGER := 0;
BEGIN
  IF to_regclass('public.system_settings') IS NULL THEN RETURN 0; END IF;
  SELECT value::TEXT INTO v_raw FROM public.system_settings WHERE key = 'system_users' LIMIT 1;
  IF v_raw IS NULL THEN RETURN 0; END IF;
  BEGIN
    v_json := v_raw::JSONB;
    -- لو القيمة اتخزنت كنص JSON جوّه JSON (string) نفكّها
    IF jsonb_typeof(v_json) = 'string' THEN v_json := (v_json #>> '{}')::JSONB; END IF;
  EXCEPTION WHEN others THEN
    RETURN 0;
  END;
  IF jsonb_typeof(v_json) <> 'array' THEN RETURN 0; END IF;

  INSERT INTO public.profiles (id, username, display_name, role_tag, allowed_screens, linked_official_id)
  SELECT
    u->>'id',
    btrim(u->>'username'),
    COALESCE(NULLIF(btrim(u->>'display_name'), ''), btrim(u->>'username')),
    CASE WHEN u->>'role_tag' IN ('admin', 'manager', 'movement_supervisor', 'requests_agent') THEN u->>'role_tag' ELSE 'custom' END,
    CASE WHEN jsonb_typeof(u->'allowed_screens') = 'array' THEN u->'allowed_screens' ELSE '[]'::JSONB END,
    NULLIF(u->>'linked_official_id', '')
  FROM jsonb_array_elements(v_json) AS u
  WHERE COALESCE(u->>'id', '') <> '' AND COALESCE(btrim(u->>'username'), '') <> ''
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION public._migrate_legacy_system_users() FROM PUBLIC, anon, authenticated;

SELECT public._migrate_legacy_system_users();

-- ----------------------------------------------------------------------------
-- 4) تطبيق السائق: جدول الدخول + محاولات الدخول الفاشلة
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_app_access (
  driver_id   TEXT PRIMARY KEY,
  pin_hash    TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS public.driver_login_attempts (
  driver_id      TEXT PRIMARY KEY,
  failures       INTEGER NOT NULL DEFAULT 0,
  locked_until   TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ
);

-- التحقق من الرقم السري + القفل من السيرفر (مش قابل للتخطي من الجهاز):
--   5 محاولات فاشلة ← قفل 30ث، وبيتضاعف مع كل محاولة بعدها لحد 24 ساعة. النجاح بيصفّر العدّاد.
--   FOR UPDATE بيسلسل المحاولات المتوازية فمفيش تخمين متوازي.
--   الأرقام القديمة (sha256$salt$hash) بتتقبل مرة وتتحوّل لـ bcrypt أول دخول ناجح.
-- بترجّع JSON: {ok, locked_seconds?, pv?}  — pv بيتغيّر لما المكتب يغيّر الرقم السري (بيبطّل التوكنات القديمة)
CREATE OR REPLACE FUNCTION public.driver_verify_pin(p_driver_id TEXT, p_pin TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  a public.driver_login_attempts;
  acc public.driver_app_access;
  v_ok BOOLEAN := FALSE;
  v_wait INTEGER;
  v_new_fail INTEGER;
BEGIN
  IF p_driver_id IS NULL OR p_pin IS NULL OR length(p_pin) > 64 THEN
    RETURN jsonb_build_object('ok', FALSE);
  END IF;

  INSERT INTO public.driver_login_attempts (driver_id) VALUES (p_driver_id) ON CONFLICT DO NOTHING;
  SELECT * INTO a FROM public.driver_login_attempts WHERE driver_id = p_driver_id FOR UPDATE;

  IF a.locked_until IS NOT NULL AND a.locked_until > NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'locked_seconds', CEIL(EXTRACT(EPOCH FROM (a.locked_until - NOW())))::INTEGER);
  END IF;

  SELECT * INTO acc FROM public.driver_app_access WHERE driver_id = p_driver_id;
  IF FOUND THEN
    IF acc.pin_hash LIKE 'sha256$%' THEN
      v_ok := split_part(acc.pin_hash, '$', 3) =
              encode(digest(split_part(acc.pin_hash, '$', 2) || ':' || p_pin, 'sha256'), 'hex');
      IF v_ok THEN
        -- ترقية الهاش لـ bcrypt (من غير ما نغيّر updated_at عشان التوكنات تفضل صالحة)
        UPDATE public.driver_app_access SET pin_hash = crypt(p_pin, gen_salt('bf', 10)) WHERE driver_id = p_driver_id;
      END IF;
    ELSE
      v_ok := acc.pin_hash = crypt(p_pin, acc.pin_hash);
    END IF;
  ELSE
    PERFORM crypt(p_pin, gen_salt('bf', 10)); -- نفس زمن الحالة العادية
  END IF;

  IF v_ok THEN
    UPDATE public.driver_login_attempts SET failures = 0, locked_until = NULL WHERE driver_id = p_driver_id;
    SELECT * INTO acc FROM public.driver_app_access WHERE driver_id = p_driver_id;
    RETURN jsonb_build_object('ok', TRUE, 'pv', FLOOR(EXTRACT(EPOCH FROM COALESCE(acc.updated_at, NOW())) * 1000)::BIGINT);
  END IF;

  v_new_fail := a.failures + 1;
  v_wait := CASE WHEN v_new_fail < 5 THEN 0
                 ELSE LEAST((30 * power(2, LEAST(v_new_fail - 5, 12)))::INTEGER, 86400) END;
  UPDATE public.driver_login_attempts
     SET failures = v_new_fail,
         last_failed_at = NOW(),
         locked_until = CASE WHEN v_wait > 0 THEN NOW() + make_interval(secs => v_wait) ELSE NULL END
   WHERE driver_id = p_driver_id;
  RETURN jsonb_build_object('ok', FALSE, 'locked_seconds', v_wait);
END
$$;

-- الحالة الحالية للسائق (للتحقق من الجلسة): هل لسه عنده دخول، وإيه رقم النسخة pv
CREATE OR REPLACE FUNCTION public.driver_access_version(p_driver_id TEXT) RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT FLOOR(EXTRACT(EPOCH FROM COALESCE(updated_at, NOW())) * 1000)::BIGINT
  FROM public.driver_app_access WHERE driver_id = p_driver_id
$$;

REVOKE ALL ON FUNCTION public.driver_verify_pin(TEXT, TEXT), public.driver_access_version(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_verify_pin(TEXT, TEXT), public.driver_access_version(TEXT) TO service_role;

-- ---- دوال المكتب (من شاشة متابعة السائقين) — بتتحقق إن المستخدم عنده صلاحية الشاشة ----

CREATE OR REPLACE FUNCTION public.set_driver_pin(p_driver_id TEXT, p_pin TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.has_screen('driver_tracking') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{6,8}$' THEN
    RAISE EXCEPTION 'invalid_pin: الرقم السري لازم يكون أرقام فقط من 6 إلى 8 خانات' USING ERRCODE = '22023';
  END IF;
  IF to_regclass('public.drivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE id::TEXT = p_driver_id) THEN
    RAISE EXCEPTION 'driver_not_found' USING ERRCODE = '22023';
  END IF;
  SELECT display_name INTO v_name FROM public.profiles WHERE auth_user_id = auth.uid();
  INSERT INTO public.driver_app_access (driver_id, pin_hash, updated_at, updated_by)
  VALUES (p_driver_id, crypt(p_pin, gen_salt('bf', 10)), NOW(), LEFT(COALESCE(v_name, ''), 150))
  ON CONFLICT (driver_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, updated_at = NOW(), updated_by = EXCLUDED.updated_by;
  DELETE FROM public.driver_login_attempts WHERE driver_id = p_driver_id;
END
$$;

CREATE OR REPLACE FUNCTION public.revoke_driver_access(p_driver_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_screen('driver_tracking') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.driver_app_access WHERE driver_id = p_driver_id;
  DELETE FROM public.driver_login_attempts WHERE driver_id = p_driver_id;
END
$$;

-- مين عنده دخول (من غير الهاش أبدًا)
CREATE OR REPLACE FUNCTION public.driver_access_status() RETURNS TABLE (driver_id TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_screen('driver_tracking') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT a.driver_id, a.updated_at FROM public.driver_app_access a;
END
$$;

REVOKE ALL ON FUNCTION public.set_driver_pin(TEXT, TEXT), public.revoke_driver_access(TEXT), public.driver_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_driver_pin(TEXT, TEXT), public.revoke_driver_access(TEXT), public.driver_access_status() TO authenticated;

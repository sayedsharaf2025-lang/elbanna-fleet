-- ============================================================================
-- security-02-lockdown.sql — المرحلة 2: قفل قاعدة البيانات
--
-- ⚠️ شغّله بعد ما تنشر التطبيق الجديد (الويب + الـ APK) وتجرّب الدخول بيه — لأن النسخ القديمة
--    من التطبيق هتبطّل تشتغل بعده (دي النقطة: مفيش وصول من غير تسجيل دخول حقيقي).
--
-- بيعمل:
--   1) يعيد ترحيل أي مستخدمين اتضافوا بعد security-01 ثم يمسح النسخة القديمة (كلمات السر) من system_settings.
--   2) يفعّل RLS على كل جداول public ويسحب كل صلاحيات anon (الزائر بدون دخول).
--   3) سياسات: الموظف المسجّل (is_staff) يقرا ويكتب جداول العمل؛ profiles للقراءة بس؛
--      system_settings بيمنع الكتابة في مفاتيح الأمان؛ جداول السائق مقفولة بالكامل (دوال بس).
-- آمن إنك تشغّله أكتر من مرة.
-- ============================================================================

-- 1) ترحيل أخير + مسح الأسرار القديمة -----------------------------------------
SELECT public._migrate_legacy_system_users();

DO $$
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    DELETE FROM public.system_settings
     WHERE key IN ('system_users', 'admin_password', 'manager_password',
                   'movement_supervisor_password', 'requests_agent_password')
        OR key ~* 'password';
  END IF;
  -- كلمات سر المسؤولين القديمة (هاش/نص عادي) ماعادتش مستخدمة — الدخول بقى عبر Supabase Auth
  IF to_regclass('public.officials') IS NOT NULL AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'officials' AND column_name = 'password') THEN
    EXECUTE 'UPDATE public.officials SET password = NULL';
  END IF;
END $$;

-- 2) سحب صلاحيات الزائر (anon) من كل حاجة في public --------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- 3) RLS على كل الجداول + سياسة الموظفين الافتراضية ---------------------------
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT IN ('profiles', 'system_settings', 'driver_app_access', 'driver_login_attempts')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY staff_all ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()))',
      t.tablename);
  END LOOP;
END $$;

-- profiles: القراءة بس (صاحب الحساب أو صاحب شاشة المستخدمين). الكتابة من دالة admin-users (service role) بس.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (SELECT public.has_screen('users_settings')));

-- system_settings: قراءة للموظفين، وكتابة بس في المفاتيح الغير حساسة
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
DROP POLICY IF EXISTS settings_read   ON public.system_settings;
DROP POLICY IF EXISTS settings_insert ON public.system_settings;
DROP POLICY IF EXISTS settings_update ON public.system_settings;
DROP POLICY IF EXISTS settings_delete ON public.system_settings;
CREATE POLICY settings_read ON public.system_settings FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) AND key !~* 'password');
CREATE POLICY settings_insert ON public.system_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff()) AND key !~* 'password' AND key <> 'system_users'
              AND (key NOT IN ('role_permissions', 'official_custom_screens') OR (SELECT public.has_screen('users_settings'))));
CREATE POLICY settings_update ON public.system_settings FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff()) AND key !~* 'password' AND key <> 'system_users'
         AND (key NOT IN ('role_permissions', 'official_custom_screens') OR (SELECT public.has_screen('users_settings'))))
  WITH CHECK ((SELECT public.is_staff()) AND key !~* 'password' AND key <> 'system_users'
              AND (key NOT IN ('role_permissions', 'official_custom_screens') OR (SELECT public.has_screen('users_settings'))));
CREATE POLICY settings_delete ON public.system_settings FOR DELETE TO authenticated
  USING ((SELECT public.is_staff()) AND key !~* 'password' AND key <> 'system_users'
         AND (key NOT IN ('role_permissions', 'official_custom_screens') OR (SELECT public.has_screen('users_settings'))));

-- جداول السائق: مقفولة تمامًا — مفيش سياسات، ومفيش صلاحيات؛ الوصول بس عبر الدوال (SECURITY DEFINER) والـ Edge Function
ALTER TABLE public.driver_app_access     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_app_access, public.driver_login_attempts FROM anon, authenticated;

-- ملحوظة: دوال is_staff/has_screen/... اتمنحت لـ authenticated و service_role بس في security-01.
-- الـ Edge Functions بتستخدم service_role (بيتخطى RLS) — فمايتحطش في التطبيق أبدًا.

-- تفعيل Supabase Realtime لطلبات النقل والإشعارات (للمكتب فقط).
-- شغّله مرة واحدة في Supabase SQL Editor. آمن لو اتشغّل أكتر من مرة.

-- 1) إضافة الجدولين لـ publication الخاص بـ Realtime
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transport_requests', 'notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 2) أحداث DELETE/UPDATE تتضمن الصف القديم كامل (الـ id كفاية بس ده أأمن مع RLS)
ALTER TABLE public.transport_requests REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ملحوظة: الملف ده مابيغيّرش RLS. Realtime بيحترم سياسات RLS، فبعد تشغيل security-02-lockdown.sql
-- (سياسة staff_all) الأحداث بتوصل للموظفين المسجّلين بس. قبل الـ lockdown الأحداث متاحة لأي حد معاه مفتاح anon.

-- تحقق: لازم يرجّع الجدولين
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('transport_requests','notifications');

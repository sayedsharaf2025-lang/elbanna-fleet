// Edge Function: driver-api — كل عمليات تطبيق السائق (دخول، رحلات، تنفيذ خطوات).
// النشر: supabase functions deploy driver-api --no-verify-jwt   (السائق مالوش JWT؛ الدالة بتتحقق من توكنها)
// الأسرار: supabase secrets set DRIVER_TOKEN_SECRET=<نص عشوائي 32+ حرف>
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleDriverApi } from '../_shared/driverApiHandler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req: Request) => handleDriverApi(req, { db, secret: Deno.env.get('DRIVER_TOKEN_SECRET') ?? '' }));

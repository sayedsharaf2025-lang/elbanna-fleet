// Edge Function: admin-users — إدارة مستخدمي المكتب عبر Supabase Auth.
// النشر: supabase functions deploy admin-users --no-verify-jwt   (التحقق من المستخدم بيتم جوه الدالة)
// الأسرار: supabase secrets set BOOTSTRAP_SECRET=<نص عشوائي طويل>   (للأدمن الأول بس)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleAdminUsers } from '../_shared/adminUsersHandler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req: Request) => handleAdminUsers(req, { admin, bootstrapSecret: Deno.env.get('BOOTSTRAP_SECRET') ?? undefined }));

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// استدعاءات Edge Function إدارة المستخدمين (admin-users). كلمات السر بتتحفظ في Supabase Auth بس —
// الدالة بتتحقق إن المنادي أدمن/صاحب شاشة المستخدمين، فالعميل نفسه مايقدرش يكتب في جدول profiles.
import { ADMIN_USERS_FUNCTION } from './functionNames';
import { getSupabaseClient } from './supabaseClient';

export interface AdminApiResult<T = any> { ok: boolean; error?: string; code?: string; data?: T; user?: any }

const SETUP_HINT = 'دالة إدارة المستخدمين (admin-users) مش منشورة على Supabase — راجع SECURITY.md.';

export async function callAdminUsers<T = any>(body: Record<string, unknown>): Promise<AdminApiResult<T>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'إعدادات الاتصال بقاعدة البيانات غير متوفرة.' };
  try {
    const { data, error } = await client.functions.invoke(ADMIN_USERS_FUNCTION, { body });
    if (error) {
      const m = String(error?.message || '');
      if (/not found|404|FunctionsRelayError|FunctionsHttpError/i.test(m)) return { ok: false, error: SETUP_HINT };
      if (/fetch|network|failed to send/i.test(m)) return { ok: false, error: 'مفيش اتصال بالإنترنت. جرّب تاني.' };
      return { ok: false, error: `تعذر تنفيذ الطلب: ${m}` };
    }
    if (!data || typeof data !== 'object') return { ok: false, error: SETUP_HINT };
    return data as AdminApiResult<T>;
  } catch (e: any) {
    return { ok: false, error: `تعذر تنفيذ الطلب: ${e?.message || e}` };
  }
}

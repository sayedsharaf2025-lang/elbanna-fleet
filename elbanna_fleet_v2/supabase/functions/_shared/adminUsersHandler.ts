// منطق Edge Function إدارة مستخدمي المكتب (admin-users).
// كلمات السر عند Supabase Auth فقط (bcrypt على السيرفر) — جدول profiles فيه الاسم والصلاحيات من غير أي سر.
// الجدولين محميين بـ RLS: العميل مايقدرش يكتب في profiles؛ الكتابة من هنا بـ service_role بعد التحقق من صلاحية المنادي.
import { usernameToEmail, normalizeUsername } from './authEmail.ts';
import { DEFAULT_ROLE_PERMISSIONS } from './permissions.ts';
import { fail, json, preflight, readJson, timingSafeEqual } from './http.ts';

export interface AdminUsersDeps {
  /** عميل Supabase بصلاحية service_role (أو بديل وهمي في الاختبارات) */
  admin: any;
  /** سر أول تشغيل (BOOTSTRAP_SECRET) — لو مش مضبوط، أول تشغيل متعطّل */
  bootstrapSecret?: string;
}

interface Profile {
  id: string;
  auth_user_id: string | null;
  username: string;
  display_name: string;
  role_tag: string;
  allowed_screens: string[];
  linked_official_id: string | null;
  active: boolean;
}

const WEAK_PASSWORDS = new Set(['admin', 'manager', 'movement123', 'requests123', '123', '1234', '123456', '12345678', 'password', '11111111', 'qwertyui']);
const MSG_DUP = 'اسم المستخدم ده مستخدم بالفعل';

const publicProfile = (p: Profile) => ({
  id: p.id, username: p.username, display_name: p.display_name, role_tag: p.role_tag,
  allowed_screens: p.allowed_screens, linked_official_id: p.linked_official_id, active: p.active, has_login: !!p.auth_user_id,
});

const isAdmin = (p: Profile) => p.role_tag === 'admin';
const canManageUsers = (p: Profile) => isAdmin(p) || (Array.isArray(p.allowed_screens) && p.allowed_screens.includes('users_settings'));

// ===== التحقق من المدخلات =====
export function validatePassword(password: unknown, username: string): string | null {
  if (typeof password !== 'string') return 'كلمة المرور مطلوبة.';
  if (password.length < 8) return 'كلمة المرور لازم تكون 8 حروف على الأقل.';
  if (new TextEncoder().encode(password).length > 72) return 'كلمة المرور طويلة جدًا (الحد الأقصى 72 بايت).';
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return 'كلمة المرور ضعيفة ومعروفة — اختار غيرها.';
  if (normalizeUsername(password) === normalizeUsername(username)) return 'كلمة المرور لازم تختلف عن اسم المستخدم.';
  return null;
}
const cleanUsername = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length >= 2 && s.length <= 60 && !/[\u0000-\u001f]/.test(s) ? s : null;
};
const cleanName = (v: unknown, fallback: string): string => {
  const s = typeof v === 'string' ? v.trim().slice(0, 100) : '';
  return s || fallback;
};
const cleanScreens = (v: unknown): string[] | null => {
  if (!Array.isArray(v) || v.length > 100) return null;
  const out = new Set<string>();
  for (const s of v) { if (typeof s !== 'string' || !/^[a-z0-9_]{1,60}$/.test(s)) return null; out.add(s); }
  return Array.from(out);
};

// كلمة سر مؤقتة قوية (بدون حروف ملتبسة)
export function generateTempPassword(len = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

export async function handleAdminUsers(req: Request, deps: AdminUsersDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const body = await readJson(req);
  if (!body) return fail('طلب غير صالح.');
  const admin = deps.admin;

  try {
    if (body.action === 'bootstrap') return await bootstrap(admin, deps.bootstrapSecret, body);

    const caller = await authenticate(req, admin);
    if (!caller) return fail('لازم تسجّل الدخول.', { code: 'unauthenticated' });
    if (!canManageUsers(caller)) return fail('مفيش عندك صلاحية إدارة المستخدمين.', { code: 'forbidden' });

    switch (body.action) {
      case 'create': return await createUser(admin, caller, body);
      case 'update': return await updateUser(admin, caller, body);
      case 'delete': return await deleteUser(admin, caller, body);
      case 'provision': return await provision(admin, caller);
      default: return fail('عملية غير معروفة.');
    }
  } catch (e: any) {
    return fail(`تعذر تنفيذ الطلب: ${e?.message || e}`);
  }
}

async function authenticate(req: Request, admin: any): Promise<Profile | null> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: p } = await admin.from('profiles').select('*').eq('auth_user_id', data.user.id).maybeSingle();
  return p && p.active ? (p as Profile) : null;
}

async function usernameTaken(admin: any, username: string, exceptId?: string): Promise<boolean> {
  const escaped = username.trim().replace(/[\\%_]/g, c => `\\${c}`);
  const { data } = await admin.from('profiles').select('id, username').ilike('username', escaped);
  return (data || []).some((r: any) => r.id !== exceptId && normalizeUsername(r.username) === normalizeUsername(username));
}

async function findAuthUserIdByEmail(admin: any, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (!data?.users || data.users.length < 1000) return null;
  }
  return null;
}

// بينشئ مستخدم Auth؛ لو البريد موجود من محاولة قديمة ومش مربوط بأي profile بنعيد استخدامه ونصفّر كلمته
async function createAuthUser(admin: any, email: string, password: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && data?.user) return { id: data.user.id };
  const msg = String(error?.message || '');
  if (/already|registered|exists/i.test(msg)) {
    const existing = await findAuthUserIdByEmail(admin, email);
    if (existing) {
      const { data: linked } = await admin.from('profiles').select('id').eq('auth_user_id', existing).maybeSingle();
      if (linked) return { error: MSG_DUP };
      const { error: upErr } = await admin.auth.admin.updateUserById(existing, { password, email_confirm: true });
      if (!upErr) return { id: existing };
      return { error: upErr.message };
    }
    return { error: MSG_DUP };
  }
  return { error: msg || 'تعذر إنشاء الحساب.' };
}

// ===== أول تشغيل: أول أدمن (بسر BOOTSTRAP_SECRET، ومرة واحدة بس) =====
async function bootstrap(admin: any, secret: string | undefined, body: Record<string, any>): Promise<Response> {
  if (!secret || secret.length < 16) return fail('أول تشغيل متعطّل: اضبط BOOTSTRAP_SECRET (16 حرف على الأقل) على السيرفر.');
  if (typeof body.secret !== 'string' || !timingSafeEqual(body.secret, secret)) return fail('السر غير صحيح.', { code: 'forbidden' });

  const { data: linkedAdmins } = await admin.from('profiles').select('id').eq('role_tag', 'admin').not('auth_user_id', 'is', null).limit(1);
  if (linkedAdmins && linkedAdmins.length > 0) return fail('أول تشغيل اتعمل قبل كده — سجّل الدخول وأضف المستخدمين من شاشة المستخدمين.');

  let { data: adminProfile } = await admin.from('profiles').select('*').eq('role_tag', 'admin').order('created_at', { ascending: true }).limit(1).maybeSingle();
  const username = cleanUsername(body.username) || adminProfile?.username || 'admin';
  const pwErr = validatePassword(body.password, username);
  if (pwErr) return fail(pwErr);
  if (await usernameTaken(admin, username, adminProfile?.id)) return fail(MSG_DUP);

  if (!adminProfile) {
    const { data, error } = await admin.from('profiles').insert({
      id: 'sysuser_admin', username, display_name: 'أدمن النظام', role_tag: 'admin', allowed_screens: DEFAULT_ROLE_PERMISSIONS.admin,
    }).select('*').single();
    if (error) return fail(`تعذر إنشاء الأدمن: ${error.message}`);
    adminProfile = data;
  }
  const created = await createAuthUser(admin, usernameToEmail(username), body.password);
  if (!created.id) return fail(created.error || 'تعذر إنشاء الحساب.');
  const { error: linkErr } = await admin.from('profiles').update({ auth_user_id: created.id, username, updated_at: new Date().toISOString() }).eq('id', adminProfile.id);
  if (linkErr) { await admin.auth.admin.deleteUser(created.id); return fail(`تعذر ربط الحساب: ${linkErr.message}`); }
  return json({ ok: true, data: { username } });
}

// ===== إنشاء =====
async function createUser(admin: any, caller: Profile, body: Record<string, any>): Promise<Response> {
  const username = cleanUsername(body.username);
  if (!username) return fail('اسم المستخدم لازم يكون من حرفين لـ 60 حرف.');
  const pwErr = validatePassword(body.password, username);
  if (pwErr) return fail(pwErr);
  const screens = cleanScreens(body.allowed_screens ?? []);
  if (!screens) return fail('قايمة الشاشات غير صالحة.');
  const screenErr = checkGrantable(caller, screens);
  if (screenErr) return fail(screenErr, { code: 'forbidden' });
  if (await usernameTaken(admin, username)) return fail(MSG_DUP);

  const created = await createAuthUser(admin, usernameToEmail(username), body.password);
  if (!created.id) return fail(created.error || 'تعذر إنشاء الحساب.');
  const row = {
    id: crypto.randomUUID(), auth_user_id: created.id, username, display_name: cleanName(body.display_name, username),
    role_tag: 'custom', allowed_screens: screens,
    linked_official_id: typeof body.linked_official_id === 'string' && body.linked_official_id ? body.linked_official_id.slice(0, 100) : null,
  };
  const { data, error } = await admin.from('profiles').insert(row).select('*').single();
  if (error) {
    await admin.auth.admin.deleteUser(created.id);
    return fail(error.code === '23505' ? MSG_DUP : `تعذر الحفظ: ${error.message}`);
  }
  return json({ ok: true, user: publicProfile(data) });
}

// غير الأدمن مايقدرش يدّي شاشات مش عنده، ولا يدّي شاشة المستخدمين
function checkGrantable(caller: Profile, screens: string[]): string | null {
  if (isAdmin(caller)) return null;
  const mine = new Set(caller.allowed_screens || []);
  if (screens.includes('users_settings')) return 'بس الأدمن يقدر يدّي صلاحية إدارة المستخدمين.';
  const extra = screens.filter(s => !mine.has(s));
  return extra.length ? 'مايصحّش تدّي شاشات مش عندك.' : null;
}

// ===== تعديل =====
async function updateUser(admin: any, caller: Profile, body: Record<string, any>): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  const { data: target } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!target) return fail('المستخدم غير موجود');
  const t = target as Profile;
  if (isAdmin(t) && !isAdmin(caller)) return fail('حساب الأدمن يعدّله الأدمن بس.', { code: 'forbidden' });
  const self = t.id === caller.id;

  const patch: Record<string, unknown> = {};
  let newUsername = t.username;
  if (body.username !== undefined) {
    const u = cleanUsername(body.username);
    if (!u) return fail('اسم المستخدم لازم يكون من حرفين لـ 60 حرف.');
    if (normalizeUsername(u) !== normalizeUsername(t.username) && await usernameTaken(admin, u, t.id)) return fail(MSG_DUP);
    newUsername = u; patch.username = u;
  }
  if (body.display_name !== undefined) patch.display_name = cleanName(body.display_name, newUsername);
  if (body.allowed_screens !== undefined) {
    const screens = cleanScreens(body.allowed_screens);
    if (!screens) return fail('قايمة الشاشات غير صالحة.');
    const err = checkGrantable(caller, screens);
    if (err) return fail(err, { code: 'forbidden' });
    patch.allowed_screens = screens;
  }
  if (body.linked_official_id !== undefined) {
    patch.linked_official_id = typeof body.linked_official_id === 'string' && body.linked_official_id ? body.linked_official_id.slice(0, 100) : null;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return fail('قيمة التفعيل غير صالحة.');
    if (self && !body.active) return fail('مايصحّش توقف حسابك بنفسك.');
    if (!body.active && isAdmin(t)) {
      const { data: others } = await admin.from('profiles').select('id').eq('role_tag', 'admin').eq('active', true).neq('id', t.id).limit(1);
      if (!others || others.length === 0) return fail('ده آخر أدمن فعّال — مايتوقفش.');
    }
    patch.active = body.active;
  }

  // Auth: اسم المستخدم (بريد داخلي) و/أو كلمة المرور
  const wantsPassword = body.password !== undefined && body.password !== '' && body.password !== null;
  if (wantsPassword) {
    const pwErr = validatePassword(body.password, newUsername);
    if (pwErr) return fail(pwErr);
  }
  const usernameChanged = normalizeUsername(newUsername) !== normalizeUsername(t.username);
  if (t.auth_user_id && (usernameChanged || wantsPassword)) {
    const attrs: Record<string, unknown> = { email_confirm: true };
    if (usernameChanged) attrs.email = usernameToEmail(newUsername);
    if (wantsPassword) attrs.password = body.password;
    const { error } = await admin.auth.admin.updateUserById(t.auth_user_id, attrs);
    if (error) return fail(`تعذر تحديث الحساب: ${error.message}`);
  } else if (!t.auth_user_id && wantsPassword) {
    // أول مرة يتحدد له دخول (مستخدم اتنقل من النظام القديم ولسه ماتفعّلش)
    const created = await createAuthUser(admin, usernameToEmail(newUsername), body.password);
    if (!created.id) return fail(created.error || 'تعذر إنشاء الحساب.');
    patch.auth_user_id = created.id;
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from('profiles').update(patch).eq('id', t.id).select('*').single();
    if (error) return fail(error.code === '23505' ? MSG_DUP : `تعذر الحفظ: ${error.message}`);
    return json({ ok: true, user: publicProfile(data) });
  }
  return json({ ok: true, user: publicProfile(t) });
}

// ===== حذف =====
async function deleteUser(admin: any, caller: Profile, body: Record<string, any>): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  const { data: target } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!target) return fail('المستخدم غير موجود');
  const t = target as Profile;
  if (t.id === caller.id) return fail('مايصحّش تمسح حسابك بنفسك.');
  if (isAdmin(t)) {
    if (!isAdmin(caller)) return fail('حساب الأدمن يمسحه الأدمن بس.', { code: 'forbidden' });
    const { data: others } = await admin.from('profiles').select('id').eq('role_tag', 'admin').eq('active', true).neq('id', t.id).limit(1);
    if (!others || others.length === 0) return fail('ده آخر أدمن فعّال — مايتمسحش.');
  }
  const { error } = await admin.from('profiles').delete().eq('id', t.id);
  if (error) return fail(`تعذر الحذف: ${error.message}`);
  if (t.auth_user_id) await admin.auth.admin.deleteUser(t.auth_user_id);
  return json({ ok: true });
}

// ===== تفعيل كل المستخدمين المنقولين (أدمن بس): بيولّد كلمة سر مؤقتة لكل واحد ويرجّعها مرة واحدة =====
async function provision(admin: any, caller: Profile): Promise<Response> {
  if (!isAdmin(caller)) return fail('التفعيل الجماعي للأدمن بس.', { code: 'forbidden' });
  const { data: pending } = await admin.from('profiles').select('*').is('auth_user_id', null).eq('active', true).order('created_at', { ascending: true });
  const results: Array<{ id: string; username: string; display_name: string; password?: string; error?: string }> = [];
  for (const p of (pending || []) as Profile[]) {
    const password = generateTempPassword();
    const created = await createAuthUser(admin, usernameToEmail(p.username), password);
    if (!created.id) { results.push({ id: p.id, username: p.username, display_name: p.display_name, error: created.error || 'فشل' }); continue; }
    const { error } = await admin.from('profiles').update({ auth_user_id: created.id, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { await admin.auth.admin.deleteUser(created.id); results.push({ id: p.id, username: p.username, display_name: p.display_name, error: error.message }); continue; }
    results.push({ id: p.id, username: p.username, display_name: p.display_name, password });
  }
  return json({ ok: true, data: results });
}

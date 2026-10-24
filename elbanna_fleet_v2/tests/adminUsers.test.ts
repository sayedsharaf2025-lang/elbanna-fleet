import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminUsers, validatePassword, generateTempPassword } from '../supabase/functions/_shared/adminUsersHandler.ts';
import { usernameToEmail, normalizeUsername, AUTH_EMAIL_DOMAIN } from '../src/db/authEmail';

const call = async (admin: any, body: any, jwt?: string, extra: any = {}) => {
  const res = await handleAdminUsers(new Request('https://x.test', { method: 'POST', headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) }), { admin, ...extra });
  return res.json() as Promise<any>;
};
const adminWith = (profile: any) => ({
  auth: { getUser: async (jwt: string) => jwt === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: null, error: { message: 'bad' } } },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }),
});

test('اسم المستخدم بيتحوّل لإيميل داخلي ثابت وغير حساس للحالة', async () => {
  assert.equal(normalizeUsername('  Ahmed '), 'ahmed');
  const a = await usernameToEmail('Ahmed'); const b = await usernameToEmail(' ahmed ');
  assert.equal(a, b);
  assert.ok(a.endsWith('@' + AUTH_EMAIL_DOMAIN));
  assert.notEqual(a, await usernameToEmail('ahmed2'));
});

test('قواعد كلمة المرور', () => {
  assert.ok(validatePassword('123', 'x'));
  assert.ok(validatePassword('password', 'x'));
  assert.ok(validatePassword('abcdefgh', 'abcdefgh'));
  assert.ok(validatePassword('a'.repeat(80), 'x'));
  assert.equal(validatePassword('Str0ng-pass!', 'x'), null);
  const t = generateTempPassword();
  assert.equal(t.length, 12);
  assert.equal(validatePassword(t, 'x'), null);
});

test('بدون تسجيل دخول أو من غير صلاحية: مرفوض', async () => {
  assert.equal((await call(adminWith(null), { action: 'create' })).code, 'unauthenticated');
  assert.equal((await call(adminWith(null), { action: 'create' }, 'bad')).code, 'unauthenticated');
  const plain = { id: 'p', role_tag: 'supervisor', allowed_screens: ['cars'], active: true };
  assert.equal((await call(adminWith(plain), { action: 'create' }, 'good')).code, 'forbidden');
  const inactive = { ...plain, role_tag: 'admin', active: false };
  assert.equal((await call(adminWith(inactive), { action: 'delete' }, 'good')).code, 'unauthenticated');
});

test('أول تشغيل متعطّل لو مفيش BOOTSTRAP_SECRET أو السر غلط', async () => {
  const r1 = await call(adminWith(null), { action: 'bootstrap', secret: 'x' });
  assert.equal(r1.ok, false);
  const r2 = await call(adminWith(null), { action: 'bootstrap', secret: 'wrong' }, undefined, { bootstrapSecret: 'right-secret-123456' });
  assert.equal(r2.ok, false);
});

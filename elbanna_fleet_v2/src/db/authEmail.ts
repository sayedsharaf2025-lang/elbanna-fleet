/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// تحويل اسم المستخدم (ممكن يكون عربي: "منى") لبريد داخلي ثابت عشان Supabase Auth.
// مفيش بريد حقيقي بيتبعتله حاجة أبدًا (الحسابات بتتأكد من الـ Edge Function) — ده مجرد معرّف ASCII ثابت.
// نفس الدالة بتتنسخ لـ supabase/functions/_shared (npm run sync:functions) فالتطبيق والسيرفر دايمًا متطابقين.
import { sha256Hex } from './passwordUtil';

export const AUTH_EMAIL_DOMAIN = 'elbanna-fleet.app';

// الاسم بيتقارن بدون حساسية لحالة الحروف وبدون مسافات في الأطراف (زي ما كان الدخول القديم بالظبط)
export const normalizeUsername = (username: string): string => (username || '').trim().toLowerCase();

export const usernameToEmail = (username: string): string =>
  `u${sha256Hex(`elbanna-user:${normalizeUsername(username)}`).slice(0, 40)}@${AUTH_EMAIL_DOMAIN}`;

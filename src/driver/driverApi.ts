/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// طبقة اتصال تطبيق السائق — بتكلّم Edge Function اسمها driver-api بس (supabase/functions/driver-api).
// السائق مالوش حساب Supabase ومابيلمسش أي جدول: الدخول والرحلات والخطوات كلها بتتحقق منها السيرفر
// (رقم سري bcrypt + قفل من السيرفر + توكن موقّع) — فالمفتاح العام اللي في التطبيق مايفتحش أي بيانات.

import { DRIVER_API_FUNCTION } from '../db/functionNames';
import { getSupabaseClient } from '../db/supabaseClient';
import type { TripAction, TripPayload } from '../db/logic/tripFlow';
import type { TransportRequest } from '../types';

// للاختبارات فقط: استبدال عميل Supabase بعميل وهمي بيوصّل لمعالج الدالة مباشرة
let clientOverride: any = null;
export const __setClientForTests = (c: any) => { clientOverride = c; };
const getClient = (): any => clientOverride || getSupabaseClient();

export interface DriverSession { id: string; code: string; name: string; token: string; expires_at?: number }
// (مش discriminated union لأن إعدادات TypeScript في المشروع مش strict — الحقلين اختياريين ونتحقق من ok الأول)
// code === 'session_invalid' معناها: التوكن انتهى أو المكتب غيّر/ألغى الرقم السري → لازم تسجيل خروج
export interface ApiResult<T> { ok: boolean; data?: T; error?: string; code?: string }

export const isSessionInvalid = (r: { code?: string }): boolean => r.code === 'session_invalid';

const noClient = (): ApiResult<never> => ({ ok: false, error: 'إعدادات الاتصال بقاعدة البيانات غير متوفرة.' });
const SETUP_HINT = 'النظام لسه مش جاهز لتطبيق السائق — كلّم المكتب ينشر دالة driver-api ويشغّل سكريبتات الأمان.';

async function call<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  const client = getClient();
  if (!client) return noClient();
  try {
    const { data, error } = await client.functions.invoke(DRIVER_API_FUNCTION, { body });
    if (error) {
      const m = String(error?.message || '');
      if (/not found|404|FunctionsRelayError|FunctionsHttpError/i.test(m)) return { ok: false, error: SETUP_HINT };
      if (/fetch|network|failed to send/i.test(m)) return { ok: false, error: 'مفيش اتصال بالإنترنت. جرّب تاني.' };
      return { ok: false, error: `تعذر تنفيذ الطلب: ${m}` };
    }
    if (!data || typeof data !== 'object') return { ok: false, error: SETUP_HINT };
    return data as ApiResult<T>;
  } catch (e: any) {
    const m = String(e?.message || '');
    if (/fetch|network/i.test(m)) return { ok: false, error: 'مفيش اتصال بالإنترنت. جرّب تاني.' };
    return { ok: false, error: `تعذر تنفيذ الطلب: ${m}` };
  }
}

// ===== الدخول بكود السائق + الرقم السري =====
export async function loginDriver(codeInput: string, pinInput: string): Promise<ApiResult<DriverSession>> {
  if (!(codeInput || '').trim() || !(pinInput || '').trim()) return { ok: false, error: 'اكتب كود السائق والرقم السري.' };
  return call<DriverSession>({ action: 'login', code: codeInput, pin: pinInput });
}

// السائق لسه موجود ومعاه صلاحية دخول؟ (لو المكتب حذفه أو لغى دخوله أو غيّر رقمه السري يتسجل خروجه)
// data=false معناها الجلسة مش صالحة؛ ok=false معناها تعذّر التحقق (شبكة) — ماينفعش نسجّل خروج وقتها
export async function verifySession(session: DriverSession): Promise<ApiResult<boolean>> {
  const res = await call<boolean>({ action: 'verify', token: session.token });
  if (isSessionInvalid(res)) return { ok: true, data: false };
  return res;
}

// ===== الرحلات =====
export interface TripsSnapshot {
  open: TransportRequest[]; // الرحلات الجارية (assigned … heading_garage)
  recent: TransportRequest[]; // آخر رحلات منتهية
  cars: Record<string, string>; // car id → رقم السيارة
}

export const fetchTrips = (session: DriverSession): Promise<ApiResult<TripsSnapshot>> =>
  call<TripsSnapshot>({ action: 'trips', token: session.token });

// آخر عداد متسجل للسيارة (لمراجعة رقم العداد اللي بيكتبه السائق)
export async function fetchLastOdometer(session: DriverSession, carId: string, excludeRequestId: string): Promise<number | undefined> {
  const res = await call<number | null>({ action: 'last_odometer', token: session.token, carId, excludeId: excludeRequestId });
  return res.ok && typeof res.data === 'number' ? res.data : undefined;
}

// تنفيذ خطوة من الرحلة: السيرفر هو اللي بيحسب التعديلات ويتحقق إن الطلب بتاع السائق ده والحالة لسه زي ما هي.
// (carNumber وtodayYmd موجودين للتوافق مع الاستدعاءات القديمة — السيرفر بيحسبهم بنفسه)
export async function applyTripAction(
  trip: TransportRequest,
  action: TripAction,
  payload: TripPayload,
  session: DriverSession,
  _carNumber?: string,
  _todayYmd?: string,
): Promise<ApiResult<Partial<TransportRequest>>> {
  return call<Partial<TransportRequest>>({ action: 'trip_action', token: session.token, tripId: trip.id, action_name: action, payload });
}

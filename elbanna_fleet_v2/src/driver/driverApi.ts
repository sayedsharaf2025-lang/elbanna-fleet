/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// طبقة اتصال تطبيق السائق بـ Supabase — خفيفة ومستقلة عن متجر المكتب (مابتحمّلش بيانات الشركة كلها على موبايل السائق
// ومابترفعش أي بيانات محلية). بتقرا وتكتب بس: رحلات السائق نفسه، أرقام سياراته، وإشعارات للمكتب.

import { getSupabaseClient } from '../db/supabaseClient';
import { verifyPassword } from '../db/passwordUtil';
import { generateId } from '../db/ids';
import { normalizeTransportRequest, advanceTrip, type TripAction, type TripPayload } from '../db/logic/tripFlow';
import { transportNotification } from '../db/logic/notifications';
import { normalizeDriverCode, normalizePin } from './driverLogic';
import type { TransportRequest } from '../types';

// للاختبارات فقط: استبدال عميل Supabase بقاعدة بيانات وهمية
let clientOverride: any = null;
export const __setClientForTests = (c: any) => { clientOverride = c; };
const getClient = (): any => clientOverride || getSupabaseClient();

export interface DriverSession { id: string; code: string; name: string }
// (مش discriminated union لأن إعدادات TypeScript في المشروع مش strict — الحقلين اختياريين ونتحقق من ok الأول)
export interface ApiResult<T> { ok: boolean; data?: T; error?: string }

const TRIP_COLS = ['trip_status', 'trip_leg', 'trip_log', 'finish_odometer', 'expected_smoke'];
const SETUP_HINT = 'النظام لسه مش جاهز لتطبيق السائق — كلّم المكتب يشغّل سكريبت قاعدة البيانات (transport-trip.sql و driver-app.sql).';

const friendly = (message: string | undefined): string => {
  const m = message || '';
  if (TRIP_COLS.some(c => m.includes(c)) || m.includes('driver_app_access')) return SETUP_HINT;
  if (/fetch|network|failed to fetch/i.test(m)) return 'مفيش اتصال بالإنترنت. جرّب تاني.';
  return `تعذر تنفيذ الطلب: ${m}`;
};

const noClient = (): ApiResult<never> => ({ ok: false, error: 'إعدادات الاتصال بقاعدة البيانات غير متوفرة.' });

// ===== الدخول بكود السائق + الرقم السري =====
export async function loginDriver(codeInput: string, pinInput: string): Promise<ApiResult<DriverSession>> {
  const client = getClient();
  if (!client) return noClient();
  const code = normalizeDriverCode(codeInput);
  const pin = normalizePin(pinInput);
  if (!code || !pin) return { ok: false, error: 'اكتب كود السائق والرقم السري.' };
  try {
    let { data: drivers, error } = await client.from('drivers').select('id, driver_code, name').eq('driver_code', code).limit(2);
    if (error) return { ok: false, error: friendly(error.message) };
    if (!drivers || drivers.length === 0) {
      // محاولة تانية بدون حساسية لحالة الحروف (مع تعطيل رموز البحث الخاصة)
      const escaped = code.replace(/[\\%_]/g, c => `\\${c}`);
      const second = await client.from('drivers').select('id, driver_code, name').ilike('driver_code', escaped).limit(2);
      if (second.error) return { ok: false, error: friendly(second.error.message) };
      drivers = second.data;
    }
    if (!drivers || drivers.length !== 1) return { ok: false, error: 'كود السائق أو الرقم السري غير صحيح.' };
    const driver = drivers[0] as { id: string; driver_code: string; name: string };
    const { data: access, error: accErr } = await client.from('driver_app_access').select('pin_hash').eq('driver_id', driver.id).maybeSingle();
    if (accErr) return { ok: false, error: friendly(accErr.message) };
    if (!access) return { ok: false, error: 'مفيش رقم سري متحدد ليك لسه — كلّم المكتب.' };
    if (!verifyPassword(pin, (access as any).pin_hash)) return { ok: false, error: 'كود السائق أو الرقم السري غير صحيح.' };
    return { ok: true, data: { id: driver.id, code: driver.driver_code, name: driver.name } };
  } catch (e: any) {
    return { ok: false, error: friendly(e?.message) };
  }
}

// السائق لسه موجود ومعاه صلاحية دخول؟ (لو المكتب حذفه أو لغى دخوله يتسجل خروجه)
export async function verifySession(session: DriverSession): Promise<ApiResult<boolean>> {
  const client = getClient();
  if (!client) return noClient();
  try {
    const [d, a] = await Promise.all([
      client.from('drivers').select('id').eq('id', session.id).maybeSingle(),
      client.from('driver_app_access').select('driver_id').eq('driver_id', session.id).maybeSingle(),
    ]);
    if (d.error || a.error) return { ok: false, error: friendly((d.error || a.error)?.message) };
    return { ok: true, data: !!d.data && !!a.data };
  } catch (e: any) {
    return { ok: false, error: friendly(e?.message) };
  }
}

// ===== الرحلات =====
export interface TripsSnapshot {
  open: TransportRequest[]; // الرحلات الجارية (assigned … heading_garage)
  recent: TransportRequest[]; // آخر رحلات منتهية
  cars: Record<string, string>; // car id → رقم السيارة
}

export async function fetchTrips(driverId: string): Promise<ApiResult<TripsSnapshot>> {
  const client = getClient();
  if (!client) return noClient();
  try {
    const [open, recent] = await Promise.all([
      client.from('transport_requests').select('*').eq('assigned_driver_id', driverId).eq('status', 'in_progress').order('responded_at', { ascending: true }),
      client.from('transport_requests').select('*').eq('assigned_driver_id', driverId).eq('status', 'done').order('delivered_at', { ascending: false }).limit(5),
    ]);
    if (open.error) return { ok: false, error: friendly(open.error.message) };
    if (recent.error) return { ok: false, error: friendly(recent.error.message) };
    const openRows = (open.data || []).map((r: any) => normalizeTransportRequest(r) as TransportRequest);
    const recentRows = (recent.data || []).map((r: any) => normalizeTransportRequest(r) as TransportRequest);
    const carIds = Array.from(new Set([...openRows, ...recentRows].map(r => r.assigned_car_id).filter(Boolean))) as string[];
    const cars: Record<string, string> = {};
    if (carIds.length > 0) {
      const { data } = await client.from('cars').select('id, car_number').in('id', carIds);
      (data || []).forEach((c: any) => { cars[c.id] = c.car_number; });
    }
    return { ok: true, data: { open: openRows, recent: recentRows, cars } };
  } catch (e: any) {
    return { ok: false, error: friendly(e?.message) };
  }
}

// آخر عداد متسجل للسيارة (لمراجعة رقم العداد اللي بيكتبه السائق)
export async function fetchLastOdometer(carId: string, excludeRequestId: string): Promise<number | undefined> {
  const client = getClient();
  if (!client) return undefined;
  try {
    const { data } = await client.from('transport_requests').select('id, finish_odometer')
      .eq('assigned_car_id', carId).not('finish_odometer', 'is', null).neq('id', excludeRequestId)
      .order('delivered_at', { ascending: false }).limit(1);
    const v = data && data[0] ? Number((data[0] as any).finish_odometer) : NaN;
    return isNaN(v) ? undefined : v;
  } catch { return undefined; }
}

// تنفيذ خطوة من الرحلة: الشرط .eq('trip_status', الحالية) بيمنع تعارض لو المكتب غيّر الطلب في نفس اللحظة
export async function applyTripAction(
  trip: TransportRequest,
  action: TripAction,
  payload: TripPayload,
  driver: DriverSession,
  carNumber: string | undefined,
  todayYmd: string,
): Promise<ApiResult<Partial<TransportRequest>>> {
  const client = getClient();
  if (!client) return noClient();
  const nowIso = new Date().toISOString();
  const res = advanceTrip(trip, action, nowIso, todayYmd, payload);
  if (!res.ok || !res.patch) return { ok: false, error: res.error || 'تعذر تنفيذ الخطوة.' };
  try {
    const { data, error } = await client.from('transport_requests').update(res.patch).eq('id', trip.id).eq('trip_status', trip.trip_status as string).select('id');
    if (error) return { ok: false, error: friendly(error.message) };
    if (!data || data.length === 0) return { ok: false, error: 'الطلب اتغيّر من المكتب — اتحدّثت الشاشة، راجع الحالة وجرّب تاني.' };
    // إشعار للمكتب (القبول والانتهاء بس) — لو جدول الإشعارات لسه ماتنشأش مش بيوقف الرحلة
    if (action === 'accept' || action === 'finish') {
      const draft = transportNotification(action === 'accept' ? 'trip_accepted' : 'trip_finished', trip, carNumber);
      const note = { ...draft, id: generateId('nt'), created_at: nowIso, created_by: driver.name, read_by: [] as string[] };
      client.from('notifications').upsert([note]).then(({ error: nErr }: any) => { if (nErr) console.warn('notification upsert failed', nErr.message); });
    }
    return { ok: true, data: res.patch };
  } catch (e: any) {
    return { ok: false, error: friendly(e?.message) };
  }
}

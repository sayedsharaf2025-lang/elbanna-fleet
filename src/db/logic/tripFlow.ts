/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// منطق رحلة السائق على طلب النقل (قبول ← وصول التحميل ← استلام ← وصول الوجهة ← الجراج ← انتهاء).
// دوال صافية عشان تتختبر بدون React، وتتشارك بين تطبيق المكتب وتطبيق السائق.

import type { TransportRequest, TripEvent, TripStatus } from '../../types';

export type TripAction = 'accept' | 'arrive_pickup' | 'load' | 'arrive_destination' | 'next_destination' | 'head_garage' | 'finish';

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  assigned: 'بانتظار قبول السائق',
  accepted: 'في الطريق للتحميل',
  at_pickup: 'وصل مكان التحميل',
  loaded: 'محمّلة وفي الطريق للوجهة',
  at_destination: 'وصل الوجهة',
  heading_garage: 'في الطريق للجراج',
  finished: 'تم الانتهاء',
};

// عنوان الزر اللي بيظهر للسائق في كل مرحلة (الإجراء التالي)
export const TRIP_ACTION_LABELS: Record<TripAction, string> = {
  accept: 'قبول الطلب',
  arrive_pickup: 'تم الوصول',
  load: 'تم الاستلام',
  arrive_destination: 'تم الوصول',
  next_destination: 'التوجه للوجهة التالية',
  head_garage: 'الاتجاه للجراج',
  finish: 'تم الانتهاء',
};

const STATUSES: TripStatus[] = ['assigned', 'accepted', 'at_pickup', 'loaded', 'at_destination', 'heading_garage', 'finished'];

export const legCount = (r: Pick<TransportRequest, 'destinations'>): number => Math.max(1, Array.isArray(r.destinations) ? r.destinations.length : 0);

export const currentLeg = (r: Pick<TransportRequest, 'trip_leg'>): number => (typeof r.trip_leg === 'number' && r.trip_leg >= 0 ? r.trip_leg : 0);

// الإجراء التالي المتاح للسائق (null لو مفيش: مفيش رحلة أو الرحلة انتهت)
export function nextTripAction(r: Pick<TransportRequest, 'trip_status' | 'trip_leg' | 'destinations'>): TripAction | null {
  switch (r.trip_status) {
    case 'assigned': return 'accept';
    case 'accepted': return 'arrive_pickup';
    case 'at_pickup': return 'load';
    case 'loaded': return 'arrive_destination';
    case 'at_destination': return currentLeg(r) + 1 < legCount(r) ? 'next_destination' : 'head_garage';
    case 'heading_garage': return 'finish';
    default: return null;
  }
}

export interface TripPayload { odometer?: number; expectedSmoke?: number }
export interface AdvanceResult { ok: boolean; error?: string; patch?: Partial<TransportRequest> }

// تنفيذ إجراء على الرحلة: بيرجّع التعديلات (patch) اللي تتحفظ على الطلب، أو خطأ لو الإجراء مش مسموح في المرحلة دي
export function advanceTrip(
  r: Pick<TransportRequest, 'status' | 'trip_status' | 'trip_leg' | 'trip_log' | 'destinations' | 'execution_date'>,
  action: TripAction,
  nowIso: string,
  todayYmd: string,
  payload: TripPayload = {},
): AdvanceResult {
  if (r.status === 'new') return { ok: false, error: 'الطلب لسه ماتردش عليه بسيارة.' };
  if (r.status === 'done' || r.trip_status === 'finished') return { ok: false, error: 'الرحلة منتهية بالفعل.' };
  if (!r.trip_status) return { ok: false, error: 'مفيش رحلة نشطة على الطلب ده.' };
  const expected = nextTripAction(r);
  if (expected !== action) return { ok: false, error: 'الخطوة دي مش متاحة دلوقتي — حدّث الشاشة وجرّب تاني.' };

  const log = Array.isArray(r.trip_log) ? r.trip_log : [];
  const leg = currentLeg(r);
  let status: TripStatus;
  let nextLeg = leg;
  switch (action) {
    case 'accept': status = 'accepted'; break;
    case 'arrive_pickup': status = 'at_pickup'; break;
    case 'load': status = 'loaded'; break;
    case 'arrive_destination': status = 'at_destination'; break;
    case 'next_destination': status = 'loaded'; nextLeg = leg + 1; break;
    case 'head_garage': status = 'heading_garage'; break;
    case 'finish': {
      const odo = payload.odometer;
      const smoke = payload.expectedSmoke;
      if (typeof odo !== 'number' || isNaN(odo) || odo < 0) return { ok: false, error: 'اكتب عداد السيارة (كم).' };
      if (typeof smoke !== 'number' || isNaN(smoke) || smoke < 0) return { ok: false, error: 'اكتب الدخان المتوقع.' };
      status = 'finished';
      const event: TripEvent = { status, at: nowIso };
      return {
        ok: true,
        patch: {
          trip_status: status,
          trip_log: [...log, event],
          finish_odometer: odo,
          expected_smoke: smoke,
          // إنهاء الرحلة بيقفل الطلب بنفس منطق "تأكيد التسليم" من المكتب
          status: 'done',
          delivered_at: nowIso,
          execution_date: r.execution_date || todayYmd,
        },
      };
    }
  }
  const event: TripEvent = { status, at: nowIso, ...(status === 'loaded' || status === 'at_destination' ? { leg: nextLeg } : {}) };
  return { ok: true, patch: { trip_status: status, trip_leg: nextLeg, trip_log: [...log, event] } };
}

// أول حالة للرحلة لما يتم الرد بسيارة
export function startTripPatch(nowIso: string): Partial<TransportRequest> {
  return { trip_status: 'assigned', trip_leg: 0, trip_log: [{ status: 'assigned', at: nowIso }] };
}

// إنهاء الرحلة من المكتب (تأكيد التسليم اليدوي) عشان السائق ماتفضلش عنده رحلة معلّقة
export function closeTripByOfficePatch(r: Pick<TransportRequest, 'trip_status' | 'trip_log'>, nowIso: string): Partial<TransportRequest> {
  if (!r.trip_status || r.trip_status === 'finished') return {};
  const log = Array.isArray(r.trip_log) ? r.trip_log : [];
  return { trip_status: 'finished', trip_log: [...log, { status: 'finished', at: nowIso, by: 'office' }] };
}

// وصف مرحلة الرحلة للعرض (مع اسم الوجهة الحالية)
export function describeTrip(r: Pick<TransportRequest, 'trip_status' | 'trip_leg' | 'destinations' | 'farm_name'>): string {
  if (!r.trip_status) return '';
  const dests = Array.isArray(r.destinations) ? r.destinations : [];
  const dest = dests[currentLeg(r)];
  const multi = dests.length > 1;
  const legLabel = dest ? `${multi ? `${currentLeg(r) + 1}/${dests.length} — ` : ''}${dest}` : '';
  switch (r.trip_status) {
    case 'accepted': return r.farm_name ? `${TRIP_STATUS_LABELS.accepted}: ${r.farm_name}` : TRIP_STATUS_LABELS.accepted;
    case 'at_pickup': return r.farm_name ? `${TRIP_STATUS_LABELS.at_pickup}: ${r.farm_name}` : TRIP_STATUS_LABELS.at_pickup;
    case 'loaded': return legLabel ? `${TRIP_STATUS_LABELS.loaded}: ${legLabel}` : TRIP_STATUS_LABELS.loaded;
    case 'at_destination': return legLabel ? `${TRIP_STATUS_LABELS.at_destination}: ${legLabel}` : TRIP_STATUS_LABELS.at_destination;
    default: return TRIP_STATUS_LABELS[r.trip_status];
  }
}

// صفوف الطلبات اللي جاية من Supabase فيها null للأعمدة الفاضية — نحوّلها لقيم آمنة من غير ما نضيف مفاتيح جديدة
const NULLABLE_KEYS = ['execution_date', 'assigned_car_id', 'assigned_driver_id', 'responded_at', 'delivered_at', 'created_by', 'trip_status', 'trip_leg', 'trip_log', 'finish_odometer', 'expected_smoke'];
const NUMERIC_KEYS = ['trip_leg', 'finish_odometer', 'expected_smoke'];

export function normalizeTransportRequest<T extends object>(row: T): T {
  const r: any = { ...row };
  for (const k of NULLABLE_KEYS) if (r[k] === null || r[k] === undefined || r[k] === '') delete r[k];
  for (const k of NUMERIC_KEYS) if (k in r && typeof r[k] !== 'number') { const n = Number(r[k]); if (isNaN(n)) delete r[k]; else r[k] = n; }
  if ('destinations' in r && !Array.isArray(r.destinations)) {
    let d: unknown = [];
    if (typeof r.destinations === 'string') { try { d = JSON.parse(r.destinations); } catch { d = []; } }
    r.destinations = Array.isArray(d) ? d : [];
  }
  if ('trip_log' in r) {
    let log: unknown = r.trip_log;
    if (typeof log === 'string') { try { log = JSON.parse(log); } catch { log = []; } }
    r.trip_log = Array.isArray(log) ? log.filter((e: any) => e && typeof e.at === 'string' && STATUSES.includes(e.status)) : [];
  }
  if ('trip_status' in r && !STATUSES.includes(r.trip_status)) delete r.trip_status;
  return r as T;
}

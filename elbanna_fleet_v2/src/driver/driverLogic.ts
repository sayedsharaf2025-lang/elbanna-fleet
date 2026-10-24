/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// منطق تطبيق السائق (دوال صافية قابلة للاختبار): الدخول، اختيار الرحلة الحالية، التحقق من العداد والدخان، تسميات الأزرار.

import type { TransportRequest, TripStatus } from '../types';
import { currentLeg, legCount, type TripAction } from '../db/logic/tripFlow';

// ===== الأرقام =====
// السواق ممكن يكتب بأرقام عربية (٠١٢٣) — بنحوّلها للاتينية قبل أي تحقق
export function parseDriverNumber(input: string): number | undefined {
  let latin = (input || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/٬/g, ',')
    .replace(/٫/g, '.')
    .replace(/\s/g, '')
    .trim();
  // 120,500 = آلاف (مجموعات من 3 أرقام)، لكن 850,5 = عشري
  latin = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(latin) ? latin.replace(/,/g, '') : latin.replace(',', '.');
  if (latin === '' || !/^\d+(\.\d+)?$/.test(latin)) return undefined;
  const n = Number(latin);
  return isFinite(n) ? n : undefined;
}

// ===== الدخول =====
export const normalizeDriverCode = (code: string): string =>
  (code || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();

export const normalizePin = (pin: string): string =>
  (pin || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s/g, '');

// الرقم السري: أرقام فقط من 6 لـ 8
export function validatePin(pin: string): string | null {
  const p = normalizePin(pin);
  if (!/^\d{6,8}$/.test(p)) return 'الرقم السري لازم يكون أرقام فقط من 6 إلى 8 خانات.';
  return null;
}

// قفل مؤقت بعد محاولات فاشلة متتالية (حماية بسيطة من التخمين على الجهاز)
export function lockUntilMs(failures: number, nowMs: number): number {
  if (failures < 5) return 0;
  const steps = Math.min(failures - 5, 4); // 30ث، 1د، 2د، 4د، 8د
  return nowMs + 30000 * Math.pow(2, steps);
}

// ===== الرحلات =====
const STARTED: TripStatus[] = ['accepted', 'at_pickup', 'loaded', 'at_destination', 'heading_garage'];

export const isStartedTrip = (t: Pick<TransportRequest, 'trip_status'>): boolean => !!t.trip_status && STARTED.includes(t.trip_status);

export interface TripBuckets {
  current?: TransportRequest; // الرحلة اللي السائق ماشي فيها
  incoming: TransportRequest[]; // طلبات جديدة بانتظار القبول
  untracked: TransportRequest[]; // طلبات قديمة اتردّ عليها قبل نظام التتبع (للعلم بس)
}

export function bucketTrips(trips: TransportRequest[]): TripBuckets {
  const byTime = (a: TransportRequest, b: TransportRequest) => (a.responded_at || '').localeCompare(b.responded_at || '') || a.request_number.localeCompare(b.request_number);
  const open = trips.filter(t => t.status === 'in_progress' && t.trip_status !== 'finished').sort(byTime);
  return {
    current: open.find(isStartedTrip),
    incoming: open.filter(t => t.trip_status === 'assigned'),
    untracked: open.filter(t => !t.trip_status),
  };
}

// مينفعش يقبل طلب جديد وهو في رحلة لسه ماخلصتش
export const canAcceptTrip = (buckets: TripBuckets): boolean => !buckets.current;

// الطلبات الجديدة (assigned) اللي ماكانتش ظاهرة في التحديث اللي فات — للتنبيه
export function newAssignments(seenIds: Set<string>, trips: TransportRequest[]): TransportRequest[] {
  return trips.filter(t => t.status === 'in_progress' && t.trip_status === 'assigned' && !seenIds.has(t.id));
}

// ===== واجهة الزر =====
export function actionButtonLabel(action: TripAction, trip: Pick<TransportRequest, 'destinations' | 'trip_leg'>): string {
  const n = legCount(trip);
  const leg = currentLeg(trip);
  switch (action) {
    case 'accept': return 'قبول الطلب';
    case 'arrive_pickup': return 'تم الوصول لمكان التحميل';
    case 'load': return 'تم الاستلام';
    case 'arrive_destination': return n > 1 ? `تم الوصول للوجهة ${leg + 1} من ${n}` : 'تم الوصول للوجهة';
    case 'next_destination': return 'التوجه للوجهة التالية';
    case 'head_garage': return 'الاتجاه للجراج';
    case 'finish': return 'تم الانتهاء';
  }
}

// نقطة الرحلة المستهدفة حاليًا (للتمييز في قايمة المحطات): 'pickup' | رقم الوجهة | 'garage'
export function targetStop(trip: Pick<TransportRequest, 'trip_status' | 'trip_leg'>): 'pickup' | 'garage' | number | null {
  switch (trip.trip_status) {
    case 'accepted': case 'at_pickup': return 'pickup';
    case 'loaded': case 'at_destination': return currentLeg(trip);
    case 'heading_garage': return 'garage';
    default: return null;
  }
}

// ===== إنهاء الرحلة =====
export interface FinishCheck { ok: boolean; error?: string; warning?: string; odometer?: number; smoke?: number }

export function checkFinishInput(odometerText: string, smokeText: string, lastOdometer?: number): FinishCheck {
  const odometer = parseDriverNumber(odometerText);
  if (odometer === undefined) return { ok: false, error: 'اكتب رقم العداد (أرقام فقط).' };
  const smoke = parseDriverNumber(smokeText);
  if (smoke === undefined) return { ok: false, error: 'اكتب الدخان المتوقع (أرقام فقط، ولو مفيش اكتب 0).' };
  const out: FinishCheck = { ok: true, odometer, smoke };
  if (typeof lastOdometer === 'number' && odometer < lastOdometer) {
    out.warning = `العداد اللي كتبته (${odometer.toLocaleString('en-US')}) أقل من آخر عداد متسجل للسيارة (${lastOdometer.toLocaleString('en-US')}). راجع الرقم.`;
  } else if (typeof lastOdometer === 'number' && odometer - lastOdometer > 2000) {
    out.warning = `الفرق عن آخر عداد ${(odometer - lastOdometer).toLocaleString('en-US')} كم — كبير. راجع الرقم.`;
  }
  return out;
}

export const localYmd = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ===== قايمة محطات الرحلة =====
export type StopState = 'done' | 'here' | 'target' | 'pending';

// المحطات بالترتيب: [نقطة التحميل، الوجهات…، الجراج] وحالة كل محطة (تمت / وصلت / متجه لها / لسه)
export function stopStates(trip: Pick<TransportRequest, 'trip_status' | 'trip_leg' | 'destinations'>): StopState[] {
  const n = legCount(trip);
  const leg = currentLeg(trip);
  let reached = -1;
  let target = 0;
  switch (trip.trip_status) {
    case 'at_pickup': reached = 0; target = 0; break;
    case 'loaded': reached = leg; target = 1 + leg; break; // المحطة اللي قبلها (التحميل أو الوجهة السابقة) اتعدّت
    case 'at_destination': reached = 1 + leg; target = 1 + leg; break;
    case 'heading_garage': reached = n; target = 1 + n; break;
    default: reached = -1; target = 0;
  }
  return Array.from({ length: n + 2 }, (_, i): StopState => {
    if (i === target) return reached === target ? 'here' : 'target';
    if (i <= reached && i < target) return 'done';
    return 'pending';
  });
}

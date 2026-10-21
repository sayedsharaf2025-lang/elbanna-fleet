/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// منطق شاشة متابعة السائقين (دوال صافية): مكان كل سيارة ومرحلتها من طلبات النقل الجارية ورحلات السائق.

import type { Car, Driver, TransportRequest, TripEvent, TripStatus } from '../../types';
import { TRIP_STATUS_LABELS } from './tripFlow';

export type TrackingPhase = 'garage' | 'awaiting_accept' | 'to_pickup' | 'at_pickup' | 'to_destination' | 'delivered' | 'to_garage' | 'untracked';

export const PHASE_LABELS: Record<TrackingPhase, string> = {
  garage: 'في الجراج',
  awaiting_accept: 'بانتظار قبول السائق',
  to_pickup: 'في الطريق للتحميل',
  at_pickup: 'وصلت مكان التحميل',
  to_destination: 'محمّلة وفي الطريق للوجهة',
  delivered: 'تم التسليم (وصلت الوجهة)',
  to_garage: 'عائدة للجراج',
  untracked: 'جاري التوصيل (بدون تتبع)',
};

// ترتيب العرض: السيارات النشطة الأول، والجراج في الآخر
export const PHASE_ORDER: TrackingPhase[] = ['awaiting_accept', 'to_pickup', 'at_pickup', 'to_destination', 'delivered', 'to_garage', 'untracked', 'garage'];

const TRIP_TO_PHASE: Record<TripStatus, TrackingPhase | null> = {
  assigned: 'awaiting_accept',
  accepted: 'to_pickup',
  at_pickup: 'at_pickup',
  loaded: 'to_destination',
  at_destination: 'delivered',
  heading_garage: 'to_garage',
  finished: null,
};

type ReqLike = Pick<TransportRequest, 'status' | 'trip_status'>;

// هل الطلب ده رحلة جارية فعلًا على سيارة؟
export const isActiveRequest = (r: ReqLike & Pick<TransportRequest, 'assigned_car_id'>): boolean =>
  !!r.assigned_car_id && r.status === 'in_progress' && r.trip_status !== 'finished';

export function phaseOfRequest(r: ReqLike): TrackingPhase {
  if (r.trip_status) return TRIP_TO_PHASE[r.trip_status] || 'garage';
  return r.status === 'in_progress' ? 'untracked' : 'garage';
}

// وقت بداية المرحلة الحالية: آخر حدث في سجل الرحلة، وإلا وقت الرد بالسيارة
export function phaseSince(r: Pick<TransportRequest, 'trip_log' | 'responded_at'>): string | undefined {
  const log = Array.isArray(r.trip_log) ? r.trip_log : [];
  return log.length > 0 ? log[log.length - 1].at : r.responded_at;
}

export const minutesSince = (iso: string | undefined, nowMs: number): number | undefined => {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return isNaN(t) ? undefined : Math.max(0, Math.floor((nowMs - t) / 60000));
};

// تنبيه تأخير: السائق ماقبلش بعد نص ساعة، أو أي مرحلة تانية فاتت 4 ساعات
export function isStalePhase(phase: TrackingPhase, minutes: number | undefined): boolean {
  if (minutes === undefined || phase === 'garage' || phase === 'untracked') return false;
  return phase === 'awaiting_accept' ? minutes >= 30 : minutes >= 240;
}

export const formatDuration = (minutes: number): string => {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes < 60) return `${minutes} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h} س ${m} د` : `${h} ساعة`;
  const d = Math.floor(h / 24);
  return `${d} يوم`;
};

export interface TimelineEntry { status: TripStatus; label: string; at: string; leg?: number; byOffice: boolean; minutesFromPrev?: number }

// خط زمني لمراحل الرحلة مع المدة من المرحلة اللي قبلها
export function tripTimeline(r: Pick<TransportRequest, 'trip_log'>): TimelineEntry[] {
  const log: TripEvent[] = Array.isArray(r.trip_log) ? r.trip_log : [];
  return log.map((e, i) => {
    const prev = i > 0 ? new Date(log[i - 1].at).getTime() : NaN;
    const cur = new Date(e.at).getTime();
    return {
      status: e.status,
      label: TRIP_STATUS_LABELS[e.status],
      at: e.at,
      ...(typeof e.leg === 'number' ? { leg: e.leg } : {}),
      byOffice: e.by === 'office',
      ...(!isNaN(prev) && !isNaN(cur) ? { minutesFromPrev: Math.max(0, Math.round((cur - prev) / 60000)) } : {}),
    };
  });
}

export interface CarTrackingRow {
  car: Car;
  driverName: string;
  phase: TrackingPhase;
  request?: TransportRequest; // الرحلة الجارية
  since?: string; // بداية المرحلة الحالية
  lastTrip?: TransportRequest; // آخر رحلة منتهية (للسيارات في الجراج)
  lastFinishedAt?: string;
}

const finishedAt = (r: TransportRequest): string | undefined => {
  const log = Array.isArray(r.trip_log) ? r.trip_log : [];
  const fin = [...log].reverse().find(e => e.status === 'finished');
  return fin?.at || r.delivered_at || r.execution_date;
};

export function buildTrackingRows(cars: Car[], drivers: Pick<Driver, 'id' | 'name'>[], requests: TransportRequest[]): CarTrackingRow[] {
  const driverName = (id?: string) => (id ? drivers.find(d => d.id === id)?.name : undefined) || '';
  const rows: CarTrackingRow[] = cars.map(car => {
    const mine = requests.filter(r => r.assigned_car_id === car.id);
    const active = mine
      .filter(isActiveRequest)
      .sort((a, b) => (b.responded_at || '').localeCompare(a.responded_at || '') || b.request_number.localeCompare(a.request_number))[0];
    if (active) {
      return { car, driverName: driverName(active.assigned_driver_id || car.driver_id), phase: phaseOfRequest(active), request: active, since: phaseSince(active) };
    }
    const last = mine
      .filter(r => r.status === 'done')
      .sort((a, b) => (finishedAt(b) || '').localeCompare(finishedAt(a) || '') || b.request_number.localeCompare(a.request_number))[0];
    return { car, driverName: driverName(car.driver_id), phase: 'garage', ...(last ? { lastTrip: last, lastFinishedAt: finishedAt(last) } : {}) };
  });
  const rank = (p: TrackingPhase) => PHASE_ORDER.indexOf(p);
  return rows.sort((a, b) =>
    rank(a.phase) - rank(b.phase) ||
    // داخل نفس المرحلة: اللي مستنيّة أطول وقت الأول (والجراج بترتيب رقم السيارة)
    (a.phase === 'garage' ? 0 : (a.since || '').localeCompare(b.since || '')) ||
    a.car.car_number.localeCompare(b.car.car_number));
}

export function countByPhase(rows: Pick<CarTrackingRow, 'phase'>[]): Record<TrackingPhase, number> {
  const out = { garage: 0, awaiting_accept: 0, to_pickup: 0, at_pickup: 0, to_destination: 0, delivered: 0, to_garage: 0, untracked: 0 } as Record<TrackingPhase, number>;
  rows.forEach(r => { out[r.phase]++; });
  return out;
}

// وقت محلي بأرقام لاتينية (YYYY/MM/DD HH:MM) — الأوقات متخزنة UTC فلازم تتحوّل لتوقيت جهاز المستخدم
export function formatLocalDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
export function formatLocalTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

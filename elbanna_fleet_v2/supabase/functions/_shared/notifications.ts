// ⚠️ ملف متولّد تلقائيًا من src/db/logic/notifications.ts — ماتعدّلوش هنا. عدّل الأصل ثم شغّل: npm run sync:functions
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// منطق الإشعارات (دوال صافية): إيه الأحداث اللي بتعمل إشعار ولمين، الفلترة بالصلاحيات، الدمج مع السحابة.

import type { AppNotification, MaintenanceRequest, TransportRequest } from './types.ts';

export type NotificationDraft = Pick<AppNotification, 'kind' | 'title' | 'body' | 'entity_type' | 'entity_id' | 'target_screens'>;

// شاشة كل وضع من أوضاع شاشة الصيانة (MaintenanceTab) — لازم تتطابق مع App.tsx / MobileApp.tsx
export const MAINTENANCE_MODE_SCREEN: Record<string, string> = {
  requests: 'maintenance_requests',
  parts: 'maintenance_parts',
  manager: 'maintenance_review',
  accounting: 'maintenance_accounting',
};

// إشعار الصيانة حسب المرحلة الجديدة للطلب (null = مفيش إشعار للمرحلة دي)
const MAINTENANCE_STAGE: Record<string, { title: string; screens: string[] } | undefined> = {
  new: { title: 'عطل جديد بانتظار مدير الصيانة', screens: ['maintenance_review'] },
  parts_requested: { title: 'طلب قطع غيار جديد', screens: ['maintenance_parts'] },
  parts_purchased: { title: 'تم شراء قطع الغيار — بانتظار التوجيه للورشة', screens: ['maintenance_review'] },
  pending_invoice: { title: 'تم الانتهاء من الصيانة — بانتظار الفاتورة', screens: ['maintenance_accounting'] },
  invoice_review: { title: 'فاتورة صيانة بانتظار الاعتماد', screens: ['maintenance_review'] },
  invoice_approved: { title: 'فاتورة صيانة معتمدة — بانتظار الطباعة والإغلاق', screens: ['maintenance_accounting'] },
  repaired: { title: 'تم إصلاح السيارة — بانتظار الاستلام', screens: ['maintenance_requests'] },
  receipt_rejected: { title: 'تم رفض استلام السيارة بعد الإصلاح', screens: ['maintenance_review'] },
};

export function maintenanceNotification(
  newStatus: string,
  request: Pick<MaintenanceRequest, 'id' | 'request_number' | 'fault_description'>,
  carNumber: string,
): NotificationDraft | null {
  const stage = MAINTENANCE_STAGE[newStatus];
  if (!stage) return null;
  return {
    kind: `maintenance_${newStatus}`,
    title: stage.title,
    body: `${request.request_number} — ${carNumber || 'سيارة غير محددة'}${request.fault_description ? ` — ${request.fault_description}` : ''}`,
    entity_type: 'maintenance',
    entity_id: request.id,
    target_screens: stage.screens,
  };
}

export type TransportEvent = 'created' | 'responded' | 'trip_accepted' | 'trip_finished' | 'delivered';

export function transportNotification(
  event: TransportEvent,
  request: Pick<TransportRequest, 'id' | 'request_number' | 'requester_name' | 'farm_name' | 'destinations'>,
  carNumber?: string,
): NotificationDraft {
  const route = [request.farm_name, ...(Array.isArray(request.destinations) ? request.destinations : [])].filter(Boolean).join(' ← ');
  const base = `${request.request_number}${route ? ` — ${route}` : ''}`;
  const withCar = carNumber ? `${base} — سيارة ${carNumber}` : base;
  switch (event) {
    case 'created':
      return { kind: 'transport_created', title: 'طلب نقل جديد', body: `${base}${request.requester_name ? ` — الطالب: ${request.requester_name}` : ''}`, entity_type: 'transport', entity_id: request.id, target_screens: ['requests_tracking'] };
    case 'responded':
      return { kind: 'transport_responded', title: 'تم الرد على طلب النقل بسيارة', body: withCar, entity_type: 'transport', entity_id: request.id, target_screens: ['transport_requests'] };
    case 'trip_accepted':
      return { kind: 'transport_trip_accepted', title: 'السائق قبل الطلب', body: withCar, entity_type: 'transport', entity_id: request.id, target_screens: ['requests_tracking'] };
    case 'trip_finished':
      return { kind: 'transport_trip_finished', title: 'السائق أنهى الرحلة — العداد والدخان المتوقع اتسجلوا', body: withCar, entity_type: 'transport', entity_id: request.id, target_screens: ['requests_tracking', 'transport_requests', 'route_accounting'] };
    case 'delivered':
      return { kind: 'transport_delivered', title: 'تم تسليم طلب النقل', body: withCar, entity_type: 'transport', entity_id: request.id, target_screens: ['transport_requests', 'route_accounting'] };
  }
}

// معرّف المستخدم في حالة القراءة: مستخدم النظام لو موجود، وإلا اسم المستخدم
export const notificationUserKey = (user: { systemUserId?: string; username: string } | null | undefined): string =>
  user ? (user.systemUserId || user.username) : '';

export const isVisibleTo = (n: Pick<AppNotification, 'target_screens'>, screens: string[]): boolean =>
  n.target_screens.some(s => screens.includes(s));

// الشاشة اللي هتتفتح للمستخدم: أول شاشة من target_screens مسموحة له
export const resolveTargetScreen = (n: Pick<AppNotification, 'target_screens'>, screens: string[]): string | null =>
  n.target_screens.find(s => screens.includes(s)) || null;

export const isUnread = (n: Pick<AppNotification, 'read_by'>, userKey: string): boolean => !!userKey && !n.read_by.includes(userKey);

// صفوف السحابة: null → قيم آمنة
export function normalizeNotification(row: any): AppNotification {
  const arr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter(x => typeof x === 'string');
    if (typeof v === 'string') { try { const x = JSON.parse(v); return Array.isArray(x) ? x.filter((y: unknown) => typeof y === 'string') : []; } catch { return []; } }
    return [];
  };
  return {
    id: String(row.id),
    kind: row.kind || '',
    title: row.title || '',
    body: row.body || '',
    entity_type: row.entity_type === 'maintenance' ? 'maintenance' : 'transport',
    entity_id: String(row.entity_id || ''),
    target_screens: arr(row.target_screens),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at || Date.now()).toISOString(),
    ...(row.created_by ? { created_by: String(row.created_by) } : {}),
    read_by: arr(row.read_by),
  };
}

// دمج المحلي مع السحابة: اتحاد الإشعارات حسب المعرّف، وحالة القراءة بتتجمع من الطرفين
export function mergeNotifications(local: AppNotification[], cloud: AppNotification[]): AppNotification[] {
  const map = new Map<string, AppNotification>();
  for (const n of cloud) map.set(n.id, n);
  for (const n of local) {
    const c = map.get(n.id);
    map.set(n.id, c ? { ...c, read_by: Array.from(new Set([...c.read_by, ...n.read_by])) } : n);
  }
  return sortNotifications(Array.from(map.values()));
}

export const sortNotifications = (list: AppNotification[]): AppNotification[] =>
  [...list].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

// الاحتفاظ بآخر 30 يوم وبحد أقصى 300 إشعار
export function pruneNotifications(list: AppNotification[], nowMs: number, maxAgeDays = 30, max = 300): AppNotification[] {
  const cutoff = nowMs - maxAgeDays * 86400000;
  return sortNotifications(list.filter(n => new Date(n.created_at).getTime() >= cutoff)).slice(0, max);
}

// الإشعارات اللي لازم تتبعت للسحابة: الجديدة، أو اللي عليها قراءة لسه السحابة ماعرفتهاش
export function notificationsToUpload(merged: AppNotification[], cloud: AppNotification[]): AppNotification[] {
  const byId = new Map(cloud.map(n => [n.id, n]));
  return merged.filter(n => { const c = byId.get(n.id); return !c || n.read_by.some(k => !c.read_by.includes(k)); });
}

export function timeAgoAr(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

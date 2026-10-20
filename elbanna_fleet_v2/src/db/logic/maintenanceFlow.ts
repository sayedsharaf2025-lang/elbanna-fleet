/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// منطق سير طلب الصيانة (الحالات الجديدة، تحويل الحالات القديمة، حساب المسافة بين عطلين).
// دوال صافية عشان تتختبر بدون React.

import type { MaintenanceInvoice, MaintenanceRequest, MaintenanceRequestStatus } from '../../types';

// تحويل الحالات القديمة لأقرب مرحلة جديدة (الطلبات المسجلة قبل تعديل سير العمل)
export function normalizeMaintenanceStatus(status: string, invoice?: Pick<MaintenanceInvoice, 'status'> | null): MaintenanceRequestStatus {
  switch (status) {
    case 'pending_parts': return 'parts_requested';
    case 'in_progress': return 'in_workshop';
    case 'pending_review': return 'pending_invoice';
    case 'invoiced': return invoice && invoice.status !== 'draft' ? 'invoice_approved' : 'invoice_review';
    case 'new': case 'parts_requested': case 'parts_purchased': case 'in_workshop':
    case 'pending_invoice': case 'invoice_review': case 'invoice_approved':
    case 'repaired': case 'receipt_rejected': case 'closed':
      return status as MaintenanceRequestStatus;
    default: return 'new';
  }
}

export function normalizeMaintenanceRequest<T extends { status: string; invoice_id?: string }>(
  r: T, invoices: Pick<MaintenanceInvoice, 'id' | 'status'>[] = []
): T & { status: MaintenanceRequestStatus } {
  const inv = r.invoice_id ? invoices.find(i => i.id === r.invoice_id) : undefined;
  return { ...r, status: normalizeMaintenanceStatus(r.status, inv) };
}

// آخر عطل سابق لنفس السيارة (غير الطلب الحالي) — الأحدث بتاريخ الطلب ثم برقمه
export function findPreviousFault(requests: MaintenanceRequest[], current: Pick<MaintenanceRequest, 'id' | 'car_id' | 'request_date' | 'request_number'>): MaintenanceRequest | undefined {
  return requests
    .filter(r => r.car_id === current.car_id && r.id !== current.id &&
      (r.request_date < current.request_date || (r.request_date === current.request_date && r.request_number < current.request_number)))
    .sort((a, b) => b.request_date.localeCompare(a.request_date) || b.request_number.localeCompare(a.request_number))[0];
}

// المسافة من آخر عطل مسجّل له عداد. لو مفيش عطل سابق بعداد، مفيش مسافة (undefined). مفيش مسافة سالبة.
export function kmSinceLastFault(requests: MaintenanceRequest[], current: Pick<MaintenanceRequest, 'id' | 'car_id' | 'request_date' | 'request_number'>, odometer: number): number | undefined {
  const prev = requests
    .filter(r => r.car_id === current.car_id && r.id !== current.id && typeof r.odometer === 'number' &&
      (r.request_date < current.request_date || (r.request_date === current.request_date && r.request_number < current.request_number)))
    .sort((a, b) => b.request_date.localeCompare(a.request_date) || b.request_number.localeCompare(a.request_number))[0];
  if (!prev || typeof prev.odometer !== 'number') return undefined;
  return Math.max(0, odometer - prev.odometer);
}

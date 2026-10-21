/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// تكلفة الصيانة الحقيقية لسيارة في يوم: فواتير الصيانة غير المسودة، إجمالي البنود ناقص الخصم
// (منقول حرفيًا من store.tsx — مصدر واحد لشاشات المصاريف اليومية والربحية)

import type { MaintenanceInvoice } from '../../types';

export const maintenanceCostForCarDay = (maintenanceInvoices: MaintenanceInvoice[], carId: string, date: string): number => {
  return maintenanceInvoices
    .filter(inv => inv.car_id === carId && inv.invoice_date === date && inv.status !== 'draft')
    .reduce((sum, inv) => {
      const itemsTotal = inv.items.reduce((s, it) => s + (it.total || 0), 0);
      return sum + (itemsTotal - (inv.discount || 0));
    }, 0);
};

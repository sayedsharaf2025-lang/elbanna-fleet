/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { useDb } from '../db/store';

type Db = ReturnType<typeof useDb>;

// نسبة الجزء اللي بيتقاطع من الشهر ده مع المدى المختار (لتوزيع التكاليف الشهرية بالتناسب على الأيام)
export const monthOverlapShare = (month: string, from: string, to: string) => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const s = from > start ? from : start;
  const e = to < end ? to : end;
  if (s > e) return 0;
  const days = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;
  return days / daysInMonth;
};


export const effectiveDate = (r: { execution_date?: string; request_date: string }) => r.execution_date || r.request_date;

// حساب ربحية كل سيارة في مدى تاريخ: المصدر الوحيد المشترك بين شاشة الربحية وتقارير تكلفة الكيلو
export function computeVehicleProfitRows(db: Db, dateFrom: string, dateTo: string) {
    return db.cars.map(car => {
      const dailyRecords = db.carDailyCosts.filter(c => c.car_id === car.id && c.date >= dateFrom && c.date <= dateTo);
      const freight = dailyRecords.reduce((s, c) => s + (c.freight_amount || 0), 0);
      const distance = dailyRecords.reduce((s, c) => s + (c.total_distance_km || 0), 0);
      const cards = dailyRecords.reduce((s, c) => s + (c.cards_amount || 0), 0);
      // المخالفات كلها بتتحسب تكلفة من فواتير التراخيص، فمبلغ "مخالفات" اليدوي اليومي مابقاش بيتخصم هنا (منعًا للتكرار).
      // المبلغ اللي بيتخصم من السائق بيرجع للسيارة كإيراد: مجموع حركات الخصم المربوطة بالسيارة في المدى
      const recovered = db.movements
        .filter(m => m.type === 'deduction' && m.car_id === car.id && m.date >= dateFrom && m.date <= dateTo)
        .reduce((s, m) => s + Math.abs(m.amount_change || 0), 0);
      const tireWash = dailyRecords.reduce((s, c) => s + (c.tire_wash_amount || 0), 0);
      const extra = dailyRecords.reduce((s, c) => s + (c.extra_costs || []).reduce((ss, i) => ss + (i.amount || 0), 0), 0);

      const carRequests = db.transportRequests.filter(r => r.assigned_car_id === car.id && effectiveDate(r) >= dateFrom && effectiveDate(r) <= dateTo);
      const smoke = carRequests.reduce((s, r) => {
        const cost = db.transportRequestCosts.find(c => c.request_id === r.id);
        return s + (cost ? cost.legs.reduce((ss, l) => ss + (l.smoke_amount || 0), 0) : 0);
      }, 0);

      // تكلفة الصيانة الحقيقية — نفس المصدر الوحيد المستخدم في باقي الشاشات، لكل أيام المدى المختار
      const uniqueDates = Array.from(new Set(dailyRecords.map(c => c.date)));
      const maintenanceDatesSet = new Set<string>([...uniqueDates]);
      // نضيف كمان أي تاريخ له فاتورة صيانة حتى لو مفيش سجل مصاريف يومية ليه في المدى
      db.maintenanceInvoices
        .filter(inv => inv.car_id === car.id && inv.invoice_date >= dateFrom && inv.invoice_date <= dateTo)
        .forEach(inv => maintenanceDatesSet.add(inv.invoice_date));
      const maintenance = Array.from(maintenanceDatesSet).reduce((s, date) => s + db.getMaintenanceCostForCarDay(car.id, date), 0);

      // تكلفة التراخيص: فواتير التراخيص المعتمدة من المالية لنفس السيارة في المدى المختار
      const license = db.invoices
        .filter(inv => !inv.is_deleted && (inv.approval_status || 'approved') === 'approved' && inv.car_id === car.id && inv.invoice_date >= dateFrom && inv.invoice_date <= dateTo)
        .reduce((s, inv) => s + (inv.total_amount || 0), 0);

      // التكاليف الشهرية (مرتب السائق + سولار + زيت) موزّعة بالتناسب على أيام المدى المختار
      let salary = 0, diesel = 0, oil = 0;
      const driverIds = new Set<string>();
      db.carMonthlyCosts.filter(r => r.car_id === car.id).forEach(r => {
        const share = monthOverlapShare(r.month, dateFrom, dateTo);
        if (share <= 0) return;
        salary += (r.salary_amount || 0) * share;
        diesel += (r.diesel_amount || 0) * share;
        oil += (r.oil_amount || 0) * share;
        if (r.driver_id) driverIds.add(r.driver_id);
      });
      salary = Math.round(salary * 100) / 100;
      diesel = Math.round(diesel * 100) / 100;
      oil = Math.round(oil * 100) / 100;
      const driverNames = Array.from(driverIds).map(id => db.drivers.find(d => d.id === id)?.name).filter(Boolean).join(' / ');

      const totalCost = smoke + cards + tireWash + extra + maintenance + license + salary + diesel + oil;
      const net = freight + recovered - totalCost;

      return { car, freight, distance, recovered, smoke, cards, tireWash, extra, maintenance, license, salary, diesel, oil, driverNames, totalCost, net, tripCount: carRequests.length };
    }).filter(r => r.freight > 0 || r.totalCost > 0 || r.recovered > 0);
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import {
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Truck,
  Fuel,
  Wind,
  CreditCard,
  AlertTriangle,
  Droplets,
  Wrench,
  Printer,
} from 'lucide-react';

// شاشة ربحية السيارة: صافي الربح = النولون (الدخل) − كل المصاريف المرتبطة (دخان + كارتات +
// مخالفات + غسيل كاوتش + صيانة حقيقية من فواتير الصيانة). كل رقم هنا مسحوب حيًّا من مصدره
// الأصلي الوحيد — مفيش تكرار أو إدخال يدوي مباشر في الشاشة دي.
export function VehicleProfitabilityTab() {
  const db = useDb();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const effectiveDate = (r: { execution_date?: string; request_date: string }) => r.execution_date || r.request_date;

  const rows = useMemo(() => {
    return db.cars.map(car => {
      const dailyRecords = db.carDailyCosts.filter(c => c.car_id === car.id && c.date >= dateFrom && c.date <= dateTo);
      const freight = dailyRecords.reduce((s, c) => s + (c.freight_amount || 0), 0);
      const cards = dailyRecords.reduce((s, c) => s + (c.cards_amount || 0), 0);
      const violations = dailyRecords.reduce((s, c) => s + (c.violations_amount || 0), 0);
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

      const totalCost = smoke + cards + violations + tireWash + extra + maintenance;
      const net = freight - totalCost;

      return { car, freight, smoke, cards, violations, tireWash, extra, maintenance, totalCost, net, tripCount: carRequests.length };
    }).filter(r => r.freight > 0 || r.totalCost > 0);
  }, [db.cars, db.carDailyCosts, db.transportRequests, db.transportRequestCosts, db.maintenanceInvoices, dateFrom, dateTo]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    freight: acc.freight + r.freight,
    totalCost: acc.totalCost + r.totalCost,
    net: acc.net + r.net,
  }), { freight: 0, totalCost: 0, net: 0 }), [rows]);

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير ربحية السيارات</title>
      <style>
        body { font-family: 'Calibri','Cairo',Arial,sans-serif; direction: rtl; background:#fff; color:#111; font-size:12px; padding:24px; }
        h1 { font-size:18px; margin:0 0 4px; } .sub { color:#555; font-size:11px; margin-bottom:16px; }
        table { width:100%; border-collapse:collapse; font-size:11px; }
        th,td { border:1px solid #ccc; padding:6px 8px; text-align:center; }
        th { background:#f1f5f9; font-weight:900; } tfoot td { font-weight:900; background:#f8fafc; }
        .neg { color:#dc2626; } .pos { color:#059669; }
      </style></head><body>
        <h1>تقرير ربحية السيارات</h1>
        <div class="sub">من ${dateFrom} إلى ${dateTo} — تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
        <table><thead><tr>
          <th>السيارة</th><th>عدد النقلات</th><th>النولون (الدخل)</th><th>دخان</th><th>كارتات</th><th>مخالفات</th><th>غسيل كاوتش</th><th>صيانة</th><th>إجمالي التكلفة</th><th>صافي الربح</th>
        </tr></thead><tbody>
          ${rows.map(r => `<tr>
            <td>${r.car.car_number}</td><td>${r.tripCount}</td><td>${r.freight.toLocaleString()}</td>
            <td>${r.smoke.toLocaleString()}</td><td>${r.cards.toLocaleString()}</td><td>${r.violations.toLocaleString()}</td>
            <td>${r.tireWash.toLocaleString()}</td><td>${r.maintenance.toLocaleString()}</td><td>${r.totalCost.toLocaleString()}</td>
            <td class="${r.net >= 0 ? 'pos' : 'neg'}">${r.net.toLocaleString()}</td>
          </tr>`).join('')}
        </tbody><tfoot><tr>
          <td colspan="2">الإجمالي الكلي</td><td>${totals.freight.toLocaleString()}</td><td colspan="5"></td><td>${totals.totalCost.toLocaleString()}</td>
          <td class="${totals.net >= 0 ? 'pos' : 'neg'}">${totals.net.toLocaleString()}</td>
        </tr></tfoot></table>
      </body></html>
    `);
    win.document.close(); win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="space-y-6" id="vehicle_profitability_tab_view" style={{ direction: 'rtl' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><TrendingUp className="w-6 h-6" /> ربحية السيارات</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">صافي الربح = النولون (الدخل) − كل المصاريف (دخان، كارتات، مخالفات، غسيل كاوتش، صيانة). كل رقم هنا مسحوب حيًّا من مصدره الأصلي، بدون أي إدخال يدوي مباشر أو احتمال تكرار.</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6">
        <div className="grid grid-cols-1 md:grid-cols-[180px,180px,auto] gap-3">
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> من تاريخ</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handlePrint} disabled={rows.length === 0} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 justify-center">
              <Printer className="w-3.5 h-3.5" /> طباعة التقرير
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي النولون (الدخل)</p>
          <p className="text-lg font-black text-indigo-600">{totals.freight.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي كل التكاليف</p>
          <p className="text-lg font-black text-rose-600">{totals.totalCost.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">صافي الربح الكلي</p>
          <p className={`text-lg font-black ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totals.net.toLocaleString()} ج.م</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto text-xs font-sans">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <th className="py-3 px-3">السيارة</th>
                <th className="py-3 px-3">النقلات</th>
                <th className="py-3 px-3">النولون</th>
                <th className="py-3 px-3">دخان</th>
                <th className="py-3 px-3">كارتات</th>
                <th className="py-3 px-3">مخالفات</th>
                <th className="py-3 px-3">غسيل كاوتش</th>
                <th className="py-3 px-3">صيانة</th>
                <th className="py-3 px-3">إجمالي التكلفة</th>
                <th className="py-3 px-3">صافي الربح</th>
              </tr>
            </thead>
            <tbody>
              {rows.sort((a, b) => b.net - a.net).map(r => (
                <tr key={r.car.id} className="border-b border-slate-100 hover:bg-slate-50/70 text-slate-700">
                  <td className="py-2.5 px-3 font-bold flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-slate-400" /> {r.car.car_number}</td>
                  <td className="py-2.5 px-3 font-mono">{r.tripCount}</td>
                  <td className="py-2.5 px-3 font-mono text-indigo-600 font-bold flex items-center gap-1"><Fuel className="w-3 h-3" /> {r.freight.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-amber-600"><Wind className="w-3 h-3" /> {r.smoke.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><CreditCard className="w-3 h-3" /> {r.cards.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><AlertTriangle className="w-3 h-3" /> {r.violations.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><Droplets className="w-3 h-3" /> {r.tireWash.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><Wrench className="w-3 h-3" /> {r.maintenance.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono text-rose-600 font-bold">{r.totalCost.toLocaleString()}</td>
                  <td className={`py-2.5 px-3 font-mono font-black flex items-center gap-1 ${r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {r.net >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />} {r.net.toLocaleString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="py-10 text-center text-slate-400 font-bold">لا توجد بيانات تكلفة أو دخل مسجلة في المدى الزمني ده.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

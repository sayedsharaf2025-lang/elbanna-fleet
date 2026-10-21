/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { computeVehicleProfitRows } from '../utils/vehicleProfit';
import { downloadCsv } from '../utils/csv';
import { printA4Report } from '../utils/printA4';
import { SortableTh } from './SortableTh';
import { useSort } from '../hooks/useSort';
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
  FileCheck,
  Download,
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

  const rows = useMemo(() => computeVehicleProfitRows(db, dateFrom, dateTo), [db.cars, db.carDailyCosts, db.transportRequests, db.transportRequestCosts, db.maintenanceInvoices, db.invoices, db.carMonthlyCosts, db.drivers, db.movements, dateFrom, dateTo]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    trips: acc.trips + r.tripCount,
    freight: acc.freight + r.freight,
    recovered: acc.recovered + r.recovered,
    smoke: acc.smoke + r.smoke,
    cards: acc.cards + r.cards,
    tireWash: acc.tireWash + r.tireWash,
    extra: acc.extra + r.extra,
    maintenance: acc.maintenance + r.maintenance,
    license: acc.license + r.license,
    salary: acc.salary + r.salary,
    diesel: acc.diesel + r.diesel,
    oil: acc.oil + r.oil,
    totalCost: acc.totalCost + r.totalCost,
    net: acc.net + r.net,
  }), { trips: 0, freight: 0, recovered: 0, smoke: 0, cards: 0, tireWash: 0, extra: 0, maintenance: 0, license: 0, salary: 0, diesel: 0, oil: 0, totalCost: 0, net: 0 }), [rows]);

  // الفرز بالضغط على عنوان العمود — الافتراضي: الأعلى ربحًا الأول (زي الشاشة القديمة)
  const { sort, sorted, toggle } = useSort(rows, (r, key) => {
    switch (key) {
      case 'car': return r.car.car_number;
      case 'trips': return r.tripCount;
      case 'tireWash': return r.tireWash;
      default: return (r as any)[key] as number;
    }
  }, { initial: { key: 'net', dir: 'desc' } });

  // خصومات من السائقين في المدى بدون سيارة محددة (خصم جماعي أو فردي من غير ربط بسيارة) — مش بتتحسب على أي سيارة
  const unassignedDeductions = useMemo(() => db.movements
    .filter(m => m.type === 'deduction' && !m.car_id && m.date >= dateFrom && m.date <= dateTo)
    .reduce((s, m) => s + Math.abs(m.amount_change || 0), 0), [db.movements, dateFrom, dateTo]);

  const handleCsv = () => downloadCsv(
    `ربحية-السيارات-${dateFrom}-${dateTo}`,
    ['السيارة', 'السائق', 'المشاوير', 'الكيلومترات', 'النولون', 'خصم مخالفات (+)', 'دخان', 'كارتات', 'غسيل كاوتش', 'بنود إضافية', 'صيانة', 'تراخيص', 'مرتب السائق', 'سولار', 'زيت', 'إجمالي التكلفة', 'الصافي'],
    rows.map(r => [r.car.car_number, r.driverNames || '', r.tripCount, r.distance, r.freight, r.recovered, r.smoke, r.cards, r.tireWash, r.extra, r.maintenance, r.license, r.salary, r.diesel, r.oil, r.totalCost, r.net])
  );

  const handlePrint = () => {
    printA4Report({
      title: 'تقرير ربحية السيارات',
      subtitle: `من ${dateFrom} إلى ${dateTo}`,
      user: db.currentUser?.name || db.currentUser?.username || '',
      orientation: 'landscape',
      headers: ['السيارة', 'النقلات', 'النولون (الدخل)', 'خصم مخالفات (+)', 'دخان', 'كارتات', 'غسيل كاوتش', 'بنود إضافية', 'صيانة', 'تراخيص', 'مرتب السائق', 'سولار', 'زيت', 'إجمالي التكلفة', 'صافي الربح'],
      rows: sorted.map(r => [r.car.car_number, r.tripCount, r.freight, r.recovered, r.smoke, r.cards, r.tireWash, r.extra, r.maintenance, r.license, r.salary, r.diesel, r.oil, r.totalCost, r.net]),
      totalsRow: ['الإجمالي الكلي', totals.trips, totals.freight, totals.recovered, totals.smoke, totals.cards, totals.tireWash, totals.extra, totals.maintenance, totals.license, totals.salary, totals.diesel, totals.oil, totals.totalCost, totals.net],
      signedColumns: [14],
      summary: [
        { label: 'إجمالي النولون (الدخل)', value: `${totals.freight.toLocaleString()} ج.م` },
        { label: 'خصومات المخالفات (+)', value: `${totals.recovered.toLocaleString()} ج.م` },
        { label: 'إجمالي التكاليف', value: `${totals.totalCost.toLocaleString()} ج.م` },
        { label: 'صافي الربح', value: `${totals.net.toLocaleString()} ج.م` },
      ],
      notes: unassignedDeductions > 0 ? `تنبيه: خصومات من السائقين بقيمة ${unassignedDeductions.toLocaleString()} ج.م في الفترة غير مرتبطة بسيارة، فمش محسوبة على أي سيارة.` : undefined,
    });
  };

  return (
    <div className="space-y-6" id="vehicle_profitability_tab_view" style={{ direction: 'rtl' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><TrendingUp className="w-6 h-6" /> ربحية السيارات</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">صافي الربح = النولون (الدخل) + خصومات المخالفات من السائقين − كل المصاريف (دخان، كارتات، غسيل كاوتش، صيانة، تراخيص، مرتب السائق، سولار، زيت). كل رقم هنا مسحوب حيًّا من مصدره الأصلي، بدون أي إدخال يدوي مباشر أو احتمال تكرار.</p>
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
          <button type="button" onClick={handleCsv} disabled={rows.length === 0} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 justify-center">
            <Download className="w-3.5 h-3.5" /> تصدير CSV
          </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي النولون (الدخل)</p>
          <p className="text-lg font-black text-indigo-600">{totals.freight.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">خصومات المخالفات من السائقين (+)</p>
          <p className="text-lg font-black text-emerald-600">{totals.recovered.toLocaleString()} ج.م</p>
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

      {unassignedDeductions > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          تنبيه: فيه خصومات من السائقين بقيمة {unassignedDeductions.toLocaleString()} ج.م في الفترة دي من غير سيارة محددة (خصم جماعي أو بدون ربط)، فمش محسوبة على أي سيارة. اربطها بسيارة من شاشة الخصومات لو عايزها تدخل في الربح.
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="xl-wrap text-xs font-sans" style={{ maxHeight: '70vh', border: 0, borderRadius: 0 }}>
          <table className="xl-table xl-plain w-full text-right">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <SortableTh label="السيارة" sortKey="car" sort={sort} onToggle={toggle} sticky />
                <SortableTh label="النقلات" sortKey="trips" sort={sort} onToggle={toggle} />
                <SortableTh label="النولون" sortKey="freight" sort={sort} onToggle={toggle} />
                <SortableTh label="دخان" sortKey="smoke" sort={sort} onToggle={toggle} />
                <SortableTh label="كارتات" sortKey="cards" sort={sort} onToggle={toggle} />
                <SortableTh label="خصم مخالفات (+)" sortKey="recovered" sort={sort} onToggle={toggle} />
                <SortableTh label="غسيل كاوتش" sortKey="tireWash" sort={sort} onToggle={toggle} />
                <SortableTh label="بنود إضافية" sortKey="extra" sort={sort} onToggle={toggle} />
                <SortableTh label="صيانة" sortKey="maintenance" sort={sort} onToggle={toggle} />
                <SortableTh label="تراخيص" sortKey="license" sort={sort} onToggle={toggle} />
                <SortableTh label="مرتب السائق" sortKey="salary" sort={sort} onToggle={toggle} />
                <SortableTh label="سولار" sortKey="diesel" sort={sort} onToggle={toggle} />
                <SortableTh label="زيت" sortKey="oil" sort={sort} onToggle={toggle} />
                <SortableTh label="إجمالي التكلفة" sortKey="totalCost" sort={sort} onToggle={toggle} />
                <SortableTh label="صافي الربح" sortKey="net" sort={sort} onToggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.car.id} className="border-b border-slate-100 hover:bg-slate-50/70 text-slate-700">
                  <td className="xl-sticky-col py-2.5 px-3 font-bold"><span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-slate-400" /> {r.car.car_number}{r.driverNames && <span className="text-[10px] text-slate-400 font-normal mr-1">({r.driverNames})</span>}</span></td>
                  <td className="py-2.5 px-3 font-mono">{r.tripCount}</td>
                  <td className="py-2.5 px-3 font-mono text-indigo-600 font-bold flex items-center gap-1"><Fuel className="w-3 h-3" /> {r.freight.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-amber-600"><Wind className="w-3 h-3" /> {r.smoke.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><CreditCard className="w-3 h-3" /> {r.cards.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-emerald-600"><AlertTriangle className="w-3 h-3" /> {r.recovered.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><Droplets className="w-3 h-3" /> {r.tireWash.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">{r.extra.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><Wrench className="w-3 h-3" /> {r.maintenance.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono"><span className="flex items-center gap-1 text-slate-500"><FileCheck className="w-3 h-3" /> {r.license.toLocaleString()}</span></td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{r.salary.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono text-amber-600">{r.diesel.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{r.oil.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono text-rose-600 font-bold">{r.totalCost.toLocaleString()}</td>
                  <td className={`py-2.5 px-3 font-mono font-black flex items-center gap-1 ${r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {r.net >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />} {r.net.toLocaleString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={15} className="py-10 text-center text-slate-400 font-bold">لا توجد بيانات تكلفة أو دخل مسجلة في المدى الزمني ده.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

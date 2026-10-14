/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { BarChart3, CalendarDays, Download, Printer, User, Truck } from 'lucide-react';
import { computeVehicleProfitRows, effectiveDate, monthOverlapShare } from '../utils/vehicleProfit';
import { downloadCsv } from '../utils/csv';
import { printTable } from '../utils/printTable';

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => round2(n).toLocaleString();

// تقارير: (1) ربحية كل سائق (2) تكلفة الكيلو لكل سيارة
export function DriverReportsTab() {
  const db = useDb();
  const [tab, setTab] = useState<'drivers' | 'perkm'>('drivers');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  // ===== ربحية السائقين =====
  // النولون والكيلومترات بتتوزع كل يوم على سائقي المشاوير اللي اتسجلت للسيارة في اليوم ده (بنسبة عدد المشاوير).
  // لو مفيش مشاوير في اليوم: بتروح لسائق السيارة المسجل في تكاليف الشهر، وبعده السائق المرتبط بالسيارة.
  const driverRows = useMemo(() => {
    const bucket = new Map<string, { freight: number; km: number; trips: number }>();
    const get = (id: string) => {
      if (!bucket.has(id)) bucket.set(id, { freight: 0, km: 0, trips: 0 });
      return bucket.get(id)!;
    };

    const requests = db.transportRequests.filter(r => r.assigned_car_id && effectiveDate(r) >= dateFrom && effectiveDate(r) <= dateTo);
    requests.forEach(r => { if (r.assigned_driver_id) get(r.assigned_driver_id).trips += 1; });

    db.carDailyCosts.filter(c => c.date >= dateFrom && c.date <= dateTo).forEach(rec => {
      const dayDrivers = requests.filter(r => r.assigned_car_id === rec.car_id && effectiveDate(r) === rec.date && r.assigned_driver_id);
      const weights = new Map<string, number>();
      dayDrivers.forEach(r => weights.set(r.assigned_driver_id!, (weights.get(r.assigned_driver_id!) || 0) + 1));
      if (weights.size === 0) {
        const monthly = db.carMonthlyCosts.find(m => m.car_id === rec.car_id && m.month === rec.date.slice(0, 7));
        const fallback = monthly?.driver_id || db.cars.find(c => c.id === rec.car_id)?.driver_id || '';
        weights.set(fallback, 1);
      }
      const total = Array.from(weights.values()).reduce((s, w) => s + w, 0);
      weights.forEach((w, driverId) => {
        const b = get(driverId);
        b.freight += (rec.freight_amount || 0) * w / total;
        b.km += (rec.total_distance_km || 0) * w / total;
      });
    });

    const ids = new Set<string>(bucket.keys());
    db.carMonthlyCosts.forEach(m => { if (m.driver_id && monthOverlapShare(m.month, dateFrom, dateTo) > 0) ids.add(m.driver_id); });
    db.violations.forEach(v => { if (v.driver_id && v.violation_date >= dateFrom && v.violation_date <= dateTo) ids.add(v.driver_id); });
    db.movements.forEach(m => { if (m.type === 'deduction' && m.driver_id && m.date >= dateFrom && m.date <= dateTo) ids.add(m.driver_id); });

    return Array.from(ids).map(id => {
      const b = bucket.get(id) || { freight: 0, km: 0, trips: 0 };
      const driver = db.drivers.find(d => d.id === id);
      const salary = db.carMonthlyCosts
        .filter(m => m.driver_id === id)
        .reduce((s, m) => s + (m.salary_amount || 0) * monthOverlapShare(m.month, dateFrom, dateTo), 0);
      const viol = db.violations.filter(v => v.driver_id === id && v.violation_date >= dateFrom && v.violation_date <= dateTo);
      const violations = viol.reduce((s, v) => s + (v.amount || 0), 0);
      const deducted = db.movements
        .filter(m => m.type === 'deduction' && m.driver_id === id && m.date >= dateFrom && m.date <= dateTo)
        .reduce((s, m) => s + Math.abs(m.amount_change || 0), 0);
      const net = b.freight - salary - (violations - deducted);
      return {
        id,
        name: id ? (driver?.name || 'سائق محذوف') : 'غير موزّع (بدون سائق)',
        trips: b.trips,
        km: b.km,
        freight: b.freight,
        salary,
        violations,
        violationCount: viol.length,
        deducted,
        net,
      };
    })
      .filter(r => r.trips > 0 || r.freight > 0 || r.salary > 0 || r.violations > 0 || r.deducted > 0)
      .sort((a, b) => b.net - a.net);
  }, [db.transportRequests, db.carDailyCosts, db.carMonthlyCosts, db.cars, db.drivers, db.violations, db.movements, dateFrom, dateTo]);

  // ===== تكلفة الكيلو =====
  const perKm = useMemo(() => {
    const rows = computeVehicleProfitRows(db, dateFrom, dateTo).map(r => ({
      ...r,
      costPerKm: r.distance > 0 ? r.totalCost / r.distance : null,
      freightPerKm: r.distance > 0 ? r.freight / r.distance : null,
      netPerKm: r.distance > 0 ? r.net / r.distance : null,
    }));
    const withKm = rows.filter(r => r.distance > 0);
    const totalKm = withKm.reduce((s, r) => s + r.distance, 0);
    const totalCost = withKm.reduce((s, r) => s + r.totalCost, 0);
    const avg = totalKm > 0 ? totalCost / totalKm : 0;
    rows.sort((a, b) => (b.costPerKm ?? -1) - (a.costPerKm ?? -1));
    return { rows, avg, totalKm, totalCost };
  }, [db, dateFrom, dateTo]);

  const driverTotals = driverRows.reduce((acc, r) => ({
    trips: acc.trips + r.trips, km: acc.km + r.km, freight: acc.freight + r.freight, salary: acc.salary + r.salary,
    violations: acc.violations + r.violations, deducted: acc.deducted + r.deducted, net: acc.net + r.net,
  }), { trips: 0, km: 0, freight: 0, salary: 0, violations: 0, deducted: 0, net: 0 });

  const period = `من ${dateFrom} إلى ${dateTo}`;
  const driverHeaders = ['السائق', 'المشاوير', 'الكيلومترات', 'النولون المنسوب', 'المرتب', 'المخالفات', 'المخصوم من السائق', 'صافي المساهمة'];
  const driverTable = () => driverRows.map(r => [r.name, r.trips, round2(r.km), round2(r.freight), round2(r.salary), round2(r.violations), round2(r.deducted), round2(r.net)]);
  const kmHeaders = ['السيارة', 'السائق', 'الكيلومترات', 'إجمالي التكلفة', 'تكلفة الكيلو', 'نولون الكيلو', 'صافي الكيلو'];
  const kmTable = () => perKm.rows.map(r => [r.car.car_number, r.driverNames || '', round2(r.distance), round2(r.totalCost), r.costPerKm === null ? '' : round2(r.costPerKm), r.freightPerKm === null ? '' : round2(r.freightPerKm), r.netPerKm === null ? '' : round2(r.netPerKm)]);

  const handleCsv = () => tab === 'drivers'
    ? downloadCsv(`ربحية-السائقين-${dateFrom}-${dateTo}`, driverHeaders, driverTable())
    : downloadCsv(`تكلفة-الكيلو-${dateFrom}-${dateTo}`, kmHeaders, kmTable());
  const handlePrint = () => tab === 'drivers'
    ? printTable('تقرير ربحية السائقين', period, driverHeaders, driverTable(), ['الإجمالي', driverTotals.trips, round2(driverTotals.km), round2(driverTotals.freight), round2(driverTotals.salary), round2(driverTotals.violations), round2(driverTotals.deducted), round2(driverTotals.net)])
    : printTable('تقرير تكلفة الكيلو للسيارات', `${period} — متوسط تكلفة الكيلو للأسطول: ${round2(perKm.avg)} ج.م`, kmHeaders, kmTable());

  return (
    <div className="space-y-6" id="driver_reports_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">التقارير</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><BarChart3 className="w-6 h-6" /> تقارير السائقين وتكلفة الكيلو</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">كل الأرقام بتتسحب من نفس مصادر شاشة ربحية السيارات (مصاريف يومية وشهرية، فواتير تراخيص وصيانة، مخالفات وخصومات). مفيش إدخال في الشاشة دي.</p>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> من</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono bg-white" />
        </div>
        <div>
          <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> إلى</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono bg-white" />
        </div>
        <div className="flex gap-2 mr-auto">
          <button type="button" onClick={handleCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> تصدير CSV</button>
          <button type="button" onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('drivers')} className={`text-xs font-bold px-4 py-2 rounded-lg border flex items-center gap-1.5 ${tab === 'drivers' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><User className="w-3.5 h-3.5" /> ربحية السائقين</button>
        <button type="button" onClick={() => setTab('perkm')} className={`text-xs font-bold px-4 py-2 rounded-lg border flex items-center gap-1.5 ${tab === 'perkm' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><Truck className="w-3.5 h-3.5" /> تكلفة الكيلو</button>
      </div>

      {tab === 'drivers' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{driverHeaders.map(h => <th key={h} className="py-3 px-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {driverRows.map(r => (
                <tr key={r.id || 'none'} className="border-t border-slate-50 text-slate-700">
                  <td className="py-2.5 px-3 font-bold">{r.name}</td>
                  <td className="py-2.5 px-3 font-mono">{r.trips}</td>
                  <td className="py-2.5 px-3 font-mono">{fmt(r.km)}</td>
                  <td className="py-2.5 px-3 font-mono">{fmt(r.freight)}</td>
                  <td className="py-2.5 px-3 font-mono">{fmt(r.salary)}</td>
                  <td className="py-2.5 px-3 font-mono text-rose-600">{fmt(r.violations)}{r.violationCount > 0 && <span className="text-slate-400"> ({r.violationCount})</span>}</td>
                  <td className="py-2.5 px-3 font-mono text-emerald-600">{fmt(r.deducted)}</td>
                  <td className={`py-2.5 px-3 font-mono font-black ${r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.net)}</td>
                </tr>
              ))}
              {driverRows.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400 font-bold">لا توجد بيانات سائقين في الفترة دي.</td></tr>
              )}
            </tbody>
            {driverRows.length > 0 && (
              <tfoot className="bg-slate-50 font-black text-slate-800">
                <tr>
                  <td className="py-3 px-3">الإجمالي</td>
                  <td className="py-3 px-3 font-mono">{driverTotals.trips}</td>
                  <td className="py-3 px-3 font-mono">{fmt(driverTotals.km)}</td>
                  <td className="py-3 px-3 font-mono">{fmt(driverTotals.freight)}</td>
                  <td className="py-3 px-3 font-mono">{fmt(driverTotals.salary)}</td>
                  <td className="py-3 px-3 font-mono">{fmt(driverTotals.violations)}</td>
                  <td className="py-3 px-3 font-mono">{fmt(driverTotals.deducted)}</td>
                  <td className="py-3 px-3 font-mono">{fmt(driverTotals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-slate-100 leading-relaxed">
            صافي المساهمة = النولون المنسوب − المرتب − (المخالفات − المخصوم من السائق). السولار والزيت والصيانة والتراخيص بتتحسب على السيارة مش على السائق، فهي مش هنا (شوفها في ربحية السيارات). النولون بيتوزع كل يوم على سائقي مشاوير السيارة بنسبة عدد المشاوير.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
              <p className="text-[11px] text-slate-500 font-bold">متوسط تكلفة الكيلو للأسطول</p>
              <p className="text-lg font-black text-slate-800">{fmt(perKm.avg)} ج.م</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
              <p className="text-[11px] text-slate-500 font-bold">إجمالي الكيلومترات</p>
              <p className="text-lg font-black text-slate-800">{fmt(perKm.totalKm)} كم</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center col-span-2 md:col-span-1">
              <p className="text-[11px] text-slate-500 font-bold">إجمالي التكاليف (سيارات لها كيلومترات)</p>
              <p className="text-lg font-black text-rose-600">{fmt(perKm.totalCost)} ج.م</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{kmHeaders.map(h => <th key={h} className="py-3 px-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {perKm.rows.map(r => {
                  const high = r.costPerKm !== null && perKm.avg > 0 && r.costPerKm > perKm.avg * 1.25;
                  return (
                    <tr key={r.car.id} className={`border-t border-slate-50 text-slate-700 ${high ? 'bg-amber-50' : ''}`}>
                      <td className="py-2.5 px-3 font-bold">{r.car.car_number}</td>
                      <td className="py-2.5 px-3">{r.driverNames || '—'}</td>
                      <td className="py-2.5 px-3 font-mono">{r.distance > 0 ? fmt(r.distance) : <span className="text-slate-400">مفيش كيلومترات</span>}</td>
                      <td className="py-2.5 px-3 font-mono">{fmt(r.totalCost)}</td>
                      <td className={`py-2.5 px-3 font-mono font-black ${high ? 'text-amber-700' : ''}`}>{r.costPerKm === null ? '—' : fmt(r.costPerKm)}</td>
                      <td className="py-2.5 px-3 font-mono">{r.freightPerKm === null ? '—' : fmt(r.freightPerKm)}</td>
                      <td className={`py-2.5 px-3 font-mono font-bold ${(r.netPerKm ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{r.netPerKm === null ? '—' : fmt(r.netPerKm)}</td>
                    </tr>
                  );
                })}
                {perKm.rows.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-bold">لا توجد بيانات في الفترة دي.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-slate-100 leading-relaxed">
              تكلفة الكيلو = إجمالي تكلفة السيارة ÷ الكيلومترات المسجلة في المصاريف اليومية. السيارات المظللة بالأصفر أغلى من متوسط الأسطول بأكتر من 25%. الترتيب من الأغلى.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

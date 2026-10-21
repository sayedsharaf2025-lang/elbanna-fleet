/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Driver } from '../types';
import { A5PrintPreview } from './A5PrintPreview';
import {
  CalendarDays,
  Search,
  Printer,
  ChevronLeft,
  DollarSign,
  Briefcase,
  AlertOctagon,
  Download,
  Percent
} from 'lucide-react';

export const AccountsTab: React.FC = () => {
  const db = useDb();

  // Search filtering state
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');

  // Print popup hook
  const [printDocument, setPrintDocument] = useState<{
    driver: Driver;
    month?: string;
    year?: string;
  } | null>(null);

  // Month-Year Helpers
  const months = [
    { value: '01', name: 'يناير (01)' },
    { value: '02', name: 'فبراير (02)' },
    { value: '03', name: 'مارس (03)' },
    { value: '04', name: 'أبريل (04)' },
    { value: '05', name: 'مايو (05)' },
    { value: '06', name: 'يونيو (06)' },
    { value: '07', name: 'يوليو (07)' },
    { value: '08', name: 'أغسطس (08)' },
    { value: '09', name: 'سبتمبر (09)' },
    { value: '10', name: 'أكتوبر (10)' },
    { value: '11', name: 'نوفمبر (11)' },
    { value: '12', name: 'ديسمبر (12)' }
  ];

  const years = ['2026', '2025', '2024'];

  const getEnrichedMovements = (drvId?: string): typeof db.movements => {
    if (!drvId) {
      // Concatenate for all drivers
      let allEnriched: any[] = [];
      const cache = new Set<string>();
      db.drivers.forEach(d => {
        const enriched = getEnrichedMovements(d.id);
        enriched.forEach(m => {
          if (!cache.has(m.id)) {
            cache.add(m.id);
            allEnriched.push(m);
          }
        });
      });
      return allEnriched.sort((a, b) => b.date.localeCompare(a.date));
    }

    const explicitMovements = db.movements.filter(m => m.driver_id === drvId);
    const drvViolations = db.violations.filter(v => v.driver_id === drvId);
    const hasViolationMovements = explicitMovements.some(m => m.type === 'violation');

    if (!hasViolationMovements && drvViolations.length > 0) {
      // Sort violations ascending by date to build the running balance
      const sortedViolations = [...drvViolations].sort((a, b) => a.violation_date.localeCompare(b.violation_date));
      let runningBalance = 0;
      
      const synthesizedViolations = sortedViolations.map(v => {
        runningBalance += v.amount;
        return {
          id: `synth-viol-${v.id}`,
          driver_id: drvId,
          date: v.violation_date,
          description: `تسجيل مخالفة: ${v.description} (سيارة رقم: ${v.car_number || 'N/A'})`,
          amount_change: v.amount,
          new_balance: runningBalance,
          type: 'violation' as const
        };
      });

      const driverObj = db.drivers.find(d => d.id === drvId);
      const currentBalance = driverObj ? driverObj.balance : 0;
      
      const explicitDelta = explicitMovements.reduce((sum, m) => sum + m.amount_change, 0);
      const expectedBalance = runningBalance + explicitDelta;
      const paymentNeeded = currentBalance - expectedBalance;

      let result = [...synthesizedViolations, ...explicitMovements];

      if (paymentNeeded !== 0) {
        const latestDate = sortedViolations[sortedViolations.length - 1]?.violation_date || new Date().toISOString().split('T')[0];
        result.push({
          id: `synth-settlement-${drvId}`,
          driver_id: drvId,
          date: latestDate,
          description: paymentNeeded < 0 
            ? `خصومات وتفادي تسويات مقتطعة مسددة (إجمالي المبالغ والخصومات المسددة)`
            : `تسوية وتعديل رصيد مدفوعات/مستحقات`,
          amount_change: paymentNeeded,
          new_balance: currentBalance,
          type: paymentNeeded < 0 ? ('payment' as const) : ('deduction' as const)
        });
      }

      return result.sort((a, b) => b.date.localeCompare(a.date));
    }

    return explicitMovements;
  };

  const filteredMovements = getEnrichedMovements(selectedDriverId).filter(item => {
    // 1. Filter by Driver
    if (selectedDriverId && item.driver_id !== selectedDriverId) return false;

    // 2. Filter by Year and Month from "YYYY-MM-DD" style
    const [year, month] = item.date.split('-');
    if (selectedMonth && month !== selectedMonth) return false;
    if (selectedYear && year !== selectedYear) return false;

    return true;
  });

  const getDriverName = (id: string) => {
    const d = db.drivers.find(drv => drv.id === id);
    return d ? d.name : "عام";
  };

  const handlePrintSelectedLedger = () => {
    const driverObj = db.drivers.find(d => d.id === selectedDriverId);
    if (!driverObj) {
      alert("الرجاء اختيار سائق محدد لتوليد وطباعة كشّف الحركة الفردي المفلتر!");
      return;
    }

    setPrintDocument({
      driver: driverObj,
      month: selectedMonth,
      year: selectedYear
    });
  };

  // CSV Report Generator
  const handleExportLedgerReport = () => {
    const headers = 'كود السائق,السائق المقر,التاريخ,الحركة والبيان,نوع القيد,مقدار التغيير ج.م\n';
    const rows = filteredMovements.map(m => {
      const d = db.drivers.find(drv => drv.id === m.driver_id);
      return `${d?.driver_code || 'N/A'},${d?.name || 'عام'},${m.date},${m.description},${m.type === 'violation' ? 'مخالفة' : m.type === 'deduction' ? 'خصم فردي' : 'سداد'},${m.amount_change}`;
    }).join('\n');

    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `driver_accounts_ledger_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  return (
    <div className="space-y-6" id="driver_accounts_tab" style={{ direction: 'rtl' }}>
      
      {/* Printable template view overlay portal */}
      {printDocument && (
        <A5PrintPreview
          type="statement"
          statementData={{
            driver: printDocument.driver,
            movements: getEnrichedMovements(printDocument.driver.id).filter(m => {
              const [year, month] = m.date.split('-');
              if (printDocument.month && month !== printDocument.month) return false;
              if (printDocument.year && year !== printDocument.year) return false;
              return true;
            }),
            month: printDocument.month,
            year: printDocument.year
          }}
          onClose={() => setPrintDocument(null)}
        />
      )}

      {/* Cross Search & Filter Controllers card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-4">
        <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-emerald-600" />
          البحث والفلترة المتقاطعة لأرصدة وحسابات السائقين
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
          
          <div>
            <label className="block text-slate-500 font-semibold mb-1">تحديد السائق المعني</label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">-- كافة السائقين والكوادر --</option>
              {db.drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} (كود: {d.driver_code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">الفلترة بالشهر</label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium bg-white"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="">-- كافة شهور السنة --</option>
              {months.map(mon => (
                <option key={mon.value} value={mon.value}>{mon.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">الفلترة بالسنة</label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium bg-white"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="">-- كافة الأعوام ماليًا --</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Action triggers */}
        <div className="flex justify-end gap-2.5 pt-2 flex-wrap text-xs font-sans">
          <button
            onClick={handleExportLedgerReport}
            type="button"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all border border-slate-200 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            تصدير الجدول المفلتر لإكسيل CSV
          </button>
          
          <button
            onClick={handlePrintSelectedLedger}
            disabled={!selectedDriverId}
            type="button"
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 font-bold text-white px-5 py-2.5 rounded-xl transition-all flex items-center gap-1 shadow"
          >
            <Printer className="w-4 h-4" />
            طباعة كشف الحساب الحالي (A5)
          </button>
        </div>
      </div>

      {/* Grid displaying filtered ledger entries */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="border-b border-slate-50 pb-2.5">
          <h3 className="font-bold text-slate-800 text-xs md:text-sm">سجل حركات ومعاملات الحساب الأرشيفية للخصومات والمخالفات</h3>
          <p className="text-[11px] text-slate-400">كافة الدفوعات والخصومات المسترجعة والمحدثة المسجلة حاليًا</p>
        </div>

        <div className="overflow-x-auto text-xs font-sans">
          <table className="w-full text-right my-2">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <th className="py-2.5 px-3">تاريخ الحركة</th>
                <th className="py-2.5 px-3">اسم السواق المقر</th>
                <th className="py-2.5 px-3">نوع القيد المحاسبي</th>
                <th className="py-2.5 px-3">وصف وتفصيل الحركة والسيارة</th>
                <th className="py-2.5 px-3 text-left">التغيير المالي ج.م</th>
                <th className="py-2.5 px-3 text-left">الموقف الجديد المستحق</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map(mov => (
                <tr key={mov.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-3 font-mono text-slate-500">{mov.date}</td>
                  <td className="py-3 px-3 font-bold text-slate-800">{getDriverName(mov.driver_id)}</td>
                  <td className="py-3 px-3">
                    {mov.type === 'violation' && <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-500/10 font-bold text-[10px]">مخالفة مرور غروية</span>}
                    {mov.type === 'deduction' && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-500/10 font-bold text-[10px]">خصم فردي مستحق</span>}
                    {mov.type === 'payment' && <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-500/10 font-bold text-[10px]">سداد معتمد محاسبي</span>}
                    {mov.type === 'reversal' && <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-500/10 font-bold text-[10px]">مرتد ملغى</span>}
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-600 max-w-xs truncate" title={mov.description}>{mov.description}</td>
                  <td className="py-3 px-3 text-left">
                    <span className={`font-mono font-bold ${mov.amount_change > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {mov.amount_change > 0 ? `+${mov.amount_change.toLocaleString()}` : `${mov.amount_change.toLocaleString()}`} ج.م
                    </span>
                  </td>
                  <td className="py-3 px-3 text-left font-mono font-extrabold text-slate-900">{mov.new_balance.toLocaleString()} ج.م</td>
                </tr>
              ))}
              {filteredMovements.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">لا توجد أية حركات محاسبية مطابقة لمعايير الفلترة المحددة.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

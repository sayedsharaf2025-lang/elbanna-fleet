/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { downloadCsv } from '../utils/csv';
import { DataGrid, GridColumn } from './grid/DataGrid';
import { useSort } from '../hooks/useSort';
import { useSaveShortcut } from '../hooks/useSaveShortcut';
import { usePersistedState } from '../hooks/usePersistedState';
import { toNumber } from '../utils/gridParse';
import { DraftMap, buildMonthlyCostData, monthlyCellValue, monthlyKey } from '../utils/costGrid';
import type { Car } from '../types';
import { CalendarDays, Truck, Wallet, Save, Search, Copy, Trash2, CheckCircle, AlertTriangle, Lock, Download, Fuel } from 'lucide-react';

const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// شاشة التكاليف الشهرية للسيارات: مرتب السائق + السولار + الزيت لكل سيارة في جدول واحد بنمط Excel،
// بتتسجل مرة واحدة في الشهر لكل سيارة، وبتتوزّع تلقائيًا على أيام الشهر في شاشة "ربحية السيارات"
export function CarMonthlyCostsTab() {
  const db = useDb();
  const user = db.currentUser?.username || 'guest';
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [drafts, setDrafts] = usePersistedState<Record<string, DraftMap>>(`elbanna_grid_monthly:${user}`, {});

  const isAdmin = db.currentUser?.role === 'admin';
  const locked = db.isMonthLocked(month);
  const canEdit = db.canEditMonth(month);

  const showToast = (text: string, tone: 'ok' | 'warn' = 'ok') => { setToast({ text, tone }); setTimeout(() => setToast(null), 5000); };
  const recordOf = (carId: string, m = month) => db.carMonthlyCosts.find(r => r.car_id === carId && r.month === m);
  const draftOf = (carId: string) => drafts[monthlyKey(month, carId)];

  const fuelTotalFor = (carId: string) => {
    const logs = db.fuelLogs.filter(l => l.car_id === carId && l.date.startsWith(month));
    return { amount: Math.round(logs.reduce((s, l) => s + (l.total_amount || 0), 0) * 100) / 100, count: logs.length };
  };

  const cellValue = (car: Car, colKey: string) => monthlyCellValue(recordOf(car.id), car.driver_id, draftOf(car.id), colKey);
  const rowTotal = (car: Car) => toNumber(cellValue(car, 'salary')) + toNumber(cellValue(car, 'diesel')) + toNumber(cellValue(car, 'oil'));
  const statusOf = (car: Car) => draftOf(car.id) ? 'edited' : recordOf(car.id) ? 'saved' : 'new';

  const cars = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.cars
      .filter(c => !q || c.car_number.toLowerCase().includes(q) || (db.drivers.find(d => d.id === c.driver_id)?.name || '').toLowerCase().includes(q))
      .sort((a, b) => a.car_number.localeCompare(b.car_number));
  }, [db.cars, db.drivers, search]);

  const driverName = (id: string) => db.drivers.find(d => d.id === id)?.name || '';
  const sortAccessor = (car: Car, key: string): string | number | null => {
    switch (key) {
      case 'car': return car.car_number;
      case 'driver': return driverName(cellValue(car, 'driver'));
      case 'fuel': return fuelTotalFor(car.id).amount;
      case 'total': return rowTotal(car);
      case 'status': return statusOf(car);
      default: { const v = cellValue(car, key); return v === '' ? null : toNumber(v); }
    }
  };
  const { sort, setSort, sorted } = useSort(cars, sortAccessor, { getId: c => c.id });

  const totals = useMemo(() => db.carMonthlyCosts.filter(r => r.month === month).reduce((acc, r) => ({
    salary: acc.salary + (r.salary_amount || 0),
    diesel: acc.diesel + (r.diesel_amount || 0),
    oil: acc.oil + (r.oil_amount || 0),
  }), { salary: 0, diesel: 0, oil: 0 }), [db.carMonthlyCosts, month]);

  const sumCol = (key: 'salary' | 'diesel' | 'oil') => sorted.reduce((s, c) => s + toNumber(cellValue(c, key)), 0);

  const handleDelete = (carId: string) => {
    if (!window.confirm('مسح تكاليف السيارة دي للشهر ده؟')) return;
    db.deleteCarMonthlyCost(carId, month);
    setDrafts(prev => { const next = { ...prev }; delete next[monthlyKey(month, carId)]; return next; });
  };

  const columns: GridColumn<Car>[] = [
    {
      key: 'car', header: 'السيارة', kind: 'readonly', sticky: true, sortable: true, minWidth: 150,
      render: c => <span className="font-bold flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-slate-400" />{c.car_number}<span className="text-slate-400 font-normal">({c.car_type || '-'})</span></span>,
      footer: `الإجمالي (${sorted.length})`,
    },
    {
      key: 'driver', header: 'السائق', kind: 'select', sortable: true, minWidth: 170,
      options: [{ value: '', label: '— بدون سائق —' }, ...db.drivers.map(d => ({ value: d.id, label: d.name }))],
    },
    { key: 'salary', header: 'مرتب السائق', kind: 'number', sortable: true, minWidth: 120, footer: sumCol('salary').toLocaleString() },
    { key: 'diesel', header: 'سولار', kind: 'number', sortable: true, minWidth: 120, footer: sumCol('diesel').toLocaleString() },
    {
      key: 'fuel', header: 'تموينات الشهر', kind: 'readonly', sortable: true, minWidth: 120, title: 'إجمالي سجل التموين للسيارة في الشهر (للمقارنة بالسولار)',
      render: c => { const f = fuelTotalFor(c.id); return f.count ? <span className="font-mono text-amber-600">{f.amount.toLocaleString()} <span className="text-slate-400">({f.count})</span></span> : <span className="text-slate-500">—</span>; },
    },
    { key: 'oil', header: 'زيت', kind: 'number', sortable: true, minWidth: 110, footer: sumCol('oil').toLocaleString() },
    {
      key: 'total', header: 'إجمالي السيارة', kind: 'readonly', sortable: true, minWidth: 120,
      render: c => <span className="font-mono font-bold text-slate-800">{rowTotal(c).toLocaleString()}</span>,
      footer: (sumCol('salary') + sumCol('diesel') + sumCol('oil')).toLocaleString(),
    },
    {
      key: 'status', header: 'الحالة', kind: 'readonly', sortable: true, minWidth: 110,
      render: c => {
        const st = statusOf(c);
        const cls = st === 'edited' ? 'bg-sky-50 text-sky-700 border-sky-200' : st === 'saved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
        return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{st === 'edited' ? 'تعديل لم يُحفظ' : st === 'saved' ? 'محفوظة' : 'لسه ماتسجلتش'}</span>;
      },
    },
    {
      key: 'actions', header: '', kind: 'readonly', minWidth: 50,
      render: c => recordOf(c.id) && canEdit
        ? <button type="button" onClick={() => handleDelete(c.id)} className="text-rose-500 hover:text-rose-600 p-1.5 rounded-lg border border-rose-100" title="مسح تكاليف الشهر"><Trash2 className="w-3.5 h-3.5" /></button>
        : null,
    },
  ];

  const onChange = (carId: string, colKey: string, value: string) => {
    const key = monthlyKey(month, carId);
    setDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [colKey]: value } }));
  };

  // نسخ السائق والمرتب من الشهر السابق للسيارات اللي لسه ماتسجلش ليها حاجة في الشهر ده
  const handleCopyPrevious = () => {
    const prev = prevMonthOf(month);
    let count = 0;
    const next = { ...drafts };
    db.cars.forEach(car => {
      const key = monthlyKey(month, car.id);
      if (recordOf(car.id) || next[key]) return;
      const old = recordOf(car.id, prev);
      if (!old) return;
      next[key] = { driver: old.driver_id ?? car.driver_id ?? '', salary: String(old.salary_amount) };
      count++;
    });
    setDrafts(next);
    showToast(count > 0 ? `تم تجهيز ${count} سيارة بمرتبات الشهر السابق — راجعها واضغط "حفظ الكل".` : 'مفيش سيارات ليها بيانات في الشهر السابق تتنسخ.', count > 0 ? 'ok' : 'warn');
  };

  // تعبئة السولار من سجل التموين لكل السيارات اللي السولار بتاعها فاضي (مش بتلمس أي رقم مكتوب)
  const handleFillDiesel = () => {
    let count = 0;
    const next = { ...drafts };
    db.cars.forEach(car => {
      const f = fuelTotalFor(car.id);
      if (f.amount <= 0) return;
      const key = monthlyKey(month, car.id);
      const current = monthlyCellValue(recordOf(car.id), car.driver_id, next[key], 'diesel');
      if (toNumber(current) > 0) return;
      next[key] = { ...(next[key] || {}), diesel: String(f.amount) };
      count++;
    });
    setDrafts(next);
    showToast(count > 0 ? `تم تعبئة السولار لـ ${count} سيارة من سجل التموين — راجعها واضغط "حفظ الكل".` : 'مفيش سيارات سولارها فاضي وليها تموينات في الشهر ده.', count > 0 ? 'ok' : 'warn');
  };

  const dirtyKeys = Object.keys(drafts).filter(k => Object.keys(drafts[k] || {}).length > 0);
  const dirtyThisMonth = dirtyKeys.filter(k => k.startsWith(month + '|')).length;

  const handleSaveAll = () => {
    if (dirtyKeys.length === 0) { showToast('مفيش تعديلات محتاجة حفظ.', 'warn'); return; }
    const entries: { carId: string; month: string; data: ReturnType<typeof buildMonthlyCostData> }[] = [];
    const heldKeys: string[] = [];
    const doneKeys: string[] = [];
    dirtyKeys.forEach(key => {
      const i = key.indexOf('|');
      const m = key.slice(0, i), carId = key.slice(i + 1);
      const car = db.cars.find(c => c.id === carId);
      if (!car) { doneKeys.push(key); return; }
      if (!db.canEditMonth(m)) { heldKeys.push(key); return; }
      entries.push({ carId, month: m, data: buildMonthlyCostData(recordOf(carId, m), car.driver_id, drafts[key]) });
      doneKeys.push(key);
    });
    const res = db.upsertCarMonthlyCostsBatch(entries);
    setDrafts(prev => { const next = { ...prev }; doneKeys.forEach(k => delete next[k]); return next; });
    showToast(
      `تم حفظ ${res.saved} سيارة${heldKeys.length ? ` — ${heldKeys.length} سجل في شهر مقفول لسه ماتحفظش (محتاج أدمن)` : ''}.`,
      heldKeys.length ? 'warn' : 'ok'
    );
  };
  useSaveShortcut(handleSaveAll);

  const handleDiscard = () => {
    if (dirtyKeys.length === 0) return;
    if (window.confirm(`تجاهل ${dirtyKeys.length} سجل لسه ماتحفظوش؟`)) setDrafts({});
  };

  return (
    <div className="space-y-5" id="car_monthly_costs_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><Wallet className="w-6 h-6" /> المرتبات والسولار والزيت الشهرية</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">سجّل لكل سيارة في الشهر: مرتب السائق، والسولار، والزيت — في جدول واحد (Tab / Enter / الأسهم، ولصق أعمدة من Excel). الأرقام دي بتتحمّل على السيارة في شاشة "ربحية السيارات" وبتتوزّع بالتناسب على أيام الفترة.</p>
      </div>

      {toast && (
        <div className={`text-xs font-bold px-4 py-3 rounded-xl border flex items-center gap-1.5 ${toast.tone === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          {toast.tone === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} {toast.text}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> الشهر</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
            </div>
            <div>
              <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم السيارة أو اسم السائق" className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 text-xs bg-white w-56" />
            </div>
            <button type="button" onClick={handleCopyPrevious} disabled={!canEdit} className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" /> نسخ المرتبات من الشهر السابق
            </button>
            <button type="button" onClick={handleFillDiesel} disabled={!canEdit} className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5" /> تعبئة السولار من التموينات
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleDiscard} disabled={dirtyKeys.length === 0} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg">تجاهل التعديلات</button>
            <button
              type="button"
              onClick={() => downloadCsv(
                `تكاليف-شهرية-${month}`,
                ['السيارة', 'السائق', 'مرتب السائق', 'سولار', 'زيت', 'الإجمالي'],
                db.carMonthlyCosts.filter(r => r.month === month).map(r => [
                  db.cars.find(c => c.id === r.car_id)?.car_number || '',
                  db.drivers.find(d => d.id === r.driver_id)?.name || '',
                  r.salary_amount, r.diesel_amount, r.oil_amount, r.salary_amount + r.diesel_amount + r.oil_amount,
                ])
              )}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> CSV للشهر
            </button>
            <button type="button" onClick={handleSaveAll} disabled={dirtyKeys.length === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs px-5 py-2.5 rounded-lg flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" /> حفظ الكل{dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ''} <span className="opacity-70 font-mono">Ctrl+S</span>
            </button>
          </div>
        </div>
        {dirtyKeys.length > dirtyThisMonth && (
          <p className="text-[11px] text-sky-600 font-bold">فيه {dirtyKeys.length - dirtyThisMonth} سجل لسه ماتحفظش في شهور تانية — "حفظ الكل" هيحفظهم كمان.</p>
        )}
      </div>

      {locked ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5"><Lock className="w-4 h-4" /> الشهر ده مقفول{canEdit ? ' — أنت أدمن فتقدر تعدّل.' : ' — التعديل عليه متاح لأدمن البرنامج فقط.'}</span>
          {isAdmin && (
            <button type="button" onClick={() => db.unlockMonth(month)} className="bg-white border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg">فتح الشهر</button>
          )}
        </div>
      ) : isAdmin && (
        <div className="flex justify-end">
          <button type="button" onClick={() => { if (window.confirm(`قفل شهر ${month}؟ بعد القفل محدش يعدّل مصاريفه أو فواتير التراخيص بتاعته غير أدمن البرنامج.`)) db.lockMonth(month); }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> قفل الشهر بعد المراجعة
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center"><p className="text-[11px] text-slate-500 font-bold">مرتبات السائقين (المحفوظ)</p><p className="text-lg font-black text-slate-800">{totals.salary.toLocaleString()} ج.م</p></div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center"><p className="text-[11px] text-slate-500 font-bold">السولار</p><p className="text-lg font-black text-amber-600">{totals.diesel.toLocaleString()} ج.م</p></div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center"><p className="text-[11px] text-slate-500 font-bold">الزيت</p><p className="text-lg font-black text-slate-700">{totals.oil.toLocaleString()} ج.م</p></div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center"><p className="text-[11px] text-slate-500 font-bold">إجمالي الشهر</p><p className="text-lg font-black text-rose-600">{(totals.salary + totals.diesel + totals.oil).toLocaleString()} ج.م</p></div>
      </div>

      <DataGrid
        id="car_monthly_grid"
        rows={sorted}
        columns={columns}
        rowId={c => c.id}
        getValue={cellValue}
        onChange={onChange}
        isDirty={(rid, key) => !!draftOf(rid) && key in draftOf(rid)}
        disabled={!canEdit}
        sort={sort}
        onSortChange={setSort}
        onPasted={info => showToast(`تم لصق ${info.cells} خانة${info.skipped ? ` — تم تجاهل ${info.skipped} خانة (خارج الجدول أو قيمة غير صالحة)` : ''}. اضغط "حفظ الكل" لتثبيتها.`, info.skipped ? 'warn' : 'ok')}
        emptyMessage="لا توجد سيارات مطابقة."
      />
      <p className="text-[11px] text-slate-400">الخانات الزرقاء = تعديل لسه ماتحفظش. المرتبات اللي فوق بتعرض المحفوظ فعلًا؛ والإجماليات تحت الجدول بتشمل اللي لسه ماتحفظش.</p>
    </div>
  );
}

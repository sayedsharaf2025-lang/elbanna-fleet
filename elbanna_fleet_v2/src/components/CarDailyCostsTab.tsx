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
import { numberToInputText, parseNumberText, toNumber } from '../utils/gridParse';
import {
  DraftMap, EXTRA_PREFIX, buildDailyCostData, dailyCellValue, dailyKey, findCarByPlate, looksLikePlateColumn, suggestedFreight,
} from '../utils/costGrid';
import type { Car } from '../types';
import { CalendarDays, Truck, Save, CheckCircle, AlertTriangle, Lock, Download, Search, Info } from 'lucide-react';

const effectiveDate = (r: { execution_date?: string; request_date: string }) => r.execution_date || r.request_date;

// شاشة "تسجيل مصاريف وأرباح السيارات اليومية": جدول واحد بنمط Excel لكل سيارات اليوم. تنقّل بـ Tab/Enter/الأسهم،
// لصق أعمدة كاملة من Excel، وحفظ كل التعديلات بزر واحد (أو Ctrl+S). النولون بيتحسب تلقائي من المسافة.
export function CarDailyCostsTab() {
  const db = useDb();
  const user = db.currentUser?.username || 'guest';
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  // المسودات مفتاحها "التاريخ|السيارة" وبتتحفظ في sessionStorage عشان ماتضيعش لو حصل تسجيل خروج بسبب الخمول
  const [drafts, setDrafts] = usePersistedState<Record<string, DraftMap>>(`elbanna_grid_daily:${user}`, {});

  const showToast = (text: string, tone: 'ok' | 'warn' = 'ok') => { setToast({ text, tone }); setTimeout(() => setToast(null), 5000); };

  const savedForDate = useMemo(() => {
    const m = new Map<string, (typeof db.carDailyCosts)[number]>();
    db.carDailyCosts.filter(c => c.date === selectedDate).forEach(c => m.set(c.car_id, c));
    return m;
  }, [db.carDailyCosts, selectedDate]);

  const visibleCars = useMemo(() => {
    const requestCarIds = new Set(
      db.transportRequests.filter(r => r.assigned_car_id && effectiveDate(r) === selectedDate).map(r => r.assigned_car_id!)
    );
    const q = search.trim().toLowerCase();
    return db.cars
      .filter(c => showAll || requestCarIds.has(c.id) || savedForDate.has(c.id) || !!drafts[dailyKey(selectedDate, c.id)])
      .filter(c => !q || c.car_number.toLowerCase().includes(q))
      .sort((a, b) => a.car_number.localeCompare(b.car_number));
  }, [db.cars, db.transportRequests, selectedDate, showAll, search, savedForDate, drafts]);

  const driverNamesFor = (carId: string) => {
    const names = db.transportRequests
      .filter(r => r.assigned_car_id === carId && effectiveDate(r) === selectedDate)
      .map(r => db.drivers.find(dr => dr.id === r.assigned_driver_id)?.name)
      .filter(Boolean) as string[];
    return Array.from(new Set(names)).join(' / ');
  };

  const draftOf = (carId: string) => drafts[dailyKey(selectedDate, carId)];
  const cellValue = (car: Car, colKey: string) => dailyCellValue(savedForDate.get(car.id), draftOf(car.id), colKey);
  const freightOf = (car: Car) => suggestedFreight(cellValue(car, 'distance'), car.car_type, db.vehicleFreightRates) ?? 0;
  const maintenanceOf = (car: Car) => db.getMaintenanceCostForCarDay(car.id, selectedDate);
  const licenseOf = (car: Car) => db.getLicenseCostForCarDay(car.id, selectedDate);
  const statusOf = (car: Car) => draftOf(car.id) ? 'edited' : savedForDate.has(car.id) ? 'saved' : 'new';

  const sortAccessor = (car: Car, key: string): string | number | null => {
    switch (key) {
      case 'car': return car.car_number;
      case 'driver': return driverNamesFor(car.id);
      case 'freight': return freightOf(car);
      case 'maintenance': return maintenanceOf(car);
      case 'license': return licenseOf(car);
      case 'status': return statusOf(car);
      default: {
        const v = cellValue(car, key);
        return v === '' ? null : toNumber(v);
      }
    }
  };
  const { sort, setSort, sorted } = useSort(visibleCars, sortAccessor, { getId: c => c.id });

  const monthLocked = db.isMonthLocked(selectedDate);
  const canEditDay = db.canEditMonth(selectedDate);

  const extraCols: GridColumn<Car>[] = db.costItemTypes.map(item => ({
    key: EXTRA_PREFIX + item.id, header: item.name, kind: 'number' as const, sortable: true, minWidth: 100,
  }));
  const editableKeys = ['distance', 'cards', 'violations', 'tireWash', ...extraCols.map(c => c.key)];

  const sum = (fn: (c: Car) => number) => sorted.reduce((s, c) => s + fn(c), 0);
  const fmt = (n: number) => n.toLocaleString();

  const columns: GridColumn<Car>[] = [
    {
      key: 'car', header: 'السيارة', kind: 'readonly', sticky: true, sortable: true, minWidth: 150,
      render: c => <span className="font-bold flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-slate-400" />{c.car_number}<span className="text-slate-400 font-normal">({c.car_type || '-'})</span></span>,
      footer: `الإجمالي (${sorted.length})`,
    },
    { key: 'driver', header: 'السائق', kind: 'readonly', sortable: true, minWidth: 120, render: c => <span className="text-slate-500">{driverNamesFor(c.id) || '—'}</span> },
    { key: 'distance', header: 'المسافة (كم)', kind: 'number', sortable: true, minWidth: 110, footer: fmt(sum(c => toNumber(cellValue(c, 'distance')))) },
    {
      key: 'freight', header: 'النولون (تلقائي)', kind: 'readonly', sortable: true, minWidth: 120,
      title: 'المسافة × سعر الكيلو لنوع السيارة (من الإعدادات)',
      render: c => {
        const f = freightOf(c);
        const noRate = !c.car_type || !db.vehicleFreightRates[c.car_type];
        return <span className="font-mono font-bold text-indigo-600" title={noRate ? 'مفيش سعر نولون لنوع السيارة ده في الإعدادات' : ''}>{f.toLocaleString()}{noRate && toNumber(cellValue(c, 'distance')) > 0 ? ' ⚠' : ''}</span>;
      },
      footer: fmt(sum(freightOf)),
    },
    { key: 'cards', header: 'كارتات', kind: 'number', sortable: true, minWidth: 100, footer: fmt(sum(c => toNumber(cellValue(c, 'cards')))) },
    { key: 'violations', header: 'مخالفات (للعلم)', kind: 'number', sortable: true, minWidth: 110, title: 'للعلم فقط — حساب المخالفات الفعلي من فواتير التراخيص' },
    { key: 'tireWash', header: 'غسيل كاوتش', kind: 'number', sortable: true, minWidth: 110, footer: fmt(sum(c => toNumber(cellValue(c, 'tireWash')))) },
    ...extraCols,
    { key: 'maintenance', header: 'صيانة (تلقائي)', kind: 'readonly', sortable: true, minWidth: 110, title: 'من فواتير الصيانة المعتمدة لنفس السيارة/اليوم', render: c => <span className="font-mono">{maintenanceOf(c).toLocaleString()}</span> },
    { key: 'license', header: 'تراخيص (تلقائي)', kind: 'readonly', sortable: true, minWidth: 110, title: 'من فواتير التراخيص المعتمدة لنفس السيارة/اليوم', render: c => <span className="font-mono">{licenseOf(c).toLocaleString()}</span> },
    {
      key: 'status', header: 'الحالة', kind: 'readonly', sortable: true, minWidth: 110,
      render: c => {
        const st = statusOf(c);
        const cls = st === 'edited' ? 'bg-sky-50 text-sky-700 border-sky-200' : st === 'saved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
        return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{st === 'edited' ? 'تعديل لم يُحفظ' : st === 'saved' ? 'محفوظة' : 'لسه ماتسجلتش'}</span>;
      },
    },
  ];

  const onChange = (carId: string, colKey: string, value: string) => {
    const key = dailyKey(selectedDate, carId);
    setDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [colKey]: value } }));
  };

  // لصق بأرقام السيارات: أول عمود رقم السيارة والباقي أعمدة بداية من الخانة اللي واقف عليها (زي الاستيراد القديم بس بيحفظ الكل صح)
  const handlePasteMatrix = ({ matrix, colKey }: { matrix: string[][]; rowIndex: number; colKey: string }) => {
    if (!looksLikePlateColumn(db.cars, matrix)) return false;
    const startIdx = Math.max(editableKeys.indexOf(colKey), 0);
    const patches: Record<string, DraftMap> = {};
    let matched = 0, unmatched = 0, hidden = false;
    const visibleIds = new Set(visibleCars.map(c => c.id));
    matrix.forEach(line => {
      const car = findCarByPlate(db.cars, line[0] ?? '');
      if (!car) { unmatched++; return; }
      const patch: DraftMap = patches[car.id] || {};
      for (let j = 1; j < line.length; j++) {
        const key = editableKeys[startIdx + j - 1];
        if (!key) break;
        const n = parseNumberText(line[j]);
        if (n !== null) patch[key] = numberToInputText(n);
      }
      patches[car.id] = patch;
      matched++;
      if (!visibleIds.has(car.id)) hidden = true;
    });
    setDrafts(prev => {
      const next = { ...prev };
      Object.entries(patches).forEach(([carId, patch]) => {
        const key = dailyKey(selectedDate, carId);
        next[key] = { ...(next[key] || {}), ...patch };
      });
      return next;
    });
    if (hidden) setShowAll(true);
    showToast(`تم لصق ${matched} سيارة بالرقم${unmatched ? ` — ${unmatched} رقم ماتطابقش مع سيارة` : ''}. اضغط "حفظ الكل" لتثبيتها.`, unmatched ? 'warn' : 'ok');
    return true;
  };

  const dirtyKeys = Object.keys(drafts).filter(k => Object.keys(drafts[k] || {}).length > 0);

  const handleSaveAll = () => {
    if (dirtyKeys.length === 0) { showToast('مفيش تعديلات محتاجة حفظ.', 'warn'); return; }
    const entries: { carId: string; date: string; data: ReturnType<typeof buildDailyCostData> }[] = [];
    const lockedKeys: string[] = [];
    const savedKeys: string[] = [];
    dirtyKeys.forEach(key => {
      const i = key.indexOf('|');
      const date = key.slice(0, i), carId = key.slice(i + 1);
      const car = db.cars.find(c => c.id === carId);
      if (!car) { savedKeys.push(key); return; } // سيارة اتمسحت — نشيل المسودة
      if (!db.canEditMonth(date)) { lockedKeys.push(key); return; }
      const existing = db.carDailyCosts.find(c => c.car_id === carId && c.date === date);
      entries.push({ carId, date, data: buildDailyCostData(existing, drafts[key], car.car_type, db.vehicleFreightRates, db.costItemTypes) });
      savedKeys.push(key);
    });
    const res = db.upsertCarDailyCostsBatch(entries);
    setDrafts(prev => { const next = { ...prev }; savedKeys.forEach(k => delete next[k]); return next; });
    showToast(
      `تم حفظ ${res.saved} سجل${lockedKeys.length ? ` — ${lockedKeys.length} سجل في شهر مقفول لسه ماتحفظش (محتاج أدمن)` : ''}.`,
      lockedKeys.length ? 'warn' : 'ok'
    );
  };
  useSaveShortcut(handleSaveAll);

  const handleDiscard = () => {
    if (dirtyKeys.length === 0) return;
    if (window.confirm(`تجاهل ${dirtyKeys.length} سجل لسه ماتحفظوش؟`)) setDrafts({});
  };

  const month = selectedDate.slice(0, 7);

  return (
    <div className="space-y-5" id="car_daily_costs_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">الإدارة المالية</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight">تسجيل مصاريف وأرباح السيارات اليومية</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          جدول واحد لكل سيارات اليوم. اكتب وانتقل بـ <b>Tab</b> / <b>Enter</b> / الأسهم، أو الصق عمود كامل من Excel (حتى لو فيه رقم السيارة في أول عمود)، وبعدها <b>حفظ الكل</b> أو <b>Ctrl+S</b>.
        </p>
      </div>

      {toast && (
        <div className={`rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-bold border ${toast.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {toast.tone === 'ok' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {toast.text}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> التاريخ</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث برقم السيارة</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم السيارة" className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 text-xs bg-white w-40" />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 pb-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> عرض كل السيارات
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleDiscard} disabled={dirtyKeys.length === 0} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg">تجاهل التعديلات</button>
          <button
            type="button"
            onClick={() => downloadCsv(
              `مصاريف-يومية-${month}`,
              ['التاريخ', 'السيارة', 'الكيلومترات', 'النولون', 'كارتات', 'غسيل كاوتش', 'بنود إضافية', 'صيانة'],
              db.carDailyCosts.filter(r => r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)).map(r => [
                r.date, db.cars.find(c => c.id === r.car_id)?.car_number || '',
                r.total_distance_km || 0, r.freight_amount || 0, r.cards_amount || 0, r.tire_wash_amount || 0,
                (r.extra_costs || []).reduce((s, i) => s + (i.amount || 0), 0),
                db.getMaintenanceCostForCarDay(r.car_id, r.date),
              ])
            )}
            className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> CSV لشهر {month}
          </button>
          <button type="button" onClick={handleSaveAll} disabled={dirtyKeys.length === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs px-5 py-2.5 rounded-lg flex items-center gap-1.5">
            <Save className="w-3.5 h-3.5" /> حفظ الكل{dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ''} <span className="opacity-70 font-mono">Ctrl+S</span>
          </button>
        </div>
      </div>

      {monthLocked && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-1.5">
          <Lock className="w-4 h-4" /> شهر {month} مقفول{canEditDay ? ' — أنت أدمن فتقدر تعدّل.' : ' — التعديل عليه متاح لأدمن البرنامج فقط.'}
        </div>
      )}

      <DataGrid
        id="car_daily_grid"
        rows={sorted}
        columns={columns}
        rowId={c => c.id}
        getValue={cellValue}
        onChange={onChange}
        isDirty={(rid, key) => !!draftOf(rid) && key in draftOf(rid)}
        disabled={!canEditDay}
        sort={sort}
        onSortChange={setSort}
        onPasteMatrix={handlePasteMatrix}
        onPasted={info => showToast(`تم لصق ${info.cells} خانة${info.skipped ? ` — تم تجاهل ${info.skipped} خانة (خارج الجدول أو قيمة غير صالحة)` : ''}.`, info.skipped ? 'warn' : 'ok')}
        emptyMessage={`لا توجد سيارات نفذت طلبات في ${selectedDate}. فعّل "عرض كل السيارات" لإدخال أي سيارة.`}
      />

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        الصيانة والتراخيص بتتسحب تلقائيًا من فواتيرها المعتمدة (مفيش إدخال يدوي ليها لمنع احتساب نفس التكلفة مرتين). الخانات الزرقاء = تعديل لسه ماتحفظش. لو لصقت عمودين أو أكتر بيتوزعوا على الأعمدة اللي بعد الخانة اللي واقف عليها.
      </p>
    </div>
  );
}

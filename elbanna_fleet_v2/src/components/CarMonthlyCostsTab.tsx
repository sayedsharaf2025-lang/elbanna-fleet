/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { CalendarDays, Truck, User, Fuel, Droplets, Wallet, Save, Search, Copy, Trash2, CheckCircle } from 'lucide-react';

const num = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type Draft = { driverId: string; salary: string; diesel: string; oil: string };

// شاشة التكاليف الشهرية للسيارات: مرتب السائق (على السيارة اللي بيشتغل عليها) + السولار + الزيت،
// بتتسجل مرة واحدة في الشهر لكل سيارة، وبتتوزّع تلقائيًا على أيام الشهر في شاشة "ربحية السيارات"
export function CarMonthlyCostsTab() {
  const db = useDb();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (text: string) => { setToastMsg(text); setTimeout(() => setToastMsg(null), 3000); };
  const keyOf = (carId: string) => `${month}|${carId}`;
  const recordOf = (carId: string, m = month) => db.carMonthlyCosts.find(r => r.car_id === carId && r.month === m);

  const draftFor = (carId: string): Draft => {
    const k = keyOf(carId);
    if (drafts[k]) return drafts[k];
    const rec = recordOf(carId);
    const car = db.cars.find(c => c.id === carId);
    return {
      driverId: rec?.driver_id ?? car?.driver_id ?? '',
      salary: rec ? String(rec.salary_amount) : '',
      diesel: rec ? String(rec.diesel_amount) : '',
      oil: rec ? String(rec.oil_amount) : '',
    };
  };
  const updateDraft = (carId: string, patch: Partial<Draft>) =>
    setDrafts(prev => ({ ...prev, [keyOf(carId)]: { ...draftFor(carId), ...patch } }));

  const handleSave = (carId: string) => {
    const d = draftFor(carId);
    db.upsertCarMonthlyCost(carId, month, {
      driver_id: d.driverId || undefined,
      salary_amount: num(d.salary),
      diesel_amount: num(d.diesel),
      oil_amount: num(d.oil),
    });
    setDrafts(prev => { const next = { ...prev }; delete next[keyOf(carId)]; return next; });
    showToast('تم حفظ تكاليف السيارة للشهر ده.');
  };

  const handleDelete = (carId: string) => {
    if (!window.confirm('مسح تكاليف السيارة دي للشهر ده؟')) return;
    db.deleteCarMonthlyCost(carId, month);
    setDrafts(prev => { const next = { ...prev }; delete next[keyOf(carId)]; return next; });
  };

  // نسخ السائق والمرتب من الشهر السابق للسيارات اللي لسه ماتسجلش ليها حاجة في الشهر ده
  const handleCopyPrevious = () => {
    const prev = prevMonthOf(month);
    let count = 0;
    const next = { ...drafts };
    db.cars.forEach(car => {
      if (recordOf(car.id) || next[keyOf(car.id)]) return;
      const old = recordOf(car.id, prev);
      if (!old) return;
      next[keyOf(car.id)] = { driverId: old.driver_id ?? car.driver_id ?? '', salary: String(old.salary_amount), diesel: '', oil: '' };
      count++;
    });
    setDrafts(next);
    showToast(count > 0 ? `تم تجهيز ${count} سيارة بمرتبات الشهر السابق — راجعها واضغط حفظ لكل سيارة.` : 'مفيش سيارات ليها بيانات في الشهر السابق تتنسخ.');
  };

  const cars = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.cars
      .filter(c => !q || c.car_number.toLowerCase().includes(q) || (db.drivers.find(d => d.id === c.driver_id)?.name || '').toLowerCase().includes(q))
      .sort((a, b) => a.car_number.localeCompare(b.car_number));
  }, [db.cars, db.drivers, search]);

  const totals = useMemo(() => db.carMonthlyCosts.filter(r => r.month === month).reduce((acc, r) => ({
    salary: acc.salary + (r.salary_amount || 0),
    diesel: acc.diesel + (r.diesel_amount || 0),
    oil: acc.oil + (r.oil_amount || 0),
  }), { salary: 0, diesel: 0, oil: 0 }), [db.carMonthlyCosts, month]);

  return (
    <div className="space-y-6" id="car_monthly_costs_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><Wallet className="w-6 h-6" /> المرتبات والسولار والزيت الشهرية</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">سجّل لكل سيارة في الشهر: مرتب السائق اللي شغال عليها، والسولار، والزيت. الأرقام دي بتتحمّل على السيارة في شاشة "ربحية السيارات" وبتتوزّع بالتناسب على أيام الفترة اللي بتختارها.</p>
      </div>

      {toastMsg && (
        <div className="text-xs font-bold px-4 py-3 rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> {toastMsg}</div>
      )}

      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[200px,1fr,auto] gap-3">
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> الشهر</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم السيارة أو اسم السائق" className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 text-xs bg-white" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handleCopyPrevious} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 justify-center">
              <Copy className="w-3.5 h-3.5" /> نسخ المرتبات من الشهر السابق
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">مرتبات السائقين</p>
          <p className="text-lg font-black text-slate-800">{totals.salary.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">السولار</p>
          <p className="text-lg font-black text-amber-600">{totals.diesel.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">الزيت</p>
          <p className="text-lg font-black text-slate-700">{totals.oil.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي الشهر</p>
          <p className="text-lg font-black text-rose-600">{(totals.salary + totals.diesel + totals.oil).toLocaleString()} ج.م</p>
        </div>
      </div>

      <div className="space-y-3">
        {cars.map(car => {
          const d = draftFor(car.id);
          const saved = !!recordOf(car.id);
          const dirty = !!drafts[keyOf(car.id)];
          const rowTotal = num(d.salary) + num(d.diesel) + num(d.oil);
          return (
            <div key={car.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400" /> {car.car_number} <span className="text-slate-400 font-normal text-xs">({car.car_type || '-'})</span></span>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${dirty ? 'bg-sky-50 text-sky-700 border-sky-200' : saved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {dirty ? 'تعديل لم يُحفظ' : saved ? 'محفوظة' : 'لسه ماتسجلتش'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><User className="w-3.5 h-3.5" /> السائق</label>
                  <select value={d.driverId} onChange={(e) => updateDraft(car.id, { driverId: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 bg-white">
                    <option value="">— بدون سائق —</option>
                    {db.drivers.map(dr => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> مرتب السائق</label>
                  <input type="number" step="0.01" min="0" value={d.salary} onChange={(e) => updateDraft(car.id, { salary: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Fuel className="w-3.5 h-3.5" /> سولار</label>
                  <input type="number" step="0.01" min="0" value={d.diesel} onChange={(e) => updateDraft(car.id, { diesel: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> زيت</label>
                  <input type="number" step="0.01" min="0" value={d.oil} onChange={(e) => updateDraft(car.id, { oil: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono" />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">إجمالي السيارة في الشهر: <b className="font-mono text-slate-800">{rowTotal.toLocaleString()} ج.م</b></span>
                <div className="flex items-center gap-2">
                  {saved && (
                    <button type="button" onClick={() => handleDelete(car.id)} className="text-rose-500 hover:text-rose-600 p-2 rounded-lg border border-rose-100" title="مسح تكاليف الشهر"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                  <button type="button" onClick={() => handleSave(car.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
                    <Save className="w-3.5 h-3.5" /> حفظ
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {cars.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold">لا توجد سيارات مطابقة.</div>
        )}
      </div>
    </div>
  );
}

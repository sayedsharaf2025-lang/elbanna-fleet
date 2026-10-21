/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { ClipboardList, Truck, Plus, Trash2, CheckCircle } from 'lucide-react';
import { computeServiceRows } from '../utils/fuelStats';

const fmt = (n: number) => Math.round(n).toLocaleString();
const SUGGESTIONS = ['تغيير زيت', 'فلتر زيت', 'فلتر سولار', 'فلتر هواء', 'كاوتش', 'فرامل', 'جرسة وتشحيم', 'تغيير زيت جيربوكس'];

const STATUS_STYLE: Record<string, string> = {
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  soon: 'bg-amber-50 text-amber-700 border-amber-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unknown: 'bg-slate-50 text-slate-500 border-slate-200',
};

// خطط الصيانة الوقائية: لكل سيارة خدمات بتتكرر كل عدد كيلومترات (زي تغيير الزيت). المتبقي بيتحسب من قراءة العدّاد
// (آخر قراءة في سجل التموين) أو تقديريًا من الكيلومترات المسجلة في المصاريف اليومية بعد تاريخ آخر تنفيذ.
export function ServicePlansTab() {
  const db = useDb();
  const [carFilter, setCarFilter] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [carId, setCarId] = useState('');
  const [name, setName] = useState('');
  const [interval, setIntervalKm] = useState('');
  const [lastKm, setLastKm] = useState('');
  const [lastDate, setLastDate] = useState('');

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };
  const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const rows = useMemo(() => {
    const order = { overdue: 0, soon: 1, unknown: 2, ok: 3 } as const;
    return computeServiceRows(db)
      .filter(r => !carFilter || r.car_id === carFilter)
      .sort((a, b) => order[a.status] - order[b.status] || (a.remaining ?? 1e9) - (b.remaining ?? 1e9));
  }, [db.servicePlans, db.fuelLogs, db.carDailyCosts, db.cars, carFilter]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const res = db.upsertServicePlan({
      car_id: carId,
      name,
      interval_km: num(interval),
      last_done_km: lastKm.trim() ? num(lastKm) : undefined,
      last_done_date: lastDate || undefined,
    });
    if (!res.success) { flash(res.error || 'تعذّر الحفظ.', false); return; }
    flash('تمت إضافة الخطة.', true);
    setName(''); setIntervalKm(''); setLastKm(''); setLastDate('');
  };

  const handleDone = (id: string, planName: string, carNumber: string) => {
    if (!window.confirm(`تسجيل إن "${planName}" لسيارة ${carNumber} اتنفذت النهاردة؟`)) return;
    db.markServiceDone(id);
    flash('تم تسجيل التنفيذ.', true);
  };

  return (
    <div className="space-y-6" id="service_plans_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><ClipboardList className="w-6 h-6" /> الصيانة الوقائية</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">عرّف لكل سيارة الخدمات الدورية (زيت، فلاتر، كاوتش...) والمسافة بين كل مرة والتانية. بيتنبّه في لوحة التحكم لما الخدمة تقرب أو تتأخر. لو مفيش قراءة عدّاد، المتبقي بيتحسب تقديريًا من الكيلومترات المسجلة بعد تاريخ آخر تنفيذ.</p>
      </div>

      {msg && <div className={`text-xs font-bold px-4 py-3 rounded-xl border ${msg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{msg.text}</div>}

      <form onSubmit={handleAdd} className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> السيارة</label>
            <select value={carId} onChange={(e) => setCarId(e.target.value)} required className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 bg-white">
              <option value="">— اختر —</option>
              {db.cars.map(c => <option key={c.id} value={c.id}>{c.car_number}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">الخدمة</label>
            <input list="service-suggestions" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800" />
            <datalist id="service-suggestions">{SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">كل كم كيلومتر</label>
            <input type="number" min="1" value={interval} onChange={(e) => setIntervalKm(e.target.value)} required placeholder="مثلًا 10000" className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">عدّاد آخر تنفيذ</label>
            <input type="number" min="0" value={lastKm} onChange={(e) => setLastKm(e.target.value)} placeholder="اختياري" className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">تاريخ آخر تنفيذ</label>
            <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono bg-white" />
          </div>
        </div>
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> إضافة خطة</button>
      </form>

      <div className="flex items-center gap-2">
        <label className="text-xs font-bold text-slate-500">السيارة</label>
        <select value={carFilter} onChange={(e) => setCarFilter(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 text-slate-800 bg-white text-xs">
          <option value="">كل السيارات</option>
          {db.cars.map(c => <option key={c.id} value={c.id}>{c.car_number}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['السيارة', 'الخدمة', 'كل (كم)', 'المقطوع منذ آخر تنفيذ', 'المتبقي', 'الحالة', ''].map(h => <th key={h} className="py-3 px-3 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-50 text-slate-700">
                <td className="py-2.5 px-3 font-bold">{r.carNumber}</td>
                <td className="py-2.5 px-3">{r.name}</td>
                <td className="py-2.5 px-3 font-mono">{fmt(r.interval_km)}</td>
                <td className="py-2.5 px-3 font-mono">
                  {r.usedKm !== null ? fmt(r.usedKm) : '—'}
                  {r.usedSource === 'estimate' && <span className="text-[10px] text-slate-400"> (تقديري)</span>}
                </td>
                <td className="py-2.5 px-3 font-mono font-bold">{r.remaining !== null ? (r.remaining < 0 ? `متأخرة ${fmt(-r.remaining)}` : fmt(r.remaining)) : '—'}</td>
                <td className="py-2.5 px-3">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLE[r.status]}`}>
                    {r.status === 'overdue' ? 'متأخرة' : r.status === 'soon' ? 'قربت' : r.status === 'ok' ? 'سليمة' : 'سجّل تاريخ/عدّاد آخر تنفيذ'}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button type="button" onClick={() => handleDone(r.id, r.name, r.carNumber)} className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1"><CheckCircle className="w-3 h-3" /> تم التنفيذ الآن</button>
                    <button type="button" onClick={() => { if (window.confirm('مسح الخطة دي؟')) db.deleteServicePlan(r.id); }} className="text-rose-400 hover:text-rose-600" title="مسح"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-bold">لا توجد خطط صيانة وقائية. أضف أول خطة من النموذج فوق.</td></tr>}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-slate-100 leading-relaxed">
          "قربت" = المتبقي أقل من 10% من المسافة بين الخدمتين (أو 500 كم، أيهما أكبر). زر "تم التنفيذ الآن" بيسجل تاريخ النهاردة وآخر قراءة عدّاد معروفة للسيارة.
        </p>
      </div>
    </div>
  );
}

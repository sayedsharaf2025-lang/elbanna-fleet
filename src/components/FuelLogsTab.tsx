/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { Fuel, CalendarDays, Truck, Save, Trash2, Download, AlertTriangle, Lock } from 'lucide-react';
import { computeFuelRows } from '../utils/fuelStats';
import { downloadCsv } from '../utils/csv';

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => round2(n).toLocaleString();
const today = () => new Date().toISOString().split('T')[0];

// سجل التموين: كل تموين بيتسجل بلتراته وسعره وقراءة العدّاد (اختيارية). منه بيتحسب معدل الاستهلاك (لتر/100كم)
// وبيتعلّم أي تموين استهلاكه أعلى من المعتاد بأكتر من 30%. سولار الشهر في شاشة المرتبات بيتعبّى منه بزر "استخدم".
export function FuelLogsTab() {
  const db = useDb();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [carFilter, setCarFilter] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [carId, setCarId] = useState('');
  const [date, setDate] = useState(today());
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [odometer, setOdometer] = useState('');
  const [note, setNote] = useState('');

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };
  const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const { rows: allRows, avgByCar } = useMemo(() => computeFuelRows(db), [db.fuelLogs, db.carDailyCosts, db.cars]);
  const rows = useMemo(
    () => allRows
      .filter(r => r.date.startsWith(month) && (!carFilter || r.car_id === carFilter))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allRows, month, carFilter]
  );

  const autoTotal = num(liters) > 0 && num(price) > 0 ? round2(num(liters) * num(price)) : 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const res = db.upsertFuelLog({
      car_id: carId,
      date,
      liters: num(liters),
      price_per_liter: num(price),
      total_amount: num(total) > 0 ? num(total) : undefined,
      odometer_km: odometer.trim() ? num(odometer) : undefined,
      driver_id: db.cars.find(c => c.id === carId)?.driver_id || undefined,
      note: note.trim() || undefined,
    });
    if (!res.success) { flash(res.error || 'تعذّر الحفظ.', false); return; }
    flash('تم تسجيل التموين.', true);
    setLiters(''); setTotal(''); setOdometer(''); setNote('');
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('مسح التموين ده؟')) return;
    const res = db.deleteFuelLog(id);
    if (!res.success) flash(res.error || 'تعذّر المسح.', false);
  };

  const sums = rows.reduce((a, r) => ({ liters: a.liters + r.liters, amount: a.amount + r.total_amount }), { liters: 0, amount: 0 });
  const monthLocked = db.isMonthLocked(month);

  const handleCsv = () => downloadCsv(
    `تموين-${month}`,
    ['التاريخ', 'السيارة', 'لترات', 'سعر اللتر', 'الإجمالي', 'العدّاد', 'كم منذ آخر تموين', 'لتر/100كم', 'ملاحظة'],
    rows.map(r => [r.date, r.carNumber, r.liters, r.price_per_liter, r.total_amount, r.odometer_km ?? '', r.kmSince !== null ? round2(r.kmSince) : '', r.lPer100 !== null ? round2(r.lPer100) : '', r.note || ''])
  );

  return (
    <div className="space-y-6" id="fuel_logs_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><Fuel className="w-6 h-6" /> سجل التموين</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">سجّل كل تموين سولار. معدل الاستهلاك بيتحسب من قراءة العدّاد لو مسجلة في تمويننين ورا بعض، وإلا من الكيلومترات المسجلة في المصاريف اليومية (وبيتعلّم "تقديري"). مبلغ السولار اللي بيدخل الربحية هو اللي في شاشة المرتبات الشهرية، وزر "استخدم" هناك بيعبّيه من هنا.</p>
      </div>

      {msg && <div className={`text-xs font-bold px-4 py-3 rounded-xl border ${msg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{msg.text}</div>}

      <form onSubmit={handleSave} className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> السيارة</label>
            <select value={carId} onChange={(e) => setCarId(e.target.value)} required className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 bg-white">
              <option value="">— اختر —</option>
              {db.cars.map(c => <option key={c.id} value={c.id}>{c.car_number}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono bg-white" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">لترات</label>
            <input type="number" step="0.01" min="0" value={liters} onChange={(e) => setLiters(e.target.value)} required className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">سعر اللتر</label>
            <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">الإجمالي {autoTotal > 0 && <span className="text-slate-400 font-normal">(تلقائي {fmt(autoTotal)})</span>}</label>
            <input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="اتركه فاضي للحساب التلقائي" className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1">قراءة العدّاد (كم)</label>
            <input type="number" step="0.1" min="0" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="اختياري" className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono" />
          </div>
          <div className="col-span-2">
            <label className="block text-slate-500 font-bold mb-1">ملاحظة</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 text-slate-800" />
          </div>
        </div>
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> حفظ التموين</button>
      </form>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-slate-500 font-bold mb-1 text-xs">الشهر</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 text-slate-800 font-mono bg-white" />
        </div>
        <div>
          <label className="block text-slate-500 font-bold mb-1 text-xs">السيارة</label>
          <select value={carFilter} onChange={(e) => setCarFilter(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 text-slate-800 bg-white">
            <option value="">كل السيارات</option>
            {db.cars.map(c => <option key={c.id} value={c.id}>{c.car_number}</option>)}
          </select>
        </div>
        {monthLocked && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> الشهر مقفول</span>}
        <div className="flex gap-4 mr-auto text-xs">
          <span className="text-slate-500">لترات الشهر: <b className="font-mono text-slate-800">{fmt(sums.liters)}</b></span>
          <span className="text-slate-500">المبلغ: <b className="font-mono text-slate-800">{fmt(sums.amount)} ج.م</b></span>
        </div>
        <button type="button" onClick={handleCsv} disabled={rows.length === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> CSV</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {['التاريخ', 'السيارة', 'لترات', 'سعر اللتر', 'الإجمالي', 'العدّاد', 'كم منذ آخر تموين', 'لتر/100كم', ''].map(h => <th key={h} className="py-3 px-3 whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-t border-slate-50 text-slate-700 ${r.flagged ? 'bg-amber-50' : ''}`}>
                <td className="py-2.5 px-3 font-mono">{r.date}</td>
                <td className="py-2.5 px-3 font-bold">{r.carNumber}</td>
                <td className="py-2.5 px-3 font-mono">{fmt(r.liters)}</td>
                <td className="py-2.5 px-3 font-mono">{fmt(r.price_per_liter)}</td>
                <td className="py-2.5 px-3 font-mono">{fmt(r.total_amount)}</td>
                <td className="py-2.5 px-3 font-mono">{r.odometer_km ?? '—'}</td>
                <td className="py-2.5 px-3 font-mono">{r.kmSince !== null ? fmt(r.kmSince) : '—'}{r.kmSource === 'estimate' && <span className="text-[10px] text-slate-400"> (تقديري)</span>}</td>
                <td className={`py-2.5 px-3 font-mono font-bold ${r.flagged ? 'text-amber-700' : ''}`}>
                  {r.lPer100 !== null ? fmt(r.lPer100) : '—'}
                  {r.flagged && <span className="inline-flex items-center gap-1 text-[10px] mr-1"><AlertTriangle className="w-3 h-3" /> أعلى من المعتاد ({fmt(avgByCar.get(r.car_id) || 0)})</span>}
                </td>
                <td className="py-2.5 px-3">
                  <button type="button" onClick={() => handleDelete(r.id)} className="text-rose-400 hover:text-rose-600" title="مسح"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400 font-bold">لا توجد تموينات في الشهر ده.</td></tr>}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-slate-100 leading-relaxed">
          التعليم الأصفر بيظهر لما استهلاك التموين يعلى عن متوسط السيارة بأكتر من 30% (بعد 3 تموينات قابلة للقياس على الأقل). أول تموين لأي سيارة مالوش سابق، فمالوش معدل.
        </p>
      </div>
    </div>
  );
}

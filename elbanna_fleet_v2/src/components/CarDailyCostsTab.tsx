/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import {
  CalendarDays,
  Truck,
  User,
  Gauge,
  Fuel,
  CreditCard,
  AlertTriangle,
  Droplets,
  Wrench,
  Save,
  CheckCircle,
  ClipboardPaste,
  Sparkles,
} from 'lucide-react';

const num = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// شاشة "تسجيل مصاريف وأرباح السيارات اليومية": تاريخ واحد، كل السيارات اللي نفذت طلبات في اليوم
// ده، بتدخل لكل واحدة المسافة الكلية (الجراج للجراج) يدوي أو استيراد لصق من إكسيل، والنولون
// بيتحسب تلقائي، بالإضافة لكارتات/مخالفات/غسيل كاوتش/صيانة لكل سيارة في اليوم ده
export function CarDailyCostsTab() {
  const db = useDb();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  const showToast = (text: string) => { setToastMsg(text); setTimeout(() => setToastMsg(null), 3500); };

  const effectiveDate = (r: { execution_date?: string; request_date: string }) => r.execution_date || r.request_date;

  // السيارات اللي نفذت أي طلب في التاريخ المختار
  const carsOfDay = useMemo(() => {
    const ids = new Set(
      db.transportRequests
        .filter(r => r.assigned_car_id && effectiveDate(r) === selectedDate)
        .map(r => r.assigned_car_id!)
    );
    return db.cars.filter(c => ids.has(c.id));
  }, [db.transportRequests, db.cars, selectedDate]);

  const [drafts, setDrafts] = useState<Record<string, {
    distance: string; cards: string; violations: string; tireWash: string; maintenance: string; extra: Record<string, string>;
  }>>({});

  const draftFor = (carId: string) => {
    if (drafts[carId]) return drafts[carId];
    const existing = db.carDailyCosts.find(c => c.car_id === carId && c.date === selectedDate);
    const extra: Record<string, string> = {};
    (existing?.extra_costs || []).forEach(i => { extra[i.item_id] = String(i.amount); });
    return {
      distance: existing ? String(existing.total_distance_km) : '',
      cards: existing ? String(existing.cards_amount) : '',
      violations: existing ? String(existing.violations_amount) : '',
      tireWash: existing ? String(existing.tire_wash_amount) : '',
      maintenance: existing ? String(existing.maintenance_amount) : '',
      extra,
    };
  };

  const updateDraft = (carId: string, patch: Partial<ReturnType<typeof draftFor>>) => {
    setDrafts(prev => ({ ...prev, [carId]: { ...draftFor(carId), ...patch } }));
  };

  const suggestedFreight = (carId: string) => {
    const car = db.cars.find(c => c.id === carId);
    const d = draftFor(carId);
    const dist = num(d.distance);
    const rate = car?.car_type ? (db.vehicleFreightRates[car.car_type] || 0) : 0;
    if (!dist || !rate) return null;
    return Math.round(dist * rate * 100) / 100;
  };

  const handleSaveCar = (carId: string) => {
    const d = draftFor(carId);
    const extra_costs = db.costItemTypes
      .map(item => ({ item_id: item.id, item_name: item.name, amount: num(d.extra[item.id] || '0') }))
      .filter(i => i.amount > 0);
    const freight = suggestedFreight(carId) ?? 0;
    db.upsertCarDailyCost(carId, selectedDate, {
      total_distance_km: num(d.distance),
      freight_amount: freight,
      cards_amount: num(d.cards),
      violations_amount: num(d.violations),
      tire_wash_amount: num(d.tireWash),
      maintenance_amount: num(d.maintenance),
      extra_costs,
    });
    showToast(`تم حفظ مصاريف السيارة في ${selectedDate} بنجاح.`);
  };

  // استيراد لصق: كل سطر "رقم السيارة [تاب أو فاصلة] المسافة"
  const handlePasteImport = () => {
    const lines = pasteValue.split('\n').map(l => l.trim()).filter(Boolean);
    let success = 0, failed = 0;
    lines.forEach(line => {
      const cols = line.includes('\t') ? line.split('\t') : line.split(',');
      if (cols.length < 2) { failed++; return; }
      const carNumber = cols[0].trim();
      const distance = parseFloat(cols[1].trim());
      const car = db.cars.find(c => c.car_number.replace(/\s/g, '') === carNumber.replace(/\s/g, ''));
      if (!car || isNaN(distance)) { failed++; return; }
      const existing = db.carDailyCosts.find(c => c.car_id === car.id && c.date === selectedDate);
      const rate = car.car_type ? (db.vehicleFreightRates[car.car_type] || 0) : 0;
      db.upsertCarDailyCost(car.id, selectedDate, {
        total_distance_km: distance,
        freight_amount: Math.round(distance * rate * 100) / 100,
        cards_amount: existing?.cards_amount || 0,
        violations_amount: existing?.violations_amount || 0,
        tire_wash_amount: existing?.tire_wash_amount || 0,
        maintenance_amount: existing?.maintenance_amount || 0,
        extra_costs: existing?.extra_costs || [],
      });
      success++;
    });
    showToast(`تم استيراد ${success} سيارة بنجاح${failed > 0 ? ` — فشل ${failed} صف` : ''}.`);
    setPasteValue('');
    setPasteOpen(false);
  };

  return (
    <div className="space-y-6" id="car_daily_costs_tab_view" style={{ direction: 'rtl' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">الإدارة المالية</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight">تسجيل مصاريف وأرباح السيارات اليومية</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            لكل سيارة نفذت نقلة في التاريخ المختار: المسافة الكلية الفعلية (الجراج للجراج) والنولون المحسوب منها تلقائيًا، وكارتات/مخالفات/غسيل كاوتش/صيانة اليوم كله.
          </p>
        </div>
      </div>

      {toastMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-bold">
          <CheckCircle className="w-4 h-4 shrink-0" /> {toastMsg}
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 flex flex-col md:flex-row items-start md:items-end gap-3 justify-between">
        <div>
          <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> التاريخ</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
        </div>
        <button type="button" onClick={() => setPasteOpen(o => !o)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5">
          <ClipboardPaste className="w-3.5 h-3.5" /> استيراد مسافات (لصق من إكسيل)
        </button>
      </div>

      {pasteOpen && (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow space-y-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            الصق بيانات رقم السيارة والمسافة من إكسيل (عمودين: رقم السيارة، المسافة بالكيلومتر) — كل سيارة في سطر، بتتطبق على تاريخ <span className="font-mono font-bold">{selectedDate}</span> المختار فوق.
          </p>
          <textarea
            rows={6}
            placeholder={'مثال:\nر س ب 7352\t185\nأ ب ج 1234\t92'}
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono text-xs"
          />
          <div className="flex gap-2">
            <button type="button" onClick={handlePasteImport} disabled={!pasteValue.trim()} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold text-xs px-4 py-2 rounded-lg">تنفيذ الاستيراد</button>
            <button type="button" onClick={() => { setPasteOpen(false); setPasteValue(''); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2 rounded-lg">إلغاء</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {carsOfDay.map(car => {
          const d = draftFor(car.id);
          const sugg = suggestedFreight(car.id);
          const requestsToday = db.transportRequests.filter(r => r.assigned_car_id === car.id && effectiveDate(r) === selectedDate);
          const driverNames = Array.from(new Set(requestsToday.map(r => db.drivers.find(dr => dr.id === r.assigned_driver_id)?.name).filter(Boolean))).join(' / ');
          const alreadySaved = !!db.carDailyCosts.find(c => c.car_id === car.id && c.date === selectedDate);
          return (
            <div key={car.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400" /> {car.car_number} <span className="text-slate-400 font-normal">({car.car_type || '-'})</span></span>
                  <span className="font-bold text-slate-600 flex items-center gap-1.5 text-xs"><User className="w-3.5 h-3.5 text-slate-400" /> {driverNames || 'بدون سائق'}</span>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${alreadySaved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {alreadySaved ? 'محفوظة' : 'لسه ماتسجلتش'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> المسافة (كم)</label>
                  <input type="number" step="0.1" min="0" value={d.distance} onChange={(e) => updateDraft(car.id, { distance: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Fuel className="w-3.5 h-3.5" /> النولون</label>
                  <div className="p-2 rounded-lg border border-slate-100 bg-slate-50 text-indigo-600 font-mono font-bold">{(sugg ?? 0).toLocaleString()} ج.م</div>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> كارتات</label>
                  <input type="number" step="0.01" min="0" value={d.cards} onChange={(e) => updateDraft(car.id, { cards: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> مخالفات</label>
                  <input type="number" step="0.01" min="0" value={d.violations} onChange={(e) => updateDraft(car.id, { violations: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> غسيل كاوتش</label>
                  <input type="number" step="0.01" min="0" value={d.tireWash} onChange={(e) => updateDraft(car.id, { tireWash: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> صيانة</label>
                  <input type="number" step="0.01" min="0" value={d.maintenance} onChange={(e) => updateDraft(car.id, { maintenance: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                </div>
              </div>

              {db.costItemTypes.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 text-xs pt-2 border-t border-slate-100">
                  {db.costItemTypes.map(item => (
                    <div key={item.id}>
                      <label className="block text-slate-500 font-bold mb-1">{item.name}</label>
                      <input type="number" step="0.01" min="0" value={d.extra[item.id] || ''} onChange={(e) => updateDraft(car.id, { extra: { ...d.extra, [item.id]: e.target.value } })} className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                    </div>
                  ))}
                </div>
              )}

              {!car.car_type || !db.vehicleFreightRates[car.car_type] ? (
                <p className="text-[10px] text-slate-400 italic flex items-center gap-1"><Sparkles className="w-3 h-3" /> لا يوجد سعر نولون لكيلومتر نوع "{car.car_type || '-'}" في الإعدادات — النولون هيتسجل صفر لحد ما تضيفه.</p>
              ) : null}

              <div className="flex justify-end">
                <button type="button" onClick={() => handleSaveCar(car.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> حفظ مصاريف السيارة دي
                </button>
              </div>
            </div>
          );
        })}
        {carsOfDay.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold">
            لا توجد سيارات نفذت طلبات في تاريخ {selectedDate}.
          </div>
        )}
      </div>
    </div>
  );
}

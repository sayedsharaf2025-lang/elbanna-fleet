/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useDb } from '../db/store';
import { computeServiceRows } from '../utils/fuelStats';

type AlertItem = { key: string; kind: string; who: string; detail: string; level: 'expired' | 'soon'; order: number };

// تنبيهات الانتهاء في لوحة التحكم: رخصة السيارة، الطفاية، التأمين (لو مكتوب منتهي)، ورخصة السائق
export const ExpiryAlertsCard: React.FC = () => {
  const db = useDb();
  const [days, setDays] = useState<number>(() => parseInt(localStorage.getItem('elbanna_alert_days') || '30', 10) || 30);
  const [showAll, setShowAll] = useState(false);

  const items = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = (d?: string): number | null => {
      if (!d) return null;
      const t = new Date(d);
      if (isNaN(t.getTime())) return null;
      return Math.ceil((t.getTime() - today.getTime()) / 86400000);
    };
    const out: AlertItem[] = [];
    const dateAlert = (key: string, kind: string, who: string, dl: number | null) => {
      if (dl === null || dl > days) return;
      out.push({ key, kind, who, detail: dl < 0 ? `منتهية من ${-dl} يوم` : dl === 0 ? 'تنتهي اليوم' : `تنتهي بعد ${dl} يوم`, level: dl < 0 ? 'expired' : 'soon', order: dl });
    };
    db.cars.forEach(car => {
      dateAlert(`cl-${car.id}`, 'رخصة سيارة', car.car_number, daysLeft(car.license_end_date));
      if (car.extinguisher_status === 'expired') out.push({ key: `ex-${car.id}`, kind: 'طفاية', who: car.car_number, detail: 'منتهية أو تالفة', level: 'expired', order: -1000 });
      else if (car.extinguisher_status === 'warning') out.push({ key: `ew-${car.id}`, kind: 'طفاية', who: car.car_number, detail: 'قربت نهاية صلاحيتها', level: 'soon', order: 0 });
      if (/منتهي/.test(car.insurance_status || '')) out.push({ key: `in-${car.id}`, kind: 'تأمين', who: car.car_number, detail: car.insurance_status, level: 'expired', order: -1000 });
    });
    db.drivers.forEach(d => dateAlert(`dl-${d.id}`, 'رخصة سائق', d.name, daysLeft(d.license_end_date)));
    // الصيانة الوقائية بالكيلومتر: المتأخرة والقريبة
    computeServiceRows(db).forEach(p => {
      if (p.status === 'overdue') out.push({ key: `sp-${p.id}`, kind: 'صيانة وقائية', who: `${p.carNumber} — ${p.name}`, detail: `متأخرة ${Math.round(-(p.remaining as number)).toLocaleString()} كم`, level: 'expired', order: -500 });
      else if (p.status === 'soon') out.push({ key: `sp-${p.id}`, kind: 'صيانة وقائية', who: `${p.carNumber} — ${p.name}`, detail: `باقي ${Math.round(p.remaining as number).toLocaleString()} كم`, level: 'soon', order: 1 });
    });
    return out.sort((a, b) => a.order - b.order);
  }, [db.cars, db.drivers, db.servicePlans, db.fuelLogs, db.carDailyCosts, days]);

  const expired = items.filter(i => i.level === 'expired').length;
  const soon = items.length - expired;
  const shown = showAll ? items : items.slice(0, 8);

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 className="font-bold text-slate-100 text-sm md:text-base flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" /> تنبيهات الانتهاء
          {items.length > 0 && <span className="text-[11px] font-normal text-slate-400">({expired} منتهي، {soon} قرب ينتهي)</span>}
        </h3>
        <label className="text-[11px] text-slate-400 flex items-center gap-1.5">
          التنبيه قبل
          <select
            value={days}
            onChange={(e) => { const v = parseInt(e.target.value, 10); setDays(v); localStorage.setItem('elbanna_alert_days', String(v)); }}
            className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs"
          >
            {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} يوم</option>)}
          </select>
        </label>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-emerald-400 py-2">مفيش تراخيص أو أوراق منتهية أو قربت تنتهي خلال {days} يوم.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {shown.map(i => (
              <div key={i.key} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${i.level === 'expired' ? 'bg-rose-950/40 border-rose-500/30 text-rose-200' : 'bg-amber-950/30 border-amber-500/30 text-amber-200'}`}>
                <span className="flex items-center gap-1.5 font-bold"><AlertTriangle className="w-3.5 h-3.5" /> {i.kind} — {i.who}</span>
                <span className="text-[11px]">{i.detail}</span>
              </div>
            ))}
          </div>
          {items.length > 8 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="text-[11px] text-slate-400 hover:text-slate-200">
              {showAll ? 'عرض أقل' : `عرض الكل (${items.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

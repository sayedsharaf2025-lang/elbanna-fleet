/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { describeTrip } from '../db/logic/tripFlow';
import {
  TrackingPhase, PHASE_LABELS, PHASE_ORDER, buildTrackingRows, countByPhase, formatDuration, formatLocalDateTime,
  formatLocalTime, isStalePhase, minutesSince, tripTimeline,
} from '../db/logic/driverTracking';
import { DriverAccessPanel } from './DriverAccessPanel';
import { Search, Truck, User, MapPin, Clock, AlertTriangle, ChevronDown, ChevronUp, Home, Gauge, Wind, Route as RouteIcon } from 'lucide-react';

// شاشة متابعة السائقين: كل سيارة فين دلوقتي (في الجراج / في الطريق للتحميل / محمّلة / تم التسليم / عائدة للجراج)
// وتفاصيل رحلتها الحالية. بتتحدث تلقائيًا من مزامنة طلبات النقل اللي بيحدّثها تطبيق السائق.
const PHASE_STYLE: Record<TrackingPhase, { badge: string; dot: string }> = {
  garage: { badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  awaiting_accept: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  to_pickup: { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  at_pickup: { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500' },
  to_destination: { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  delivered: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  to_garage: { badge: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  untracked: { badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};

// خطوات شريط التقدم بعد القبول
const STEPS: { status: string; label: string }[] = [
  { status: 'accepted', label: 'قبول' },
  { status: 'at_pickup', label: 'التحميل' },
  { status: 'loaded', label: 'استلام' },
  { status: 'at_destination', label: 'الوجهة' },
  { status: 'heading_garage', label: 'الجراج' },
  { status: 'finished', label: 'انتهاء' },
];

export function DriverTrackingTab() {
  const db = useDb();
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'active' | TrackingPhase>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // تحديث المدد المعروضة (منذ كام دقيقة) كل نصف دقيقة
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => buildTrackingRows(db.cars, db.drivers, db.transportRequests), [db.cars, db.drivers, db.transportRequests]);
  const counts = useMemo(() => countByPhase(rows), [rows]);
  const activeCount = rows.length - counts.garage;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (phaseFilter === 'active' && r.phase === 'garage') return false;
      if (phaseFilter !== 'all' && phaseFilter !== 'active' && r.phase !== phaseFilter) return false;
      if (!q) return true;
      return r.car.car_number.toLowerCase().includes(q)
        || r.driverName.toLowerCase().includes(q)
        || (r.request?.request_number || '').toLowerCase().includes(q)
        || (r.request?.farm_name || '').toLowerCase().includes(q);
    });
  }, [rows, search, phaseFilter]);

  const chip = (key: 'all' | 'active' | TrackingPhase, label: string, count: number) => (
    <button key={key} type="button" onClick={() => setPhaseFilter(key)}
      className={`text-xs font-bold px-3 py-2 rounded-lg border flex items-center gap-1.5 ${phaseFilter === key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${phaseFilter === key ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-5" style={{ direction: 'rtl' }} id="driver_tracking_view">
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">العمليات</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2"><MapPin className="w-6 h-6" /> متابعة السائقين</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">مكان كل سيارة ومرحلة رحلتها الآن — بتتحدث تلقائيًا أول بأول من تطبيق السائق.</p>
      </div>

      <DriverAccessPanel />

      <div className="flex flex-wrap items-center gap-2">
        {chip('all', 'الكل', rows.length)}
        {chip('active', 'في رحلة', activeCount)}
        {PHASE_ORDER.filter(p => counts[p] > 0 || p === 'garage').map(p => chip(p, PHASE_LABELS[p], counts[p]))}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow">
        <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث برقم السيارة أو اسم السائق أو رقم الطلب</label>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white" />
      </div>

      {visible.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold text-sm">لا توجد سيارات مطابقة.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map(row => {
          const { car, request, phase } = row;
          const style = PHASE_STYLE[phase];
          const mins = minutesSince(row.since, nowMs);
          const stale = isStalePhase(phase, mins);
          const open = expandedId === car.id;
          const tripIdx = request?.trip_status ? STEPS.findIndex(s => s.status === request.trip_status) : -1;
          const shownTrip = request || row.lastTrip;
          const timeline = shownTrip ? tripTimeline(shownTrip) : [];
          const garage = car.garage_location || db.defaultGarageLocation;
          return (
            <div key={car.id} className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3 ${stale ? 'border-rose-300' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-black text-slate-800 text-base flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400 shrink-0" /> {car.car_number}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {row.driverName || 'بدون سائق'}</span>
                    {car.car_type && <span className="text-slate-400">— {car.car_type}</span>}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap flex items-center gap-1.5 ${style.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${phase !== 'garage' ? 'animate-pulse' : ''}`} /> {PHASE_LABELS[phase]}
                </span>
              </div>

              {request ? (
                <>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5 text-[11px]">
                    <p className="font-mono font-black text-slate-700">{request.request_number}</p>
                    <p className="text-slate-600 font-bold flex items-start gap-1"><RouteIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" /> {[request.farm_name, ...(request.destinations || [])].join(' ← ')}</p>
                    {request.trip_status && <p className="text-indigo-700 font-bold">📍 {describeTrip(request)}</p>}
                    {request.cargo_description && <p className="text-slate-500">الحمولة: {request.cargo_description}</p>}
                  </div>

                  {request.trip_status && (
                    <div className="flex items-center gap-1" aria-label="تقدم الرحلة">
                      {STEPS.map((s, i) => (
                        <div key={s.status} className="flex-1 min-w-0">
                          <div className={`h-1.5 rounded-full ${i <= tripIdx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                          <p className={`text-[9px] mt-1 text-center truncate ${i === tripIdx ? 'font-black text-emerald-700' : 'text-slate-400'}`}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className={`text-[11px] font-bold flex items-center gap-1 ${stale ? 'text-rose-600' : 'text-slate-500'}`}>
                    {stale ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    {mins !== undefined ? `في المرحلة دي من ${formatDuration(mins)}` : 'وقت المرحلة غير معروف'}
                    {stale && (phase === 'awaiting_accept' ? ' — السائق لسه ماقبلش' : ' — متأخرة')}
                  </p>
                </>
              ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1 text-[11px] text-slate-600">
                  <p className="flex items-center gap-1 font-bold"><Home className="w-3.5 h-3.5 text-slate-400" /> الجراج: {garage || '—'}</p>
                  {row.lastTrip ? (
                    <>
                      <p>آخر رحلة: <span className="font-mono font-bold">{row.lastTrip.request_number}</span> — {[row.lastTrip.farm_name, ...(row.lastTrip.destinations || [])].join(' ← ')}</p>
                      <p className="text-slate-500">انتهت: <span className="font-mono">{formatLocalDateTime(row.lastFinishedAt)}</span>{typeof row.lastTrip.finish_odometer === 'number' && <> — <Gauge className="w-3 h-3 inline" /> <span className="font-mono">{row.lastTrip.finish_odometer.toLocaleString()}</span> كم</>}{typeof row.lastTrip.expected_smoke === 'number' && <> — <Wind className="w-3 h-3 inline" /> <span className="font-mono">{row.lastTrip.expected_smoke.toLocaleString()}</span> ج.م</>}</p>
                    </>
                  ) : <p className="text-slate-400">مفيش رحلات مسجلة لسه.</p>}
                </div>
              )}

              {timeline.length > 0 && (
                <>
                  <button type="button" onClick={() => setExpandedId(open ? null : car.id)} className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
                    {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} {open ? 'إخفاء تفاصيل الرحلة' : 'تفاصيل الرحلة وأوقاتها'}
                  </button>
                  {open && (
                    <ol className="space-y-1.5 border-t border-slate-100 pt-2">
                      {timeline.map((e, i) => (
                        <li key={i} className="text-[11px] flex flex-wrap items-center gap-x-2">
                          <span className="font-bold text-slate-700">{e.label}{typeof e.leg === 'number' && (shownTrip?.destinations || []).length > 1 ? ` (وجهة ${e.leg + 1})` : ''}</span>
                          <span className="font-mono text-slate-500">{formatLocalTime(e.at)}</span>
                          {e.minutesFromPrev !== undefined && <span className="text-slate-400">(بعد {formatDuration(e.minutesFromPrev)})</span>}
                          {e.byOffice && <span className="text-slate-400">أنهاها المكتب</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

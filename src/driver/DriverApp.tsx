/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Truck, LogOut, RefreshCw, MapPin, User, Clock, Bell, Wifi, WifiOff, Home, Flag, Gauge, Wind, Package, KeyRound, Loader2, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { nextTripAction, TRIP_STATUS_LABELS, type TripAction } from '../db/logic/tripFlow';
import { formatLocalTime } from '../db/logic/driverTracking';
import {
  DriverSession, TripsSnapshot, loginDriver, verifySession, fetchTrips, fetchLastOdometer, applyTripAction, isSessionInvalid,
} from './driverApi';
import {
  actionButtonLabel, bucketTrips, canAcceptTrip, checkFinishInput, localYmd, lockUntilMs, newAssignments, stopStates, type StopState,
} from './driverLogic';
import type { TransportRequest } from '../types';

// تطبيق السائق: دخول بكود السائق + رقم سري ← استلام الطلب كإشعار ← قبول ← وصول التحميل ← استلام ← وصول الوجهة ← الجراج ← انتهاء بالعداد والدخان المتوقع.
const SESSION_KEY = 'elbanna_driver_session';
const FAIL_KEY = 'elbanna_driver_login_fails';
// تطبيق السائق مالوش جلسة Supabase Auth فمايقدرش يستخدم Realtime: Polling كل 45 ثانية (+ تحديث فوري عند رجوع الشاشة أو عودة النت)
const POLL_MS = 45000;          // سائق مستني تكليف: تنبيه الطلب الجديد لازم يوصل بسرعة معقولة
const POLL_BUSY_MS = 120000;    // سائق في رحلة جارية: هو اللي بيحدّث الشاشة بنفسه بعد كل خطوة، فمفيش داعي للسؤال كتير
const POLL_MAX_BACKOFF_MS = 300000; // عند فشل متكرر (نت ضعيف/سيرفر) نبطّئ لحد 5 دقايق بدل ما نفضل نزن

const loadSession = (): DriverSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    // جلسات قديمة من غير توكن (قبل تأمين التطبيق) أو منتهية: لازم دخول جديد
    return s && s.id && s.name && typeof s.token === 'string' && s.token && (!s.expires_at || s.expires_at > Date.now()) ? s : null;
  } catch { return null; }
};

function alertUser(title: string, body: string) {
  try { navigator.vibrate?.([250, 120, 250, 120, 250]); } catch { /* مش مدعوم */ }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.value = 0.15; osc.frequency.value = 880; osc.start();
    setTimeout(() => { osc.frequency.value = 1175; }, 200);
    setTimeout(() => { osc.stop(); ctx.close(); }, 450);
  } catch { /* الصوت ممنوع قبل أول لمسة */ }
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body });
  } catch { /* مش مدعوم */ }
}

export default function DriverApp() {
  const [session, setSession] = useState<DriverSession | null>(loadSession);
  const [notice, setNotice] = useState<string | null>(null);
  const login = (s: DriverSession) => { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); setNotice(null); setSession(s); };
  const logout = (msg?: string) => { localStorage.removeItem(SESSION_KEY); setNotice(msg || null); setSession(null); };
  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 text-slate-800" style={{ fontFamily: 'inherit' }}>
      {session ? <DriverHome session={session} onLogout={logout} /> : <DriverLogin onLogin={login} notice={notice} />}
    </div>
  );
}

// ===================== شاشة الدخول =====================
function DriverLogin({ onLogin, notice }: { onLogin: (s: DriverSession) => void; notice: string | null }) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || remaining > 0) return;
    // طلب إذن إشعارات المتصفح من لمسة المستخدم (بيفيد لو التطبيق مفتوح في الخلفية)
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* تجاهل */ }
    setBusy(true); setError(null);
    const res = await loginDriver(code, pin);
    setBusy(false);
    if (res.ok && res.data) { localStorage.removeItem(FAIL_KEY); onLogin(res.data); return; }
    const fails = (Number(localStorage.getItem(FAIL_KEY)) || 0) + 1;
    localStorage.setItem(FAIL_KEY, String(fails));
    setLockedUntil(lockUntilMs(fails, Date.now()));
    setError(res.error || 'تعذر تسجيل الدخول.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-100 p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-600 text-white flex items-center justify-center"><Truck className="w-7 h-7" /></div>
          <h1 className="text-lg font-black text-slate-800">تطبيق السائق</h1>
          <p className="text-xs text-slate-500">سجّل دخولك بكود السائق والرقم السري</p>
        </div>
        {notice && <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">{notice}</div>}
        <label className="block text-xs font-bold text-slate-500">
          كود السائق
          <input value={code} onChange={e => setCode(e.target.value)} inputMode="text" autoComplete="username" autoCapitalize="off"
            className="mt-1 w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold text-base" />
        </label>
        <label className="block text-xs font-bold text-slate-500">
          الرقم السري
          <input value={pin} onChange={e => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password"
            className="mt-1 w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold text-base tracking-widest" />
        </label>
        {error && <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}
        {remaining > 0 && <div className="text-xs font-bold text-slate-600 text-center">محاولات كتير غلط — استنى {remaining} ثانية.</div>}
        <button type="submit" disabled={busy || remaining > 0}
          className="w-full bg-emerald-600 disabled:bg-slate-300 text-white font-black text-base py-3.5 rounded-xl flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />} دخول
        </button>
      </form>
    </div>
  );
}

// ===================== الشاشة الرئيسية =====================
type ToastState = { type: 'success' | 'error'; text: string } | null;

function DriverHome({ session, onLogout }: { session: DriverSession; onLogout: (msg?: string) => void }) {
  const [snap, setSnap] = useState<TripsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ trip: TransportRequest; action: TripAction } | null>(null);
  const [finishTrip, setFinishTrip] = useState<TransportRequest | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [banner, setBanner] = useState<TransportRequest | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const loading = useRef(false);
  const snapRef = useRef<TripsSnapshot | null>(null);
  snapRef.current = snap;

  const showToast = (type: 'success' | 'error', text: string) => { setToast({ type, text }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async (): Promise<boolean> => {
    if (loading.current) return true; // فيه تحميل شغال بالفعل
    loading.current = true;
    const res = await fetchTrips(session);
    loading.current = false;
    if (isSessionInvalid(res)) { onLogout('انتهت الجلسة أو اتغيّر الرقم السري — سجّل الدخول من جديد.'); return true; }
    if (!res.ok || !res.data) { setError(res.error || 'تعذر تحميل الرحلات.'); return false; }
    const data = res.data;
    setError(null);
    setSnap(data);
    setLastSync(new Date());
    // أول تحميل: بس نسجّل الموجود. بعد كده أي طلب جديد بيتنبّه بيه (بانر + صوت + اهتزاز)
    if (seen.current === null) {
      seen.current = new Set(data.open.map(t => t.id));
      return true;
    }
    const fresh = newAssignments(seen.current, data.open);
    data.open.forEach(t => seen.current!.add(t.id));
    if (fresh.length > 0) {
      setBanner(fresh[0]);
      const t = fresh[0];
      alertUser('طلب جديد', `${t.request_number} — ${[t.farm_name, ...(t.destinations || [])].join(' ← ')}`);
    }
    return true;
  }, [session.token]);

  useEffect(() => {
    // لو المكتب لغى دخول السائق أو حذفه يتسجل خروجه
    verifySession(session).then(r => { if (r.ok && r.data === false) onLogout('تم إيقاف دخولك للتطبيق — كلّم المكتب.'); });
    // Polling تكيّفي: بيوقف تمامًا لما التطبيق في الخلفية أو الشاشة مقفولة، ويستأنف فورًا (مع تحديث) عند الرجوع،
    // وبيبطّأ لما السائق في رحلة جارية أو لما الطلبات بتفشل. ده بيقلل استدعاءات الـ Edge Function بشكل كبير مع عدد سائقين كبير.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;
    const nextDelay = () => {
      if (failures > 0) return Math.min(POLL_MAX_BACKOFF_MS, POLL_MS * 2 ** failures);
      return snapRef.current && bucketTrips(snapRef.current.open).current ? POLL_BUSY_MS : POLL_MS;
    };
    const schedule = () => {
      if (stopped || document.visibilityState === 'hidden') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tickPoll, nextDelay());
    };
    const tickPoll = async () => {
      if (stopped || document.visibilityState === 'hidden' || !navigator.onLine) return;
      const ok = await load();
      failures = ok ? 0 : failures + 1;
      schedule();
    };
    const refreshNow = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const ok = await load();
      failures = ok ? 0 : failures + 1;
      schedule();
    };
    refreshNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshNow();
      else if (timer) { clearTimeout(timer); timer = null; }
    };
    const onOnline = () => { setOnline(true); refreshNow(); };
    const onOffline = () => { setOnline(false); if (timer) { clearTimeout(timer); timer = null; } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const run = async (trip: TransportRequest, action: TripAction, payload: { odometer?: number; expectedSmoke?: number } = {}): Promise<boolean> => {
    setBusy(true);
    const res = await applyTripAction(trip, action, payload, session, snap?.cars[trip.assigned_car_id || ''], localYmd());
    setBusy(false);
    if (isSessionInvalid(res)) { onLogout('انتهت الجلسة أو اتغيّر الرقم السري — سجّل الدخول من جديد.'); return false; }
    if (!res.ok) { showToast('error', res.error || 'تعذر تنفيذ الخطوة.'); await load(); return false; }
    // تحديث فوري للشاشة قبل التحميل من السحابة
    setSnap(prev => {
      if (!prev) return prev;
      const updated = { ...trip, ...(res.data || {}) } as TransportRequest;
      return updated.status === 'done'
        ? { ...prev, open: prev.open.filter(t => t.id !== trip.id), recent: [updated, ...prev.recent].slice(0, 5) }
        : { ...prev, open: prev.open.map(t => (t.id === trip.id ? updated : t)) };
    });
    setBanner(null);
    showToast('success', action === 'finish' ? 'تم حفظ إنهاء الرحلة.' : 'تم التسجيل.');
    load();
    return true;
  };

  const onAction = (trip: TransportRequest, action: TripAction) => {
    if (action === 'finish') setFinishTrip(trip);
    else setConfirm({ trip, action });
  };

  const buckets = snap ? bucketTrips(snap.open) : null;
  const carNo = (t: TransportRequest) => (snap && t.assigned_car_id ? snap.cars[t.assigned_car_id] : '') || '';

  return (
    <div className="max-w-md mx-auto min-h-screen pb-10">
      <header className="bg-slate-900 text-white px-4 pt-4 pb-3 sticky top-0 z-20" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-base flex items-center gap-1.5 truncate"><User className="w-4 h-4 text-emerald-400 shrink-0" /> {session.name}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>كود {session.code}</span>
              <span className={`flex items-center gap-1 ${online && !error ? 'text-emerald-400' : 'text-amber-400'}`}>{online && !error ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{online && !error ? 'متصل' : 'غير متصل'}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => load()} aria-label="تحديث" className="p-2.5 rounded-xl hover:bg-slate-800"><RefreshCw className="w-5 h-5" /></button>
            <button type="button" onClick={() => { if (window.confirm('تسجيل الخروج؟')) onLogout(); }} aria-label="خروج" className="p-2.5 rounded-xl hover:bg-slate-800"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      {error && (
        <div className="m-4 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}</div>
      )}

      {banner && (
        <button type="button" onClick={() => setBanner(null)} className="mx-4 mt-4 w-[calc(100%-2rem)] text-right bg-emerald-600 text-white rounded-2xl p-4 shadow-lg flex gap-3 items-start animate-pulse">
          <Bell className="w-6 h-6 shrink-0" />
          <span><span className="block font-black text-sm">طلب جديد ليك</span><span className="block text-xs mt-0.5">{banner.request_number} — {[banner.farm_name, ...(banner.destinations || [])].join(' ← ')}</span></span>
        </button>
      )}

      <main className="p-4 space-y-4">
        {!snap && !error && <div className="text-center text-slate-400 font-bold text-sm py-16 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...</div>}

        {buckets?.current && (
          <TripCard trip={buckets.current} carNumber={carNo(buckets.current)} busy={busy} onAction={onAction} canAccept />
        )}

        {buckets && buckets.incoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-black text-amber-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> {buckets.current ? 'طلبات جاية بعد رحلتك الحالية' : 'طلب جديد بانتظار قبولك'} ({buckets.incoming.length})</h2>
            {buckets.incoming.map(t => (
              <TripCard key={t.id} trip={t} carNumber={carNo(t)} busy={busy} onAction={onAction} canAccept={canAcceptTrip(buckets)} />
            ))}
          </section>
        )}

        {buckets && buckets.untracked.length > 0 && (
          <div className="text-xs text-slate-500 bg-white rounded-2xl border border-slate-100 p-3">
            عندك {buckets.untracked.length} طلب رد عليه المكتب قبل تشغيل نظام التتبع ({buckets.untracked.map(t => t.request_number).join('، ')}) — المكتب هو اللي بيقفله.
          </div>
        )}

        {snap && !buckets?.current && buckets?.incoming.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center"><Home className="w-6 h-6" /></div>
            <p className="font-black text-slate-700">مفيش رحلات حاليًا</p>
            <p className="text-xs text-slate-500 leading-relaxed">أول ما المكتب يرد عليك بسيارة هيظهرلك الطلب هنا مع تنبيه. سيب التطبيق مفتوح.</p>
            {lastSync && <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> آخر تحديث {formatLocalTime(lastSync.toISOString())}</p>}
          </div>
        )}

        {snap && snap.recent.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-black text-slate-600">آخر رحلاتك</h2>
            {snap.recent.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-100 p-3 text-xs space-y-1">
                <p className="flex items-center justify-between"><span className="font-mono font-black text-slate-700">{t.request_number}</span><span className="text-slate-400">{t.delivered_at ? formatLocalTime(t.delivered_at) : ''}</span></p>
                <p className="text-slate-600 font-bold">{[t.farm_name, ...(t.destinations || [])].join(' ← ')}</p>
                <p className="text-slate-500 flex flex-wrap gap-x-3">
                  {carNo(t) && <span>سيارة {carNo(t)}</span>}
                  {typeof t.finish_odometer === 'number' && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {t.finish_odometer.toLocaleString('en-US')} كم</span>}
                  {typeof t.expected_smoke === 'number' && <span className="flex items-center gap-1"><Wind className="w-3 h-3" /> {t.expected_smoke.toLocaleString('en-US')} ج.م</span>}
                </p>
              </div>
            ))}
          </section>
        )}
      </main>

      {confirm && (
        <Sheet onClose={() => setConfirm(null)}>
          <p className="font-black text-base text-slate-800">تأكيد: {actionButtonLabel(confirm.action, confirm.trip)}؟</p>
          <p className="text-xs text-slate-500">{confirm.trip.request_number} — الخطوة دي بتتسجل بوقتها الحالي.</p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={() => setConfirm(null)} className="py-3.5 rounded-xl bg-slate-100 text-slate-600 font-black">إلغاء</button>
            <button type="button" disabled={busy} onClick={async () => { const c = confirm; const ok = await run(c.trip, c.action); if (ok) setConfirm(null); }}
              className="py-3.5 rounded-xl bg-emerald-600 disabled:bg-slate-300 text-white font-black flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} تأكيد</button>
          </div>
        </Sheet>
      )}

      {finishTrip && (
        <FinishSheet session={session} trip={finishTrip} carNumber={carNo(finishTrip)} busy={busy} onClose={() => setFinishTrip(null)}
          onSave={async (odometer, smoke) => { const ok = await run(finishTrip, 'finish', { odometer, expectedSmoke: smoke }); if (ok) setFinishTrip(null); }} />
      )}

      {toast && (
        <div className="fixed left-4 right-4 bottom-6 z-50 max-w-md mx-auto">
          <div className={`rounded-2xl shadow-2xl p-4 text-sm font-black flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />} {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== كارت الرحلة =====================
const STOP_STYLE: Record<StopState, string> = {
  done: 'bg-emerald-500 border-emerald-500 text-white',
  here: 'bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-200',
  target: 'bg-white border-indigo-500 text-indigo-600 ring-4 ring-indigo-100',
  pending: 'bg-white border-slate-300 text-slate-300',
};

function TripCard({ trip, carNumber, busy, onAction, canAccept }: {
  trip: TransportRequest; carNumber: string; busy: boolean; onAction: (t: TransportRequest, a: TripAction) => void; canAccept: boolean;
}) {
  const action = nextTripAction(trip);
  const dests = trip.destinations || [];
  const stops = [
    { label: trip.farm_name || 'نقطة التحميل', tag: 'التحميل', icon: Package },
    ...dests.map((d, i) => ({ label: d, tag: dests.length > 1 ? `الوجهة ${i + 1}` : 'التسليم', icon: MapPin })),
    ...(dests.length === 0 ? [{ label: 'الوجهة', tag: 'التسليم', icon: MapPin }] : []),
    { label: 'الجراج', tag: 'العودة', icon: Home },
  ];
  const states = stopStates(trip);
  const isNew = trip.trip_status === 'assigned';
  const blocked = action === 'accept' && !canAccept;

  return (
    <article className={`bg-white rounded-3xl border shadow-sm p-4 space-y-4 ${isNew ? 'border-amber-300' : 'border-emerald-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono font-black text-slate-800">{trip.request_number}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1"><Truck className="w-3 h-3" /> {carNumber ? `سيارة ${carNumber}` : 'سيارة غير محددة'}</p>
        </div>
        <span className={`text-[11px] font-black px-3 py-1.5 rounded-full border ${isNew ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {trip.trip_status ? TRIP_STATUS_LABELS[trip.trip_status] : ''}
        </span>
      </div>

      <ol className="space-y-0">
        {stops.map((s, i) => {
          const st = states[i] || 'pending';
          const Icon = s.icon;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${STOP_STYLE[st]}`}>{st === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}</span>
                {i < stops.length - 1 && <span className={`w-0.5 flex-1 min-h-4 ${st === 'done' ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </div>
              <div className="pb-4 min-w-0">
                <p className="text-[10px] font-bold text-slate-400">{s.tag}</p>
                <p className={`text-sm leading-snug break-words ${st === 'target' || st === 'here' ? 'font-black text-slate-800' : 'font-bold text-slate-500'}`}>{s.label}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-3 text-xs space-y-1.5">
        {trip.requester_name && <p className="flex gap-1.5"><span className="text-slate-400 shrink-0">الطالب:</span> <span className="font-bold text-slate-700">{trip.requester_name}</span></p>}
        {trip.cargo_description && <p className="flex gap-1.5"><span className="text-slate-400 shrink-0">الحمولة:</span> <span className="font-bold text-slate-700">{trip.cargo_description}</span></p>}
        {trip.car_type && <p className="flex gap-1.5"><span className="text-slate-400 shrink-0">نوع السيارة:</span> <span className="font-bold text-slate-700">{trip.car_type}</span></p>}
        {trip.responded_at && <p className="flex gap-1.5"><span className="text-slate-400 shrink-0">وقت الرد:</span> <span className="font-mono font-bold text-slate-700">{formatLocalTime(trip.responded_at)}</span></p>}
      </div>

      {action && (
        <div className="space-y-2">
          <button type="button" disabled={busy || blocked} onClick={() => onAction(trip, action)}
            className={`w-full py-4 rounded-2xl font-black text-lg text-white disabled:bg-slate-300 flex items-center justify-center gap-2 ${action === 'accept' ? 'bg-amber-500' : action === 'finish' ? 'bg-slate-900' : 'bg-emerald-600'}`}>
            {action === 'finish' ? <Flag className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />} {actionButtonLabel(action, trip)}
          </button>
          {blocked && <p className="text-[11px] text-center font-bold text-slate-500">أنهِ رحلتك الحالية الأول عشان تقبل الطلب ده.</p>}
        </div>
      )}
    </article>
  );
}

// ===================== نوافذ سفلية =====================
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div dir="rtl" className="w-full max-w-md bg-white rounded-t-3xl p-5 space-y-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function FinishSheet({ session, trip, carNumber, busy, onClose, onSave }: {
  session: DriverSession; trip: TransportRequest; carNumber: string; busy: boolean; onClose: () => void; onSave: (odometer: number, smoke: number) => void;
}) {
  const [odometer, setOdometer] = useState('');
  const [smoke, setSmoke] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmedWarning, setConfirmedWarning] = useState(false);
  const [lastOdo, setLastOdo] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (trip.assigned_car_id) fetchLastOdometer(session, trip.assigned_car_id, trip.id).then(setLastOdo);
  }, [session.token, trip.assigned_car_id, trip.id]);

  const save = () => {
    const check = checkFinishInput(odometer, smoke, lastOdo);
    if (!check.ok) { setError(check.error || 'راجع البيانات.'); setWarning(null); return; }
    setError(null);
    // تحذير العداد (أقل من آخر قراءة / فرق كبير): أول ضغطة بتعرض التحذير، التانية بتأكد
    if (check.warning && !confirmedWarning) { setWarning(check.warning); setConfirmedWarning(true); return; }
    onSave(check.odometer as number, check.smoke as number);
  };

  return (
    <Sheet onClose={() => { if (!busy) onClose(); }}>
      <p className="font-black text-base text-slate-800 flex items-center gap-2"><Flag className="w-5 h-5 text-slate-700" /> إنهاء الرحلة {trip.request_number}</p>
      <p className="text-xs text-slate-500">{carNumber ? `سيارة ${carNumber} — ` : ''}اكتب قراءة العداد والدخان المتوقع وبعدين احفظ.</p>
      <label className="block text-xs font-bold text-slate-500">
        رقم العداد (كم)
        <input value={odometer} onChange={e => { setOdometer(e.target.value); setConfirmedWarning(false); setWarning(null); }} inputMode="decimal" autoFocus
          className="mt-1 w-full p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-black text-lg font-mono" />
        {typeof lastOdo === 'number' && <span className="block mt-1 text-[11px] text-slate-400">آخر عداد متسجل للسيارة: {lastOdo.toLocaleString('en-US')} كم</span>}
      </label>
      <label className="block text-xs font-bold text-slate-500">
        الدخان المتوقع (ج.م)
        <input value={smoke} onChange={e => setSmoke(e.target.value)} inputMode="decimal"
          className="mt-1 w-full p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-black text-lg font-mono" />
      </label>
      {error && <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}
      {warning && <div className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{warning} لو الرقم صح اضغط «حفظ» تاني.</div>}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" disabled={busy} onClick={onClose} className="py-3.5 rounded-xl bg-slate-100 text-slate-600 font-black">رجوع</button>
        <button type="button" disabled={busy} onClick={save} className="py-3.5 rounded-xl bg-emerald-600 disabled:bg-slate-300 text-white font-black flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {warning ? 'حفظ رغم التحذير' : 'حفظ'}
        </button>
      </div>
    </Sheet>
  );
}

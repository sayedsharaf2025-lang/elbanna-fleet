/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { getSupabaseClient } from '../db/supabaseClient';
import { hashPassword } from '../db/passwordUtil';
import { normalizePin, validatePin } from '../driver/driverLogic';
import { KeyRound, Smartphone, Search, Copy, ChevronDown, ChevronUp, Trash2, Dices } from 'lucide-react';

// إدارة دخول تطبيق السائق: المكتب بيحدد لكل سائق رقم سري (بيتخزن مشفّر) وبيدّيله هو وكود السائق ورابط التطبيق.
export function DriverAccessPanel() {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const appLink = `${window.location.origin}/driver`;
  const SETUP = 'جدول دخول السائقين لسه مش موجود في Supabase — شغّل سكريبت driver-app.sql مرة واحدة في SQL Editor.';

  const loadAccess = async () => {
    const client = getSupabaseClient();
    if (!client) { setLoadError('الاتصال بالسحابة غير مفعّل.'); return; }
    const { data, error } = await client.from('driver_app_access').select('driver_id, updated_at');
    if (error) { setLoadError(/driver_app_access|does not exist|schema cache/i.test(error.message) ? SETUP : error.message); return; }
    setLoadError(null);
    const map: Record<string, string> = {};
    (data || []).forEach((r: any) => { map[r.driver_id] = r.updated_at; });
    setAccess(map);
  };
  useEffect(() => { if (open) loadAccess(); }, [open]);

  const duplicateCodes = useMemo(() => {
    const counts = new Map<string, number>();
    db.drivers.forEach(d => { const c = (d.driver_code || '').trim().toLowerCase(); if (c) counts.set(c, (counts.get(c) || 0) + 1); });
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([c]) => c));
  }, [db.drivers]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.drivers
      .filter(d => !q || d.name.toLowerCase().includes(q) || (d.driver_code || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.drivers, search]);

  const savePin = async (driverId: string) => {
    const err = validatePin(pin);
    if (err) { setMsg({ type: 'err', text: err }); return; }
    const client = getSupabaseClient();
    if (!client) { setMsg({ type: 'err', text: 'الاتصال بالسحابة غير مفعّل.' }); return; }
    setBusy(true);
    const { error } = await client.from('driver_app_access').upsert([{ driver_id: driverId, pin_hash: hashPassword(normalizePin(pin)), updated_at: new Date().toISOString(), updated_by: db.currentUser?.name || db.currentUser?.username || '' }]);
    setBusy(false);
    if (error) { setMsg({ type: 'err', text: /driver_app_access|does not exist|schema cache/i.test(error.message) ? SETUP : error.message }); return; }
    setMsg({ type: 'ok', text: `تم حفظ الرقم السري. سلّمه للسائق دلوقتي (${normalizePin(pin)}) — مش هيتعرض تاني.` });
    setEditingId(null); setPin('');
    loadAccess();
  };

  const revoke = async (driverId: string, name: string) => {
    if (!window.confirm(`إلغاء دخول السائق ${name} لتطبيق السائق؟`)) return;
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.from('driver_app_access').delete().eq('driver_id', driverId);
    setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'تم إلغاء الدخول.' });
    loadAccess();
  };

  const randomPin = () => setPin(String(Math.floor(100000 + Math.random() * 900000)));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 p-4 text-right">
        <span className="font-black text-sm text-slate-800 flex items-center gap-2"><Smartphone className="w-4 h-4 text-emerald-600" /> دخول تطبيق السائق (أرقام سرية السائقين)</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-50 pt-3">
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <span className="font-bold">رابط تطبيق السائق:</span>
            <span className="font-mono text-[11px] break-all" dir="ltr">{appLink}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(appLink).then(() => setMsg({ type: 'ok', text: 'تم نسخ الرابط.' }))} className="text-emerald-700 font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> نسخ</button>
          </div>
          {loadError && <div className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{loadError}</div>}
          {msg && <div className={`text-xs font-bold rounded-xl p-3 border ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{msg.text}</div>}
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث بالاسم أو الكود</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white" />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {list.map(d => {
              const code = (d.driver_code || '').trim();
              const dup = !!code && duplicateCodes.has(code.toLowerCase());
              const has = !!access[d.id];
              const editing = editingId === d.id;
              return (
                <div key={d.id} className="border border-slate-100 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-800 truncate">{d.name}</p>
                      <p className="text-[11px] text-slate-500">كود: <span className="font-mono font-bold">{code || '—'}</span>{dup && <span className="text-rose-600 font-bold"> — الكود مكرر، السائق مش هيقدر يدخل</span>}{!code && <span className="text-rose-600 font-bold"> — لازم يكون للسائق كود</span>}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${has ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{has ? 'مفعّل' : 'غير مفعّل'}</span>
                      <button type="button" disabled={!code || dup} onClick={() => { setEditingId(editing ? null : d.id); setPin(''); setMsg(null); }} className="text-[11px] font-bold text-emerald-700 disabled:text-slate-300 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> {has ? 'تغيير الرقم' : 'تحديد رقم'}</button>
                      {has && <button type="button" onClick={() => revoke(d.id, d.name)} className="text-rose-500" aria-label="إلغاء الدخول"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                  {editing && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={pin} onChange={e => setPin(e.target.value)} inputMode="numeric" placeholder="4 إلى 8 أرقام" className="flex-1 min-w-32 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold text-slate-800" />
                      <button type="button" onClick={randomPin} className="p-2.5 rounded-lg bg-slate-100 text-slate-600" aria-label="رقم عشوائي"><Dices className="w-4 h-4" /></button>
                      <button type="button" disabled={busy} onClick={() => savePin(d.id)} className="px-4 py-2.5 rounded-lg bg-emerald-600 disabled:bg-slate-300 text-white font-bold text-xs">حفظ</button>
                    </div>
                  )}
                </div>
              );
            })}
            {list.length === 0 && <p className="text-center text-xs text-slate-400 font-bold py-6">لا يوجد سائقين مطابقين.</p>}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">الرقم السري بيتخزن مشفّر ومابيتعرضش بعد الحفظ. يفضّل 6 أرقام. بعد تفعيل حماية قاعدة البيانات (RLS) هيتحسّن مستوى الأمان أكتر.</p>
        </div>
      )}
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Truck, Wrench, X } from 'lucide-react';
import { useDb } from '../db/store';
import { AppNotification } from '../types';
import { isUnread, notificationUserKey, timeAgoAr } from '../db/logic/notifications';

// جرس الإشعارات: عدّاد غير المقروء + قايمة بإشعارات المستخدم حسب صلاحياته. الضغط على إشعار بيفتح تفاصيل الطلب.
// onNavigate بيغيّر الشاشة الحالية في التطبيق (الموقع أو الموبايل)، والشاشة المستهدفة بتفتح الطلب نفسه.
export function NotificationBell({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const userKey = notificationUserKey(db.currentUser);
  const list = db.notifications;
  const unread = db.unreadNotificationCount;

  // إشعار منبثق لما يوصل إشعار جديد والتطبيق مفتوح (مش وقت أول تحميل)
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) { seen.current = new Set(list.map(n => n.id)); return; }
    const fresh = list.filter(n => !seen.current!.has(n.id) && isUnread(n, userKey));
    list.forEach(n => seen.current!.add(n.id));
    if (fresh.length > 0) setToast(fresh[0]);
  }, [list, userKey]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // رقم الإشعارات غير المقروءة في عنوان التبويب
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => { document.title = base; };
  }, [unread]);

  const handleOpen = (n: AppNotification) => {
    const screen = db.openNotification(n);
    setOpen(false);
    setToast(null);
    if (screen) onNavigate(screen);
    else { setMsg('مفيش عندك صلاحية على الشاشة المرتبطة بالإشعار ده.'); setTimeout(() => setMsg(null), 4000); }
  };

  const Item = ({ n }: { n: AppNotification }) => {
    const Icon = n.entity_type === 'maintenance' ? Wrench : Truck;
    const un = isUnread(n, userKey);
    return (
      <button type="button" onClick={() => handleOpen(n)}
        className={`w-full text-right p-3 flex gap-3 items-start border-b border-slate-100 hover:bg-slate-50 transition-colors ${un ? 'bg-emerald-50/60' : 'bg-white'}`}>
        <span className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${n.entity_type === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}><Icon className="w-4 h-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={`text-xs leading-snug ${un ? 'font-black text-slate-900' : 'font-bold text-slate-600'}`}>{n.title}</span>
            {un && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1" />}
          </span>
          <span className="block text-[11px] text-slate-500 mt-0.5 leading-relaxed break-words">{n.body}</span>
          <span className="block text-[10px] text-slate-400 mt-1">{timeAgoAr(n.created_at, Date.now())}{n.created_by ? ` — ${n.created_by}` : ''}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="الإشعارات" title="الإشعارات"
        className="relative p-2 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center leading-none">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[80]" dir="rtl" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-2 md:inset-x-auto md:left-6 md:w-[26rem] max-h-[70vh] flex flex-col bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.75rem)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="font-black text-sm text-slate-800 flex items-center gap-1.5"><Bell className="w-4 h-4 text-emerald-600" /> الإشعارات {unread > 0 && <span className="text-[10px] bg-rose-500 text-white rounded-full px-1.5 py-0.5">{unread}</span>}</span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button type="button" onClick={() => db.markAllNotificationsRead()} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> تعليم الكل كمقروء</button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-500" aria-label="إغلاق"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto">
              {list.length === 0
                ? <div className="p-8 text-center text-slate-400 text-xs font-bold">لا توجد إشعارات حاليًا.</div>
                : list.slice(0, 60).map(n => <Item key={n.id} n={n} />)}
            </div>
          </div>
        </div>,
        document.body
      )}

      {(toast || msg) && createPortal(
        <div className="fixed left-3 right-3 md:right-auto md:left-6 md:w-96 z-[90]" dir="rtl" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4rem)' }}>
          {toast ? (
            <button type="button" onClick={() => handleOpen(toast)} className="w-full text-right bg-slate-900 text-white rounded-2xl shadow-2xl border border-emerald-500/40 p-3.5 flex gap-3 items-start">
              <Bell className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="min-w-0"><span className="block text-xs font-black">{toast.title}</span><span className="block text-[11px] text-slate-300 mt-0.5 break-words">{toast.body}</span></span>
            </button>
          ) : (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl shadow-xl p-3 text-xs font-bold">{msg}</div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

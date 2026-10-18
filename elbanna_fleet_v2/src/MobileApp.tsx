/**
 * تطبيق الموبايل (APK) — شاشات طلبات النقل فقط: تسجيل طلب جديد + متابعة الطلبات.
 * بيتفعّل لما يتبني المشروع بالمتغيّر VITE_APP_MODE=requests (شوف main.tsx و workflow الـ APK).
 */
import React, { useState } from 'react';
import { DbProvider, useDb } from './db/store';
import { LoginScreen } from './components/LoginScreen';
import { TransportRequestsTab } from './components/TransportRequestsTab';
import { RequestsTrackingTab } from './components/RequestsTrackingTab';
import { Send, ClipboardList, LogOut } from 'lucide-react';

function MobileShell() {
  const db = useDb();
  const [tab, setTab] = useState<'new' | 'track'>('new');

  // الشاشات المسموحة للمستخدم حيًّا من جدول المستخدمين (نفس منطق الموقع)
  const user = db.currentUser;
  const live = db.systemUsers?.find(u => u.id === user?.systemUserId);
  const screens: string[] = live ? live.allowed_screens : (user?.allowedScreens || []);
  const canNew = screens.includes('transport_requests');
  const canTrack = screens.includes('requests_tracking');
  const current = tab === 'new' ? (canNew ? 'new' : 'track') : (canTrack ? 'track' : 'new');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16" dir="rtl">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 h-14 flex items-center justify-between"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-slate-950">بـ</span>
          <span className="font-extrabold text-sm">طلبات النقل</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-300 font-bold truncate max-w-[110px]">👤 {user?.name || user?.username}</span>
          <button type="button" onClick={() => db.logout()} className="text-rose-400 font-black flex items-center gap-1">
            <LogOut className="w-4 h-4" /> خروج
          </button>
        </div>
      </header>

      <main className="flex-1 p-3">
        {!canNew && !canTrack ? (
          <div className="mt-10 text-center text-sm text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-4">
            هذا المستخدم ليس له صلاحية على شاشات طلبات النقل. اطلب من المدير تفعيل «طلبات النقل» أو «متابعة الطلبات» له.
          </div>
        ) : current === 'new' ? <TransportRequestsTab /> : <RequestsTrackingTab />}
      </main>

      {(canNew || canTrack) && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900 border-t border-slate-800 grid grid-cols-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {canNew && (
            <button type="button" onClick={() => setTab('new')}
              className={`py-3 flex flex-col items-center gap-0.5 text-xs font-bold ${current === 'new' ? 'text-emerald-400' : 'text-slate-400'}`}>
              <Send className="w-5 h-5" /> طلب جديد
            </button>
          )}
          {canTrack && (
            <button type="button" onClick={() => setTab('track')}
              className={`py-3 flex flex-col items-center gap-0.5 text-xs font-bold ${current === 'track' ? 'text-emerald-400' : 'text-slate-400'}`}>
              <ClipboardList className="w-5 h-5" /> متابعة الطلبات
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

function MobileContent() {
  const db = useDb();
  return db.currentUser ? <MobileShell /> : <LoginScreen />;
}

export default function MobileApp() {
  return (
    <DbProvider>
      <MobileContent />
    </DbProvider>
  );
}

/**
 * تطبيق الموبايل (APK) — طلبات النقل (طلب جديد + متابعة) + فواتير التراخيص + متابعة وتحديث التراخيص.
 * بيتفعّل لما يتبني المشروع بالمتغيّر VITE_APP_MODE=requests (شوف main.tsx و workflow الـ APK).
 */
import React, { useState } from 'react';
import { DbProvider, useDb } from './db/store';
import { LoginScreen } from './components/LoginScreen';
import { TransportRequestsTab } from './components/TransportRequestsTab';
import { RequestsTrackingTab } from './components/RequestsTrackingTab';
import { InvoicesTab } from './components/InvoicesTab';
import { LicenseDashboardTab } from './components/LicenseDashboardTab';
import { Send, ClipboardList, LogOut, Receipt, CalendarCheck } from 'lucide-react';

// شاشات التطبيق: كل شاشة ليها نفس id الصلاحية المستخدم في الموقع
const MOBILE_TABS = [
  { id: 'transport_requests', label: 'طلب جديد', icon: Send, render: () => <TransportRequestsTab /> },
  { id: 'requests_tracking', label: 'متابعة الطلبات', icon: ClipboardList, render: () => <RequestsTrackingTab /> },
  { id: 'custody_licensing', label: 'فواتير تراخيص', icon: Receipt, render: () => <InvoicesTab /> },
  { id: 'license_tracking', label: 'متابعة التراخيص', icon: CalendarCheck, render: () => <LicenseDashboardTab /> },
] as const;

function MobileShell() {
  const db = useDb();
  const [tab, setTab] = useState<string>('transport_requests');

  // الشاشات المسموحة للمستخدم حيًّا من جدول المستخدمين (نفس منطق الموقع)
  const user = db.currentUser;
  const live = db.systemUsers?.find(u => u.id === user?.systemUserId);
  const screens: string[] = live ? live.allowed_screens : (user?.allowedScreens || []);
  const tabs = MOBILE_TABS.filter(t => screens.includes(t.id));
  const current = tabs.find(t => t.id === tab) || tabs[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16" dir="rtl">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 h-14 flex items-center justify-between"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-slate-950">بـ</span>
          <span className="font-extrabold text-sm">{current ? current.label : 'البنا جروب'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-300 font-bold truncate max-w-[110px]">👤 {user?.name || user?.username}</span>
          <button type="button" onClick={() => db.logout()} className="text-rose-400 font-black flex items-center gap-1">
            <LogOut className="w-4 h-4" /> خروج
          </button>
        </div>
      </header>

      <main className="flex-1 p-3 overflow-x-hidden">
        {!current ? (
          <div className="mt-10 text-center text-sm text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-4">
            هذا المستخدم ليس له صلاحية على شاشات التطبيق. اطلب من المدير تفعيل «طلبات النقل» أو «متابعة الطلبات» أو «فواتير تراخيص» أو «متابعة وتحديث التراخيص».
          </div>
        ) : current.render()}
      </main>

      {current && tabs.length > 1 && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900 border-t border-slate-800 flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = t.id === current.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-bold ${active ? 'text-emerald-400' : 'text-slate-400'}`}>
                <Icon className="w-5 h-5" /> {t.label}
              </button>
            );
          })}
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

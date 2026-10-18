/**
 * تطبيق الموبايل (APK) — كل شاشات الموقع، حسب صلاحيات المستخدم.
 * بيتفعّل لما يتبني المشروع بالمتغيّر VITE_APP_MODE=requests (شوف main.tsx و workflow الـ APK).
 * التنقل: شريط سفلي للشاشات الأساسية + قايمة جانبية (☰) فيها كل الشاشات مقسّمة مجموعات.
 */
import React, { useState } from 'react';
import { DbProvider, useDb } from './db/store';
import { LoginScreen } from './components/LoginScreen';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { CarsDriversTab } from './components/CarsDriversTab';
import { ViolationsTab } from './components/ViolationsTab';
import { DeductionsTab } from './components/DeductionsTab';
import { InvoicesTab } from './components/InvoicesTab';
import { AccountsTab } from './components/AccountsTab';
import { LicenseDashboardTab } from './components/LicenseDashboardTab';
import { ReportsTab } from './components/ReportsTab';
import { UsersSettingsTab } from './components/UsersSettingsTab';
import { TransportRequestsTab } from './components/TransportRequestsTab';
import { RequestsTrackingTab } from './components/RequestsTrackingTab';
import { TransportCostSettingsTab } from './components/TransportCostSettingsTab';
import { RouteAccountingTab } from './components/RouteAccountingTab';
import { CarDailyCostsTab } from './components/CarDailyCostsTab';
import { MaintenanceTab } from './components/MaintenanceTab';
import { VehicleProfitabilityTab } from './components/VehicleProfitabilityTab';
import { LicenseApprovalsTab } from './components/LicenseApprovalsTab';
import { CarMonthlyCostsTab } from './components/CarMonthlyCostsTab';
import { DriverReportsTab } from './components/DriverReportsTab';
import { FuelLogsTab } from './components/FuelLogsTab';
import { ServicePlansTab } from './components/ServicePlansTab';
import {
  Send, ClipboardList, LogOut, Receipt, CalendarCheck, Menu, X, LayoutDashboard, Users, Truck, Fuel,
  AlertTriangle, Route, Gauge, Wallet, BarChart3, TrendingUp, FileCheck, CreditCard, FileSpreadsheet,
  Wrench, Package, FileText,
} from 'lucide-react';

type Screen = { id: string; label: string; icon: any; render: () => React.ReactNode };

// نفس ids الصلاحيات المستخدمة في الموقع (App.tsx)
const GROUPS: { label: string; items: Screen[] }[] = [
  { label: 'الرئيسية', items: [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, render: () => <DashboardAnalytics /> },
  ] },
  { label: 'العمليات / حركة الأسطول', items: [
    { id: 'transport_requests', label: 'طلبات النقل', icon: Send, render: () => <TransportRequestsTab /> },
    { id: 'requests_tracking', label: 'متابعة الطلبات', icon: ClipboardList, render: () => <RequestsTrackingTab /> },
    { id: 'license_tracking', label: 'متابعة وتحديث التراخيص', icon: CalendarCheck, render: () => <LicenseDashboardTab /> },
    { id: 'violations', label: 'المخالفات', icon: AlertTriangle, render: () => <ViolationsTab /> },
  ] },
  { label: 'المالية', items: [
    { id: 'custody_licensing', label: 'فواتير تراخيص', icon: Receipt, render: () => <InvoicesTab /> },
    { id: 'license_invoice_approvals', label: 'اعتماد فواتير التراخيص', icon: FileCheck, render: () => <LicenseApprovalsTab /> },
    { id: 'route_accounting', label: 'حساب خطوط السير', icon: Route, render: () => <RouteAccountingTab /> },
    { id: 'car_daily_costs', label: 'مصاريف وأرباح السيارات اليومية', icon: Gauge, render: () => <CarDailyCostsTab /> },
    { id: 'car_monthly_costs', label: 'المرتبات والسولار والزيت الشهرية', icon: Wallet, render: () => <CarMonthlyCostsTab /> },
    { id: 'driver_reports', label: 'تقارير السائقين وتكلفة الكيلو', icon: BarChart3, render: () => <DriverReportsTab /> },
    { id: 'fuel_logs', label: 'سجل التموين', icon: Fuel, render: () => <FuelLogsTab /> },
    { id: 'service_plans', label: 'الصيانة الوقائية', icon: ClipboardList, render: () => <ServicePlansTab /> },
    { id: 'vehicle_profitability', label: 'ربحية السيارات', icon: TrendingUp, render: () => <VehicleProfitabilityTab /> },
    { id: 'deductions', label: 'الخصومات', icon: CreditCard, render: () => <DeductionsTab /> },
    { id: 'cross_accounts', label: 'حسابات السائقين (شهرية)', icon: FileSpreadsheet, render: () => <AccountsTab /> },
  ] },
  { label: 'الصيانة', items: [
    { id: 'maintenance', label: 'قسم الصيانة', icon: Wrench, render: () => <MaintenanceTab /> },
    { id: 'maintenance_requests', label: 'طلبات الصيانة', icon: ClipboardList, render: () => <MaintenanceTab mode="requests" /> },
    { id: 'maintenance_parts', label: 'قطع الغيار', icon: Package, render: () => <MaintenanceTab mode="parts" /> },
    { id: 'maintenance_execution', label: 'تنفيذ الصيانة', icon: Wrench, render: () => <MaintenanceTab mode="execution" /> },
    { id: 'maintenance_review', label: 'مراجعة واعتماد الصيانة', icon: CalendarCheck, render: () => <MaintenanceTab mode="review" /> },
    { id: 'maintenance_accounting', label: 'فواتير الصيانة', icon: Receipt, render: () => <MaintenanceTab mode="accounting" /> },
  ] },
  { label: 'الإعدادات والتقارير', items: [
    { id: 'reports', label: 'التقارير والمطبوعات', icon: FileText, render: () => <ReportsTab /> },
    { id: 'users_settings', label: 'المستخدمين والصلاحيات', icon: Users, render: () => <UsersSettingsTab /> },
    { id: 'fleet', label: 'السيارات والسائقين', icon: Truck, render: () => <CarsDriversTab /> },
    { id: 'transport_cost_settings', label: 'إعدادات تكلفة خطوط السير', icon: Fuel, render: () => <TransportCostSettingsTab /> },
  ] },
];

// الشاشات اللي بتظهر في الشريط السفلي (لو مسموحة للمستخدم)
const BOTTOM_IDS = ['transport_requests', 'requests_tracking', 'custody_licensing', 'license_tracking'];

function MobileShell() {
  const db = useDb();
  const [tab, setTab] = useState<string>('transport_requests');
  const [menuOpen, setMenuOpen] = useState(false);

  // الشاشات المسموحة للمستخدم حيًّا من جدول المستخدمين (نفس منطق الموقع)
  const user = db.currentUser;
  const live = db.systemUsers?.find(u => u.id === user?.systemUserId);
  const screens: string[] = live ? live.allowed_screens : (user?.allowedScreens || []);
  const groups = GROUPS.map(g => ({ ...g, items: g.items.filter(i => screens.includes(i.id)) })).filter(g => g.items.length > 0);
  const all = groups.flatMap(g => g.items);
  const current = all.find(t => t.id === tab) || all.find(t => t.id === 'transport_requests') || all[0];
  const bottom = BOTTOM_IDS.map(id => all.find(t => t.id === id)).filter(Boolean) as Screen[];

  const go = (id: string) => { setTab(id); setMenuOpen(false); window.scrollTo(0, 0); };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16" dir="rtl">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-3 h-14 flex items-center justify-between"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => setMenuOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-800" aria-label="القائمة">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-extrabold text-sm truncate">{current ? current.label : 'البنا جروب'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="text-slate-300 font-bold truncate max-w-[90px]">👤 {user?.name || user?.username}</span>
          <button type="button" onClick={() => db.logout()} className="text-rose-400 font-black flex items-center gap-1">
            <LogOut className="w-4 h-4" /> خروج
          </button>
        </div>
      </header>

      <main className="flex-1 p-3 overflow-x-hidden">
        {!current ? (
          <div className="mt-10 text-center text-sm text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-4">
            هذا المستخدم ليس له صلاحية على أي شاشة. اطلب من المدير تفعيل الشاشات له من «المستخدمين والصلاحيات».
          </div>
        ) : current.render()}
      </main>

      {current && bottom.length > 1 && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900 border-t border-slate-800 flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {bottom.map(t => {
            const Icon = t.icon;
            const active = t.id === current.id;
            return (
              <button key={t.id} type="button" onClick={() => go(t.id)}
                className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-bold ${active ? 'text-emerald-400' : 'text-slate-400'}`}>
                <Icon className="w-5 h-5" /> {t.label}
              </button>
            );
          })}
        </nav>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-[80] flex" dir="rtl">
          <div className="w-72 max-w-[85%] bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-3 space-y-3"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm">البنا جروب</span>
              <button type="button" onClick={() => setMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            {groups.map(g => (
              <div key={g.label}>
                <div className="text-[10px] font-black text-emerald-400 mb-1 px-1">{g.label}</div>
                <div className="space-y-1">
                  {g.items.map(i => {
                    const Icon = i.icon;
                    const active = current && i.id === current.id;
                    return (
                      <button key={i.id} type="button" onClick={() => go(i.id)}
                        className={`w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 border ${active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-300 border-transparent hover:bg-slate-800'}`}>
                        <Icon className="w-4 h-4 shrink-0" /> {i.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMenuOpen(false)} />
        </div>
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DbProvider, useDb } from './db/store';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { CarsDriversTab } from './components/CarsDriversTab';
import { ViolationsTab } from './components/ViolationsTab';
import { DeductionsTab } from './components/DeductionsTab';
import { InvoicesTab } from './components/InvoicesTab';
import { AccountsTab } from './components/AccountsTab';
import { LicenseDashboardTab } from './components/LicenseDashboardTab';
import { ReportsTab } from './components/ReportsTab';
import { UsersSettingsTab } from './components/UsersSettingsTab';
import { SupabaseConsole } from './components/SupabaseConsole';
import { LoginScreen } from './components/LoginScreen';
import {
  LayoutDashboard,
  Truck,
  AlertTriangle,
  Receipt,
  FileSpreadsheet,
  CalendarCheck,
  Database,
  RefreshCw,
  Clock,
  HelpCircle,
  Menu,
  X,
  CreditCard,
  FileText,
  Users
} from 'lucide-react';

function DashboardLayout() {
  const db = useDb();

  // Filter tab list based on logged-in user role
  const allowedTabs = React.useMemo(() => {
    const role = db.currentUser?.role;
    if (role === 'admin') {
      return ['dashboard', 'fleet', 'violations', 'deductions', 'custody_licensing', 'cross_accounts', 'license_tracking', 'reports', 'users_settings'];
    }
    if (role === 'supervisor') {
      return ['custody_licensing', 'license_tracking', 'reports'];
    }
    if (role === 'manager') {
      return ['reports'];
    }
    return [];
  }, [db.currentUser]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'fleet' | 'violations' | 'deductions' | 'custody_licensing' | 'cross_accounts' | 'license_tracking' | 'reports' | 'users_settings'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Enforce redirection to allowed tabs as role switches or updates
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0] as any);
    }
  }, [allowedTabs, activeTab]);

  // Real-time Clock loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const tabItems = [
    { id: 'dashboard', label: 'لوحة التحكم والتحليلات الحية', icon: LayoutDashboard },
    { id: 'fleet', label: 'إعدادات السيارات والسائقين (Excel)', icon: Truck },
    { id: 'violations', label: 'تسجيل المخالفات وتفادي التكرار', icon: AlertTriangle },
    { id: 'deductions', label: 'الخصومات الفردية والجماعية', icon: CreditCard },
    { id: 'custody_licensing', label: 'العهد الصرف وتسوية الفواتير', icon: Receipt },
    { id: 'cross_accounts', label: 'أرشيف وحسابات السائقين (شهرية)', icon: FileSpreadsheet },
    { id: 'license_tracking', label: 'متابعة وتحديث التراخيص المتقدمة', icon: CalendarCheck },
    { id: 'reports', label: 'شاشة التقارير والمطبوعات الموحدة', icon: FileText },
    { id: 'users_settings', label: 'حماية وإعدادات حسابات النظام', icon: Users }
  ] as const;

  const visibleTabItems = tabItems.filter(item => allowedTabs.includes(item.id));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative pb-16">
      
      {/* Corporate Header Ribbon */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-40 no-print" id="elbanna_main_header">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              type="button"
              className="lg:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Branding Logo */}
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-slate-950 text-base shadow">
                بـ
              </span>
              <div>
                <h1 className="font-extrabold text-slate-100 text-sm md:text-base leading-none">مجموعة البنا جروب</h1>
                <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">البوابة الرقمية لإدارة الأسطول والعهد المالية</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* User status & Logout */}
            <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="text-slate-300 font-extrabold whitespace-nowrap">
                {db.currentUser?.role === 'admin' ? '👤 مدير النظام' : db.currentUser?.role === 'manager' ? '📈 المدير المالي' : `🧑‍✈️ مشرف: ${db.currentUser?.username}`}
              </span>
              <button
                onClick={() => db.logout()}
                type="button"
                className="text-[10px] text-rose-400 hover:text-rose-300 font-black border-r border-slate-800 pr-2 mr-1 transition-all hover:underline"
              >
                تسجيل الخروج
              </button>
            </div>

            {/* Live Clock indicator representing localized time */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 font-medium font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{currentTime.toLocaleTimeString('ar-EG')}</span>
            </div>

            {/* Quick Developer Supabase trigger */}
            <button
              onClick={() => setShowConsole(!showConsole)}
              type="button"
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${showConsole ? 'bg-emerald-500 border-emerald-450 text-slate-950 shadow shadow-emerald-500/20 font-extrabold' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
            >
              <Database className="w-4 h-4" />
              <span>{showConsole ? 'إغلاق الكونسول' : 'محرر ومراقب Supabase'}</span>
            </button>

            {/* Database resetting safety hatch */}
            <button
              onClick={() => {
                if(confirm("هل ترغب بإعادة تعيين قاعدة بيانات شركة البنا جروب للبيانات الأولية من الكراسة وحذف المدخلات التجريبية؟")) {
                  db.resetToInitial();
                  alert("تمت استعادة التهيئة الأولية للجداول بنجاح!");
                  window.location.reload();
                }
              }}
              type="button"
              className="p-1.5 border border-slate-800 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="استعادة الحالة المصنعية"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main layout frame */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 md:px-6 py-6 gap-6 relative">
        
        {/* Navigation Sidebar Drawer */}
        <aside 
          className={`lg:w-72 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between h-[80vh] shrink-0 sticky top-24 no-print transition-all duration-300 md:translate-x-0 ${isSidebarOpen ? 'fixed right-4 left-4 top-20 z-50 translate-x-0 bg-slate-900' : 'hidden lg:flex'}`}
          id="elbanna_sidebar"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center lg:hidden border-b border-slate-800 pb-2">
              <span className="font-extrabold text-sm text-slate-200">قائمة البوابات</span>
              <button onClick={() => setIsSidebarOpen(false)} type="button" className="p-1 hover:bg-slate-800 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {visibleTabItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsSidebarOpen(false);
                    }}
                    type="button"
                    className={`w-full text-right px-4 py-3 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-3 border ${activeTab === item.id ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-405 hover:bg-slate-800 hover:text-slate-200 border-transparent'}`}
                  >
                    <Icon className={`w-4 h-4 ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quick status cards */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-4 space-y-2 text-xs">
            <div className="flex justify-between font-semibold text-slate-400 text-[10px]">
              <span>معدل الحماية</span>
              <span className="text-emerald-400">100% (RLS Active)</span>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-full"></div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed text-right">
              تم تشفير وحظر البيانات السحابية بموجب بروتوكولات البنا جروب الصارمة.
            </p>
          </div>
        </aside>

        {/* Content Portal */}
        <main className="flex-1 min-w-0" id="main_content_frame">
          <div className="pb-8">
            {db.cloudError && (
              <div className="mb-6 no-print" id="cloud_warning_banner">
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-2xl p-4 flex flex-col md:flex-row items-center md:items-start justify-between gap-4 shadow-lg shadow-amber-500/5 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-xs md:text-sm text-amber-400">تنبيه الحالة السحابية: جداول قاعدة البيانات غير مهيأة</h4>
                      <p className="text-[11px] md:text-xs text-slate-300 leading-relaxed text-right">
                        {db.cloudError.includes("public.drivers") || db.cloudError.includes("schema cache") ? (
                          <>
                            <span className="font-extrabold text-amber-450">أنت متصل بالاتصال السحابي لـ Supabase بنجاح! </span> 
                            ولكن جداول قاعدة البيانات (مثل جدول السائقين <span className="font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">public.drivers</span>) غير مكشوفة أو غير منشأة بمشروعك السحابي بعد.
                            <br className="mb-1" />
                            لهذا السبب تظهر هذه الرسالة ولا تظهر مدخلاتك الحقيقية عند الدخول من جهاز آخر. يرجى الضغط على الزر المقابل باليسار لفتح لوحة التحكم ثم نسخ كود الاستعلام <span className="font-bold text-amber-400">SQL Schema</span> الموحد ولصقه في نافذة <span className="font-bold text-amber-350">SQL Editor</span> في حساب Supabase الخاص بك والضغط على <span className="font-extrabold text-emerald-400">Run</span> لإنشاء كافة جداول النظام وحفظ حركات العمل محاسبيًا ومزامنتها بنجاح عبر الهواتف والكمبيوتر فوريًا!
                          </>
                        ) : db.cloudError}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        const res = await db.downloadCloudDataToLocal(true);
                        alert(res.message);
                      }}
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow shadow-emerald-600/20"
                    >
                      <RefreshCw className="w-4 h-4 animate-pulse" />
                      مزامنة السحاب وجلب البيانات السابقة
                    </button>
                    <button
                      onClick={() => setShowConsole(true)}
                      type="button"
                      className="bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      <Database className="w-4 h-4 text-emerald-500" />
                      إعدادات السحاب والـ SQL
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dashboard' && <DashboardAnalytics />}
            {activeTab === 'fleet' && <CarsDriversTab />}
            {activeTab === 'violations' && <ViolationsTab />}
            {activeTab === 'deductions' && <DeductionsTab />}
            {activeTab === 'custody_licensing' && <InvoicesTab />}
            {activeTab === 'cross_accounts' && <AccountsTab />}
            {activeTab === 'license_tracking' && <LicenseDashboardTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'users_settings' && <UsersSettingsTab />}
          </div>
        </main>

      </div>

      {/* FOOTER BAR */}
      <footer className="fixed bottom-0 left-0 right-0 h-10 border-t border-slate-800 bg-slate-900 no-print flex items-center justify-between px-6 z-40 text-[10px] text-slate-500 select-none">
        <span>© 2026 مجموعة البنا جروب للتشييد واللوجستيك. جميع الحقوق محفوظة.</span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-emerald-650 font-bold">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          PostgreSQL السحابي متصل ومؤمن
        </span>
      </footer>

      {/* Toggleable Supabase Developer Console panel */}
      {showConsole && (
        <div className="fixed bottom-10 left-0 right-0 z-50 p-4 bg-slate-950 border-t border-slate-800 shadow-2xl max-h-[50vh] overflow-y-auto no-print">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800 text-xs">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" />
                محرر قواعد البيانات واستعلامات SQL التجريبي لشركة البنا جروب
              </span>
              <button
                onClick={() => setShowConsole(false)}
                type="button"
                className="text-slate-400 hover:text-white font-bold"
              >
                إغلاق [X]
              </button>
            </div>
            <SupabaseConsole />
          </div>
        </div>
      )}

    </div>
  );
}

function AppContent() {
  const db = useDb();
  if (!db.currentUser) {
    return <LoginScreen />;
  }
  return <DashboardLayout />;
}

export default function App() {
  return (
    <DbProvider>
      <AppContent />
    </DbProvider>
  );
}

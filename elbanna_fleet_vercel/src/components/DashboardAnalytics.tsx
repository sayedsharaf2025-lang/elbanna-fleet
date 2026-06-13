/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDb } from '../db/store';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  Car,
  Users,
  DollarSign,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  ListRestart
} from 'lucide-react';

export const DashboardAnalytics: React.FC = () => {
  const db = useDb();

  // Helper counters
  const totalCars = db.cars.length;
  const totalDrivers = db.drivers.length;
  const totalViolationsAmount = db.violations.reduce((sum, v) => sum + v.amount, 0);
  
  // Expiration states
  const currentDate = new Date("2026-06-06");
  const expiredCars = db.cars.filter(car => {
    const expDate = new Date(car.license_end_date);
    return expDate < currentDate;
  }).length;

  const nearExpiredCars = db.cars.filter(car => {
    const expDate = new Date(car.license_end_date);
    const diffTime = expDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 30;
  }).length;

  // Custodies
  const totalCashCustody = db.officials.reduce((sum, o) => sum + o.cash_custody, 0);
  const totalVisaCustody = db.officials.reduce((sum, o) => sum + o.visa_custody, 0);

  // Chart Data 1: Company Distribution
  const companyCounts: Record<string, number> = {};
  db.cars.forEach(car => {
    const comp = car.owner_company || 'أخرى';
    companyCounts[comp] = (companyCounts[comp] || 0) + 1;
  });

  const pieData = Object.keys(companyCounts).map(name => ({
    name,
    value: companyCounts[name]
  }));

  const COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Chart Data 2: Drivers Balances (Dues)
  const driverBalancesData = db.drivers
    .filter(d => d.balance > 0)
    .map(d => ({
      name: d.name.split(' ')[0] + ' ' + (d.name.split(' ')[1] || ''),
      'المستحقات': d.balance
    }));

  // Chart Data 3: Custody statistics for each supervisor
  const officialsCustodyData = db.officials.map(o => ({
    name: o.name,
    'نقدي': o.cash_custody,
    'فيزا': o.visa_custody
  }));

  return (
    <div className="space-y-6" id="dashboard_analytics_container" style={{ direction: 'rtl' }}>
      
      {/* Real-time DB Pulse block */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="flex h-3 w-3 absolute -top-0.5 -right-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-duration-1000"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-700">
              <Smartphone className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              لوحة التحكم والمراقبة المالية والميدانية لشركة البنا جروب
            </h2>
            <p className="text-xs text-slate-400">
              مزامنة مستمرة مع PostgreSQL • زمن الاستجابة الحالي: {db.latencyMs} مللي ثانية 
            </p>
          </div>
        </div>
        <div className="text-xs font-semibold bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          مقر عمل سحابي آمن (Supabase Active)
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800/80 shadow-lg flex items-center justify-between hover:border-slate-700/60 transition-colors">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium block">إجمالي أسطول السيارات</span>
            <span className="text-2xl font-black text-slate-100 font-mono">{totalCars}</span>
            <div className="text-[10px] text-emerald-450 font-medium">سيارات مخصصة لشاحنات وتراخيص</div>
          </div>
          <div className="bg-emerald-500/10 text-emerald-400 p-3.5 rounded-xl border border-emerald-505/10">
            <Car className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800/80 shadow-lg flex items-center justify-between hover:border-slate-700/60 transition-colors">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium block">إجمالي المخالفات المسجلة</span>
            <span className="text-2xl font-black text-rose-500 font-mono">{totalViolationsAmount.toLocaleString()} <span className="text-xs font-bold text-rose-400">ج.م</span></span>
            <div className="text-[10px] text-slate-400 font-medium">مستحقة الخصم التدريجي</div>
          </div>
          <div className="bg-rose-500/10 text-rose-450 p-3.5 rounded-xl border border-rose-505/10">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800/80 shadow-lg flex items-center justify-between hover:border-slate-700/60 transition-colors">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium block">العهد المالية الإجمالية</span>
            <span className="text-xl font-black text-sky-400 font-mono">{(totalCashCustody + totalVisaCustody).toLocaleString()} <span className="text-xs">ج.م</span></span>
            <div className="text-[10px] text-slate-400 font-medium">
              نقدي: {totalCashCustody.toLocaleString()} | فيزا: {totalVisaCustody.toLocaleString()}
            </div>
          </div>
          <div className="bg-sky-500/10 text-sky-400 p-3.5 rounded-xl border border-sky-505/10">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800/80 shadow-lg flex items-center justify-between hover:border-slate-700/60 transition-colors">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium block">تراخيص منتهية / قاربت</span>
            <span className="text-2xl font-black text-amber-550 font-mono">{expiredCars} <span className="text-xs font-normal text-slate-500">/ {nearExpiredCars}</span></span>
            <div className="text-[10px] text-rose-500 font-medium">تتطلب فحص مروري فوري</div>
          </div>
          <div className="bg-amber-500/10 text-amber-450 p-3.5 rounded-xl border border-amber-505/10">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Interactive Charts Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 1: Custodies and Supervisors */}
        <div className="lg:col-span-8 bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-100 text-sm md:text-base flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                توزيع العهد والسيولة المالية للمسؤولين
              </h3>
              <p className="text-xs text-slate-400">مقارنة السيولة المتوفرة بالعهد النقدية والفيزا</p>
            </div>
          </div>
          <div className="h-64 min-h-[250px] w-full min-w-0 text-xs font-mono">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={officialsCustodyData}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" tickSize={6} axisLine={false} />
                <YAxis stroke="#64748b" axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#f1f5f9' }} labelStyle={{ color: '#94a3b8' }} cursor={{ fill: '#1e293b' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 10 }} />
                <Bar dataKey="نقدي" name="💵 عهدة كاش" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="فيزا" name="💳 عهدة فيزا كارد" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Company Vehicles Split */}
        <div className="lg:col-span-4 bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col justify-between">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-450" />
              توزيع ملكية الأسطول بالشركات
            </h3>
            <p className="text-xs text-slate-400 text-right">عدد الشاحنات المملوكة لكل فرع</p>
          </div>

          <div className="h-44 min-h-[170px] w-full min-w-0 relative my-2 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#f1f5f9' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center bg-slate-900/10 p-1 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">إجمالي الملكية</span>
              <span className="text-sm font-black text-slate-100 font-mono">{totalCars} سيارة</span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            {pieData.map((v, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span className="text-slate-400 truncate max-w-[150px]">{v.name}</span>
                </div>
                <span className="font-bold text-slate-200 font-mono">{v.value} سيارة</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Chart 3: Driver dues breakdown bar charts */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
        <h3 className="font-bold text-slate-100 text-sm md:text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-rose-450" />
          تقرير مجمع لمديونية ومخالفات السائقين (الخصومات المتبقية)
        </h3>
        <p className="text-xs text-slate-400">المبالغ المالية الجارية المطلوب جدولتها والخصم الفردي/الجماعي لها</p>

        {driverBalancesData.length > 0 ? (
          <div className="h-60 min-h-[240px] w-full min-w-0 text-xs font-mono">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={driverBalancesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#f1f5f9' }} cursor={{ fill: '#1e293b' }} />
                <Bar dataKey="المستحقات" name="مستحق الخصم (ج.م)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500 text-xs shadow-inner rounded-xl bg-slate-950/50 border border-slate-800">
            لا توجد مديونيات أو مخالفات نشطة على السائقين حاليًا. جميع الحسابات متزنة 🌴
          </div>
        )}
      </div>

    </div>
  );
};

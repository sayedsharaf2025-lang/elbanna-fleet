/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { TransportRequest } from '../types';
import {
  Send,
  Search,
  PackagePlus,
  ClipboardList,
  Truck,
  MapPin,
  Calendar,
  User,
  CheckCircle,
  Hourglass,
  PackageCheck,
  Hash,
  FileText,
  Info
} from 'lucide-react';

export function TransportRequestsTab() {
  const db = useDb();
  const [activeSubTab, setActiveSubTab] = useState<'new_request' | 'track_status'>('new_request');

  // New Request Form State
  const [requesterName, setRequesterName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [carType, setCarType] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split('T')[0]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lastRequestNumber, setLastRequestNumber] = useState<string | null>(null);

  // Track Status search state
  const [searchQuery, setSearchQuery] = useState('');

  // نوع السيارة: مقترحات من أنواع السيارات المسجلة فعليًا بالأسطول لضمان تطابق الفلترة لاحقًا
  const carTypeOptions = Array.from(
    new Set(db.cars.map(c => (c.car_type || '').trim()).filter(Boolean))
  ).sort();

  const resetForm = () => {
    setRequesterName('');
    setFarmName('');
    setCarType('');
    setCargoDescription('');
    setRequestDate(new Date().toISOString().split('T')[0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requesterName.trim() || !farmName.trim() || !carType.trim() || !requestDate) return;

    const newReq = db.addTransportRequest({
      requester_name: requesterName.trim(),
      farm_name: farmName.trim(),
      car_type: carType.trim(),
      cargo_description: cargoDescription.trim(),
      request_date: requestDate
    });

    setLastRequestNumber(newReq.request_number);
    setSuccessMsg(`تم تسجيل طلب النقل بنجاح، رقم الطلب: ${newReq.request_number}`);
    resetForm();
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  const statusInfo = (status: TransportRequest['status']) => {
    if (status === 'new') {
      return { label: 'جديد - بانتظار سيارة', color: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Hourglass };
    }
    if (status === 'in_progress') {
      return { label: 'جاري - تم الرد بسيارة', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', Icon: Truck };
    }
    return { label: 'منتهى - تم التوصيل', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: PackageCheck };
  };

  const trackResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return db.transportRequests
      .filter(r =>
        r.request_number.toLowerCase().includes(q) ||
        r.farm_name.toLowerCase().includes(q) ||
        r.request_date.includes(q)
      )
      .sort((a, b) => b.request_number.localeCompare(a.request_number));
  }, [searchQuery, db.transportRequests]);

  const carAndDriverLabel = (r: TransportRequest) => {
    if (!r.assigned_car_id) return null;
    const car = db.cars.find(c => c.id === r.assigned_car_id);
    const drv = db.drivers.find(d => d.id === r.assigned_driver_id);
    return { carNumber: car?.car_number || '-', driverName: drv?.name || 'غير محدد' };
  };

  return (
    <div className="space-y-6" id="transport_requests_tab" style={{ direction: 'rtl' }}>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 tracking-wider block uppercase mb-1">بوابة الحركة الميدانية</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 font-sans tracking-tight">طلبات النقل</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">تسجيل طلب نقل جديد من إحدى المزارع، ومتابعة حالة الطلبات السابقة أولًا بأول.</p>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 self-start md:self-center">
          <button
            type="button"
            onClick={() => setActiveSubTab('new_request')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'new_request' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <PackagePlus className="w-3.5 h-3.5" /> طلب نقل جديد
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('track_status')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'track_status' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Search className="w-3.5 h-3.5" /> متابعة حالة الطلب
          </button>
        </div>
      </div>

      {/* Sub-tab A: New Request Form */}
      {activeSubTab === 'new_request' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 h-fit">
            <div className="border-b border-slate-50 pb-2.5">
              <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-1.5">
                <Send className="w-5 h-5 text-emerald-500" />
                تسجيل طلب نقل جديد
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">يصل الطلب فورًا لمشرف الحركة ليتم الرد عليه بسيارة مناسبة.</p>
            </div>

            {successMsg && (
              <div className="p-3.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 flex items-center gap-2.5 text-xs font-bold animate-pulse">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">اسم الطالب</label>
                <input
                  type="text"
                  required
                  placeholder="اسم الشخص المسؤول عن طلب النقل"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">المزرعة (مكان الطلب)</label>
                <input
                  type="text"
                  required
                  list="farms-datalist"
                  placeholder="اكتب اسم المزرعة أو اختر من المقترحات"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-slate-50/50"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  autoComplete="off"
                />
                <datalist id="farms-datalist">
                  {db.farms.map(f => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">نوع السيارة المطلوبة</label>
                <input
                  type="text"
                  required
                  list="car-types-datalist"
                  placeholder="مثال: جامبو / دبابة / ملاكي"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
                  value={carType}
                  onChange={(e) => setCarType(e.target.value)}
                  autoComplete="off"
                />
                <datalist id="car-types-datalist">
                  {carTypeOptions.map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">يُستخدم هذا النوع لفلترة السيارات المتاحة عند رد مشرف الحركة على الطلب، لذا يُفضل اختيار نوع مطابق لأنواع السيارات المسجلة بالأسطول.</p>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">وصف الحمولة</label>
                <textarea
                  rows={3}
                  placeholder="وصف مختصر لطبيعة الحمولة المطلوب نقلها"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                  value={cargoDescription}
                  onChange={(e) => setCargoDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">تاريخ الطلب</label>
                <input
                  type="date"
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                إرسال طلب النقل
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 space-y-4">
            {lastRequestNumber && (
              <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-emerald-500" />
                  آخر رقم طلب مسجل
                </h4>
                <p className="text-2xl font-black text-emerald-600 font-mono tracking-wide">{lastRequestNumber}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">احتفظ بهذا الرقم لمتابعة حالة الطلب لاحقًا من تبويب "متابعة حالة الطلب".</p>
              </div>
            )}

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-500" />
                خطوات معالجة الطلب
              </h4>
              <div className="space-y-2 text-[11px] text-slate-500 leading-relaxed">
                <p><span className="font-black text-amber-600">1. جديد:</span> تم تسجيل الطلب وهو بانتظار رد مشرف الحركة بسيارة مناسبة.</p>
                <p><span className="font-black text-indigo-600">2. جاري:</span> تم تخصيص سيارة وسائق للطلب وجاري التوصيل.</p>
                <p><span className="font-black text-emerald-600">3. منتهى:</span> تم توصيل الحمولة بنجاح وأُغلق الطلب.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab B: Track Request Status */}
      {activeSubTab === 'track_status' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-1.5">
              <Search className="w-5 h-5 text-emerald-500" />
              متابعة حالة الطلب
            </h3>
            <input
              type="text"
              placeholder="ابحث برقم الطلب، أو اسم المزرعة، أو تاريخ الطلب (مثال: 2608-0001 أو مزرعة الوادي أو 2026-08)"
              className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {searchQuery.trim() === '' && (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-xs font-bold">
              اكتب رقم الطلب أو اسم المزرعة أو التاريخ لعرض نتائج المتابعة.
            </div>
          )}

          {searchQuery.trim() !== '' && trackResults.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-xs font-bold">
              لا توجد طلبات مطابقة لبحثك.
            </div>
          )}

          <div className="space-y-3">
            {trackResults.map(r => {
              const st = statusInfo(r.status);
              const StIcon = st.Icon;
              const assigned = carAndDriverLabel(r);
              return (
                <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-mono font-black text-slate-800 text-sm flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-slate-400" />
                      {r.request_number}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${st.color}`}>
                      <StIcon className="w-3 h-3" /> {st.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-500">
                    <p className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-400" /> {r.requester_name}</p>
                    <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {r.farm_name}</p>
                    <p className="flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-slate-400" /> {r.car_type}</p>
                    <p className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-slate-400" /> {r.request_date}</p>
                  </div>
                  {r.cargo_description && (
                    <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" /> {r.cargo_description}
                    </p>
                  )}
                  {assigned && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-50 text-[11px] text-slate-600 font-bold flex flex-wrap gap-3">
                      <span>🚚 السيارة: {assigned.carNumber}</span>
                      <span>🧑‍✈️ السائق: {assigned.driverName}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

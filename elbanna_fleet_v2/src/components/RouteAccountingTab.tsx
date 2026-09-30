/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { TransportRequest } from '../types';
import {
  Search,
  CalendarDays,
  Route,
  Truck,
  User,
  Gauge,
  Fuel,
  ClipboardList,
  X,
  ArrowLeft,
  Save,
  Sparkles,
  CreditCard,
  AlertTriangle,
  Droplets,
  Wrench,
  CheckCircle,
  Printer,
} from 'lucide-react';

// المرحلة 2 من تطوير نظام طلبات النقل: شاشة "حساب خطوط السير"
// بحث بالسائق أو السيارة + فلتر تاريخ، وعرض كل الطلبات المرتبطة مرتبة حسب التاريخ بتفاصيلها
export function RouteAccountingTab() {
  const db = useDb();

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const driverNameFor = (driverId?: string) => {
    if (!driverId) return '';
    return db.drivers.find(d => d.id === driverId)?.name || '';
  };

  const carFor = (carId?: string) => {
    if (!carId) return undefined;
    return db.cars.find(c => c.id === carId);
  };

  const costFor = (requestId: string) => db.transportRequestCosts.find(c => c.request_id === requestId);

  // الطلبات المؤهلة لحساب خطوط السير هي اللي اترد عليها بسيارة (جارية أو منتهية) — لأن اسم
  // السائق ورقم السيارة مطلوبين أساسًا في الجدول
  const eligibleRequests = useMemo(
    () => db.transportRequests.filter(r => !!r.assigned_car_id),
    [db.transportRequests]
  );

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return eligibleRequests
      .filter(r => {
        if (dateFrom && r.request_date < dateFrom) return false;
        if (dateTo && r.request_date > dateTo) return false;
        if (!term) return true;
        const car = carFor(r.assigned_car_id);
        const driverName = driverNameFor(r.assigned_driver_id).toLowerCase();
        const carNumber = (car?.car_number || '').toLowerCase();
        return driverName.includes(term) || carNumber.includes(term);
      })
      .sort((a, b) => (b.request_date < a.request_date ? -1 : b.request_date > a.request_date ? 1 : b.request_number.localeCompare(a.request_number)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleRequests, searchTerm, dateFrom, dateTo, db.cars, db.drivers]);

  const totals = useMemo(() => {
    let freight = 0;
    let smoke = 0;
    let others = 0;
    let entered = 0;
    filteredRequests.forEach(r => {
      const cost = costFor(r.id);
      if (cost) {
        entered += 1;
        freight += cost.freight_amount || 0;
        smoke += cost.smoke_amount || 0;
        others += (cost.cards_amount || 0) + (cost.violations_amount || 0) + (cost.tire_wash_amount || 0) + (cost.maintenance_amount || 0)
          + (cost.extra_costs || []).reduce((sum, i) => sum + (i.amount || 0), 0);
      }
    });
    return { freight, smoke, others, entered, grand: freight + smoke + others };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRequests, db.transportRequestCosts]);

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
  };

  // طباعة كشف تكلفة لخط سير أو سائق معين — بيطبع بالظبط النتائج الظاهرة حاليًا حسب البحث والفلاتر
  const handlePrintStatement = () => {
    const rows = filteredRequests.map(r => {
      const car = carFor(r.assigned_car_id);
      const driverName = driverNameFor(r.assigned_driver_id) || '-';
      const cost = costFor(r.id);
      const others = cost ? (cost.cards_amount || 0) + (cost.violations_amount || 0) + (cost.tire_wash_amount || 0) + (cost.maintenance_amount || 0)
        + (cost.extra_costs || []).reduce((s, i) => s + (i.amount || 0), 0) : 0;
      const total = cost ? (cost.smoke_amount || 0) + (cost.freight_amount || 0) + others : 0;
      return { r, car, driverName, cost, others, total };
    });
    const grandTotal = rows.reduce((s, x) => s + x.total, 0);
    const filterLabel = [
      searchTerm ? `بحث: ${searchTerm}` : '',
      dateFrom ? `من: ${dateFrom}` : '',
      dateTo ? `إلى: ${dateTo}` : '',
    ].filter(Boolean).join(' — ') || 'كل الطلبات';

    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
      <meta charset="UTF-8">
      <title>كشف حساب خطوط السير</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Calibri', 'Cairo', Arial, sans-serif; direction: rtl; background: #fff; color: #111; font-size: 12px; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: center; }
        th { background: #f1f5f9; font-weight: 900; }
        tfoot td { font-weight: 900; background: #f8fafc; }
        .route { text-align: right; }
        @media print { body { padding: 0; } }
      </style>
      </head>
      <body>
        <h1>كشف حساب خطوط السير</h1>
        <div class="sub">${filterLabel} — تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')} — عدد النقلات: ${rows.length}</div>
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>خط السير</th>
              <th>السائق</th>
              <th>السيارة</th>
              <th>المسافة</th>
              <th>الدخان</th>
              <th>النولون</th>
              <th>بنود أخرى</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x => `
              <tr>
                <td>${x.r.request_date}</td>
                <td class="route">${x.r.farm_name} ← ${x.cost?.to_location || '-'}</td>
                <td>${x.driverName}</td>
                <td>${x.car?.car_number || '-'}</td>
                <td>${x.cost ? x.cost.distance_km.toLocaleString() + ' كم' : '-'}</td>
                <td>${x.cost ? x.cost.smoke_amount.toLocaleString() : '-'}</td>
                <td>${x.cost ? x.cost.freight_amount.toLocaleString() : '-'}</td>
                <td>${x.cost ? x.others.toLocaleString() : '-'}</td>
                <td>${x.cost ? x.total.toLocaleString() : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="8">الإجمالي الكلي</td>
              <td>${grandTotal.toLocaleString()} ج.م</td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="space-y-6" id="route_accounting_tab_view" style={{ direction: 'rtl' }}>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">الإدارة المالية</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight">حساب خطوط السير</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            مراجعة تكلفة كل نقلة: الدخان، النولون، والبنود اليدوية — دوس على أي طلب لاستكمال أو مراجعة بياناته.
          </p>
        </div>
      </div>

      {toastMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-bold animate-fade-in">
          <CheckCircle className="w-4 h-4 shrink-0" /> {toastMsg}
        </div>
      )}

      {/* Search + Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,180px,180px,auto,auto] gap-3">
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> البحث بالسائق أو رقم السيارة
            </label>
            <input
              type="text"
              placeholder="اكتب اسم السائق أو رقم السيارة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> من تاريخ
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> إلى تاريخ
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg transition-all flex items-center gap-1.5 justify-center"
            >
              <X className="w-3.5 h-3.5" /> مسح الفلاتر
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handlePrintStatement}
              disabled={filteredRequests.length === 0}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all flex items-center gap-1.5 justify-center"
            >
              <Printer className="w-3.5 h-3.5" /> طباعة كشف
            </button>
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">عدد النقلات الظاهرة</p>
          <p className="text-lg font-black text-slate-800">{filteredRequests.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">بيانات مستكملة</p>
          <p className="text-lg font-black text-emerald-600">{totals.entered} / {filteredRequests.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي النولون</p>
          <p className="text-lg font-black text-indigo-600">{totals.freight.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي كل التكاليف</p>
          <p className="text-lg font-black text-slate-800">{totals.grand.toLocaleString()} ج.م</p>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto text-xs font-sans">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <th className="py-3 px-3">التاريخ</th>
                <th className="py-3 px-3">رقم الطلب</th>
                <th className="py-3 px-3">خط السير (من ← إلى)</th>
                <th className="py-3 px-3">السائق</th>
                <th className="py-3 px-3">السيارة</th>
                <th className="py-3 px-3">المسافة</th>
                <th className="py-3 px-3">نولون السيارة</th>
                <th className="py-3 px-2 text-center w-32">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(r => {
                const car = carFor(r.assigned_car_id);
                const driverName = driverNameFor(r.assigned_driver_id) || 'بدون سائق مرتبط';
                const cost = costFor(r.id);
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70 text-slate-700">
                    <td className="py-2.5 px-3 font-mono text-slate-500">{r.request_date}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{r.request_number}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                      <Route className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      {r.farm_name} ← {cost?.to_location || <span className="text-slate-400 italic font-normal">لم تُحدد بعد</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 font-bold"><User className="w-3.5 h-3.5 text-slate-400" /> {driverName}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 font-bold"><Truck className="w-3.5 h-3.5 text-slate-400" /> {car?.car_number || '-'} <span className="text-slate-400 font-normal">({car?.car_type || '-'})</span></span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {cost ? <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-slate-400" /> {cost.distance_km.toLocaleString()} كم</span> : <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {cost ? <span className="flex items-center gap-1 text-indigo-600 font-bold"><Fuel className="w-3.5 h-3.5" /> {cost.freight_amount.toLocaleString()} ج.م</span> : <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => setEditingRequestId(r.id)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 mx-auto transition-all ${cost ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                      >
                        {cost ? 'مراجعة البيانات' : 'استكمال البيانات'} <ArrowLeft className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    لا توجد طلبات نقل مطابقة لعوامل البحث أو الفلترة الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* شاشة استكمال تفاصيل الطلب (المرحلة 3) */}
      {editingRequestId && (() => {
        const req = db.transportRequests.find(r => r.id === editingRequestId);
        if (!req) return null;
        return (
          <RequestCostCompletionModal
            request={req}
            onClose={() => setEditingRequestId(null)}
            onSaved={() => {
              setEditingRequestId(null);
              showToast('تم حفظ تكلفة النقلة بنجاح.');
            }}
          />
        );
      })()}
    </div>
  );
}

// ====== المرحلة 3: شاشة استكمال تفاصيل تكلفة الطلب (تفتح بالدوس على الصف، وتقفل بعد الحفظ) ======
function RequestCostCompletionModal({
  request,
  onClose,
  onSaved,
}: {
  request: TransportRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const db = useDb();
  const car = db.cars.find(c => c.id === request.assigned_car_id);
  const driver = db.drivers.find(d => d.id === request.assigned_driver_id);
  const existing = db.transportRequestCosts.find(c => c.request_id === request.id);

  const [toLocation, setToLocation] = useState(existing?.to_location || '');
  const [distanceKm, setDistanceKm] = useState(existing ? String(existing.distance_km) : '');
  const [smokeAmount, setSmokeAmount] = useState(existing ? String(existing.smoke_amount) : '');
  const [freightAmount, setFreightAmount] = useState(existing ? String(existing.freight_amount) : '');
  const [cardsAmount, setCardsAmount] = useState(existing ? String(existing.cards_amount) : '');
  const [violationsAmount, setViolationsAmount] = useState(existing ? String(existing.violations_amount) : '');
  const [tireWashAmount, setTireWashAmount] = useState(existing ? String(existing.tire_wash_amount) : '');
  const [maintenanceAmount, setMaintenanceAmount] = useState(existing ? String(existing.maintenance_amount) : '');
  const [extraAmounts, setExtraAmounts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (existing?.extra_costs || []).forEach(i => { map[i.item_id] = String(i.amount); });
    return map;
  });
  const [formError, setFormError] = useState<string | null>(null);

  // خط السير المطابق (من مكان الطلب "farm_name" إلى الوجهة المكتوبة) — لو موجود في اللائحة نقترح قيمه
  const matchedRoute = db.routePriceList.find(
    r => r.from_location.trim() === request.farm_name.trim() && r.to_location.trim() === toLocation.trim()
  );

  const suggestedFreight = (() => {
    const dist = parseFloat(distanceKm || '0');
    const rate = car?.car_type ? (db.vehicleFreightRates[car.car_type] || 0) : 0;
    if (!dist || !rate) return null;
    return Math.round(dist * rate * 100) / 100;
  })();

  const applyRouteSuggestion = () => {
    if (!matchedRoute) return;
    setDistanceKm(String(matchedRoute.distance_km || 0));
    setSmokeAmount(String(matchedRoute.smoke_amount || 0));
  };

  const applyFreightSuggestion = () => {
    if (suggestedFreight === null) return;
    setFreightAmount(String(suggestedFreight));
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const total = num(smokeAmount) + num(freightAmount) + num(cardsAmount) + num(violationsAmount) + num(tireWashAmount) + num(maintenanceAmount)
    + Object.values(extraAmounts).reduce((sum, v) => sum + num(v), 0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toLocation.trim()) {
      setFormError('يرجى تحديد "إلى" — نهاية خط السير — قبل الحفظ');
      return;
    }
    const extra_costs = db.costItemTypes
      .map(item => ({ item_id: item.id, item_name: item.name, amount: num(extraAmounts[item.id] || '0') }))
      .filter(i => i.amount > 0);

    db.upsertTransportRequestCost(request.id, {
      to_location: toLocation.trim(),
      distance_km: num(distanceKm),
      smoke_amount: num(smokeAmount),
      freight_amount: num(freightAmount),
      cards_amount: num(cardsAmount),
      violations_amount: num(violationsAmount),
      tire_wash_amount: num(tireWashAmount),
      maintenance_amount: num(maintenanceAmount),
      extra_costs,
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden text-right max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white p-4 flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <Route className="w-6 h-6" />
            <div>
              <h4 className="font-extrabold text-sm md:text-base">استكمال تكلفة النقلة — طلب {request.request_number}</h4>
              <p className="text-[10px] text-indigo-100">
                {request.farm_name} — {driver?.name || 'بدون سائق'} — {car?.car_number || '-'} ({car?.car_type || '-'}) — {request.request_date}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs font-sans overflow-y-auto">
          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {formError}
            </div>
          )}

          {/* خط السير + المسافة + الدخان */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
            <h5 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Route className="w-4 h-4 text-amber-500" /> خط السير</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 font-bold mb-1">من</label>
                <input type="text" disabled value={request.farm_name} className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-bold cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">إلى *</label>
                <input
                  type="text"
                  list="route-destinations-datalist"
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                  placeholder="اكتب أو اختر الوجهة..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-bold"
                />
                <datalist id="route-destinations-datalist">
                  {Array.from(new Set(db.routePriceList.map(r => r.to_location))).map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
            </div>

            {matchedRoute && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between gap-2 text-amber-800 font-bold">
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> القيم المقترحة من الإعدادات: {matchedRoute.distance_km} كم — دخان {matchedRoute.smoke_amount} ج.م</span>
                <button type="button" onClick={applyRouteSuggestion} className="bg-amber-500 hover:bg-amber-400 text-white px-2.5 py-1 rounded text-[10px] shrink-0">تطبيق</button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> المسافة المقطوعة (كم)</label>
                <input
                  type="number" step="0.1" min="0"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">الدخان (ج.م)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={smokeAmount}
                  onChange={(e) => setSmokeAmount(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono"
                />
              </div>
            </div>
          </div>

          {/* النولون */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5">
            <h5 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Fuel className="w-4 h-4 text-indigo-500" /> نولون السيارة</h5>
            {suggestedFreight !== null && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 flex items-center justify-between gap-2 text-indigo-800 font-bold">
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> القيمة المقترحة: {suggestedFreight.toLocaleString()} ج.م (المسافة × سعر نوع "{car?.car_type}")</span>
                <button type="button" onClick={applyFreightSuggestion} className="bg-indigo-500 hover:bg-indigo-400 text-white px-2.5 py-1 rounded text-[10px] shrink-0">تطبيق</button>
              </div>
            )}
            {!car?.car_type || !db.vehicleFreightRates[car.car_type] ? (
              <p className="text-[10px] text-slate-400 italic">لا يوجد سعر نولون للكيلومتر مسجل لنوع السيارة "{car?.car_type || '-'}" في الإعدادات — أدخل المبلغ يدويًا.</p>
            ) : null}
            <div>
              <label className="block text-slate-500 font-bold mb-1">مبلغ النولون (ج.م)</label>
              <input
                type="number" step="0.01" min="0"
                value={freightAmount}
                onChange={(e) => setFreightAmount(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono font-bold"
              />
            </div>
          </div>

          {/* البنود اليدوية */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
            <h5 className="font-extrabold text-slate-700 flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-slate-500" /> بنود إضافية (إدخال يدوي)</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> كارتات</label>
                <input type="number" step="0.01" min="0" value={cardsAmount} onChange={(e) => setCardsAmount(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> مخالفات</label>
                <input type="number" step="0.01" min="0" value={violationsAmount} onChange={(e) => setViolationsAmount(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> غسيل كاوتش</label>
                <input type="number" step="0.01" min="0" value={tireWashAmount} onChange={(e) => setTireWashAmount(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> صيانة</label>
                <input type="number" step="0.01" min="0" value={maintenanceAmount} onChange={(e) => setMaintenanceAmount(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
              </div>
            </div>

            {db.costItemTypes.length > 0 && (
              <div className="pt-2 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3">
                {db.costItemTypes.map(item => (
                  <div key={item.id}>
                    <label className="block text-slate-500 font-bold mb-1">{item.name}</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={extraAmounts[item.id] || ''}
                      onChange={(e) => setExtraAmounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الإجمالي */}
          <div className="bg-slate-800 text-white rounded-xl p-4 flex items-center justify-between">
            <span className="font-extrabold text-sm">إجمالي تكلفة النقلة</span>
            <span className="font-black text-xl font-mono">{total.toLocaleString()} ج.م</span>
          </div>

          <div className="pt-1 grid grid-cols-2 gap-3">
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-bold transition-all text-center shadow-md flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4" /> حفظ والعودة للطلبات
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 px-4 rounded-xl font-bold transition-all text-center"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

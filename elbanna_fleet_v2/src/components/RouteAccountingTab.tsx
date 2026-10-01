/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { TransportRequest, TransportRouteLeg, Car } from '../types';
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
  Plus,
  Trash2,
  MapPin,
  Undo2,
} from 'lucide-react';

const num = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const legsTotal = (legs: TransportRouteLeg[]) => ({
  distance: legs.reduce((s, l) => s + (l.distance_km || 0), 0),
  smoke: legs.reduce((s, l) => s + (l.smoke_amount || 0), 0),
  freight: legs.reduce((s, l) => s + (l.freight_amount || 0), 0),
});

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
        const t = legsTotal(cost.legs);
        freight += t.freight;
        smoke += t.smoke;
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
      const t = cost ? legsTotal(cost.legs) : { distance: 0, smoke: 0, freight: 0 };
      const others = cost ? (cost.cards_amount || 0) + (cost.violations_amount || 0) + (cost.tire_wash_amount || 0) + (cost.maintenance_amount || 0)
        + (cost.extra_costs || []).reduce((s, i) => s + (i.amount || 0), 0) : 0;
      const total = cost ? t.smoke + t.freight + others : 0;
      const routeLabel = cost && cost.legs.length > 0
        ? [cost.legs[0].from_location, ...cost.legs.map(l => l.to_location)].join(' ← ')
        : '-';
      return { r, car, driverName, cost, t, others, total, routeLabel };
    });
    const grandTotal = rows.reduce((s, x) => s + x.total, 0);
    const filterLabel = [
      searchTerm ? `بحث: ${searchTerm}` : '',
      dateFrom ? `من: ${dateFrom}` : '',
      dateTo ? `إلى: ${dateTo}` : '',
    ].filter(Boolean).join(' — ') || 'كل الطلبات';

    const win = window.open('', '_blank', 'width=1100,height=700');
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
                <td class="route">${x.routeLabel}</td>
                <td>${x.driverName}</td>
                <td>${x.car?.car_number || '-'}</td>
                <td>${x.cost ? x.t.distance.toLocaleString() + ' كم' : '-'}</td>
                <td>${x.cost ? x.t.smoke.toLocaleString() : '-'}</td>
                <td>${x.cost ? x.t.freight.toLocaleString() : '-'}</td>
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
                <th className="py-3 px-3">خط السير</th>
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
                const t = cost ? legsTotal(cost.legs) : null;
                const routeLabel = cost && cost.legs.length > 0
                  ? [cost.legs[0].from_location, ...cost.legs.map(l => l.to_location)].join(' ← ')
                  : null;
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70 text-slate-700">
                    <td className="py-2.5 px-3 font-mono text-slate-500">{r.request_date}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{r.request_number}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <Route className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        {routeLabel || <span className="text-slate-400 italic font-normal">{r.farm_name} ← لم تُحدد بعد</span>}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 font-bold"><User className="w-3.5 h-3.5 text-slate-400" /> {driverName}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 font-bold"><Truck className="w-3.5 h-3.5 text-slate-400" /> {car?.car_number || '-'} <span className="text-slate-400 font-normal">({car?.car_type || '-'})</span></span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {t ? <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-slate-400" /> {t.distance.toLocaleString()} كم</span> : <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {t ? <span className="flex items-center gap-1 text-indigo-600 font-bold"><Fuel className="w-3.5 h-3.5" /> {t.freight.toLocaleString()} ج.م</span> : <span className="text-slate-400 italic">-</span>}
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

// بيحسب نقطة بداية الرحلة المقترحة لطلب معين: آخر نقطة وصلت لها نفس السيارة في نفس اليوم
// (من أقرب طلب سابق ليه سجل تكلفة)، أو جراج السيارة، أو نقطة البداية الافتراضية العامة
function computeSuggestedStart(
  db: ReturnType<typeof useDb>,
  car: Car | undefined,
  request: TransportRequest
): { location: string; source: 'previous_trip' | 'car_garage' | 'default' } {
  if (car) {
    const priorSiblings = db.transportRequests
      .filter(r => r.assigned_car_id === car.id && r.request_date === request.request_date && r.id !== request.id && r.request_number < request.request_number)
      .map(r => ({ r, cost: db.transportRequestCosts.find(c => c.request_id === r.id) }))
      .filter((x): x is { r: TransportRequest; cost: NonNullable<typeof x.cost> } => !!x.cost && x.cost.legs.length > 0)
      .sort((a, b) => b.r.request_number.localeCompare(a.r.request_number));
    if (priorSiblings.length > 0) {
      const lastLeg = priorSiblings[0].cost.legs[priorSiblings[0].cost.legs.length - 1];
      return { location: lastLeg.to_location, source: 'previous_trip' };
    }
  }
  if (car?.garage_location?.trim()) {
    return { location: car.garage_location.trim(), source: 'car_garage' };
  }
  return { location: db.defaultGarageLocation, source: 'default' };
}

type EditableLeg = { id: string; to: string; distance: string; smoke: string; freight: string };

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

  const suggestion = useMemo(() => computeSuggestedStart(db, car, request), [db, car, request]);

  // لو فيه سجل محفوظ بالفعل، أول محطة فيه هي "من" الحقيقية. غير كده نستخدم النقطة المقترحة.
  const [startLocation, setStartLocation] = useState(existing?.legs[0]?.from_location || suggestion.location);

  // المحطة الأولى (من البداية لمزرعة الطالب) — ثابتة الوجهة، لكن المسافة/الدخان/النولون بتتعدل
  const firstDestination = request.farm_name;
  const [leg1Distance, setLeg1Distance] = useState(existing?.legs[0] ? String(existing.legs[0].distance_km) : '');
  const [leg1Smoke, setLeg1Smoke] = useState(existing?.legs[0] ? String(existing.legs[0].smoke_amount) : '');
  const [leg1Freight, setLeg1Freight] = useState(existing?.legs[0] ? String(existing.legs[0].freight_amount) : '');

  // محطات إضافية بعد مزرعة الطالب (اختيارية) — بتستبعد آخر محطة لو كانت رجوع تلقائي محفوظ قبل كده
  const initialExtraLegs: EditableLeg[] = (() => {
    if (!existing || existing.legs.length <= 1) return [];
    const middle = existing.auto_return ? existing.legs.slice(1, -1) : existing.legs.slice(1);
    return middle.map(l => ({ id: l.id, to: l.to_location, distance: String(l.distance_km), smoke: String(l.smoke_amount), freight: String(l.freight_amount) }));
  })();
  const [extraLegs, setExtraLegs] = useState<EditableLeg[]>(initialExtraLegs);
  const [autoReturn, setAutoReturn] = useState(existing ? existing.auto_return : true);

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

  // تنبيه: هل في نقلة سابقة لنفس السيارة نفس اليوم محطوطة على "رجوع تلقائي" رغم إن ده
  // مش آخر نقلة فعليًا؟ (معناه السلسلة متقطعة ومحتاجة تصحيح من النقلة القديمة)
  const brokenChainPredecessor = useMemo(() => {
    if (!car || suggestion.source !== 'car_garage' && suggestion.source !== 'default') return null;
    // لو المقترح جه من "previous_trip" يبقى السلسلة متصلة أصلاً. التنبيه مطلوب بس لو رجعنا
    // لجراج/افتراضي رغم وجود نقلة سابقة نفس اليوم كانت متسجلة بـ auto_return=true
    const priorSiblings = db.transportRequests
      .filter(r => r.assigned_car_id === car.id && r.request_date === request.request_date && r.id !== request.id && r.request_number < request.request_number)
      .map(r => ({ r, cost: db.transportRequestCosts.find(c => c.request_id === r.id) }))
      .filter((x): x is { r: TransportRequest; cost: NonNullable<typeof x.cost> } => !!x.cost && x.cost.legs.length > 0)
      .sort((a, b) => b.r.request_number.localeCompare(a.r.request_number));
    if (priorSiblings.length > 0 && priorSiblings[0].cost.auto_return) {
      return priorSiblings[0];
    }
    return null;
  }, [db, car, request, suggestion.source]);

  const fixBrokenChain = () => {
    if (!brokenChainPredecessor) return;
    const { r: predReq, cost: predCost } = brokenChainPredecessor;
    const newLegs = predCost.legs.slice(0, -1); // نشيل آخر محطة (الرجوع التلقائي القديم)
    db.upsertTransportRequestCost(predReq.id, { ...predCost, legs: newLegs, auto_return: false });
    const newStart = newLegs.length > 0 ? newLegs[newLegs.length - 1].to_location : startLocation;
    setStartLocation(newStart);
  };

  const effectiveGarage = car?.garage_location?.trim() || db.defaultGarageLocation;

  // آخر نقطة فعلية في الرحلة دلوقتي (قبل إضافة محطة العودة التلقائية)
  const lastRealStop = extraLegs.length > 0 ? extraLegs[extraLegs.length - 1].to : firstDestination;

  const findRoute = (from: string, to: string) =>
    db.routePriceList.find(r => r.from_location.trim() === from.trim() && r.to_location.trim() === to.trim());

  const computeFreightSuggestion = (distanceStr: string) => {
    const dist = parseFloat(distanceStr || '0');
    const rate = car?.car_type ? (db.vehicleFreightRates[car.car_type] || 0) : 0;
    if (!dist || !rate) return null;
    return Math.round(dist * rate * 100) / 100;
  };

  // اقتراح المحطة الأولى (البداية → مزرعة الطالب)
  const matchedRouteLeg1 = findRoute(startLocation, firstDestination);
  const suggestedFreightLeg1 = computeFreightSuggestion(leg1Distance);

  // معاينة محطة العودة التلقائية (لو مفعّلة)
  const returnPreview = useMemo(() => {
    if (!autoReturn) return null;
    const matched = findRoute(lastRealStop, effectiveGarage);
    const distance = matched?.distance_km || 0;
    const smoke = matched?.smoke_amount || 0;
    const rate = car?.car_type ? (db.vehicleFreightRates[car.car_type] || 0) : 0;
    const freight = distance && rate ? Math.round(distance * rate * 100) / 100 : 0;
    return { from: lastRealStop, to: effectiveGarage, distance, smoke, freight, matched: !!matched };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReturn, lastRealStop, effectiveGarage, car, db.routePriceList, db.vehicleFreightRates]);

  const addExtraStop = () => {
    setExtraLegs(prev => [...prev, { id: `new_${Date.now()}_${prev.length}`, to: '', distance: '', smoke: '', freight: '' }]);
  };

  const removeExtraStop = (id: string) => {
    setExtraLegs(prev => prev.filter(l => l.id !== id));
  };

  const updateExtraStop = (id: string, field: keyof EditableLeg, value: string) => {
    setExtraLegs(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const applyRouteSuggestionToLeg1 = () => {
    if (!matchedRouteLeg1) return;
    setLeg1Distance(String(matchedRouteLeg1.distance_km || 0));
    setLeg1Smoke(String(matchedRouteLeg1.smoke_amount || 0));
  };

  const applyFreightSuggestionToLeg1 = () => {
    if (suggestedFreightLeg1 === null) return;
    setLeg1Freight(String(suggestedFreightLeg1));
  };

  // إجمالي حي للعرض فوق زرار الحفظ
  const liveTotal = useMemo(() => {
    let freight = num(leg1Freight) + extraLegs.reduce((s, l) => s + num(l.freight), 0);
    let smoke = num(leg1Smoke) + extraLegs.reduce((s, l) => s + num(l.smoke), 0);
    if (returnPreview) { freight += returnPreview.freight; smoke += returnPreview.smoke; }
    const others = num(cardsAmount) + num(violationsAmount) + num(tireWashAmount) + num(maintenanceAmount)
      + Object.values(extraAmounts).reduce((s, v) => s + num(v), 0);
    return freight + smoke + others;
  }, [leg1Freight, leg1Smoke, extraLegs, returnPreview, cardsAmount, violationsAmount, tireWashAmount, maintenanceAmount, extraAmounts]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startLocation.trim()) {
      setFormError('يرجى تحديد نقطة "من" (بداية خط السير)');
      return;
    }
    for (const l of extraLegs) {
      if (!l.to.trim()) {
        setFormError('يرجى تحديد كل محطات الوجهات الإضافية أو حذف الفاضية منها');
        return;
      }
    }

    const legs: TransportRouteLeg[] = [];
    legs.push({
      id: existing?.legs[0]?.id || `leg_${Date.now()}_0`,
      from_location: startLocation.trim(),
      to_location: firstDestination,
      distance_km: num(leg1Distance),
      smoke_amount: num(leg1Smoke),
      freight_amount: num(leg1Freight),
    });
    let prevPoint = firstDestination;
    extraLegs.forEach((l, idx) => {
      legs.push({
        id: l.id.startsWith('new_') ? `leg_${Date.now()}_${idx + 1}` : l.id,
        from_location: prevPoint,
        to_location: l.to.trim(),
        distance_km: num(l.distance),
        smoke_amount: num(l.smoke),
        freight_amount: num(l.freight),
      });
      prevPoint = l.to.trim();
    });
    if (autoReturn && returnPreview) {
      legs.push({
        id: `leg_${Date.now()}_return`,
        from_location: returnPreview.from,
        to_location: returnPreview.to,
        distance_km: returnPreview.distance,
        smoke_amount: returnPreview.smoke,
        freight_amount: returnPreview.freight,
      });
    }

    const extra_costs = db.costItemTypes
      .map(item => ({ item_id: item.id, item_name: item.name, amount: num(extraAmounts[item.id] || '0') }))
      .filter(i => i.amount > 0);

    db.upsertTransportRequestCost(request.id, {
      legs,
      auto_return: autoReturn,
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

          {brokenChainPredecessor && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-2 text-amber-800 font-bold">
              <span className="flex items-center gap-1.5">
                <Undo2 className="w-4 h-4 shrink-0" />
                النقلة رقم {brokenChainPredecessor.r.request_number} كانت متظبطة كآخر نقلة في اليوم لنفس السيارة (رجوع تلقائي). لو ده مش آخر نقلة فعليًا، تقدر تلغي الرجوع منها عشان السلسلة تتظبط.
              </span>
              <button type="button" onClick={fixBrokenChain} className="bg-amber-500 hover:bg-amber-400 text-white px-2.5 py-1.5 rounded text-[10px] shrink-0">إلغاء الرجوع من النقلة دي</button>
            </div>
          )}

          {/* نقطة البداية */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
            <h5 className="font-extrabold text-slate-700 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-amber-500" /> نقطة البداية</h5>
            <input
              type="text"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-bold"
            />
            <p className="text-[10px] text-slate-400">
              {suggestion.source === 'previous_trip' && '🔗 اقترحناها من آخر نقطة وصلت لها نفس السيارة في نقلة سابقة اليوم.'}
              {suggestion.source === 'car_garage' && '🚗 اقترحناها من جراج السيارة المحدد في بياناتها.'}
              {suggestion.source === 'default' && '📍 اقترحناها من نقطة البداية الافتراضية العامة (الإعدادات).'}
              {' '}تقدر تعدلها يدويًا لو مختلفة فعليًا.
            </p>
          </div>

          {/* المحطة الأولى: البداية → مزرعة الطالب */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
            <h5 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Route className="w-4 h-4 text-amber-500" /> المحطة 1: {startLocation || '...'} ← {firstDestination}</h5>

            {matchedRouteLeg1 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between gap-2 text-amber-800 font-bold">
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> القيم المقترحة: {matchedRouteLeg1.distance_km} كم — دخان {matchedRouteLeg1.smoke_amount} ج.م</span>
                <button type="button" onClick={applyRouteSuggestionToLeg1} className="bg-amber-500 hover:bg-amber-400 text-white px-2.5 py-1 rounded text-[10px] shrink-0">تطبيق</button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> المسافة (كم)</label>
                <input type="number" step="0.1" min="0" value={leg1Distance} onChange={(e) => setLeg1Distance(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">الدخان (ج.م)</label>
                <input type="number" step="0.01" min="0" value={leg1Smoke} onChange={(e) => setLeg1Smoke(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1"><Fuel className="w-3.5 h-3.5" /> النولون (ج.م)</label>
                <input type="number" step="0.01" min="0" value={leg1Freight} onChange={(e) => setLeg1Freight(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono font-bold" />
              </div>
            </div>
            {suggestedFreightLeg1 !== null && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 flex items-center justify-between gap-2 text-indigo-800 font-bold">
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> نولون مقترح: {suggestedFreightLeg1.toLocaleString()} ج.م</span>
                <button type="button" onClick={applyFreightSuggestionToLeg1} className="bg-indigo-500 hover:bg-indigo-400 text-white px-2.5 py-1 rounded text-[10px] shrink-0">تطبيق</button>
              </div>
            )}
          </div>

          {/* محطات إضافية */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Route className="w-4 h-4 text-indigo-500" /> وجهات إضافية (اختياري)</h5>
              <button type="button" onClick={addExtraStop} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> إضافة وجهة
              </button>
            </div>

            {extraLegs.map((leg, idx) => {
              const from = idx === 0 ? firstDestination : extraLegs[idx - 1].to || '...';
              const matched = leg.to ? findRoute(from, leg.to) : undefined;
              const freightSug = computeFreightSuggestion(leg.distance);
              return (
                <div key={leg.id} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600">المحطة {idx + 2}: {from} ← {leg.to || '...'}</span>
                    <button type="button" onClick={() => removeExtraStop(leg.id)} className="text-rose-400 hover:text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    list="route-destinations-datalist"
                    placeholder="الوجهة..."
                    value={leg.to}
                    onChange={(e) => updateExtraStop(leg.id, 'to', e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-bold"
                  />
                  {matched && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center justify-between gap-2 text-amber-800 font-bold text-[11px]">
                      <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> {matched.distance_km} كم — دخان {matched.smoke_amount} ج.م</span>
                      <button type="button" onClick={() => { updateExtraStop(leg.id, 'distance', String(matched.distance_km)); updateExtraStop(leg.id, 'smoke', String(matched.smoke_amount)); }} className="bg-amber-500 hover:bg-amber-400 text-white px-2 py-0.5 rounded text-[10px]">تطبيق</button>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" step="0.1" min="0" placeholder="المسافة كم" value={leg.distance} onChange={(e) => updateExtraStop(leg.id, 'distance', e.target.value)} className="p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                    <input type="number" step="0.01" min="0" placeholder="الدخان" value={leg.smoke} onChange={(e) => updateExtraStop(leg.id, 'smoke', e.target.value)} className="p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono" />
                    <input type="number" step="0.01" min="0" placeholder="النولون" value={leg.freight} onChange={(e) => updateExtraStop(leg.id, 'freight', e.target.value)} className="p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 font-mono font-bold" />
                  </div>
                  {freightSug !== null && (
                    <button type="button" onClick={() => updateExtraStop(leg.id, 'freight', String(freightSug))} className="text-indigo-600 text-[10px] font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> تطبيق نولون مقترح: {freightSug.toLocaleString()} ج.م
                    </button>
                  )}
                </div>
              );
            })}
            <datalist id="route-destinations-datalist">
              {Array.from(new Set(db.routePriceList.map(r => r.to_location))).map(t => <option key={t} value={t} />)}
            </datalist>
          </div>

          {/* الرجوع التلقائي */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
            <label className="flex items-center gap-2 font-extrabold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={autoReturn} onChange={(e) => setAutoReturn(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              رجوع تلقائي لنقطة البداية/الجراج بعد آخر محطة (لو دي آخر نقلة للسيارة النهارده)
            </label>
            {autoReturn && returnPreview && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-indigo-800 font-bold text-[11px]">
                محطة العودة اللي هتتضاف تلقائيًا: {returnPreview.from} ← {returnPreview.to} — {returnPreview.distance.toLocaleString()} كم، دخان {returnPreview.smoke.toLocaleString()} ج.م، نولون {returnPreview.freight.toLocaleString()} ج.م
                {!returnPreview.matched && <span className="block font-normal mt-1 text-amber-700">⚠️ مفيش خط سير مطابق في الإعدادات للرجوع ده — القيم اتحطت صفر، ممكن تضيف الخط ده في الإعدادات لاحقًا.</span>}
              </div>
            )}
            {!autoReturn && (
              <p className="text-[10px] text-slate-400">تمام — مفيش محطة رجوع هتتضاف. آخر نقطة في الرحلة ({lastRealStop}) هتبقى هي المقترحة كبداية لنقلة تانية لنفس السيارة النهارده.</p>
            )}
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
            <span className="font-black text-xl font-mono">{liveTotal.toLocaleString()} ج.م</span>
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

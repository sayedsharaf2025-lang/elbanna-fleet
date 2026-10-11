/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { MaintenanceRequest, MaintenanceRequestStatus } from '../types';
import {
  Wrench,
  Search,
  Plus,
  Truck,
  User,
  Calendar,
  ClipboardList,
  Save,
  Trash2,
  FileText,
  Receipt,
  CheckCircle,
  ArrowLeft,
  Package,
  Building2,
} from 'lucide-react';

const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const STATUS_LABELS: Record<MaintenanceRequestStatus, string> = {
  pending_parts: 'بانتظار قطع الغيار',
  in_progress: 'جاري التنفيذ',
  pending_review: 'بانتظار مراجعة مدير الصيانة',
  pending_invoice: 'بانتظار فتح الفاتورة',
  invoiced: 'تم إنشاء الفاتورة',
  closed: 'مغلق',
};
const STATUS_ORDER: MaintenanceRequestStatus[] = ['pending_parts', 'in_progress', 'pending_review', 'pending_invoice', 'invoiced', 'closed'];
const STATUS_COLORS: Record<MaintenanceRequestStatus, string> = {
  pending_parts: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  pending_review: 'bg-purple-50 text-purple-700 border-purple-200',
  pending_invoice: 'bg-orange-50 text-orange-700 border-orange-200',
  invoiced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function MaintenanceTab() {
  const db = useDb();
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaintenanceRequestStatus | 'all'>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (t: string) => { setToastMsg(t); setTimeout(() => setToastMsg(null), 3500); };

  const carFor = (carId: string) => db.cars.find(c => c.id === carId);
  const driverNameFor = (driverId?: string) => driverId ? (db.drivers.find(d => d.id === driverId)?.name || '-') : '-';

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return db.maintenanceRequests
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => {
        if (!term) return true;
        const car = carFor(r.car_id);
        return (car?.car_number || '').toLowerCase().includes(term) || r.request_number.toLowerCase().includes(term) || r.fault_description.toLowerCase().includes(term);
      })
      .sort((a, b) => b.request_number.localeCompare(a.request_number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.maintenanceRequests, db.cars, searchTerm, statusFilter]);

  const openDetail = (id: string) => { setActiveRequestId(id); setView('detail'); };

  return (
    <div className="space-y-6" id="maintenance_tab_view" style={{ direction: 'rtl' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">إدارة الأسطول</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><Wrench className="w-6 h-6" /> قسم الصيانة</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">مبني فوق قاعدة بيانات السيارات الحالية مباشرة — بيانات السيارة وسجل صيانتها السابق بيظهروا تلقائيًا عند اختيارها، بدون أي تكرار أو إعادة إدخال.</p>
        </div>
        {view === 'list' && (
          <button type="button" onClick={() => setView('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> طلب صيانة جديد
          </button>
        )}
        {view !== 'list' && (
          <button type="button" onClick={() => { setView('list'); setActiveRequestId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> الرجوع لقائمة الطلبات
          </button>
        )}
      </div>

      {toastMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-bold">
          <CheckCircle className="w-4 h-4 shrink-0" /> {toastMsg}
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr,220px] gap-3">
              <div>
                <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث برقم السيارة أو رقم الطلب أو العطل</label>
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white" />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1 text-xs">الحالة</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white">
                  <option value="all">الكل</option>
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredRequests.map(r => {
              const car = carFor(r.car_id);
              return (
                <button key={r.id} type="button" onClick={() => openDetail(r.id)} className="w-full text-right bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-emerald-300 transition-all flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-slate-400 text-xs">{r.request_number}</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400" /> {car?.car_number || '—'} <span className="text-slate-400 font-normal text-xs">({car?.brand || ''} {car?.model || ''})</span></span>
                    <span className="text-slate-600 text-xs flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-slate-400" /> {r.fault_description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1"><Calendar className="w-3 h-3" /> {r.request_date}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                  </div>
                </button>
              );
            })}
            {filteredRequests.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" /> لا توجد طلبات صيانة مطابقة.
              </div>
            )}
          </div>
        </>
      )}

      {view === 'new' && (
        <NewMaintenanceRequestForm
          onCreated={(id) => { setView('detail'); setActiveRequestId(id); showToast('تم تسجيل طلب الصيانة بنجاح.'); }}
          onCancel={() => setView('list')}
        />
      )}

      {view === 'detail' && activeRequestId && (() => {
        const req = db.maintenanceRequests.find(r => r.id === activeRequestId);
        if (!req) return null;
        return <MaintenanceRequestDetail request={req} onToast={showToast} />;
      })()}
    </div>
  );
}

// ====== نموذج طلب صيانة جديد — اختيار السيارة من قاعدة البيانات الحالية + استكمال بياناتها تلقائيًا ======
function NewMaintenanceRequestForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const db = useDb();
  const [carSearch, setCarSearch] = useState('');
  const [faultDescription, setFaultDescription] = useState('');
  const [workshopType, setWorkshopType] = useState<'company' | 'external'>('company');
  const [workshopName, setWorkshopName] = useState('');
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  const matchedCar = db.cars.find(c => c.car_number.replace(/\s/g, '') === carSearch.replace(/\s/g, ''));
  const driverName = matchedCar?.driver_id ? (db.drivers.find(d => d.id === matchedCar.driver_id)?.name) : undefined;
  const carHistory = matchedCar ? db.maintenanceRequests.filter(r => r.car_id === matchedCar.id).sort((a, b) => b.request_date.localeCompare(a.request_date)) : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedCar) { setError('يرجى اختيار رقم سيارة مسجل فعليًا في قاعدة بيانات الأسطول'); return; }
    if (!faultDescription.trim()) { setError('يرجى إدخال وصف العطل'); return; }
    if (workshopType === 'external' && !workshopName.trim()) { setError('يرجى إدخال اسم الورشة الخارجية'); return; }
    const newReq = db.addMaintenanceRequest({
      car_id: matchedCar.id,
      fault_description: faultDescription,
      workshop_type: workshopType,
      workshop_name: workshopType === 'external' ? workshopName : undefined,
      request_date: requestDate,
    });
    onCreated(newReq.id);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow p-6 space-y-4 text-xs">
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-bold">{error}</div>}

      <div>
        <label className="block text-slate-500 font-bold mb-1">رقم السيارة *</label>
        <input
          type="text" list="maintenance-cars-datalist" value={carSearch} onChange={(e) => setCarSearch(e.target.value)}
          placeholder="اكتب رقم السيارة للبحث..." autoComplete="off"
          className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
        />
        <datalist id="maintenance-cars-datalist">
          {db.cars.map(c => <option key={c.id} value={c.car_number} />)}
        </datalist>
      </div>

      {matchedCar && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
          <p className="font-extrabold text-slate-700 flex items-center gap-1.5"><Truck className="w-4 h-4 text-emerald-500" /> بيانات السيارة (تلقائي من قاعدة بيانات الأسطول)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-[11px]">
            <div><p className="text-slate-400 font-bold">الماركة</p><p className="font-bold text-slate-700">{matchedCar.brand || '-'}</p></div>
            <div><p className="text-slate-400 font-bold">الموديل</p><p className="font-bold text-slate-700">{matchedCar.model || '-'}</p></div>
            <div><p className="text-slate-400 font-bold">نوع السيارة</p><p className="font-bold text-slate-700">{matchedCar.car_type || '-'}</p></div>
            <div><p className="text-slate-400 font-bold">السائق</p><p className="font-bold text-slate-700">{driverName || '-'}</p></div>
            <div><p className="text-slate-400 font-bold">رقم الشاسيه</p><p className="font-bold text-slate-700 font-mono">{matchedCar.chassis_number || '-'}</p></div>
            <div><p className="text-slate-400 font-bold">رقم الموتور</p><p className="font-bold text-slate-700 font-mono">{matchedCar.motor_number || '-'}</p></div>
          </div>

          {carHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <p className="font-bold text-slate-600 mb-1.5">سجل الصيانة السابق لهذه السيارة ({carHistory.length})</p>
              <div className="space-y-1">
                {carHistory.slice(0, 5).map(h => (
                  <div key={h.id} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-slate-100 text-[10px]">
                    <span className="font-mono text-slate-400">{h.request_date}</span>
                    <span className="text-slate-600 flex-1 px-2 truncate">{h.fault_description}</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[h.status]}`}>{STATUS_LABELS[h.status]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-slate-500 font-bold mb-1">وصف العطل *</label>
        <textarea rows={3} value={faultDescription} onChange={(e) => setFaultDescription(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-slate-500 font-bold mb-1">جهة الصيانة</label>
          <select value={workshopType} onChange={(e) => setWorkshopType(e.target.value as any)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold">
            <option value="company">داخل الشركة</option>
            <option value="external">ورشة خارجية</option>
          </select>
        </div>
        {workshopType === 'external' && (
          <div>
            <label className="block text-slate-500 font-bold mb-1">اسم الورشة *</label>
            <input type="text" value={workshopName} onChange={(e) => setWorkshopName(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold" />
          </div>
        )}
        <div>
          <label className="block text-slate-500 font-bold mb-1">تاريخ الطلب</label>
          <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-1.5"><Save className="w-4 h-4" /> حفظ طلب الصيانة</button>
        <button type="button" onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl">إلغاء</button>
      </div>
    </form>
  );
}

// ====== تفاصيل طلب الصيانة — بيانات السيارة + قطع الغيار + الأعمال المنفذة + تقدم الحالة + الفاتورة ======
function MaintenanceRequestDetail({ request, onToast }: { request: MaintenanceRequest; onToast: (t: string) => void }) {
  const db = useDb();
  const car = db.cars.find(c => c.id === request.car_id);
  const driverName = car?.driver_id ? (db.drivers.find(d => d.id === car.driver_id)?.name) : undefined;

  const [partName, setPartName] = useState('');
  const [partSource, setPartSource] = useState<'company_stock' | 'external_workshop'>('company_stock');
  const [partQty, setPartQty] = useState('1');
  const [workPerformedDraft, setWorkPerformedDraft] = useState(request.work_performed);
  const [showInvoice, setShowInvoice] = useState(!!request.invoice_id);

  const carHistory = db.maintenanceRequests.filter(r => r.car_id === request.car_id && r.id !== request.id).sort((a, b) => b.request_date.localeCompare(a.request_date));

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) return;
    db.addMaintenancePart(request.id, { name: partName.trim(), source: partSource, quantity: num(partQty) || 1 });
    setPartName(''); setPartQty('1');
  };

  const handleSaveWorkPerformed = () => {
    db.updateMaintenanceRequest(request.id, { work_performed: workPerformedDraft });
    onToast('تم حفظ الأعمال المنفذة.');
  };

  const advanceStatus = (next: MaintenanceRequestStatus) => {
    const updates: Partial<MaintenanceRequest> = { status: next };
    if (next === 'in_progress' && !request.maintenance_date) updates.maintenance_date = new Date().toISOString().split('T')[0];
    db.updateMaintenanceRequest(request.id, updates);
    onToast(`تم تحديث حالة الطلب إلى "${STATUS_LABELS[next]}".`);
  };

  const handleOpenInvoice = () => {
    db.openMaintenanceInvoice(request.id);
    setShowInvoice(true);
  };

  const statusIdx = STATUS_ORDER.indexOf(request.status);
  const nextStatus = statusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[statusIdx + 1] : null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-slate-400 text-xs">{request.request_number}</p>
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><Truck className="w-5 h-5 text-slate-400" /> {car?.car_number || '—'}</h3>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${STATUS_COLORS[request.status]}`}>{STATUS_LABELS[request.status]}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 text-[11px] bg-slate-50 border border-slate-100 rounded-xl p-3">
          <div><p className="text-slate-400 font-bold">الماركة</p><p className="font-bold text-slate-700">{car?.brand || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">الموديل</p><p className="font-bold text-slate-700">{car?.model || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">النوع</p><p className="font-bold text-slate-700">{car?.car_type || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">السائق</p><p className="font-bold text-slate-700 flex items-center gap-1"><User className="w-3 h-3" />{driverName || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">الشاسيه</p><p className="font-bold text-slate-700 font-mono">{car?.chassis_number || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">الموتور</p><p className="font-bold text-slate-700 font-mono">{car?.motor_number || '-'}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <div><p className="text-slate-400 font-bold">العطل</p><p className="font-bold text-slate-700">{request.fault_description}</p></div>
          <div><p className="text-slate-400 font-bold flex items-center gap-1"><Building2 className="w-3 h-3" /> جهة الصيانة</p><p className="font-bold text-slate-700">{request.workshop_type === 'external' ? `ورشة خارجية: ${request.workshop_name}` : 'داخل الشركة'}</p></div>
          <div><p className="text-slate-400 font-bold">تاريخ الطلب</p><p className="font-bold text-slate-700 font-mono">{request.request_date}</p></div>
        </div>

        {carHistory.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="font-bold text-slate-600 mb-1.5 text-[11px]">سجل صيانة هذه السيارة ({carHistory.length} طلب سابق)</p>
            <div className="space-y-1">
              {carHistory.slice(0, 5).map(h => (
                <div key={h.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 text-[10px]">
                  <span className="font-mono text-slate-400">{h.request_date}</span>
                  <span className="text-slate-600 flex-1 px-2 truncate">{h.fault_description}</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[h.status]}`}>{STATUS_LABELS[h.status]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* تقدم الحالة */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          {nextStatus && (
            <button type="button" onClick={() => advanceStatus(nextStatus)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg">
              نقل الحالة إلى: {STATUS_LABELS[nextStatus]}
            </button>
          )}
          {request.status !== 'closed' && request.invoice_id && (
            <button type="button" onClick={() => advanceStatus('closed')} className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg">إغلاق الطلب</button>
          )}
        </div>
      </div>

      {/* قطع الغيار */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-3">
        <h4 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Package className="w-4 h-4 text-amber-500" /> طلب قطع الغيار</h4>
        <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-[1fr,160px,90px,auto] gap-2">
          <input type="text" placeholder="اسم القطعة" value={partName} onChange={(e) => setPartName(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 text-slate-800 text-xs" />
          <select value={partSource} onChange={(e) => setPartSource(e.target.value as any)} className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 text-slate-800 text-xs font-bold">
            <option value="company_stock">مخزن الشركة</option>
            <option value="external_workshop">الورشة الخارجية</option>
          </select>
          <input type="number" min="1" value={partQty} onChange={(e) => setPartQty(e.target.value)} className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 text-slate-800 text-xs font-mono" />
          <button type="submit" className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> إضافة</button>
        </form>
        <div className="space-y-1.5">
          {request.parts.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
              <span className="font-bold text-slate-700">{p.name}</span>
              <span className="text-slate-500">{p.source === 'company_stock' ? 'مخزن الشركة' : 'الورشة الخارجية'} × {p.quantity}</span>
              <button type="button" onClick={() => db.deleteMaintenancePart(request.id, p.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {request.parts.length === 0 && <p className="text-[11px] text-slate-400 italic">لسه مفيش قطع غيار مطلوبة.</p>}
        </div>
      </div>

      {/* الأعمال المنفذة */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-2.5">
        <h4 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Wrench className="w-4 h-4 text-indigo-500" /> الأعمال التي تم تنفيذها</h4>
        <textarea rows={3} value={workPerformedDraft} onChange={(e) => setWorkPerformedDraft(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 text-xs" />
        <button type="button" onClick={handleSaveWorkPerformed} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> حفظ</button>
      </div>

      {/* الفاتورة */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Receipt className="w-4 h-4 text-emerald-500" /> فاتورة الصيانة</h4>
          {!showInvoice && (
            <button type="button" onClick={handleOpenInvoice} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg">فتح الفاتورة</button>
          )}
        </div>
        {showInvoice && request.invoice_id && <MaintenanceInvoicePanel invoiceId={request.invoice_id} onToast={onToast} />}
        {!showInvoice && <p className="text-[11px] text-slate-400 italic">الفاتورة لسه ماتفتحتش — هتتكوّن تلقائيًا من بنود قطع الغيار المسجلة فوق.</p>}
      </div>
    </div>
  );
}

// ====== فاتورة الصيانة — قطع الغيار تلقائي من الطلب + المصنعية يدوي من المحاسب + خصم + صافي ======
function MaintenanceInvoicePanel({ invoiceId, onToast }: { invoiceId: string; onToast: (t: string) => void }) {
  const db = useDb();
  const invoice = db.maintenanceInvoices.find(i => i.id === invoiceId);
  const [laborDesc, setLaborDesc] = useState('');
  const [laborQty, setLaborQty] = useState('1');
  const [laborPrice, setLaborPrice] = useState('');
  const [discountDraft, setDiscountDraft] = useState(invoice ? String(invoice.discount) : '0');
  // قاعدة إلزامية: الخصم المحاسبي واعتماد/صرف الفاتورة من اختصاص مدير الصيانة فقط — صلاحية
  // فرعية منفصلة عن مجرد الوصول لشاشة الصيانة نفسها
  const canApproveDiscount = db.hasScreenPermission('maintenance_discount');

  if (!invoice) return null;

  const handleUpdateItemPrice = (itemId: string, price: string) => {
    const item = invoice.items.find(i => i.id === itemId);
    if (!item) return;
    const unit_price = num(price);
    const updatedItems = invoice.items.map(i => i.id === itemId ? { ...i, unit_price, total: unit_price * i.quantity } : i);
    db.updateMaintenanceInvoice(invoice.id, { items: updatedItems });
  };

  const handleAddLabor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!laborDesc.trim()) return;
    const qty = num(laborQty) || 1;
    const price = num(laborPrice);
    db.addMaintenanceInvoiceItem(invoice.id, { description: laborDesc.trim(), item_type: 'labor', quantity: qty, unit_price: price, total: qty * price });
    setLaborDesc(''); setLaborQty('1'); setLaborPrice('');
  };

  const handleSaveDiscount = () => {
    if (!canApproveDiscount) return;
    db.updateMaintenanceInvoice(invoice.id, { discount: num(discountDraft) });
    onToast('تم حفظ الخصم.');
  };

  const subtotal = invoice.items.reduce((s, i) => s + (i.total || 0), 0);
  const net = subtotal - (invoice.discount || 0);

  const handleAdvanceInvoiceStatus = () => {
    if (!canApproveDiscount) return;
    const next = invoice.status === 'draft' ? 'approved' : 'paid';
    db.updateMaintenanceInvoice(invoice.id, { status: next });
    onToast(next === 'approved' ? 'تم اعتماد الفاتورة.' : 'تم تسجيل صرف الفاتورة.');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-slate-400 text-xs">{invoice.invoice_number}</span>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${invoice.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' : invoice.status === 'approved' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {invoice.status === 'draft' ? 'تحت المراجعة' : invoice.status === 'approved' ? 'معتمدة' : 'مصروفة'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <th className="py-2 px-2.5">البيان</th><th className="py-2 px-2.5">النوع</th><th className="py-2 px-2.5">المصدر</th>
              <th className="py-2 px-2.5">الكمية</th><th className="py-2 px-2.5">السعر</th><th className="py-2 px-2.5">الإجمالي</th><th className="py-2 px-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(item => (
              <tr key={item.id} className="border-b border-slate-50">
                <td className="py-2 px-2.5 font-bold text-slate-700">{item.description}</td>
                <td className="py-2 px-2.5 text-slate-500">{item.item_type === 'parts' ? 'قطع غيار' : 'مصنعية'}</td>
                <td className="py-2 px-2.5 text-slate-500">{item.source ? (item.source === 'company_stock' ? 'مخزن الشركة' : 'الورشة الخارجية') : '-'}</td>
                <td className="py-2 px-2.5 font-mono">{item.quantity}</td>
                <td className="py-2 px-2.5">
                  <input type="number" step="0.01" min="0" defaultValue={item.unit_price} onBlur={(e) => handleUpdateItemPrice(item.id, e.target.value)} className="w-20 p-1 rounded border border-slate-200 font-mono" />
                </td>
                <td className="py-2 px-2.5 font-mono font-bold">{(item.total || 0).toLocaleString()}</td>
                <td className="py-2 px-1 text-center">
                  <button type="button" onClick={() => db.deleteMaintenanceInvoiceItem(invoice.id, item.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAddLabor} className="grid grid-cols-1 md:grid-cols-[1fr,80px,110px,auto] gap-2">
        <input type="text" placeholder="بند مصنعية (فك وتركيب، ضبط...)" value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} className="p-2 rounded-lg border border-slate-200 text-xs" />
        <input type="number" min="1" placeholder="كمية" value={laborQty} onChange={(e) => setLaborQty(e.target.value)} className="p-2 rounded-lg border border-slate-200 text-xs font-mono" />
        <input type="number" step="0.01" min="0" placeholder="السعر" value={laborPrice} onChange={(e) => setLaborPrice(e.target.value)} className="p-2 rounded-lg border border-slate-200 text-xs font-mono" />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> إضافة مصنعية</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 rounded-xl p-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-slate-500">الخصم:</span>
          {canApproveDiscount ? (
            <>
              <input type="number" step="0.01" min="0" value={discountDraft} onChange={(e) => setDiscountDraft(e.target.value)} className="w-24 p-1.5 rounded border border-slate-200 font-mono" />
              <button type="button" onClick={handleSaveDiscount} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2.5 py-1.5 rounded text-[10px]">حفظ</button>
            </>
          ) : (
            <span className="font-mono font-bold text-slate-700" title="اعتماد وتعديل الخصم المحاسبي من اختصاص مدير الصيانة فقط">
              {(invoice.discount || 0).toLocaleString()} ج.م 🔒
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">الإجمالي: <span className="font-mono font-bold text-slate-700">{subtotal.toLocaleString()}</span></div>
        <div className="text-sm font-black text-slate-800">صافي الفاتورة: <span className="font-mono text-emerald-600">{net.toLocaleString()} ج.م</span></div>
      </div>

      {invoice.status !== 'paid' && (
        canApproveDiscount ? (
          <button type="button" onClick={handleAdvanceInvoiceStatus} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg">
            {invoice.status === 'draft' ? 'اعتماد الفاتورة' : 'تسجيل صرف الفاتورة'}
          </button>
        ) : (
          <p className="text-[10px] text-slate-400 italic">اعتماد الفاتورة (والصرف بعد كده) من اختصاص مدير الصيانة فقط.</p>
        )
      )}
    </div>
  );
}

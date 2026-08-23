/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { TransportRequest } from '../types';
import {
  ClipboardList,
  Truck,
  User,
  MapPin,
  Calendar,
  Pencil,
  Trash2,
  Save,
  X,
  CheckCircle2,
  Hourglass,
  PackageCheck,
  AlertTriangle,
  FileText,
  Send
} from 'lucide-react';

export function RequestsTrackingTab() {
  const db = useDb();
  const [statusFilter, setStatusFilter] = useState<'new' | 'in_progress' | 'done'>('new');

  // Respond-with-car modal state
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [selectedCarId, setSelectedCarId] = useState('');
  const [respondError, setRespondError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    requester_name: string;
    farm_name: string;
    car_type: string;
    cargo_description: string;
    request_date: string;
  }>({ requester_name: '', farm_name: '', car_type: '', cargo_description: '', request_date: '' });

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const counts = {
    new: db.transportRequests.filter(r => r.status === 'new').length,
    in_progress: db.transportRequests.filter(r => r.status === 'in_progress').length,
    done: db.transportRequests.filter(r => r.status === 'done').length
  };

  const requests = db.transportRequests
    .filter(r => r.status === statusFilter)
    .sort((a, b) => b.request_number.localeCompare(a.request_number));

  const openRequest = db.transportRequests.find(r => r.id === openRequestId) || null;

  // مفلترة حسب نوع السيارة المطلوب فقط في الطلب
  const matchingCars = openRequest
    ? db.cars.filter(c => (c.car_type || '').trim() === (openRequest.car_type || '').trim())
    : [];

  const driverNameFor = (driverId?: string) => {
    if (!driverId) return 'بدون سائق مرتبط';
    const drv = db.drivers.find(d => d.id === driverId);
    return drv ? drv.name : 'بدون سائق مرتبط';
  };

  const handleOpenRespond = (id: string) => {
    setOpenRequestId(id);
    setSelectedCarId('');
    setRespondError(null);
  };

  const handleConfirmRespond = () => {
    if (!openRequest) return;
    if (!selectedCarId) {
      setRespondError('يرجى اختيار سيارة أولًا');
      return;
    }
    const res = db.respondTransportRequestWithCar(openRequest.id, selectedCarId);
    if (res.success) {
      showToast('success', `تم الرد على الطلب ${openRequest.request_number} بنجاح وربط السائق تلقائيًا.`);
      setOpenRequestId(null);
      setSelectedCarId('');
    } else {
      setRespondError(res.error || 'حدث خطأ أثناء الرد على الطلب');
    }
  };

  const handleDelete = (r: TransportRequest) => {
    if (confirm(`هل أنت متأكد من حذف الطلب رقم ${r.request_number} نهائيًا؟`)) {
      db.deleteTransportRequest(r.id);
      showToast('success', 'تم حذف الطلب بنجاح.');
    }
  };

  const startEdit = (r: TransportRequest) => {
    setEditingId(r.id);
    setEditFields({
      requester_name: r.requester_name,
      farm_name: r.farm_name,
      car_type: r.car_type,
      cargo_description: r.cargo_description || '',
      request_date: r.request_date
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (id: string) => {
    if (!editFields.requester_name.trim() || !editFields.farm_name.trim() || !editFields.car_type.trim()) {
      showToast('error', 'يرجى استكمال الحقول الأساسية قبل الحفظ');
      return;
    }
    db.updateTransportRequest(id, {
      requester_name: editFields.requester_name.trim(),
      farm_name: editFields.farm_name.trim(),
      car_type: editFields.car_type.trim(),
      cargo_description: editFields.cargo_description.trim(),
      request_date: editFields.request_date
    });
    setEditingId(null);
    showToast('success', 'تم تحديث بيانات الطلب بنجاح.');
  };

  const handleDeliver = (r: TransportRequest) => {
    if (confirm(`تأكيد إنهاء وتسليم الطلب رقم ${r.request_number}؟`)) {
      db.markTransportRequestDelivered(r.id);
      showToast('success', 'تم إنهاء الطلب وتسجيله كمُسلَّم.');
    }
  };

  return (
    <div className="space-y-6" id="requests_tracking_tab" style={{ direction: 'rtl' }}>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 tracking-wider block uppercase mb-1">بوابة مشرف الحركة</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 font-sans tracking-tight">متابعة الطلبات</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">مراجعة طلبات النقل الواردة، الرد عليها بسيارة مناسبة، ومتابعة حالتها حتى التسليم.</p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 self-start md:self-center">
          <button
            type="button"
            onClick={() => setStatusFilter('new')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === 'new' ? 'bg-amber-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Hourglass className="w-3.5 h-3.5" /> جديدة ({counts.new})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === 'in_progress' ? 'bg-indigo-500 text-white font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Truck className="w-3.5 h-3.5" /> جارية ({counts.in_progress})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('done')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === 'done' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <PackageCheck className="w-3.5 h-3.5" /> منتهية ({counts.done})
          </button>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold animate-pulse ${toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Empty state */}
      {requests.length === 0 && (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-xs font-bold">
          لا توجد طلبات ضمن هذه الحالة حاليًا.
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-3">
        {requests.map(r => {
          const isEditing = editingId === r.id;
          return (
            <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">

              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="font-mono font-black text-slate-800 text-sm flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-slate-400" />
                  {r.request_number}
                </span>

                {!isEditing && (
                  <div className="flex items-center gap-1.5">
                    {r.status === 'new' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenRespond(r.id)}
                          className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                        >
                          <Send className="w-3.5 h-3.5" /> رد بسيارة
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" /> تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> حذف
                        </button>
                      </>
                    )}
                    {r.status === 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => handleDeliver(r)}
                        className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> تأكيد التسليم
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!isEditing ? (
                <>
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
                  {(r.status === 'in_progress' || r.status === 'done') && r.assigned_car_id && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-50 text-[11px] text-slate-600 font-bold flex flex-wrap gap-3">
                      <span>🚚 السيارة: {db.cars.find(c => c.id === r.assigned_car_id)?.car_number || '-'}</span>
                      <span>🧑‍✈️ السائق: {driverNameFor(r.assigned_driver_id)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">اسم الطالب</label>
                    <input
                      type="text"
                      className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                      value={editFields.requester_name}
                      onChange={(e) => setEditFields(prev => ({ ...prev, requester_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">المزرعة</label>
                    <input
                      type="text"
                      list="farms-datalist-edit"
                      className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                      value={editFields.farm_name}
                      onChange={(e) => setEditFields(prev => ({ ...prev, farm_name: e.target.value }))}
                    />
                    <datalist id="farms-datalist-edit">
                      {db.farms.map(f => <option key={f} value={f} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">نوع السيارة المطلوبة</label>
                    <input
                      type="text"
                      className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                      value={editFields.car_type}
                      onChange={(e) => setEditFields(prev => ({ ...prev, car_type: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">تاريخ الطلب</label>
                    <input
                      type="date"
                      className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono"
                      value={editFields.request_date}
                      onChange={(e) => setEditFields(prev => ({ ...prev, request_date: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-slate-500 font-bold mb-1">وصف الحمولة</label>
                    <textarea
                      rows={2}
                      className="w-full p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                      value={editFields.cargo_description}
                      onChange={(e) => setEditFields(prev => ({ ...prev, cargo_description: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => saveEdit(r.id)}
                      className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-all"
                    >
                      <Save className="w-3.5 h-3.5" /> حفظ التعديلات
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold px-3 py-2 rounded-lg transition-all"
                    >
                      <X className="w-3.5 h-3.5" /> إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Respond with Car Modal */}
      {openRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden text-right">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white p-4 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Truck className="w-6 h-6" />
                <div>
                  <h4 className="font-extrabold text-sm md:text-base">الرد على الطلب {openRequest.request_number} بسيارة</h4>
                  <p className="text-[10px] text-emerald-100">المزرعة: {openRequest.farm_name} — نوع السيارة المطلوب: {openRequest.car_type}</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpenRequestId(null)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-sans">
              {respondError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {respondError}
                </div>
              )}

              {matchingCars.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3.5 rounded-xl font-bold text-center">
                  لا توجد سيارات مسجلة بالأسطول من نوع "{openRequest.car_type}" حاليًا.
                </div>
              ) : (
                <div>
                  <label className="block text-slate-500 font-bold mb-1.5">اختر السيارة المتاحة (مفلترة حسب النوع المطلوب)</label>
                  <select
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
                    value={selectedCarId}
                    onChange={(e) => setSelectedCarId(e.target.value)}
                  >
                    <option value="">-- اختر رقم السيارة --</option>
                    {matchingCars.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.car_number} — {driverNameFor(c.driver_id)}
                      </option>
                    ))}
                  </select>

                  {selectedCarId && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-600 font-bold">
                      🧑‍✈️ سيتم ربط السائق تلقائيًا: {driverNameFor(matchingCars.find(c => c.id === selectedCarId)?.driver_id)}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={matchingCars.length === 0}
                  onClick={handleConfirmRespond}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-bold transition-all text-center shadow-md"
                >
                  تأكيد الرد بالسيارة
                </button>
                <button
                  type="button"
                  onClick={() => setOpenRequestId(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 px-4 rounded-xl font-bold transition-all text-center"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

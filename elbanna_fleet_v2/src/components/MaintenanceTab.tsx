/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// سير عمل الصيانة (4 شاشات):
//  1) طلب الصيانة (الورشة/مسجّل الطلب): يختار السيارة ونوع العطل، ويستلم السيارة بعد الإصلاح أو يرجعها بسبب.
//  2) مدير الصيانة: يتخذ إجراء على كل عطل جديد (قطع غيار / تنفيذ بالورشة / حذف)، يوجّه المشتريات للورشة،
//     ينهي الصيانة، يعتمد الفواتير والخصم، ويعالج رفض الاستلام.
//  3) قطع الغيار: يشوف البيان والعدد ويسجّل «تم الشراء» مع صورة الفاتورة بالكاميرا.
//  4) فواتير الصيانة: يكتب بنود الفاتورة، وبعد اعتماد المدير يطبع ويقفل الطلب (والتكلفة تتحمّل على السيارة).

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { MaintenanceRequest, MaintenanceRequestStatus } from '../types';
import { findPreviousFault, kmSinceLastFault } from '../db/logic/maintenanceFlow';
import { A5PrintPreview } from './A5PrintPreview';
import { ErrorBoundary } from './ErrorBoundary';
import {
  Wrench, Search, Plus, Truck, User, Calendar, ClipboardList, Save, Trash2, FileText, Receipt,
  CheckCircle, ArrowLeft, Package, Building2, Printer, Camera, Gauge, X,
} from 'lucide-react';

const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const today = () => new Date().toISOString().split('T')[0];

const STATUS_LABELS: Record<MaintenanceRequestStatus, string> = {
  new: 'عطل جديد — بانتظار مدير الصيانة',
  parts_requested: 'طلب قطع غيار',
  parts_purchased: 'تم الشراء — بانتظار التوجيه للورشة',
  in_workshop: 'جاري الصيانة بالورشة',
  pending_invoice: 'تم الانتهاء — بانتظار الفاتورة',
  invoice_review: 'الفاتورة بانتظار اعتماد المدير',
  invoice_approved: 'الفاتورة معتمدة — بانتظار الطباعة والإغلاق',
  repaired: 'تم الإصلاح',
  receipt_rejected: 'رفض الاستلام',
  closed: 'مغلق',
};
const STATUS_COLORS: Record<MaintenanceRequestStatus, string> = {
  new: 'bg-amber-50 text-amber-700 border-amber-200',
  parts_requested: 'bg-orange-50 text-orange-700 border-orange-200',
  parts_purchased: 'bg-sky-50 text-sky-700 border-sky-200',
  in_workshop: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  pending_invoice: 'bg-purple-50 text-purple-700 border-purple-200',
  invoice_review: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  invoice_approved: 'bg-teal-50 text-teal-700 border-teal-200',
  repaired: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  receipt_rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
};

const FAULT_TYPES = ['ميكانيكا (موتور / ناقل حركة)', 'كهرباء', 'فرامل', 'إطارات', 'عفشة ومساعدين', 'تكييف', 'سمكرة ودهان', 'تغيير زيت وفلاتر', 'أخرى'];

// ====== التأخير في المراحل ======
const getDelayDays = () => { try { return parseInt(localStorage.getItem('elbanna_maint_delay_days') || '3', 10) || 3; } catch { return 3; } };
const stageSince = (r: MaintenanceRequest): string => {
  const h = r.stage_history || [];
  for (let i = h.length - 1; i >= 0; i--) if (h[i].status === r.status) return h[i].at.slice(0, 10);
  return r.request_date;
};
const daysInStage = (r: MaintenanceRequest): number => Math.max(0, Math.floor((Date.now() - new Date(stageSince(r)).getTime()) / 86400000));

// ====== ضغط صورة فاتورة الشراء قبل الحفظ (كاميرا الموبايل صورها كبيرة) ======
const compressImage = (file: File, maxSide = 1280, quality = 0.7): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الصورة غير صالحة'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

// ====== أوضاع الشاشة ======
export type MaintenanceMode = 'requests' | 'manager' | 'parts' | 'accounting';

interface SectionDef { key: string; label: string; statuses: MaintenanceRequestStatus[] | 'all'; highlight?: boolean }

const MODE_CONFIG: Record<MaintenanceMode, { title: string; subtitle: string; canCreate: boolean; sections: SectionDef[] }> = {
  requests: {
    title: 'طلب الصيانة',
    subtitle: 'اختار السيارة المراد إصلاحها ونوع العطل، وتابع طلباتك. السيارات اللي خلص إصلاحها بتظهر في «تم الإصلاح» لاستلامها.',
    canCreate: true,
    sections: [
      { key: 'active', label: 'طلباتي الجارية', statuses: ['new', 'parts_requested', 'parts_purchased', 'in_workshop', 'pending_invoice', 'invoice_review', 'invoice_approved', 'receipt_rejected'] },
      { key: 'repaired', label: 'تم الإصلاح', statuses: ['repaired'], highlight: true },
      { key: 'closed', label: 'المغلقة', statuses: ['closed'] },
    ],
  },
  manager: {
    title: 'مدير الصيانة',
    subtitle: 'الأعطال اللي لسه ماخدتش إجراء، وتوجيه المشتريات للورشة، واعتماد الفواتير، ومعالجة رفض الاستلام.',
    canCreate: false,
    sections: [
      { key: 'new', label: 'أعطال جديدة', statuses: ['new'], highlight: true },
      { key: 'purchased', label: 'تم الشراء', statuses: ['parts_purchased'], highlight: true },
      { key: 'workshop', label: 'جاري الصيانة بالورشة', statuses: ['in_workshop'] },
      { key: 'review', label: 'اعتماد الفواتير', statuses: ['invoice_review'], highlight: true },
      { key: 'rejected', label: 'رفض الاستلام', statuses: ['receipt_rejected'], highlight: true },
      { key: 'all', label: 'كل الطلبات', statuses: 'all' },
    ],
  },
  parts: {
    title: 'قطع الغيار',
    subtitle: 'الطلبات اللي لسه ماتنفذتش: افتح الطلب لتشوف قطع الغيار المطلوبة، وسجّل «تم الشراء» مع تصوير الفاتورة.',
    canCreate: false,
    sections: [
      { key: 'todo', label: 'مطلوب شراؤها', statuses: ['parts_requested'], highlight: true },
      { key: 'done', label: 'تم الشراء', statuses: ['parts_purchased'] },
    ],
  },
  accounting: {
    title: 'فواتير الصيانة',
    subtitle: 'اكتب بنود فاتورة كل طلب انتهت صيانته، وبعد اعتماد المدير اطبع الفاتورة واقفل الطلب لتتحمّل التكلفة على السيارة.',
    canCreate: false,
    sections: [
      { key: 'todo', label: 'بانتظار الفاتورة', statuses: ['pending_invoice'], highlight: true },
      { key: 'review', label: 'بانتظار الاعتماد', statuses: ['invoice_review'] },
      { key: 'approved', label: 'تم الاعتماد', statuses: ['invoice_approved'], highlight: true },
      { key: 'done', label: 'المنتهية', statuses: ['repaired', 'receipt_rejected', 'closed'] },
    ],
  },
};

export function MaintenanceTab({ mode = 'requests' }: { mode?: MaintenanceMode }) {
  const db = useDb();
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.requests;
  const [sectionKey, setSectionKey] = useState<string>(cfg.sections[0].key);
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (t: string) => { setToastMsg(t); setTimeout(() => setToastMsg(null), 3500); };

  const carFor = (carId: string) => db.cars.find(c => c.id === carId);
  const section = cfg.sections.find(s => s.key === sectionKey) || cfg.sections[0];
  const inSection = (s: SectionDef, r: MaintenanceRequest) => s.statuses === 'all' || s.statuses.includes(r.status);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return db.maintenanceRequests
      .filter(r => inSection(section, r))
      .filter(r => {
        if (!term) return true;
        const car = carFor(r.car_id);
        return (car?.car_number || '').toLowerCase().includes(term) || r.request_number.toLowerCase().includes(term) || r.fault_description.toLowerCase().includes(term);
      })
      .sort((a, b) => b.request_number.localeCompare(a.request_number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.maintenanceRequests, db.cars, searchTerm, sectionKey, mode]);

  const openDetail = (id: string) => { setActiveRequestId(id); setView('detail'); };
  const backToList = () => { setView('list'); setActiveRequestId(null); };

  return (
    <div className="space-y-5" id="maintenance_tab_view" style={{ direction: 'rtl' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">الصيانة</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><Wrench className="w-6 h-6" /> {cfg.title}</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{cfg.subtitle}</p>
        </div>
        {view === 'list' && cfg.canCreate && (
          <button type="button" onClick={() => setView('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> طلب صيانة جديد
          </button>
        )}
        {view !== 'list' && (
          <button type="button" onClick={backToList} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> الرجوع للقائمة
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
          <div className="flex flex-wrap items-center gap-2">
            {cfg.sections.map(s => {
              const count = db.maintenanceRequests.filter(r => inSection(s, r)).length;
              const active = s.key === section.key;
              return (
                <button key={s.key} type="button" onClick={() => setSectionKey(s.key)}
                  className={`text-xs font-bold px-3.5 py-2 rounded-lg border flex items-center gap-1.5 ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {s.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${active ? 'bg-white/25 text-white' : s.highlight && count > 0 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow">
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> بحث برقم السيارة أو رقم الطلب أو العطل</label>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white" />
          </div>

          <div className="space-y-2.5">
            {filteredRequests.map(r => {
              const car = carFor(r.car_id);
              const late = r.status !== 'closed' && r.status !== 'repaired' && daysInStage(r) >= getDelayDays();
              return (
                <button key={r.id} type="button" onClick={() => openDetail(r.id)} className="w-full text-right bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-emerald-300 transition-all space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400" /> {car?.car_number || '—'}</span>
                    <span className="font-mono text-slate-400 text-[11px]">{r.request_number}</span>
                  </div>
                  <p className="text-slate-600 text-xs flex items-start gap-1"><FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" /> {r.fault_description}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1"><Calendar className="w-3 h-3" /> {r.request_date}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                    {late && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200">متأخر {daysInStage(r)} يوم</span>}
                  </div>
                </button>
              );
            })}
            {filteredRequests.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" /> لا توجد طلبات في هذا القسم.
              </div>
            )}
          </div>
        </>
      )}

      {view === 'new' && (
        <NewMaintenanceRequestForm
          onCreated={() => { backToList(); showToast('تم تسجيل طلب الصيانة وإرساله لمدير الصيانة.'); }}
          onCancel={backToList}
        />
      )}

      {view === 'detail' && activeRequestId && (() => {
        const req = db.maintenanceRequests.find(r => r.id === activeRequestId);
        if (!req) return null;
        return (
          <ErrorBoundary key={req.id} label="تعذّر عرض تفاصيل طلب الصيانة" onReset={backToList}>
            <MaintenanceRequestDetail request={req} mode={mode} onToast={showToast} onDone={backToList} />
          </ErrorBoundary>
        );
      })()}
    </div>
  );
}

// ====== نموذج طلب صيانة جديد: السيارة + نوع العطل (من غير ورشة) ======
function NewMaintenanceRequestForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const db = useDb();
  const [carSearch, setCarSearch] = useState('');
  const [faultType, setFaultType] = useState(FAULT_TYPES[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matchedCar = db.cars.find(c => c.car_number.replace(/\s/g, '') === carSearch.replace(/\s/g, ''));
  const driverName = matchedCar?.driver_id ? (db.drivers.find(d => d.id === matchedCar.driver_id)?.name) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedCar) { setError('اختار رقم سيارة مسجل فعليًا في قاعدة بيانات الأسطول'); return; }
    if (faultType === 'أخرى' && !details.trim()) { setError('اكتب تفاصيل العطل'); return; }
    db.addMaintenanceRequest({
      car_id: matchedCar.id,
      fault_description: details.trim() ? `${faultType} — ${details.trim()}` : faultType,
      request_date: today(),
    });
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-4 text-xs">
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-bold">{error}</div>}
      <div>
        <label className="block text-slate-500 font-bold mb-1">السيارة المراد إصلاحها *</label>
        <input type="text" list="maintenance-cars-datalist" value={carSearch} onChange={(e) => setCarSearch(e.target.value)} placeholder="اكتب رقم السيارة..." autoComplete="off"
          className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold" />
        <datalist id="maintenance-cars-datalist">{db.cars.map(c => <option key={c.id} value={c.car_number} />)}</datalist>
        {matchedCar && (
          <p className="mt-2 text-[11px] text-slate-500">{matchedCar.brand || ''} {matchedCar.model || ''} {matchedCar.car_type ? `— ${matchedCar.car_type}` : ''} {driverName ? `— السائق: ${driverName}` : ''}</p>
        )}
      </div>
      <div>
        <label className="block text-slate-500 font-bold mb-1">نوع العطل *</label>
        <select value={faultType} onChange={(e) => setFaultType(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold">
          {FAULT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-slate-500 font-bold mb-1">تفاصيل العطل {faultType === 'أخرى' ? '*' : '(اختياري)'}</label>
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800" />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-1.5"><Save className="w-4 h-4" /> حفظ الطلب</button>
        <button type="button" onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl">إلغاء</button>
      </div>
    </form>
  );
}

// ====== نموذج التوجيه للورشة: ورشة الشركة أو ورشة خارجية باسمها ======
function WorkshopForm({ onConfirm, onCancel }: { onConfirm: (type: 'company' | 'external', name?: string) => void; onCancel: () => void }) {
  const [type, setType] = useState<'company' | 'external'>('company');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-3 text-xs">
      <p className="font-extrabold text-indigo-800">التوجيه للورشة</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setType('company')} className={`flex-1 py-2.5 rounded-lg border font-bold ${type === 'company' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>ورشة الشركة</button>
        <button type="button" onClick={() => setType('external')} className={`flex-1 py-2.5 rounded-lg border font-bold ${type === 'external' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>ورشة خارجية</button>
      </div>
      {type === 'external' && (
        <input type="text" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="اسم الورشة الخارجية *" className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold" />
      )}
      {error && <p className="text-rose-600 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { if (type === 'external' && !name.trim()) { setError('اكتب اسم الورشة الخارجية'); return; } onConfirm(type, type === 'external' ? name.trim() : undefined); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg">تأكيد التوجيه</button>
        <button type="button" onClick={onCancel} className="bg-white border border-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-lg">إلغاء</button>
      </div>
    </div>
  );
}

// ====== نموذج طلب قطع الغيار: بيان + عدد ======
function PartsRequestForm({ onSubmit, onCancel }: { onSubmit: (rows: { name: string; quantity: number }[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<{ name: string; qty: string }[]>([{ name: '', qty: '1' }]);
  const [error, setError] = useState('');
  const update = (i: number, patch: Partial<{ name: string; qty: string }>) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  return (
    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4 space-y-3 text-xs">
      <p className="font-extrabold text-amber-800">طلب قطع غيار</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr,80px,auto] gap-2 items-center">
            <input type="text" value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="البيان (اسم القطعة)" className="p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500" />
            <input type="number" min="1" value={r.qty} onChange={(e) => update(i, { qty: e.target.value })} placeholder="العدد" className="p-2.5 rounded-lg border border-slate-200 font-mono text-center" />
            <button type="button" disabled={rows.length === 1} onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600 disabled:opacity-30 p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows(prev => [...prev, { name: '', qty: '1' }])} className="text-amber-700 font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> إضافة قطعة</button>
      {error && <p className="text-rose-600 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => {
          const valid = rows.filter(r => r.name.trim());
          if (valid.length === 0) { setError('اكتب قطعة واحدة على الأقل'); return; }
          onSubmit(valid.map(r => ({ name: r.name.trim(), quantity: num(r.qty) || 1 })));
        }} className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-4 py-2.5 rounded-lg">إرسال لشاشة قطع الغيار</button>
        <button type="button" onClick={onCancel} className="bg-white border border-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-lg">إلغاء</button>
      </div>
    </div>
  );
}

// ====== تفاصيل الطلب + إجراءات كل شاشة ======
function MaintenanceRequestDetail({ request, mode, onToast, onDone }: { request: MaintenanceRequest; mode: MaintenanceMode; onToast: (t: string) => void; onDone: () => void }) {
  const db = useDb();
  const car = db.cars.find(c => c.id === request.car_id);
  const driverName = car?.driver_id ? (db.drivers.find(d => d.id === car.driver_id)?.name) : undefined;
  const previous = findPreviousFault(db.maintenanceRequests, request);
  const parts = Array.isArray(request.parts) ? request.parts : [];
  const prevOdo = typeof previous?.odometer === 'number' ? previous.odometer : undefined;
  const reqOdo = typeof request.odometer === 'number' ? request.odometer : undefined;
  const reqKm = typeof request.km_since_last === 'number' ? request.km_since_last : undefined;
  const [action, setAction] = useState<null | 'parts' | 'workshop'>(null);
  const [odoDraft, setOdoDraft] = useState<string>(typeof request.odometer === 'number' ? String(request.odometer) : '');
  const [showPrint, setShowPrint] = useState(false);
  const invoice = request.invoice_id ? db.maintenanceInvoices.find(i => i.id === request.invoice_id) : undefined;

  const move = (status: MaintenanceRequestStatus, extra: Partial<MaintenanceRequest> & { _note?: string; _kind?: 'advance' | 'return' } = {}, toast?: string) => {
    db.updateMaintenanceRequest(request.id, { status, ...extra });
    onToast(toast || `تم نقل الطلب إلى: ${STATUS_LABELS[status]}`);
    onDone();
  };

  // عداد السيارة: إلزامي قبل أي إجراء من مدير الصيانة على العطل الجديد، وبيتخزن مع المسافة من آخر عطل
  const odometerPatch = (): Partial<MaintenanceRequest> | null => {
    const raw = odoDraft.trim();
    if (raw === '' || isNaN(Number(raw)) || Number(raw) < 0) { onToast('اكتب عداد السيارة (كم) الأول.'); return null; }
    const odometer = Number(raw);
    const km = kmSinceLastFault(db.maintenanceRequests, request, odometer);
    return { odometer, ...(km !== undefined ? { km_since_last: km } : {}) };
  };

  const isManager = mode === 'manager';
  const workshopLabel = request.workshop_name
    ? `${request.workshop_type === 'external' ? 'ورشة خارجية' : 'ورشة الشركة'}: ${request.workshop_name}`
    : request.workshop_type === 'external' ? 'ورشة خارجية' : (['in_workshop', 'pending_invoice', 'invoice_review', 'invoice_approved', 'repaired', 'closed'].includes(request.status) ? 'ورشة الشركة' : '—');

  const hist = (Array.isArray(request.stage_history) ? request.stage_history : []).filter(h => h && typeof h.at === 'string');
  const last = hist[hist.length - 1];

  // ---- إجراءات مدير الصيانة ----
  const managerNewActions = (
    <div className="space-y-3">
      <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3 space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 flex-wrap">
          <Gauge className="w-4 h-4 text-amber-600" /> عداد السيارة (كم) *
          <input type="number" min="0" value={odoDraft} onChange={(e) => setOdoDraft(e.target.value)} placeholder="اكتب العداد" className="w-36 p-2 rounded-lg border border-slate-200 font-mono text-center" />
        </label>
        {previous ? (
          <p className="text-[11px] text-slate-600">
            آخر عطل لنفس السيارة: <span className="font-bold">{previous.fault_description}</span> بتاريخ <span className="font-mono">{previous.request_date}</span>
            {prevOdo !== undefined && <> — العداد وقتها <span className="font-mono font-bold">{prevOdo.toLocaleString()}</span> كم{odoDraft && !isNaN(Number(odoDraft)) && Number(odoDraft) >= prevOdo ? <> (المسافة من آخر عطل: <span className="font-mono font-bold text-emerald-700">{(Number(odoDraft) - prevOdo).toLocaleString()}</span> كم)</> : null}</>}
          </p>
        ) : <p className="text-[11px] text-slate-400">مفيش عطل سابق مسجل لنفس السيارة.</p>}
      </div>

      {action === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { if (odometerPatch()) setAction('parts'); }} className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Package className="w-4 h-4" /> طلب قطع غيار</button>
          <button type="button" onClick={() => { if (odometerPatch()) setAction('workshop'); }} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Wrench className="w-4 h-4" /> تنفيذ بالورشة</button>
          <button type="button" onClick={() => { if (window.confirm('حذف طلب الصيانة نهائيًا؟')) { db.deleteMaintenanceRequest(request.id); onToast('تم حذف الطلب.'); onDone(); } }} className="bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> حذف الطلب</button>
        </div>
      )}
      {action === 'parts' && <PartsRequestForm onCancel={() => setAction(null)} onSubmit={(rows) => {
        const patch = odometerPatch(); if (!patch) return;
        const newParts = rows.map((r, i) => ({ id: `part_${Date.now()}_${i}`, name: r.name, quantity: r.quantity, source: 'external_workshop' as const }));
        move('parts_requested', { ...patch, parts: [...parts, ...newParts] }, 'تم إرسال طلب قطع الغيار لشاشة قطع الغيار.');
      }} />}
      {action === 'workshop' && <WorkshopForm onCancel={() => setAction(null)} onConfirm={(type, name) => {
        const patch = odometerPatch(); if (!patch) return;
        move('in_workshop', { ...patch, workshop_type: type, workshop_name: name, maintenance_date: today() }, 'تم توجيه الطلب للورشة — جاري الصيانة.');
      }} />}
    </div>
  );

  const managerPurchasedActions = (
    <div className="space-y-3">
      {action === null ? (
        <button type="button" onClick={() => setAction('workshop')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Wrench className="w-4 h-4" /> توجيه للورشة</button>
      ) : (
        <WorkshopForm onCancel={() => setAction(null)} onConfirm={(type, name) => move('in_workshop', { workshop_type: type, workshop_name: name, maintenance_date: request.maintenance_date || today() }, 'تم توجيه الطلب للورشة — جاري الصيانة.')} />
      )}
    </div>
  );

  const managerRejectedActions = (
    <div className="space-y-3">
      {action === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAction('workshop')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Wrench className="w-4 h-4" /> توجيه للورشة مرة أخرى</button>
          <button type="button" onClick={() => setAction('parts')} className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Package className="w-4 h-4" /> قطع غيار</button>
          <button type="button" onClick={() => { if (window.confirm('إغلاق الطلب؟')) move('closed', { _note: 'أغلقه مدير الصيانة بعد رفض الاستلام' }, 'تم إغلاق الطلب.'); }} className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><X className="w-4 h-4" /> إغلاق الطلب</button>
        </div>
      )}
      {action === 'parts' && <PartsRequestForm onCancel={() => setAction(null)} onSubmit={(rows) => {
        const newParts = rows.map((r, i) => ({ id: `part_${Date.now()}_${i}`, name: r.name, quantity: r.quantity, source: 'external_workshop' as const }));
        move('parts_requested', { parts: [...parts, ...newParts] }, 'تم إرسال طلب قطع الغيار لشاشة قطع الغيار.');
      }} />}
      {action === 'workshop' && <WorkshopForm onCancel={() => setAction(null)} onConfirm={(type, name) => move('in_workshop', { workshop_type: type, workshop_name: name }, 'تم توجيه الطلب للورشة مرة أخرى.')} />}
    </div>
  );

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-[11px] bg-slate-50 border border-slate-100 rounded-xl p-3">
          <div><p className="text-slate-400 font-bold">الماركة / الموديل</p><p className="font-bold text-slate-700">{car?.brand || '-'} {car?.model || ''}</p></div>
          <div><p className="text-slate-400 font-bold">النوع</p><p className="font-bold text-slate-700">{car?.car_type || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">السائق</p><p className="font-bold text-slate-700 flex items-center gap-1"><User className="w-3 h-3" />{driverName || '-'}</p></div>
          <div><p className="text-slate-400 font-bold">تاريخ الطلب</p><p className="font-bold text-slate-700 font-mono">{request.request_date}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <div className="md:col-span-2"><p className="text-slate-400 font-bold">العطل</p><p className="font-bold text-slate-700">{request.fault_description}</p></div>
          <div><p className="text-slate-400 font-bold flex items-center gap-1"><Building2 className="w-3 h-3" /> جهة الصيانة</p><p className="font-bold text-slate-700">{workshopLabel}</p></div>
          {reqOdo !== undefined && (
            <div><p className="text-slate-400 font-bold flex items-center gap-1"><Gauge className="w-3 h-3" /> العداد</p><p className="font-bold text-slate-700 font-mono">{reqOdo.toLocaleString()} كم{reqKm !== undefined ? ` — ${reqKm.toLocaleString()} كم من آخر عطل` : ''}</p></div>
          )}
        </div>

        {request.status === 'receipt_rejected' && last && last.kind === 'return' && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-xs font-bold">رفض الاستلام{last.by ? ` بواسطة ${last.by}` : ''}: {last.note}</div>
        )}

        {parts.length > 0 && (
          <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1"><Package className="w-3.5 h-3.5 text-amber-500" /> قطع الغيار المطلوبة</p>
            {parts.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs border border-slate-100">
                <span className="font-bold text-slate-700">{p.name}</span>
                <span className="font-mono text-slate-500">× {p.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {request.purchase_invoice_image && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> فاتورة شراء قطع الغيار</p>
            <a href={request.purchase_invoice_image} target="_blank" rel="noreferrer"><img src={request.purchase_invoice_image} alt="فاتورة الشراء" className="max-h-56 rounded-lg border border-slate-200" /></a>
          </div>
        )}

        {previous && !(isManager && request.status === 'new') && (
          <p className="text-[11px] text-slate-500">آخر عطل سابق لنفس السيارة: <span className="font-bold">{previous.fault_description}</span> ({previous.request_date})</p>
        )}

        {hist.length > 0 && (
          <details className="border border-slate-100 rounded-xl p-3 bg-slate-50">
            <summary className="text-[11px] font-bold text-slate-500 cursor-pointer">سجل المراحل (في المرحلة الحالية من {daysInStage(request)} يوم)</summary>
            <ol className="space-y-1.5 mt-2">
              {hist.map((h, i) => (
                <li key={i} className={`text-[11px] flex flex-wrap items-center gap-x-2 ${h.kind === 'return' ? 'text-rose-700' : 'text-slate-600'}`}>
                  <span className="font-bold">{h.kind === 'return' ? 'إرجاع إلى' : h.kind === 'create' ? 'تسجيل الطلب —' : 'نقل إلى'} {STATUS_LABELS[h.status]}</span>
                  <span className="font-mono text-slate-400">{h.at.replace('T', ' ').slice(0, 16)}</span>
                  {h.by && <span className="text-slate-400">بواسطة {h.by}</span>}
                  {h.note && <span className="w-full font-bold">السبب: {h.note}</span>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {/* ---- إجراءات الشاشة حسب المرحلة ---- */}
      {mode === 'requests' && request.status === 'repaired' && <ReceiptActions request={request} move={move} />}

      {isManager && request.status === 'new' && <div className="bg-white rounded-2xl border border-slate-100 shadow p-5">{managerNewActions}</div>}
      {isManager && request.status === 'parts_purchased' && <div className="bg-white rounded-2xl border border-slate-100 shadow p-5">{managerPurchasedActions}</div>}
      {isManager && request.status === 'receipt_rejected' && <div className="bg-white rounded-2xl border border-slate-100 shadow p-5">{managerRejectedActions}</div>}
      {isManager && request.status === 'in_workshop' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow p-5">
          <button type="button" onClick={() => move('pending_invoice', {}, 'تم الانتهاء — الطلب راح لشاشة فواتير الصيانة.')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> تم الانتهاء</button>
        </div>
      )}

      {mode === 'parts' && request.status === 'parts_requested' && <PurchaseActions request={request} move={move} onToast={onToast} />}

      {/* ---- الفاتورة ---- */}
      {mode === 'accounting' && request.status === 'pending_invoice' && !invoice && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow p-5">
          <button type="button" onClick={() => db.openMaintenanceInvoice(request.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Receipt className="w-4 h-4" /> فتح الفاتورة وكتابة البنود</button>
        </div>
      )}
      {invoice && ['pending_invoice', 'invoice_review', 'invoice_approved', 'repaired', 'closed', 'receipt_rejected'].includes(request.status) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-3">
          <h4 className="font-extrabold text-slate-700 flex items-center gap-1.5"><Receipt className="w-4 h-4 text-emerald-500" /> فاتورة الصيانة</h4>
          <MaintenanceInvoicePanel
            invoiceId={invoice.id}
            panelMode={mode === 'accounting' && request.status === 'pending_invoice' ? 'edit' : isManager && request.status === 'invoice_review' ? 'approve' : 'view'}
            canPrint={['repaired', 'closed', 'receipt_rejected'].includes(request.status) || (isManager && request.status === 'invoice_review')}
            submitLabel={mode === 'accounting' && request.status === 'pending_invoice' ? 'حفظ الفاتورة وإرسالها لاعتماد مدير الصيانة' : isManager && request.status === 'invoice_review' ? 'اعتماد الفاتورة والخصم وحفظ' : undefined}
            onSubmit={() => {
              if (mode === 'accounting') move('invoice_review', {}, 'تم حفظ الفاتورة وإرسالها لمدير الصيانة للاعتماد.');
              else move('invoice_approved', {}, 'تم اعتماد الفاتورة — ظهرت في شاشة فواتير الصيانة للطباعة والإغلاق.');
            }}
            onToast={onToast}
          />
        </div>
      )}

      {mode === 'accounting' && request.status === 'invoice_approved' && invoice && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => {
            if (!window.confirm('إغلاق الطلب هيخصم تكلفة الفاتورة على السيارة ويحوّل الطلب لـ «تم الإصلاح». متابعة؟')) return;
            db.updateMaintenanceInvoice(invoice.id, { status: 'approved', invoice_date: today() });
            move('repaired', {}, 'تم إغلاق الطلب وخصم التكلفة على السيارة — الطلب راح لشاشة طلب الصيانة تحت «تم الإصلاح».');
          }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> إغلاق الطلب وخصم التكلفة على السيارة</button>
          <button type="button" onClick={() => setShowPrint(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Printer className="w-4 h-4" /> طباعة الفاتورة</button>
        </div>
      )}
      {showPrint && invoice && (
        <A5PrintPreview
          type="maintenance_invoice"
          maintenanceInvoiceData={{
            invoice, request, carNumber: car?.car_number || '',
            odometer: reqOdo !== undefined ? String(reqOdo) : '',
            workshopName: workshopLabel === '—' ? '' : workshopLabel,
            faultDescription: request.fault_description,
          }}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}

// ====== استلام السيارة بعد الإصلاح: تم الاستلام أو إرجاع للصيانة بسبب ======
function ReceiptActions({ request, move }: { request: MaintenanceRequest; move: (s: MaintenanceRequestStatus, extra?: any, toast?: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow p-5 space-y-3">
      <p className="font-extrabold text-emerald-700 text-sm">استلام السيارة بعد الإصلاح</p>
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => move('closed', { _note: 'تم الاستلام' }, 'تم استلام السيارة وإغلاق الطلب.')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> تم الاستلام</button>
          <button type="button" onClick={() => setRejecting(true)} className="bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs px-4 py-2.5 rounded-lg">إرجاع للصيانة مرة أخرى</button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب رفض الاستلام (إلزامي)" className="w-full p-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-rose-400" />
          <div className="flex gap-2">
            <button type="button" onClick={() => { if (!reason.trim()) return; move('receipt_rejected', { _kind: 'return', _note: reason.trim() }, 'تم إرجاع الطلب لمدير الصيانة تحت «رفض الاستلام».'); }} className="bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs px-4 py-2.5 rounded-lg">إرسال لمدير الصيانة</button>
            <button type="button" onClick={() => setRejecting(false)} className="bg-white border border-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== شراء قطع الغيار: «تم الشراء» + صورة الفاتورة بالكاميرا ======
function PurchaseActions({ request, move, onToast }: { request: MaintenanceRequest; move: (s: MaintenanceRequestStatus, extra?: any, toast?: string) => void; onToast: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { setImage(await compressImage(file)); } catch (err: any) { onToast(err?.message || 'تعذر معالجة الصورة'); }
    setBusy(false);
    e.target.value = '';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow p-5 space-y-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> تم الشراء</button>
      ) : (
        <div className="space-y-3">
          <p className="font-extrabold text-slate-700 text-sm">إرفاق فاتورة الشراء</p>
          <label className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg cursor-pointer">
            <Camera className="w-4 h-4" /> {image ? 'إعادة التصوير' : 'تصوير الفاتورة بالكاميرا'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          </label>
          {busy && <p className="text-[11px] text-slate-500">جاري معالجة الصورة...</p>}
          {image && <img src={image} alt="معاينة الفاتورة" className="max-h-64 rounded-lg border border-slate-200" />}
          <div className="flex gap-2">
            <button type="button" disabled={!image || busy} onClick={() => move('parts_purchased', { purchase_invoice_image: image }, 'تم تسجيل الشراء — الطلب راح لمدير الصيانة لتوجيهه للورشة.')} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Save className="w-4 h-4" /> حفظ</button>
            <button type="button" onClick={() => { setOpen(false); setImage(''); }} className="bg-white border border-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg">إلغاء</button>
          </div>
          {!image && <p className="text-[11px] text-slate-400">لازم تصوّر الفاتورة قبل الحفظ.</p>}
        </div>
      )}
    </div>
  );
}

// ====== فاتورة الصيانة: edit = المحاسب يكتب البنود | approve = المدير يعتمد الخصم | view = عرض ======
function MaintenanceInvoicePanel({ invoiceId, panelMode, canPrint, submitLabel, onSubmit, onToast }: {
  invoiceId: string; panelMode: 'edit' | 'approve' | 'view'; canPrint: boolean; submitLabel?: string; onSubmit?: () => void; onToast: (t: string) => void;
}) {
  const db = useDb();
  const invoice = db.maintenanceInvoices.find(i => i.id === invoiceId);
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [discountDraft, setDiscountDraft] = useState(invoice ? String(invoice.discount || 0) : '0');
  const [showPrint, setShowPrint] = useState(false);

  if (!invoice) return null;
  const canEditItems = panelMode === 'edit';
  const canEditDiscount = panelMode === 'approve';

  const handleUpdateItemPrice = (itemId: string, value: string) => {
    const unit_price = num(value);
    db.updateMaintenanceInvoice(invoice.id, { items: invoice.items.map(i => i.id === itemId ? { ...i, unit_price, total: unit_price * i.quantity } : i) });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    const q = num(qty) || 1;
    const p = num(price);
    db.addMaintenanceInvoiceItem(invoice.id, { description: desc.trim(), item_type: 'labor', quantity: q, unit_price: p, total: q * p });
    setDesc(''); setQty('1'); setPrice('');
  };

  const subtotal = invoice.items.reduce((s, i) => s + (i.total || 0), 0);
  const discountValue = canEditDiscount ? num(discountDraft) : (invoice.discount || 0);
  const net = subtotal - discountValue;

  const request = db.maintenanceRequests.find(r => r.id === invoice.maintenance_request_id);
  const carNumber = db.cars.find(c => c.id === (request?.car_id || invoice.car_id))?.car_number || '';
  const workshop = request ? (request.workshop_type === 'external' ? (request.workshop_name || 'ورشة خارجية') : (request.workshop_name || 'ورشة الشركة')) : '';

  const handleSubmit = () => {
    if (panelMode === 'edit') {
      if (invoice.items.length === 0) { onToast('اكتب بند واحد على الأقل في الفاتورة.'); return; }
      if (subtotal <= 0) { onToast('أدخل أسعار البنود قبل الحفظ.'); return; }
    }
    if (canEditDiscount) {
      const d = num(discountDraft);
      if (d < 0 || d > subtotal) { onToast('الخصم لازم يكون بين صفر وإجمالي الفاتورة.'); return; }
      db.updateMaintenanceInvoice(invoice.id, { discount: d });
    }
    onSubmit && onSubmit();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-slate-400 text-xs">{invoice.invoice_number}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <th className="py-2 px-2.5">البند</th><th className="py-2 px-2.5">الكمية</th><th className="py-2 px-2.5">السعر</th><th className="py-2 px-2.5">الإجمالي</th><th className="py-2 px-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(item => (
              <tr key={item.id} className="border-b border-slate-50">
                <td className="py-2 px-2.5 font-bold text-slate-700">{item.description}</td>
                <td className="py-2 px-2.5 font-mono">{item.quantity}</td>
                <td className="py-2 px-2.5">
                  {canEditItems ? <input type="number" step="0.01" min="0" defaultValue={item.unit_price} onBlur={(e) => handleUpdateItemPrice(item.id, e.target.value)} className="w-20 p-1 rounded border border-slate-200 font-mono" /> : <span className="font-mono">{item.unit_price}</span>}
                </td>
                <td className="py-2 px-2.5 font-mono font-bold">{(item.total || 0).toLocaleString()}</td>
                <td className="py-2 px-1 text-center">
                  {canEditItems && <button type="button" onClick={() => db.deleteMaintenanceInvoiceItem(invoice.id, item.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>
              </tr>
            ))}
            {invoice.items.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-slate-400">لسه مفيش بنود.</td></tr>}
          </tbody>
        </table>
      </div>

      {canEditItems && (
        <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-[1fr,80px,110px,auto] gap-2">
          <input type="text" placeholder="بند الفاتورة (قطعة، مصنعية...)" value={desc} onChange={(e) => setDesc(e.target.value)} className="p-2 rounded-lg border border-slate-200 text-xs" />
          <input type="number" min="1" placeholder="كمية" value={qty} onChange={(e) => setQty(e.target.value)} className="p-2 rounded-lg border border-slate-200 text-xs font-mono" />
          <input type="number" step="0.01" min="0" placeholder="السعر" value={price} onChange={(e) => setPrice(e.target.value)} className="p-2 rounded-lg border border-slate-200 text-xs font-mono" />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> إضافة بند</button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 rounded-xl p-3 text-xs">
        <div className="text-slate-500">الإجمالي قبل الخصم: <span className="font-mono font-bold text-slate-700">{subtotal.toLocaleString()}</span></div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">الخصم:</span>
          {canEditDiscount
            ? <input type="number" step="0.01" min="0" value={discountDraft} onChange={(e) => setDiscountDraft(e.target.value)} className="w-24 p-1.5 rounded border border-slate-200 font-mono" />
            : <span className="font-mono font-bold text-slate-700">{(invoice.discount || 0).toLocaleString()} ج.م</span>}
        </div>
        <div className="text-sm font-black text-slate-800">الصافي: <span className="font-mono text-emerald-600">{net.toLocaleString()} ج.م</span></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {submitLabel && (
          <button type="button" onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Save className="w-4 h-4" /> {submitLabel}</button>
        )}
        {canPrint && (
          <button type="button" onClick={() => setShowPrint(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"><Printer className="w-4 h-4" /> طباعة A5</button>
        )}
      </div>

      {showPrint && (
        <A5PrintPreview
          type="maintenance_invoice"
          maintenanceInvoiceData={{
            invoice: canEditDiscount ? { ...invoice, discount: discountValue } : invoice,
            request,
            carNumber,
            odometer: typeof request?.odometer === 'number' ? String(request.odometer) : '',
            workshopName: workshop,
            faultDescription: request?.fault_description || '',
          }}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}

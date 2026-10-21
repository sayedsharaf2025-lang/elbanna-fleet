/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Violation } from '../types';
import {
  AlertOctagon,
  Search,
  Plus,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Upload
} from 'lucide-react';
import { PdfViolationImport } from './PdfViolationImport';

export const ViolationsTab: React.FC = () => {
  const db = useDb();
  const [activeSubTab, setActiveSubTab] = useState<'manual' | 'pdf_import'>('manual');

  // Form Fields
  const [violationDate, setViolationDate] = useState(new Date().toISOString().split('T')[0]);
  const [carNumberInput, setCarNumberInput] = useState('');
  const [driverIdInput, setDriverIdInput] = useState('');
  const [violationDesc, setViolationDesc] = useState('');
  const [amountVal, setAmountVal] = useState('');

  // Lists and Search
  const [searchText, setSearchText] = useState('');

  // Autocomplete Suggestions State
  const [carSuggestions, setCarSuggestions] = useState<string[]>([]);
  const [driverSuggestions, setDriverSuggestions] = useState<{ id: string; name: string }[]>([]);

  // Unique Constraint Intercept Dialog State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingViolationPayload, setPendingViolationPayload] = useState<any | null>(null);
  const [duplicateConflictingRecord, setDuplicateConflictingRecord] = useState<Violation | null>(null);

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'warning' | null; text: string }>({ type: null, text: '' });

  // Autocomplete handlers
  const handleCarInputChange = (val: string) => {
    setCarNumberInput(val);
    if (!val.trim()) {
      setCarSuggestions([]);
      return;
    }
    // Filter matching license plates
    const matches = db.cars
      .filter(car => car.car_number.includes(val))
      .map(car => car.car_number);
    setCarSuggestions(matches);
  };

  const handleDriverSelectChange = (val: string) => {
    setDriverIdInput(val);
  };

  const showToast = (text: string, type: 'success' | 'warning') => {
    setToastMsg({ type, text });
    setTimeout(() => {
      setToastMsg({ type: null, text: '' });
    }, 4500);
  };

  const handleRegisterViolation = (e: React.FormEvent, forceBypass = false) => {
    e.preventDefault();
    if (!violationDate || !carNumberInput || !driverIdInput || !violationDesc || !amountVal) {
      alert("الرجاء تعبئة سائر حقول المخالفة!");
      return;
    }

    const payload = {
      violation_date: violationDate,
      car_number: carNumberInput.trim(),
      driver_id: driverIdInput,
      description: violationDesc,
      amount: Number(amountVal)
    };

    // Try executing insertion in database store
    const result = db.addViolation(payload, forceBypass);

    if (!result.success) {
      // Captures PostgreSQL Unique Constraint Intercept
      setPendingViolationPayload(payload);
      setDuplicateConflictingRecord(result.duplicateViolation || null);
      setShowDuplicateModal(true);
      return;
    }

    // Success
    showToast(`تم تسجيل المخالفة بنجاح وتوجيه مبلب الخصم (${payload.amount} ج.م) لحساب السائق.`, 'success');
    resetForm();
  };

  const resetForm = () => {
    setCarNumberInput('');
    setViolationDesc('');
    setAmountVal('');
    setCarSuggestions([]);
  };

  const handleChooseDeleteNew = () => {
    // Choice A: Cancel and delete the new one
    setShowDuplicateModal(false);
    setPendingViolationPayload(null);
    setDuplicateConflictingRecord(null);
    showToast("تم إلغاء التعديل وحذف المخالفة المكررة تلقائيًا بناءً على طلبك ومنع التكرار.", 'warning');
  };

  const handleChooseBypassExceptional = () => {
    // Choice B: Confirm Exceptional Entry
    if (pendingViolationPayload) {
      handleRegisterViolation({ preventDefault: () => {} } as any, true);
    }
    setShowDuplicateModal(false);
    setPendingViolationPayload(null);
    setDuplicateConflictingRecord(null);
  };

  // CSV Report Generator
  const handleExportViolations = () => {
    const headers = 'تاريخ المخالفة,رقم السيارة,السائق المستحق,البيان والسبب,القيمة المالية ج.م\n';
    const rows = db.violations.map(v => {
      const drv = db.drivers.find(d => d.id === v.driver_id);
      return `${v.violation_date},${v.car_number},${drv?.name || "عام"},${v.description},${v.amount}`;
    }).join('\n');

    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `violations_violations_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  // Helper to resolve the latest car number dynamically based on digits
  const getLatestCarNumber = (carNumber: string): string => {
    if (!carNumber) return carNumber;
    const vDigits = (carNumber.match(/\d+/) || [])[0];
    if (vDigits) {
      const matchedCar = db.cars.find(c => {
        const cDigits = (c.car_number.match(/\d+/) || [])[0];
        return cDigits === vDigits;
      });
      if (matchedCar) return matchedCar.car_number;
    }
    return carNumber;
  };

  // Filters
  const filteredViolations = db.violations.filter(v => {
    const drv = db.drivers.find(d => d.id === v.driver_id);
    const text = searchText.toLowerCase().trim();
    if (!text) return true;
    
    const latestPlate = getLatestCarNumber(v.car_number).toLowerCase();
    
    return (
      v.car_number.toLowerCase().includes(text) ||
      latestPlate.includes(text) ||
      (drv && drv.name.toLowerCase().includes(text)) ||
      v.description.toLowerCase().includes(text)
    );
  });

  return (
    <div className="space-y-6" id="violations_tab" style={{ direction: 'rtl' }}>
      
      {/* Sub-tab Navigation */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        <button
          onClick={() => setActiveSubTab('manual')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all ${activeSubTab === 'manual' ? 'border-rose-500 text-rose-700 bg-rose-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Plus className="w-3.5 h-3.5" /> تسجيل يدوي
        </button>
        <button
          onClick={() => setActiveSubTab('pdf_import')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all ${activeSubTab === 'pdf_import' ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Upload className="w-3.5 h-3.5" /> استيراد من PDF
        </button>
      </div>

      {/* PDF Import Tab */}
      {activeSubTab === 'pdf_import' && <PdfViolationImport />}

      {/* Manual Tab content */}
      {activeSubTab === 'manual' && <>

      {/* Toast Alert Notice */}
      {toastMsg.text && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs md:text-sm animate-pulse ${toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-400/20 text-emerald-800' : 'bg-amber-50 border-amber-400/20 text-amber-800'}`}>
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-bold">{toastMsg.text}</span>
        </div>
      )}

      {/* Unique Constraint warning popover popup */}
      {showDuplicateModal && pendingViolationPayload && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-red-200 overflow-hidden text-right">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white p-4 flex items-center gap-2.5">
              <AlertOctagon className="w-6 h-6 animate-bounce" />
              <div>
                <h4 className="font-extrabold text-sm md:text-base">تحذير أمان: قيد فريد مانع للتكرار صلب!</h4>
                <p className="text-[10px] text-red-150">INTEGRITY_CONSTRAINT_VIOLATION: (violation_date, car_number)</p>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs font-sans">
              <div className="bg-red-50 border border-red-500/10 p-3.5 rounded-xl space-y-1.5 text-slate-700">
                <span className="font-bold text-red-800 block text-xs">وقع تدارك تكرار مخالفات ماليّة للسيارة:</span>
                <p>مخالفة مدخلة جديدة بالسيارة <span className="font-bold text-slate-950">({pendingViolationPayload.car_number})</span> في يوم تاريخ <span className="font-bold text-slate-950">({pendingViolationPayload.violation_date})</span> تتطابق مع سجل فعال بالسيستم مسبقاً.</p>
              </div>

              {duplicateConflictingRecord && (
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                  <span className="font-bold text-slate-600 block text-[10px]">المخالفة المسجلة الحالية بالداتابيز:</span>
                  <p className="font-medium text-slate-700">• السبب: <span className="font-bold text-slate-950">{duplicateConflictingRecord.description}</span></p>
                  <p className="font-medium text-slate-700">• القيمة: <span className="font-bold text-slate-900">{duplicateConflictingRecord.amount} ج.م</span></p>
                </div>
              )}

              <p className="text-slate-500 font-medium leading-relaxed">
                وفقًا لتعليمات كراسة إدارة عهد البنا جروب الصارمة، لمنع تكرار الحسابات يجب معالجة التضارب ماليًا. كيف تود التصرف؟
              </p>

              <div className="pt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleChooseDeleteNew}
                  className="bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-xl font-bold transition-all text-center shadow-md focus:ring-2 focus:ring-red-400"
                >
                  حذف المخالفة الجديدة وإلغاء التسجيل
                </button>
                <button
                  type="button"
                  onClick={handleChooseBypassExceptional}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-100 py-3 px-4 rounded-xl font-bold transition-all border border-slate-700 text-center focus:ring-2 focus:ring-slate-500"
                >
                  تأكيد الإدخال الاستثنائي (تجاوز برمجي)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Registration Form Car Column */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 h-fit">
          <div className="border-b border-slate-50 pb-2.5">
            <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              تسجيل مخالفة مرورية جديدة
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">تسجيل الدفوعات والمستحقات المستقطعة من مرتب السائق</p>
          </div>

          <form onSubmit={(e) => handleRegisterViolation(e, false)} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-500 font-bold mb-1">تاريخ ارتكاب المخالفة</label>
              <input
                type="date"
                required
                className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono"
                value={violationDate}
                onChange={(e) => setViolationDate(e.target.value)}
              />
            </div>

            <div className="relative">
              <label className="block text-slate-500 font-bold mb-1">رقم السيارة (اكتب للإكمال التلقائي)</label>
              <input
                type="text"
                required
                placeholder="أ ب ج 1234..."
                className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 bg-slate-50/50"
                value={carNumberInput}
                onChange={(e) => handleCarInputChange(e.target.value)}
                autoComplete="off"
              />
              
              {/* Autocomplete Box */}
              {carSuggestions.length > 0 && (
                <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-36 overflow-y-auto">
                  {carSuggestions.map((plate, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setCarNumberInput(plate);
                        setCarSuggestions([]);
                        // Auto lookup driver
                        const relatedCar = db.cars.find(c => c.car_number === plate);
                        if (relatedCar && relatedCar.driver_id) {
                          setDriverIdInput(relatedCar.driver_id);
                        }
                      }}
                      className="w-full text-right p-2 hover:bg-slate-50 text-[11px] text-slate-700 font-mono font-bold block border-b border-slate-100 last:border-none"
                    >
                      🚗 {plate}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-500 font-bold mb-1">السائق المسؤول (تثبيت الغرامة عليه)</label>
              <select
                required
                className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
                value={driverIdInput}
                onChange={(e) => handleDriverSelectChange(e.target.value)}
              >
                <option value="">-- اختر السائق المكلف بالخصم --</option>
                {db.drivers.map(drv => (
                  <option key={drv.id} value={drv.id}>{drv.name} (كود: {drv.driver_code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-500 font-bold mb-1">وصف وموقع المخالفة</label>
              <textarea
                required
                rows={2}
                placeholder="مثل: كسر إشارة أو السرعة الزائدة على طريق بورسعيد"
                className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                value={violationDesc}
                onChange={(e) => setViolationDesc(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-500 font-bold mb-1">مبلغ المخالفة المالي (ج.م)</label>
              <input
                type="number"
                required
                min={1}
                placeholder="مثال: 500"
                className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono font-bold"
                value={amountVal}
                onChange={(e) => setAmountVal(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl transition-all shadow flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              تسجيل المخالفة وحفظ القيد الفريد
            </button>
          </form>
        </div>

        {/* List Log Column */}
        <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm md:text-base">سجل المخالفات المرورية الجاري بالشركة ({db.violations.length})</h3>
              <p className="text-[11px] text-slate-400">تحديث فوري Real-time ومحاكاة دقيقة للفحص المزدوج</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportViolations}
                type="button"
                className="bg-slate-100 hover:bg-slate-200 hover:text-slate-800 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير التقرير
              </button>
              <div className="relative text-xs">
                <input
                  type="text"
                  placeholder="بحث بالسائق أو رقم اللوحة..."
                  className="pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right my-2">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="py-2.5 px-3">تاريخ المخالفة</th>
                  <th className="py-2.5 px-3">رقم السيارة</th>
                  <th className="py-2.5 px-3">اسم السواق المسؤول</th>
                  <th className="py-2.5 px-3">التفاصيل والوصف</th>
                  <th className="py-2.5 px-3 text-left">قيمة الغرامة</th>
                  <th className="py-2.5 px-3 text-left">خيارات</th>
                </tr>
              </thead>
              <tbody>
                {filteredViolations.map(v => {
                  const drv = db.drivers.find(d => d.id === v.driver_id);
                  return (
                    <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-medium text-slate-600">{v.violation_date}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                          {getLatestCarNumber(v.car_number)}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-800">{drv?.name || "سائق غير مسجل"}</td>
                      <td className="py-3 px-3 font-medium text-slate-500 max-w-[180px] truncate" title={v.description}>{v.description}</td>
                      <td className="py-3 px-3 text-left font-mono font-extrabold text-rose-600">{v.amount.toLocaleString()} ج.م</td>
                      <td className="py-3 px-3 text-left">
                        <button
                          onClick={() => {
                            if (confirm(`هل أنت متأكد من إلغاء وحذف هذه المخالفة؟ سيتم رد المبلغ المستحق (${v.amount} ج.م) لحساب السائق.`)) {
                              db.deleteViolation(v.id);
                              showToast(`تم حذف المخالفة وتسوية مستحقات السائق ${drv?.name} بنجاح.`, 'success');
                            }
                          }}
                          type="button"
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition-all"
                          title="حذف المخالفة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredViolations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">لا توجد مخالفات في السجل تطابق بحثك حاليًا.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      </>}
    </div>
  );
};

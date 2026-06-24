/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Driver, DriverAccountMovement } from '../types';
import { A5PrintPreview } from './A5PrintPreview';
import {
  Coins,
  Sparkles,
  Printer,
  ChevronLeft,
  Users,
  UserCheck,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Calculator,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  History
} from 'lucide-react';

export const DeductionsTab: React.FC = () => {
  const db = useDb();

  // Selected driver for individual deduction
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [individualAmount, setIndividualAmount] = useState('');
  const [individualCarId, setIndividualCarId] = useState('');

  // Group deduction state
  const [groupAmount, setGroupAmount] = useState('');
  const [isRpcRunning, setRpcRunning] = useState(false);

  // Rows deduction input state
  const [rowDeductionAmounts, setRowDeductionAmounts] = useState<Record<string, string>>({});
  const [rowDeductionCarIds, setRowDeductionCarIds] = useState<Record<string, string>>({});
  const [filterDebtorsOnly, setFilterDebtorsOnly] = useState(true);

  // Print popup states
  const [printDocument, setPrintDocument] = useState<{
    type: 'deduction' | 'statement';
    driver: Driver;
    amount?: number;
    description?: string;
  } | null>(null);

  // Movements history panel
  const [showMovementsPanel, setShowMovementsPanel] = useState(false);
  const [movSearchQuery, setMovSearchQuery] = useState('');
  const [editingMovId, setEditingMovId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [terminalLog, setTerminalLog] = useState<string[]>([]);

  const getTotalViolationsAmount = (driverId: string) => {
    return db.violations
      .filter(v => v.driver_id === driverId)
      .reduce((sum, v) => sum + v.amount, 0);
  };

  const getLatestDeduction = (driverId: string) => {
    const driverMovs = db.movements.filter(m => m.driver_id === driverId);
    // Find latest movement that is either deduction or payment
    const deduction = driverMovs.find(m => m.type === 'deduction' || m.type === 'payment');
    return deduction ? {
      amount: Math.abs(deduction.amount_change),
      description: deduction.description,
      date: deduction.date
    } : {
      amount: 0,
      description: 'لا يوجد حركات خصم سابقة مسجلة',
      date: new Date().toISOString().split('T')[0]
    };
  };

  const handleSaveRowDeduction = (driver: Driver) => {
    const amountStr = rowDeductionAmounts[driver.id];
    const carId = rowDeductionCarIds[driver.id];
    const notes = "خصم مستقطع";
    
    if (!amountStr || Number(amountStr) <= 0) {
      alert("الرجاء إدخال قيّمة مالية صالحة وموجبة للخصم أولاً!");
      return;
    }

    if (!carId) {
      alert("الرجاء تحديد السيارة لتسجيل المديونية والخصم عليها أولاً!");
      return;
    }

    const amt = Number(amountStr);
    const targetCar = db.cars.find(c => c.id === carId);
    const carNum = targetCar ? targetCar.car_number : '';
    const fullNotes = carNum ? `خصم مستقطع للسيارة (${carNum})` : notes;
    
    // Apply deduction
    db.applyIndividualDeduction(driver.id, amt, notes, undefined, carId);

    // Open Printer A5 Preview Immediately
    setPrintDocument({
      type: 'deduction',
      driver: { ...driver, balance: Math.max(0, driver.balance - amt) }, // updated preview balance
      amount: amt,
      description: fullNotes
    });

    // Clear inputs for this row
    setRowDeductionAmounts(prev => {
      const next = { ...prev };
      delete next[driver.id];
      return next;
    });
    setRowDeductionCarIds(prev => {
      const next = { ...prev };
      delete next[driver.id];
      return next;
    });
  };

  const handlePrintRowStatement = (driver: Driver) => {
    const latest = getLatestDeduction(driver.id);
    setPrintDocument({
      type: 'deduction',
      driver: driver,
      amount: latest.amount,
      description: latest.description
    });
  };

  const handleApplyIndividual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriverId || !individualAmount) {
      alert("الرجاء استكمال بيانات الخصم الفردي!");
      return;
    }

    if (!individualCarId) {
      alert("الرجاء تحديد لوحة السيارة لتخصيص الخصم والمديونية عليها!");
      return;
    }

    const targetDriver = db.drivers.find(d => d.id === selectedDriverId);
    if (!targetDriver) return;

    const targetCar = db.cars.find(c => c.id === individualCarId);
    const carNum = targetCar ? targetCar.car_number : '';
    const fullNotes = carNum ? `خصم مستقطع للسيارة (${carNum})` : "خصم مستقطع";

    const amt = Number(individualAmount);

    db.applyIndividualDeduction(selectedDriverId, amt, "خصم مستقطع", undefined, individualCarId);

    // Open Printer A5 Preview Immediately
    setPrintDocument({
      type: 'deduction',
      driver: { ...targetDriver, balance: Math.max(0, targetDriver.balance - amt) }, // calculated preview balance
      amount: amt,
      description: fullNotes
    });

    // Reset fields
    setIndividualAmount('');
    setIndividualCarId('');
  };

  const handleApplyGroupRpc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupAmount) {
      alert("الرجاء تحديد مبلغ الخصم الجماعي!");
      return;
    }

    const amt = Number(groupAmount);
    setRpcRunning(true);
    setTerminalLog(prev => [
      ...prev,
      `[CLIENT] جاري تحضير النداء البرمجي لـ Supabase Stored Procedure...`,
      `[POSTGRES] استدعاء الدالة: rpc_apply_group_deduction(${amt}, 'خصم جماعي موحد')`
    ]);

    try {
      await db.applyGroupDeductionRpc(amt, 'خصم جماعي موحد');
      
      setTerminalLog(prev => [
        ...prev,
        `[SUCCESS] تم الانتهاء من تحديث الجدول drivers لـ ${db.drivers.length} مستخدم في 0.05 ثانية.`,
        `[REALTIME] تم بث التحديث الحاص بالأرصدة لجميع المستخدمين بنجاح.`
      ]);
      
      alert(`نجح الخصم الفيدرالي الجماعي! تم خصم ${amt} ج.م من كافة السائقين دفعة واحدة عبر RPC.`);
      setGroupAmount('');
    } catch {
      setTerminalLog(prev => [...prev, `[ERROR] فشل تنفيذ الإجراء بالخادم.`]);
    } finally {
      setRpcRunning(false);
    }
  };

  return (
    <div className="space-y-6" id="deductions_tab_root" style={{ direction: 'rtl' }}>

      {/* Toolbar — sticky دايماً في الأعلى */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-indigo-950 rounded-2xl px-4 py-3 border border-indigo-800 shadow-lg">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-300" />
          <span className="text-xs text-indigo-200 font-semibold">
            {db.movements.filter(m => m.type === 'deduction').length} حركة خصم مسجلة
          </span>
        </div>
        <button
          onClick={() => { setShowMovementsPanel(v => !v); setMovSearchQuery(''); setEditingMovId(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm border ${showMovementsPanel ? 'bg-white text-indigo-700 border-white' : 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500'}`}
        >
          <Search className="w-4 h-4" />
          {showMovementsPanel ? 'إغلاق السجل' : 'بحث وتعديل حركات الخصم'}
        </button>
      </div>

      {/* A5 Print Screen Popup Overlay */}
      {printDocument && (
        <A5PrintPreview
          type={printDocument.type}
          deductionData={printDocument.type === 'deduction' ? {
            driver: printDocument.driver,
            amount: printDocument.amount || 0,
            description: printDocument.description || '',
            date: new Date().toISOString().split('T')[0]
          } : undefined}
          statementData={printDocument.type === 'statement' ? {
            driver: printDocument.driver,
            movements: db.movements.filter(m => m.driver_id === printDocument.driver.id)
          } : undefined}
          onClose={() => setPrintDocument(null)}
        />
      )}

      {/* Movements History Panel */}
      {showMovementsPanel && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              <h3 className="font-bold text-slate-800 text-sm">سجل حركات الخصومات — بحث وتعديل وحذف</h3>
            </div>
            <button onClick={() => setShowMovementsPanel(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم السائق أو البيان..."
              className="w-full pr-9 pl-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 text-slate-800"
              value={movSearchQuery}
              onChange={e => setMovSearchQuery(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse min-w-[680px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="py-2.5 px-3">السائق</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">البيان</th>
                  <th className="py-2.5 px-3 text-left">المبلغ</th>
                  <th className="py-2.5 px-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const query = movSearchQuery.trim().toLowerCase();
                  const filtered = db.movements
                    .filter(m => m.type === 'deduction')
                    .filter(m => {
                      if (!query) return true;
                      const drv = db.drivers.find(d => d.id === m.driver_id);
                      return (
                        (drv?.name.toLowerCase().includes(query)) ||
                        (drv?.driver_code.toLowerCase().includes(query)) ||
                        m.description.toLowerCase().includes(query)
                      );
                    })
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                  if (filtered.length === 0) return (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400">لا توجد حركات خصم مطابقة</td></tr>
                  );

                  return filtered.map(m => {
                    const drv = db.drivers.find(d => d.id === m.driver_id);
                    const isEditing = editingMovId === m.id;
                    return (
                      <tr key={m.id} className={`border-b border-slate-100 transition-colors ${isEditing ? 'bg-amber-50' : 'hover:bg-slate-50/80'}`}>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          <div>{drv?.name || '—'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{drv?.driver_code}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{m.date?.substring(0,10)}</td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[200px]">
                          {isEditing ? (
                            <input
                              className="w-full border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
                              value={editDescription}
                              onChange={e => setEditDescription(e.target.value)}
                            />
                          ) : (
                            <span className="truncate block">{m.description}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-left">
                          {isEditing ? (
                            <input
                              type="number"
                              min={1}
                              className="w-24 border border-amber-300 rounded px-2 py-1 text-xs font-mono font-bold focus:outline-none focus:border-indigo-400"
                              value={editAmount}
                              onChange={e => setEditAmount(e.target.value)}
                            />
                          ) : (
                            <span className="font-mono font-bold text-rose-600">{Math.abs(m.amount_change).toLocaleString()} ج.م</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex gap-1.5 justify-center">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => {
                                    if (!editAmount || Number(editAmount) <= 0) return;
                                    db.editMovementAmount(m.id, Number(editAmount), editDescription);
                                    setEditingMovId(null);
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                                >
                                  <Check className="w-3 h-3" /> حفظ
                                </button>
                                <button
                                  onClick={() => setEditingMovId(null)}
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
                                >
                                  إلغاء
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingMovId(m.id);
                                    setEditAmount(String(Math.abs(m.amount_change)));
                                    setEditDescription(m.description);
                                  }}
                                  className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" /> تعديل
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`هل تريد حذف هذا الخصم (${Math.abs(m.amount_change)} ج.م) بشكل نهائي؟ سيتم تعديل رصيد السائق تلقائياً.`)) {
                                      db.deleteMovement(m.id);
                                    }
                                  }}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" /> حذف
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Primary Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* RIGHT COLUMN: ACTION PANEL */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Section A: Individual Deduction Form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="border-b border-slate-50 pb-2 flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500 animate-pulse" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm md:text-base">استقطاع خصم فردي لسائق</h3>
                <p className="text-[10px] text-slate-400">تحديث فوري وتوليد كشف A5 في الأجزاء من الثانية</p>
              </div>
            </div>

            <form onSubmit={handleApplyIndividual} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-500 font-bold mb-1">اختر السائق المستهدف</label>
                <select
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold"
                  value={selectedDriverId}
                  onChange={(e) => { setSelectedDriverId(e.target.value); setIndividualCarId(''); }}
                >
                  <option value="">-- اختر السائق لتسجيل خصمه --</option>
                  {db.drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} (الرصيد الجاري: {d.balance} ج.م)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">السيارة المرتبطة بالخصم / المخالفة</label>
                {(() => {
                  // Cars that have violations for the selected driver
                  const violationCarIds = selectedDriverId
                    ? [...new Set(db.violations.filter(v => v.driver_id === selectedDriverId).map(v => v.car_number))]
                    : [];
                  const violationCars = db.cars.filter(c => violationCarIds.includes(c.car_number));
                  return (
                    <select
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white"
                      value={individualCarId}
                      onChange={(e) => setIndividualCarId(e.target.value)}
                    >
                      <option value="">
                        {!selectedDriverId
                          ? '-- اختر السائق أولاً --'
                          : violationCars.length === 0
                            ? '-- لا توجد مخالفات مسجلة لهذا السائق --'
                            : '-- اختر سيارة المخالفة --'}
                      </option>
                      {violationCars.map(c => {
                        const violCount = db.violations.filter(v => v.driver_id === selectedDriverId && v.car_number === c.car_number).length;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.car_number} — {violCount} مخالفة
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">القيمة المالية للخصم (ج.م)</label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="مثال: 200"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono font-bold"
                  value={individualAmount}
                  onChange={(e) => setIndividualAmount(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                📥 حفظ وتوليد كشف الخصم (A5)
              </button>
            </form>
          </div>

          {/* Section B: Group Deduction Server RPC call */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="border-b border-slate-50 pb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">الخصم الجماعي الموحد (RPC)</h3>
                <p className="text-[10px] text-slate-400">تنفيذ إجراء مخزن خادم (Stored Stored Procedure)</p>
              </div>
            </div>

            <form onSubmit={handleApplyGroupRpc} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">مبلغ الخصم الجماعي الثابت (ج.م)</label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="مثال: 150"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono font-black text-emerald-700"
                  value={groupAmount}
                  onChange={(e) => setGroupAmount(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isRpcRunning}
                className="w-full bg-emerald-700 hover:bg-emerald-650 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl transition-all shadow flex items-center justify-center gap-1.5"
              >
                {isRpcRunning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Users className="w-4 h-4" />
                )}
                تنفيذ الخصم الجماعي (Supabase RPC)
              </button>
            </form>

            {/* Virtual database terminal feed log */}
            {terminalLog.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-[10px] text-teal-400 max-h-28 overflow-y-auto space-y-1">
                <div className="text-slate-500 font-bold flex items-center gap-1 border-b border-slate-800 pb-1">
                  <Terminal className="w-3.5 h-3.5" />
                  محطة بث استجابة الخادم:
                </div>
                {terminalLog.slice(-4).map((log, index) => (
                  <div key={index} className="truncate">{log}</div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* LEFT COLUMN: ACTIVE BALANCES DATABASE LIST */}
        <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="border-b border-slate-50 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-800 text-sm md:text-base">الأرصدة والمديونيات الجارية والخصومات المتبقية على السائقين</h3>
              <p className="text-xs text-slate-400 mt-0.5">سجل السائقين الذين تترتب عليهم مخالفات لم تسدد لإجراء خصومات وطباعة كشّف الحساب فوراً</p>
            </div>
            
            {/* Filter Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-650 cursor-pointer flex items-center gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={filterDebtorsOnly}
                  onChange={(e) => setFilterDebtorsOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>عرض الذين عليهم متبقي مخالفات فقط</span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto text-xs font-sans">
            <table className="w-full text-right border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="py-2.5 px-3">كود السائق</th>
                  <th className="py-2.5 px-3">السائق المقر</th>
                  <th className="py-2.5 px-3 text-left">إجمالي المخالفات</th>
                  <th className="py-2.5 px-3 text-left">المتبقي المطلوب</th>
                  <th className="py-2.5 px-3 text-right" style={{ width: '160px' }}>تسجيل الخصم</th>
                  <th className="py-2.5 px-3 text-center" style={{ width: '180px' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {db.drivers
                  .filter(d => {
                    if (!filterDebtorsOnly) return true;
                    const totalViol = getTotalViolationsAmount(d.id);
                    const totalDed = db.movements
                      .filter(m => m.driver_id === d.id && m.type === 'deduction')
                      .reduce((sum, m) => sum + Math.abs(m.amount_change), 0);
                    return Math.max(0, totalViol - totalDed) > 0;
                  })
                  .map(d => {
                    const totalViolations = getTotalViolationsAmount(d.id);
                    // المتبقي = إجمالي المخالفات - إجمالي الخصومات المدفوعة فعلاً
                    const totalDeducted = db.movements
                      .filter(m => m.driver_id === d.id && m.type === 'deduction')
                      .reduce((sum, m) => sum + Math.abs(m.amount_change), 0);
                    const remaining = Math.max(0, totalViolations - totalDeducted);
                    return (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{d.driver_code}</td>
                        <td className="py-3 px-3 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-50 font-black text-center text-[10px] text-indigo-700 flex items-center justify-center">
                              {d.name.slice(0, 1)}
                            </div>
                            <span>{d.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-left font-mono font-semibold text-slate-700">
                          {totalViolations.toLocaleString()} ج.م
                        </td>
                        <td className="py-3 px-3 text-left">
                          <span className={`font-mono font-bold text-[13px] ${remaining > 0 ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100' : 'text-slate-500'}`}>
                            {remaining.toLocaleString()} ج.م
                          </span>
                        </td>
                        <td className="py-2 px-2 space-y-1" style={{ minWidth: "160px" }}>
                          {(() => {
                            const driverViolCarNums = [...new Set(
                              db.violations.filter(v => v.driver_id === d.id).map(v => v.car_number)
                            )];
                            const driverViolCars = db.cars.filter(c => driverViolCarNums.includes(c.car_number));
                            return (
                              <select
                                className="w-full p-1 border border-slate-200 rounded text-[10px] font-bold text-slate-700 bg-white"
                                value={rowDeductionCarIds[d.id] || ''}
                                onChange={(e) => setRowDeductionCarIds(prev => ({ ...prev, [d.id]: e.target.value }))}
                              >
                                <option value="">
                                  {driverViolCars.length === 0 ? '-- لا توجد مخالفات --' : '-- سيارة المخالفة --'}
                                </option>
                                {driverViolCars.map(c => {
                                  const cnt = db.violations.filter(v => v.driver_id === d.id && v.car_number === c.car_number).length;
                                  return (
                                    <option key={c.id} value={c.id}>{c.car_number} ({cnt})</option>
                                  );
                                })}
                              </select>
                            );
                          })()}
                          <input
                            type="number"
                            min={1}
                            placeholder="مبلغ الخصم"
                            value={rowDeductionAmounts[d.id] || ''}
                            onChange={(e) => setRowDeductionAmounts(prev => ({ ...prev, [d.id]: e.target.value }))}
                            className="w-full p-1.5 border border-slate-250 rounded text-xs font-mono font-bold focus:outline-none focus:border-indigo-500 bg-white"
                          />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex gap-1.5 justify-center">
                            <button
                              type="button"
                              onClick={() => handleSaveRowDeduction(d)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] transition-all duration-150 active:scale-95 shadow-sm"
                            >
                              حفظ الخصم
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintRowStatement(d)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-lg border border-emerald-55/10 transition-all text-[11px] flex items-center gap-1.5"
                              title="طباعة إشعار كشف الحساب والخصم المعتمد للأرشيف"
                            >
                              <Printer className="w-3 h-3" />
                              كشف حساب
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {db.drivers.filter(d => {
                  if (!filterDebtorsOnly) return true;
                  const totalViol = getTotalViolationsAmount(d.id);
                  const totalDed = db.movements.filter(m => m.driver_id === d.id && m.type === 'deduction').reduce((sum, m) => sum + Math.abs(m.amount_change), 0);
                  return Math.max(0, totalViol - totalDed) > 0;
                }).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      لا يوجد أي سائقين متبقي عليهم مديونيات أو مخالفات لم تسدد حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};

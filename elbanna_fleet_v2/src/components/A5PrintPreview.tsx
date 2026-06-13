/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, ShieldAlert, CheckCircle2, History } from 'lucide-react';
import { Invoice, InvoiceItem, Driver, Official, DriverAccountMovement } from '../types';

interface A5PrintPreviewProps {
  id?: string;
  type: 'invoice' | 'deduction' | 'statement' | 'custody_statement';
  invoiceData?: {
    invoice: Invoice;
    items: InvoiceItem[];
    officialName: string;
    carsMap: Record<string, string>; // ID to plate number
    carsObjMap?: Record<string, any>; // ID to Car details
  };
  deductionData?: {
    driver: Driver;
    amount: number;
    description: string;
    date: string;
  };
  statementData?: {
    driver: Driver;
    movements: DriverAccountMovement[];
    month?: string;
    year?: string;
  };
  custodyData?: {
    accountId?: string;
    official: Official;
    accountName: string;
    balance: number;
    movements: any[];
  };
  onClose: () => void;
}

export const A5PrintPreview: React.FC<A5PrintPreviewProps> = ({
  type,
  invoiceData,
  deductionData,
  statementData,
  custodyData,
  onClose
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    document.body.classList.add('a5-print-active');
    return () => {
      document.body.classList.remove('a5-print-active');
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const getTodayDateString = () => {
    return new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" id="a5_print_preview_modal">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden no-print-modal-container">
        {/* Modal Controls toolbar */}
        <div className="bg-slate-900 text-slate-100 p-4 border-b border-slate-800 modal-toolbar no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                <Printer className="w-5 h-5 text-emerald-400" />
              </span>
              <div>
                <span className="font-bold text-sm md:text-base block text-slate-100">تحميل وحفظ الفاتورة كـ PDF (مقاس A5)</span>
                <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">💡 تلميح: اضغط "حفظ/طباعة" ثم اختر "Save as PDF" من خيارات وجهة الطباعة.</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <button
                onClick={handlePrint}
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500 font-extrabold text-xs text-white px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md hover:shadow-emerald-500/10 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                طباعة / حفظ بفورمات PDF
              </button>
              <button
                onClick={onClose}
                type="button"
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                title="إغلاق المعاينة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Printable Card Area */}
        <div className="p-8 bg-slate-950 max-h-[70vh] overflow-y-auto flex justify-center printable-wrapper">
          
          <div 
            ref={contentRef}
            className="p-4 shadow-2xl rounded relative text-right text-xs leading-relaxed font-sans font-print-styles"
            style={{ 
              direction: 'rtl',
              backgroundColor: '#ffffff',
              color: '#1e293b',
              width: '148mm',
              minHeight: '210mm',
              borderColor: '#cbd5e1',
              borderWidth: '1px'
            }}
            id="a5_print_document"
          >
            {/* العلامة المائية مخفية - تم الإلغاء بطلب الإدارة */}

            {/* Document Header Branding */}
            <div className="border-b border-slate-300 pb-1.5 mb-2.5 flex items-center justify-between">
              {/* Right Side: Beautiful Vector El Banna Group Corporate Logo */}
              <div className="flex items-center gap-2 pr-1">
                <div className="w-32 h-auto">
                  <svg viewBox="0 0 280 130" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
                    {/* Outer Gold G Ring */}
                    <path d="M 140 10 A 32 32 0 1 0 166 22 M 166 22 L 160 30 M 160 30 L 175 30 M 175 30 L 175 18" fill="none" stroke="#cca244" strokeWidth="4.5" strokeLinecap="round" />
                    
                    {/* Stylized B in center of Ring */}
                    <text x="131" y="58" fontFamily="'Times New Roman', Georgia, serif" fontSize="44" fontWeight="bold" fill="#cca244">B</text>
                    {/* Leaf detail on B */}
                    <path d="M 124 43 Q 118 42 113 47 Q 115 37 124 43 Z" fill="#cca244" />
                    <path d="M 124 43 L 118 40" stroke="#cca244" strokeWidth="1" />

                    {/* Since 1974 beside badge */}
                    <text x="180" y="52" fontFamily="'Times New Roman', Georgia, serif" fontSize="11" fontStyle="italic" fill="#3d2f21" fontWeight="bold">Since 1974</text>

                    {/* Lines and El Banna Text */}
                    <path d="M 5 68 L 95 68 M 185 68 L 275 68" stroke="#cca244" strokeWidth="1.5" strokeLinecap="round" />
                    <polygon points="95,67 100,68 95,69" fill="#cca244" />
                    <polygon points="185,67 180,68 185,69" fill="#cca244" />

                    <text x="140" y="94" fontFamily="'Times New Roman', Georgia, serif" fontSize="28" fontWeight="bold" fill="#3d2f21" textAnchor="middle" letterSpacing="1">EL BANNA</text>

                    <path d="M 10 107 L 85 107 M 195 107 L 270 107" stroke="#cca244" strokeWidth="1" />
                    <text x="140" y="114" fontFamily="'Helvetica Neue', Arial, sans-serif" fontSize="13" fontWeight="normal" fill="#3d2f21" textAnchor="middle" letterSpacing="4">GROUP</text>
                  </svg>
                </div>
              </div>
              
              {/* Left Side: Printing Date only */}
              <div className="text-left font-mono text-[9px] text-slate-600 pl-1 self-end mb-1">
                <p className="font-bold text-slate-800">تاريخ الطباعة: {getTodayDateString()}</p>
              </div>
            </div>

            {/* Title (Only visible for non-invoice documents to reduce head vertical space on A5 invoices) */}
            {type !== 'invoice' && (
              <div className="text-center my-2 bg-slate-50 py-1 rounded border border-slate-200">
                <h2 className="font-bold text-slate-900 text-[11px]">
                  {type === 'deduction' && 'كشف مالي - إشعار خصم سائق مستقطع'}
                  {type === 'statement' && `كشف حساب حركة الخصومات والمستحقات بالسائق`}
                  {type === 'custody_statement' && `كشف حساب فرعي وحركات عهدة`}
                </h2>
              </div>
            )}

            {/* Content Specific elements */}

            {/* 1. INVOICE RENDERING */}
            {type === 'invoice' && invoiceData && (
              <div className="space-y-2">
                {/* Specific A5 Header Layout requested by User */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 p-2 rounded text-[10px] border border-slate-200">
                  <div>
                    <span className="text-slate-600 font-medium font-sans font-sans">رقم السيارة المسجلة بالفاتورة:</span>{' '}
                    <span className="font-mono font-black text-indigo-700 text-xs text-right">
                      {invoiceData.invoice.car_id ? (invoiceData.carsMap[invoiceData.invoice.car_id] || "سيارة غير محددة") : "سيارة غير محددة"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 font-medium font-sans">نوع السيارة:</span>{' '}
                    <span className="font-extrabold text-slate-950">
                      {invoiceData.invoice.car_id ? (invoiceData.carsObjMap?.[invoiceData.invoice.car_id]?.car_type || "غير مسجل") : "غير مسجل"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 font-medium">مكان تواجد السيارة الحالي:</span>{' '}
                    <span className="font-bold text-slate-950">{invoiceData.invoice.car_location || 'غير محدد'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 font-medium font-sans font-sans">مكان الترخيص / المرور:</span>{' '}
                    <span className="font-bold text-emerald-700">{invoiceData.invoice.license_location || 'رئاسة مرور القاهرة والجيزة'}</span>
                  </div>
                  <div className="col-span-2 border-t border-b border-dashed border-slate-200 py-1 flex flex-wrap gap-x-4">
                    <span className="text-slate-600 font-medium font-sans">بيان وتفاصيل الترخيص:</span>{' '}
                    <span className="font-bold text-slate-950">{invoiceData.invoice.license_details || 'تجديد فحص وتأمين دوري من العهدة'}</span>
                  </div>
                  <div className="col-span-2 pt-0.5 flex justify-between text-slate-800 text-[9.5px]">
                    <span><span className="text-slate-600">مسئول التراخيص:</span> <span className="font-extrabold text-slate-950">{invoiceData.officialName}</span></span>
                    <span><span className="text-slate-600">رقم الفاتورة:</span> <span className="font-mono font-bold text-slate-950">{invoiceData.invoice.invoice_number}</span></span>
                    <span><span className="text-slate-600">تاريخ الفاتورة:</span> <span className="font-mono font-bold text-slate-950">{invoiceData.invoice.invoice_date}</span></span>
                  </div>
                </div>

                {/* Middle of invoice: newly added items table */}
                <div className="mt-2">
                  <table className="w-full text-right border-collapse text-[10px] border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-900 border-b border-slate-300 font-bold">
                        <th className="py-1 px-1.5 border border-slate-200 text-center w-6">م</th>
                        <th className="py-1 px-1.5 border border-slate-200">البيان</th>
                        <th className="py-1 px-1.5 border border-slate-200 text-left w-24">المبلغ (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const itemsToRender = invoiceData.items.length > 0 
                          ? [...invoiceData.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          : [{
                              id: 'fallback',
                              description: invoiceData.invoice.license_details || 'إجمالي مصروفات ترخيص ورسوم متنوعة معتمدة للسيارة',
                              amount: invoiceData.invoice.total_amount || 0,
                              payment_method: 'cash'
                            }];

                        return itemsToRender.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-250 hover:bg-slate-50">
                            <td className="py-1 px-1.5 border border-slate-200 font-mono text-center text-slate-900">{idx + 1}</td>
                            <td className="py-1 px-1.5 border border-slate-200 font-medium text-slate-900">{item.description}</td>
                            <td className="py-1 px-1.5 border border-slate-200 text-left font-mono font-bold text-slate-950">{(item.amount || 0).toLocaleString()} ج.م</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                    <tfoot>
                      <tr className="font-black bg-slate-50 text-slate-950 text-[10.5px]">
                        <td colSpan={2} className="py-1 px-1.5 border border-slate-200 text-right">الإجمالي الكامل المطلوب تسويته:</td>
                        <td className="py-1 px-1.5 border border-slate-200 text-left font-mono text-emerald-700 font-bold">
                          {(invoiceData.items.length > 0 
                            ? invoiceData.items.reduce((sum, i) => sum + i.amount, 0) 
                            : (invoiceData.invoice.total_amount || 0)).toLocaleString()} ج.م
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Specific Footer Signatures requested by user */}
                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-200 pt-5 text-[10px] text-slate-700 text-center font-bold">
                  <div>
                    <p className="font-black text-slate-900 mb-9 leading-none">توقيع مسئول التراخيص</p>
                    <div className="border-b border-dashed border-slate-300 mx-3"></div>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 mb-9 leading-none">توقيع محاسب الحملة</p>
                    <div className="border-b border-dashed border-slate-300 mx-3"></div>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 mb-9 leading-none">توقيع مدير الحركة</p>
                    <div className="border-b border-dashed border-slate-300 mx-3"></div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. DEDUCTION INDIVIDUAL/GROUP RECEIPT */}
            {type === 'deduction' && deductionData && (
              <div className="space-y-4">
                <div className="border border-slate-200 p-4 rounded-xl bg-slate-50 space-y-2.5">
                  <div className="text-xs text-slate-650">
                    بموجب هذا الإشعار الإلكتروني المعتمد من محاسب النقليات بشركة البنا جروب، نقر بأنه تم خصم القيمة الموضحة أدناه من كشف رصيد السائق المستحق:
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-[10px] bg-white p-3 rounded border border-slate-200 mt-2">
                    <div>
                      <span className="text-slate-500">كود السائق:</span> <span className="font-mono font-bold text-slate-900">{deductionData.driver.driver_code}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">اسم السائق:</span> <span className="font-bold text-slate-900">{deductionData.driver.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">رقم الهاتف:</span> <span className="font-bold text-slate-900 font-mono">{deductionData.driver.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">الرقم القومي:</span> <span className="font-semibold text-slate-900 font-mono">{deductionData.driver.national_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">التاريخ:</span> <span className="font-semibold text-slate-900 font-mono">{deductionData.date}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">الرصيد المالي المتبقي:</span> <span className="font-bold text-rose-700 font-mono">{deductionData.driver.balance.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-center justify-between text-xs mt-3">
                    <div>
                      <span className="text-red-750 font-semibold">المبلغ المخصوم محاسبيًا:</span>
                      <p className="text-[10px] text-slate-500 mt-1">السبب: {deductionData.description}</p>
                    </div>
                    <span className="font-mono text-rose-700 font-extrabold text-base">-{deductionData.amount.toLocaleString()} ج.م</span>
                  </div>
                </div>

                {/* standard footer signatures */}
                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-300 pt-4 text-[9px] text-slate-650 text-center font-bold">
                  <div>
                    <p className="font-bold text-slate-800">توقيع المستعلم/المسؤول</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">توقيع السائق المقر</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                  <div className="flex flex-col justify-between items-center bg-slate-50 p-1 rounded border border-slate-200">
                    <span className="font-bold text-[8px] text-emerald-800">اعتماد الإدارة والختم</span>
                    <div className="w-8 h-8 rounded-full border border-emerald-600/30 flex items-center justify-center font-bold text-[7px] text-emerald-600 leading-none">
                      البنا
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. STATEMENT LEDGER LOGS */}
            {type === 'statement' && statementData && (
              <div className="space-y-3">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-slate-600">اسم السائق المدقق:</span> <span className="font-bold text-slate-950">{statementData.driver.name}</span></div>
                  <div><span className="text-slate-600">كود السائق:</span> <span className="font-bold text-slate-950 font-mono">{statementData.driver.driver_code}</span></div>
                  <div><span className="text-slate-600">الفلترة:</span> <span className="font-bold text-emerald-700">
                    {statementData.month ? `${statementData.month} / ${statementData.year}` : 'كافة الحركات التاريخية'}
                  </span></div>
                  <div><span className="text-slate-600">المديونية المستحقة حالياً:</span> <span className="font-bold text-rose-700 font-mono">{statementData.driver.balance.toLocaleString()} ج.م</span></div>
                </div>

                <div className="mt-3">
                  <div className="text-[9px] text-slate-800 mb-1.5 font-bold">الحركات القييدية للخصومات والمخالفات بالتفصيل:</div>
                  <table className="w-full text-right border-collapse text-[9px] border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-900 border-b border-slate-300 font-bold">
                        <th className="py-1.5 px-1.5 border border-slate-200">التاريخ</th>
                        <th className="py-1.5 px-1.5 border border-slate-200">البيان والحركة</th>
                        <th className="py-1.5 px-1.5 border border-slate-200 text-center">النوع</th>
                        <th className="py-1.5 px-1.5 border border-slate-200 text-left">التغيير (ج.م)</th>
                        <th className="py-1.5 px-1.5 border border-slate-200 text-left">الرصيد المركم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.movements.length > 0 ? statementData.movements.map((mov, idx) => (
                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 text-slate-800">
                          <td className="py-1.5 px-1.5 border border-slate-200 font-mono">{mov.date}</td>
                          <td className="py-1.5 px-1.5 border border-slate-200 font-medium truncate max-w-[150px]">{mov.description}</td>
                          <td className="py-1.5 px-1.5 border border-slate-200 text-center text-[8px]">
                            {mov.type === 'violation' && <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">مخالفة</span>}
                            {mov.type === 'deduction' && <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded">خصم</span>}
                            {mov.type === 'payment' && <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">سداد</span>}
                            {mov.type === 'reversal' && <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded">مرتد</span>}
                          </td>
                          <td className="py-1.5 px-1.5 border border-slate-200 text-left font-mono font-semibold">
                            {mov.amount_change > 0 ? `+${mov.amount_change}` : mov.amount_change} ج.م
                          </td>
                          <td className="py-1.5 px-1.5 border border-slate-200 text-left font-mono text-slate-950 font-medium">{mov.new_balance} ج.م</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">لا توجد حركات قييدية مطابقة للبحث في السجلات.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. CUSTODY STATEMENTS AND BANK CARD MOVEMENT LEDGER */}
            {type === 'custody_statement' && custodyData && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded border border-slate-200 text-[11px] space-y-1">
                  <div><span className="text-slate-600">منفذ عهدة الترخيص:</span> <span className="font-extrabold text-slate-950">{custodyData.official.name}</span></div>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div><span className="text-slate-600">اسم الخزينة الفرعية:</span> <span className="font-bold text-indigo-700">{custodyData.accountName || 'بطاقة بنكية'}</span></div>
                    <div><span className="text-slate-600">الرصيد المحقق حالياً:</span> <span className="font-black text-emerald-700">{custodyData.balance?.toLocaleString()} ج.م</span></div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[10px] text-slate-800 font-bold mb-2">حركات الخزينة الفرعية والتحويلات المسجلة:</div>
                  <table className="w-full text-right border-collapse text-[9px] border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-900 border-b border-slate-300 font-bold">
                        <th className="py-1.5 px-2 border border-slate-200">التاريخ</th>
                        <th className="py-1.5 px-2 border border-slate-200">البيان والحركة</th>
                        <th className="py-1.5 px-2 border border-slate-200 text-center">النوع</th>
                        <th className="py-1.5 px-2 border border-slate-200 text-left">الوارد (إيداع)</th>
                        <th className="py-1.5 px-2 border border-slate-200 text-left">المنصرف (خصم)</th>
                        <th className="py-1.5 px-2 border border-slate-200 text-left bg-slate-100">الرصيد الجاري</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const accId = custodyData.accountId || '';
                        const chronological = [...custodyData.movements].reverse();
                        let runningBalance = 0;
                        const processedMovements = chronological.map((m) => {
                          let inflow = 0;
                          let outflow = 0;

                          if (m.to_account_id === accId) {
                            inflow = m.amount;
                          } else if (m.type === 'deposit' && !m.from_account_id) {
                            inflow = m.amount;
                          }

                          if (m.from_account_id === accId) {
                            outflow = m.amount;
                          } else if ((m.type === 'withdrawal' || m.type === 'invoice_charge') && !m.to_account_id) {
                            outflow = m.amount;
                          }

                          if (!m.from_account_id && !m.to_account_id) {
                            if (m.type === 'deposit') {
                              inflow = m.amount;
                            } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
                              outflow = m.amount;
                            } else if (m.type === 'settlement') {
                              if (m.description.includes('-') || m.description.includes('عجز') || m.description.includes('تنزيل')) {
                                outflow = m.amount;
                              } else {
                                inflow = m.amount;
                              }
                            }
                          }

                          runningBalance += (inflow - outflow);

                          return {
                            ...m,
                            inflow,
                            outflow,
                            running: runningBalance
                          };
                        });

                        const newestFirst = [...processedMovements].reverse();

                        if (newestFirst.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="py-4 text-center text-slate-400">لا توجد حركات صادرة أو واردة مسجلة على هذه العهدة بعد.</td>
                            </tr>
                          );
                        }

                        return newestFirst.map((m, idx) => (
                          <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 text-slate-800">
                            <td className="py-1.5 px-2 border border-slate-200 font-mono text-slate-600">{m.date}</td>
                            <td className="py-1.5 px-2 border border-slate-200 font-medium text-slate-900">{m.description}</td>
                            <td className="py-1.5 px-2 border border-slate-200 text-center font-bold text-[8px]">
                              {m.type === 'deposit' && <span className="text-emerald-700 bg-emerald-50 px-1 rounded">إيداع وتغذية</span>}
                              {m.type === 'withdrawal' && <span className="text-red-700 bg-red-50 px-1 rounded">سحب ومصروف</span>}
                              {m.type === 'transfer' && <span className="text-blue-700 bg-blue-50 px-1 rounded">تحويل نقود</span>}
                              {m.type === 'settlement' && <span className="text-amber-700 bg-amber-50 px-1 rounded">تسويات</span>}
                              {m.type === 'invoice_charge' && <span className="text-indigo-700 bg-indigo-50 px-1 rounded">خصم فاتورة</span>}
                            </td>
                            <td className="py-1.5 px-2 border border-slate-200 text-left font-mono font-bold text-emerald-700">
                              {m.inflow > 0 ? `${m.inflow.toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-1.5 px-2 border border-slate-200 text-left font-mono font-bold text-red-500">
                              {m.outflow > 0 ? `${m.outflow.toLocaleString()} ج.m` : '-'}
                            </td>
                            <td className="py-1.5 px-2 border border-slate-200 text-left font-mono font-bold bg-slate-50 text-slate-900">
                              {m.running.toLocaleString()} ج.م
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-300 pt-4 text-[9px] text-slate-650 text-center font-bold">
                  <div>
                    <p className="font-bold text-slate-800">مسؤول التراخيص والعهد</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">اعتماد إدارة الحسابات والتشغيل</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Terms Footer */}
            {type !== 'invoice' && (
              <div className="mt-6 pt-2 border-t border-slate-100 text-center text-[8px] text-slate-400">
                * تم توليد هذه الاستمارات محاسبيًا على أنظمة البنا جروب اللوجستية السحابية لعام 2026.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>,
    document.body
  );
};

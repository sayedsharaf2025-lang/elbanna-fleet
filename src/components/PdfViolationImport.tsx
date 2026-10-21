/**
 * شاشة استيراد المخالفات من PDF
 * تستخرج: رقم الرخصة، التاريخ، البيان، الغرامة
 * تربط السيارة بالأرقام وتنبّه لو في حروف ناقصة
 */
import React, { useState, useRef } from 'react';
import { useDb } from '../db/store';
import {
  Upload, FileText, CheckCircle2, AlertOctagon, Plus, Trash2,
  Save, AlertTriangle, Search, UserPlus, Car, X
} from 'lucide-react';
import { Car as CarType } from '../types';

interface ParsedViolation {
  id: string;
  violation_date: string;
  description: string;
  amount: number;
  // حالة الربط بالسيارة
  carMatchStatus: 'exact' | 'digits_only' | 'not_found' | 'pending';
  carNumberRaw: string;       // الرقم كما في الـ PDF
  matchedCar?: CarType;       // السيارة المطابقة (لو وُجدت)
  duplicateExists?: boolean;  // هل مخالفة مكررة؟
  // السائق
  driver_id: string;
  // هل محفوظة؟
  saved: boolean;
}

export const PdfViolationImport: React.FC = () => {
  const db = useDb();
  const fileRef = useRef<HTMLInputElement>(null);

  const [licenseNumber, setLicenseNumber] = useState(''); // رقم الرخصة من PDF
  const [violations, setViolations] = useState<ParsedViolation[]>([]);
  const [pdfText, setPdfText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warn' | null; text: string }>({ type: null, text: '' });
  const [savedCount, setSavedCount] = useState(0);

  const showMsg = (text: string, type: 'success' | 'error' | 'warn') => {
    setStatus({ type, text });
    setTimeout(() => setStatus({ type: null, text: '' }), 7000);
  };

  // تحويل الأرقام الشرقية
  const toWesternDigits = (str: string) =>
    str.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
       .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

  // البحث عن السيارة بالأرقام فقط أو الكامل
  const findCar = (rawNum: string): { car?: CarType; status: ParsedViolation['carMatchStatus'] } => {
    const normalized = toWesternDigits(rawNum.trim());
    // بحث مطابق تام
    const exact = db.cars.find(c => c.car_number.replace(/\s/g, '') === normalized.replace(/\s/g, ''));
    if (exact) return { car: exact, status: 'exact' };

    // استخراج الأرقام فقط من المدخل
    const digits = normalized.match(/\d+/)?.[0];
    if (digits) {
      const byDigits = db.cars.find(c => {
        const cDigits = c.car_number.match(/\d+/)?.[0];
        return cDigits === digits;
      });
      if (byDigits) return { car: byDigits, status: 'digits_only' };
    }
    return { status: 'not_found' };
  };

  // تحليل نص PDF لاستخراج رقم الرخصة + المخالفات
  const parseText = (text: string) => {
    const clean = toWesternDigits(text);
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

    let foundLicense = '';
    const parsed: Omit<ParsedViolation, 'id' | 'carMatchStatus' | 'carNumberRaw' | 'driver_id' | 'saved'>[] = [];

    // أنماط استخراج رقم الرخصة
    for (const line of lines) {
      if (/رقم\s*(الرخصة|الترخيص|لوحة|السيارة)/.test(line)) {
        const m = line.match(/(\d[\d\s]*[أ-يa-z]*[\d\s]*\d+)/i);
        if (m) { foundLicense = m[1].trim(); break; }
        // أرقام فقط في نهاية السطر
        const nums = line.match(/\d[\d\s]{1,10}$/);
        if (nums) { foundLicense = nums[0].trim(); break; }
      }
    }

    // استخراج المخالفات — أنماط شائعة في PDF المرور المصري
    // السطر عادةً: [تاريخ] [بيان] [مبلغ]
    const datePattern = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const amountPattern = /(\d[\d,\.]+)\s*(جنيه|ج\.م|ج\.ع|EGP|LE|£)?/i;

    for (const line of lines) {
      const dateM = line.match(datePattern);
      if (!dateM) continue;

      // تكوين تاريخ بصيغة YYYY-MM-DD
      let [, d, m, y] = dateM;
      if (y.length === 2) y = '20' + y;
      const violation_date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

      // إزالة التاريخ من السطر للحصول على البيان والمبلغ
      const rest = line.replace(dateM[0], '').trim();
      const amtM = rest.match(/(\d[\d,\.]{1,9})\s*(جنيه|ج\.م|ج\.ع|EGP|LE|£)?/i);
      if (!amtM) continue;

      const amount = parseFloat(amtM[1].replace(/,/g, ''));
      if (amount <= 0 || amount > 500000) continue;

      const description = rest.replace(amtM[0], '').trim() || 'مخالفة مرورية';

      parsed.push({ violation_date, description, amount, matchedCar: undefined, duplicateExists: false });
    }

    if (foundLicense) setLicenseNumber(foundLicense);

    if (parsed.length === 0) {
      showMsg('لم يتم استخراج مخالفات من الملف. حاول لصق النص يدوياً أو تحقق من صيغة الملف.', 'warn');
      return;
    }

    // ربط السيارة وفحص التكرار
    const carResult = findCar(foundLicense || licenseNumber);
    const newViolations: ParsedViolation[] = parsed.map(v => {
      const dup = db.violations.some(
        ex => ex.violation_date === v.violation_date &&
          (ex.car_number === (carResult.car?.car_number || foundLicense || licenseNumber))
      );
      return {
        id: 'v' + Date.now() + Math.random(),
        ...v,
        carNumberRaw: foundLicense || licenseNumber,
        carMatchStatus: carResult.status,
        matchedCar: carResult.car,
        duplicateExists: dup,
        driver_id: carResult.car?.driver_id || '',
        saved: false
      };
    });

    setViolations(newViolations);
    showMsg(`✅ تم استخراج ${parsed.length} مخالفة من الملف. راجع البيانات وعيّن السائق ثم احفظ.`, 'success');
  };

  // تحميل PDF
  const loadPdfJs = async (): Promise<any> => {
    if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      s.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        resolve((window as any).pdfjsLib);
      };
      s.onerror = () => reject(new Error('فشل تحميل مكتبة PDF'));
      document.head.appendChild(s);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showMsg('جاري قراءة الملف...', 'success');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const pdfjs = await loadPdfJs();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(ev.target?.result as ArrayBuffer) }).promise;
        let txt = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg = await pdf.getPage(i);
          const content = await pg.getTextContent();
          txt += content.items.map((it: any) => it.str).join('\n') + '\n';
        }
        if (!txt.trim()) throw new Error('الملف لا يحتوي على نص قابل للقراءة (صورة ممسوحة).');
        setPdfText(txt);
        parseText(txt);
      } catch (err: any) {
        showMsg(err.message || 'خطأ في قراءة الملف', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // تحديث سطر مخالفة
  const updateViolation = (id: string, field: string, val: any) => {
    setViolations(prev => prev.map(v => {
      if (v.id !== id) return v;
      const updated = { ...v, [field]: val };
      // لو غيّر رقم السيارة يدوياً، أعد البحث
      if (field === 'carNumberRaw') {
        const res = findCar(val);
        updated.carMatchStatus = res.status;
        updated.matchedCar = res.car;
        updated.driver_id = res.car?.driver_id || v.driver_id;
        // فحص تكرار مجدداً
        updated.duplicateExists = db.violations.some(
          ex => ex.violation_date === updated.violation_date &&
            ex.car_number === (res.car?.car_number || val)
        );
      }
      return updated;
    }));
  };

  const removeViolation = (id: string) => setViolations(prev => prev.filter(v => v.id !== id));

  // حفظ المخالفات المحددة
  const handleSaveAll = () => {
    let count = 0;
    const updated = violations.map(v => {
      if (v.saved || v.duplicateExists) return v;
      const carNum = v.matchedCar?.car_number || v.carNumberRaw;
      if (!carNum || !v.driver_id) return v;

      const res = db.addViolation({
        violation_date: v.violation_date,
        car_number: carNum,
        driver_id: v.driver_id,
        description: v.description,
        amount: v.amount
      }, false);

      if (res.success) { count++; return { ...v, saved: true }; }
      return v;
    });
    setViolations(updated);
    setSavedCount(c => c + count);
    if (count > 0) showMsg(`✅ تم حفظ ${count} مخالفة بنجاح في قاعدة البيانات.`, 'success');
    else showMsg('لم يتم حفظ أي مخالفة — تأكد من تعيين السائق وعدم التكرار.', 'warn');
  };

  const statusColor = {
    exact: 'text-emerald-400',
    digits_only: 'text-amber-400',
    not_found: 'text-red-400',
    pending: 'text-slate-400'
  };

  const statusLabel = {
    exact: '✅ مطابقة تامة',
    digits_only: '⚠️ أرقام فقط — يحتاج حروف',
    not_found: '❌ غير مسجلة في النظام',
    pending: '⏳ لم يُحدَّد بعد'
  };

  return (
    <div className="space-y-5 text-right font-sans" style={{ direction: 'rtl' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-slate-200 text-sm">استيراد المخالفات المرورية من PDF</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPasteBox(!showPasteBox)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> لصق النص يدوياً
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> رفع ملف PDF
          </button>
          <input type="file" ref={fileRef} accept=".pdf" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {/* رسالة الحالة */}
      {status.type && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2 ${
          status.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
          : status.type === 'warn' ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
          : 'bg-red-500/15 border border-red-500/30 text-red-400'}`}>
          {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
           : <AlertOctagon className="w-4 h-4 flex-shrink-0" />}
          {status.text}
        </div>
      )}

      {/* لصق يدوي */}
      {showPasteBox && (
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-400 font-bold">الصق نص PDF المخالفات هنا:</p>
          <textarea
            rows={8} value={pdfText}
            onChange={e => setPdfText(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300 resize-y"
            placeholder={`رقم الرخصة 1215 ر ي ص\n12/03/2025  مخالفة سرعة  750 جنيه\n18/04/2025  عدم الالتزام بالحارة  400 جنيه`}
            style={{ direction: 'ltr', textAlign: 'left' }}
          />
          <div className="flex gap-2">
            <button onClick={() => parseText(pdfText)}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg">
              استخراج المخالفات
            </button>
            <button onClick={() => { setShowPasteBox(false); setPdfText(''); }}
              className="bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-lg">إلغاء</button>
          </div>
        </div>
      )}

      {/* رقم الرخصة */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-300">🪪 رقم لوحة السيارة المستخرج من المستند</p>
        <div className="flex gap-3 items-start flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="مثال: 1215 أو ر ي ص 1215"
              value={licenseNumber}
              onChange={e => {
                setLicenseNumber(e.target.value);
                // أعد ربط كل المخالفات بالرقم الجديد
                const res = findCar(e.target.value);
                setViolations(prev => prev.map(v => ({
                  ...v,
                  carNumberRaw: e.target.value,
                  carMatchStatus: res.status,
                  matchedCar: res.car,
                  driver_id: res.car?.driver_id || v.driver_id,
                  duplicateExists: db.violations.some(
                    ex => ex.violation_date === v.violation_date &&
                      ex.car_number === (res.car?.car_number || e.target.value)
                  )
                })));
              }}
              className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-800 text-sky-300 font-bold text-sm focus:outline-none focus:border-amber-500"
            />
            <datalist id="cars-dl">{db.cars.map(c => <option key={c.id} value={c.car_number} />)}</datalist>
          </div>

          {/* نتيجة البحث */}
          {licenseNumber && (() => {
            const res = findCar(licenseNumber);
            return (
              <div className={`flex-1 min-w-[200px] text-xs p-3 rounded-xl border ${
                res.status === 'exact' ? 'bg-emerald-500/10 border-emerald-500/30'
                : res.status === 'digits_only' ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-red-500/10 border-red-500/30'}`}>
                <p className={`font-bold ${statusColor[res.status]}`}>{statusLabel[res.status]}</p>
                {res.car && (
                  <p className="text-slate-300 mt-1">
                    🚘 <strong>{res.car.car_number}</strong> — {res.car.car_type || ''} {res.car.brand || ''}
                  </p>
                )}
                {res.status === 'digits_only' && (
                  <p className="text-amber-300 mt-1 text-[11px]">
                    ⚠️ السيارة مسجلة بالرقم: <strong>{res.car?.car_number}</strong> — يرجى تحديث الحروف في صفحة السيارات
                  </p>
                )}
                {res.status === 'not_found' && (
                  <p className="text-red-300 mt-1 text-[11px]">السيارة غير موجودة في النظام — أضفها أولاً من تبويب السيارات والسائقين</p>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* جدول المخالفات المستخرجة */}
      {violations.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <p className="text-xs font-bold text-slate-300">
              📋 المخالفات المستخرجة ({violations.length}) — المحفوظة: {savedCount}
            </p>
            <button
              onClick={handleSaveAll}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all"
            >
              <Save className="w-3.5 h-3.5" /> حفظ الكل في قاعدة البيانات
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px]">
                  <th className="py-2.5 px-3 text-right">التاريخ</th>
                  <th className="py-2.5 px-3 text-right">البيان</th>
                  <th className="py-2.5 px-3 text-right w-24">الغرامة ج.م</th>
                  <th className="py-2.5 px-3 text-right">السيارة</th>
                  <th className="py-2.5 px-3 text-right">السائق</th>
                  <th className="py-2.5 px-3 text-center w-20">الحالة</th>
                  <th className="py-2.5 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {violations.map(v => (
                  <tr key={v.id} className={`border-b border-slate-800/60 ${
                    v.saved ? 'bg-emerald-500/5'
                    : v.duplicateExists ? 'bg-amber-500/5'
                    : ''}`}>

                    {/* التاريخ */}
                    <td className="py-1.5 px-2">
                      <input type="date" value={v.violation_date}
                        onChange={e => updateViolation(v.id, 'violation_date', e.target.value)}
                        disabled={v.saved}
                        className="rounded px-2 py-1 text-xs bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-50"
                      />
                    </td>

                    {/* البيان */}
                    <td className="py-1.5 px-2">
                      <input type="text" value={v.description}
                        onChange={e => updateViolation(v.id, 'description', e.target.value)}
                        disabled={v.saved}
                        className="w-full rounded px-2 py-1 text-xs bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-50"
                      />
                    </td>

                    {/* المبلغ */}
                    <td className="py-1.5 px-2">
                      <input type="number" value={v.amount}
                        onChange={e => updateViolation(v.id, 'amount', Number(e.target.value))}
                        disabled={v.saved}
                        className="w-full rounded px-2 py-1 text-xs bg-slate-950 border border-slate-800 text-amber-400 font-mono font-bold disabled:opacity-50"
                      />
                    </td>

                    {/* رقم السيارة */}
                    <td className="py-1.5 px-2">
                      <div className="space-y-0.5">
                        <input type="text" value={v.carNumberRaw}
                          onChange={e => updateViolation(v.id, 'carNumberRaw', e.target.value)}
                          disabled={v.saved}
                          className={`w-full rounded px-2 py-1 text-xs bg-slate-950 border font-mono font-bold disabled:opacity-50 ${
                            v.carMatchStatus === 'exact' ? 'border-emerald-500/50 text-emerald-400'
                            : v.carMatchStatus === 'digits_only' ? 'border-amber-500/50 text-amber-400'
                            : 'border-red-500/50 text-red-400'}`}
                        />
                        {v.matchedCar && v.carMatchStatus === 'digits_only' && (
                          <p className="text-[10px] text-amber-400">→ {v.matchedCar.car_number}</p>
                        )}
                      </div>
                    </td>

                    {/* السائق */}
                    <td className="py-1.5 px-2">
                      <select
                        value={v.driver_id}
                        onChange={e => updateViolation(v.id, 'driver_id', e.target.value)}
                        disabled={v.saved}
                        className="w-full rounded px-2 py-1 text-xs bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-50"
                      >
                        <option value="">-- اختر السائق --</option>
                        {db.drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.driver_code})</option>
                        ))}
                      </select>
                    </td>

                    {/* الحالة */}
                    <td className="py-1.5 px-2 text-center">
                      {v.saved ? (
                        <span className="text-emerald-400 text-[10px] font-bold">✅ محفوظة</span>
                      ) : v.duplicateExists ? (
                        <span className="text-amber-400 text-[10px] font-bold">⚠️ مكررة</span>
                      ) : !v.driver_id ? (
                        <span className="text-slate-500 text-[10px]">ينتظر سائق</span>
                      ) : (
                        <span className="text-sky-400 text-[10px] font-bold">✓ جاهز</span>
                      )}
                    </td>

                    {/* حذف */}
                    <td className="py-1.5 px-2">
                      {!v.saved && (
                        <button onClick={() => removeViolation(v.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950">
                  <td colSpan={2} className="py-2 px-3 text-slate-400 text-xs font-bold">الإجمالي</td>
                  <td className="py-2 px-3 text-amber-400 font-mono font-bold text-xs">
                    {violations.filter(v => !v.duplicateExists).reduce((s, v) => s + v.amount, 0).toLocaleString()} ج.م
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* تنبيهات */}
          {violations.some(v => v.duplicateExists) && (
            <div className="p-3 m-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
              ⚠️ بعض المخالفات محددة كمكررة (نفس التاريخ + نفس السيارة موجود مسبقاً) وستُتجاهل عند الحفظ.
            </div>
          )}
          {violations.some(v => v.carMatchStatus === 'digits_only') && (
            <div className="p-3 m-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
              ⚠️ بعض السيارات وُجدت بالأرقام فقط بدون حروف. يُنصح بتحديث لوحة السيارة في تبويب "السيارات والسائقين" بإضافة الحروف الصحيحة.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

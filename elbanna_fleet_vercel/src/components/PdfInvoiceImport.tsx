/**
 * شاشة استيراد فواتير PDF القديمة
 */
import React, { useState, useRef } from 'react';
import { useDb } from '../db/store';
import { Upload, FileText, CheckCircle2, AlertOctagon, Plus, Trash2, X, Save } from 'lucide-react';

interface ImportItem {
  id: string;
  description: string;
  amount: number;
}

interface ImportForm {
  external_invoice_number: string;
  invoice_date: string;
  car_number: string;
  license_location: string;
  license_details: string;
  items: ImportItem[];
  total_amount: number;
}

const emptyForm = (): ImportForm => ({
  external_invoice_number: '',
  invoice_date: new Date().toISOString().split('T')[0],
  car_number: '',
  license_location: '',
  license_details: 'تجديد سنوى',
  items: [{ id: 'r1', description: '', amount: 0 }],
  total_amount: 0
});

export const PdfInvoiceImport: React.FC = () => {
  const db = useDb();
  const [form, setForm] = useState<ImportForm>(emptyForm());
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [importedList, setImportedList] = useState<{ num: string; car: string; total: number; sysCreatedNum?: string }[]>([]);
  const [pdfText, setPdfText] = useState('');
  const [showParser, setShowParser] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setStatus({ type, text });
    setTimeout(() => setStatus({ type: null, text: '' }), 6000);
  };

  // حساب الإجمالي تلقائياً
  const calcTotal = (items: ImportItem[]) =>
    items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const updateItem = (id: string, field: 'description' | 'amount', val: any) => {
    const updated = form.items.map(i =>
      i.id === id ? { ...i, [field]: field === 'amount' ? Number(val) : val } : i
    );
    setForm(prev => ({ ...prev, items: updated, total_amount: calcTotal(updated) }));
  };

  const addItem = () => {
    const updated = [...form.items, { id: 'r' + Date.now(), description: '', amount: 0 }];
    setForm(prev => ({ ...prev, items: updated }));
  };

  const removeItem = (id: string) => {
    if (form.items.length <= 1) return;
    const updated = form.items.filter(i => i.id !== id);
    setForm(prev => ({ ...prev, items: updated, total_amount: calcTotal(updated) }));
  };

  // تحميل محرك معالجة الـ PDF ديناميكياً من CDN موثوق
  const loadPdfJs = async (): Promise<any> => {
    if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        resolve((window as any).pdfjsLib);
      };
      script.onerror = () => reject(new Error('فشل تحميل مكتبة معالج مستندات الـ PDF'));
      document.head.appendChild(script);
    });
  };

  // معالجة واستخلاص النصوص من سياق الفاتورة
  const runParsingOnText = (text: string) => {
    // 1. تحويل الأرقام الهندية/الشرقية إلى الأرقام العربية القياسية
    const convertEasternDigits = (str: string): string => {
      const eastern = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩','۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
      const western = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
      let res = str;
      for (let i = 0; i < eastern.length; i++) {
        res = res.replace(new RegExp(eastern[i], 'g'), western[i]);
      }
      return res;
    };

    // 2. توحيد الحروف العربية المتشابهة لتفادي عيوب الـ OCR (مثل الياء الفارسية والهاء/التاء المربوطة)
    const normalizeArabicLetters = (str: string): string => {
      return str
        .replace(/[\u06CC\u0649]/g, '\u064A') // ياء فارسية وألف مقصورة -> ياء قياسية
        .replace(/\u06BE/g, '\u0647'); // هاء دوكاشمي -> هاء قياسية
    };

    const cleanText = convertEasternDigits(normalizeArabicLetters(text));
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

    let invNum = '', date = '', carNum = '', location = '', details = '';
    const parsedItems: ImportItem[] = [];

    for (const line of lines) {
      if (line.includes('رقم الفاتورة') || line.includes('فاتورة رقم')) {
        invNum = line.replace(/رقم الفاتورة|فاتورة رقم/g, '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('التاريخ') || line.includes('التاریخ')) {
        const d = line.replace(/التاريخ|التاریخ/g, '').replace(/[:–-]/g, '').trim();
        const separator = d.includes('-') ? '-' : (d.includes('/') ? '/' : (d.includes('.') ? '.' : ''));
        if (separator) {
          const parts = d.split(separator).map(x => x.trim());
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              date = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
            } else if (parts[2].length === 4) {
              date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            } else {
              date = d;
            }
          } else {
            date = d;
          }
        } else {
          date = d;
        }
      } else if (line.includes('رقم السيارة') || line.includes('رقم السبارة')) {
        carNum = line.replace(/رقم السيارة|رقم السبارة/g, '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('مكان الخدمة') || line.includes('مكان الترخيص') || line.includes('مكان السيارة') || line.includes('حملة')) {
        location = line.replace(/مكان الخدمة|مكان الترخيص|مكان السيارة/g, '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('الترخيص') && !line.includes('رقم') && !line.includes('مكان')) {
        details = line.replace('الترخيص', '').replace(/[:–-]/g, '').trim();
      } else {
        // فحص البنود والمبالغ
        const amountMatch = line.match(/^(\d[\d,]*)\s+(.+)$/) || line.match(/^(.+)\s+(\d[\d,]*)$/);
        if (amountMatch) {
          const isFirstNum = /^\d/.test(line);
          const amountStr = isFirstNum ? amountMatch[1] : amountMatch[2];
          const descStr = isFirstNum ? amountMatch[2] : amountMatch[1];
          const amount = parseInt(amountStr.replace(/,/g, ''));
          const descClean = descStr.trim();
          
          // تجاهل سطر الإجمالي تماماً حتى لا ينزل كبند مكرر في الفاتورة
          const isTotal = /اجمال|إجمال|الجمالي|الإجمالي|total|sum/i.test(descClean);
          if (isTotal) continue;

          if (amount > 0 && amount < 100000 && descClean.length > 1) {
            parsedItems.push({ id: 'p' + Date.now() + Math.random(), description: descClean, amount });
          }
        }
      }
    }

    setForm(prev => {
      const next = { ...prev };
      if (invNum) next.external_invoice_number = invNum;
      if (date) next.invoice_date = date;
      if (carNum) next.car_number = carNum;
      if (location) next.license_location = location;
      if (details) next.license_details = details;
      if (parsedItems.length > 0) {
        next.items = parsedItems;
        next.total_amount = calcTotal(parsedItems);
      }
      return next;
    });

    showMsg('📊 تم تحميل ملف الـ PDF بنجاح وقراءة البيانات تلقائياً! يرجى مراجعة وتعديل الحقول أدناه للحفظ الموثوق.', 'success');
  };

  // معالجة اختيار ملف من الجهاز
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showMsg('جاري تحميل وقراءة ملف الـ PDF من جهازك...', 'success');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
        const pdfjs = await loadPdfJs();
        const pdf = await pdfjs.getDocument({ data: typedarray }).promise;
        let extractedText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join("\n");
          extractedText += pageText + "\n";
        }

        if (!extractedText.trim()) {
          throw new Error('لم نتفحص نصوصاً مقروءة بداخل ملف الـ PDF. قد يكون الملف محملاً كشكل صورة ممسوحة ضوئياً (سكانر).');
        }

        setPdfText(extractedText);
        runParsingOnText(extractedText);
      } catch (err: any) {
        console.error(err);
        showMsg(err.message || 'عذراً، فشل استخراج نصوص PDF المقروءة للتوطين.', 'error');
      }
    };
    reader.onerror = () => {
      showMsg('عذراً، حدث خطأ أثناء فتح الملف المختار.', 'error');
    };
    reader.readAsArrayBuffer(file);
  };

  // تحليل نص PDF يدوياً
  const parsePdfText = () => {
    if (!pdfText.trim()) return;
    runParsingOnText(pdfText);
    setShowParser(false);
  };

  const handleSave = () => {
    if (!form.external_invoice_number) return showMsg('أدخل رقم الفاتورة الأصلي من المستند', 'error');
    if (!form.car_number) return showMsg('أدخل رقم السيارة للاستيراد', 'error');
    if (!form.invoice_date) return showMsg('أدخل تاريخ الفاتورة الأصلي', 'error');
    if (form.items.some(i => !i.description || i.amount <= 0)) return showMsg('أكمل جميع بنود الفاتورة', 'error');

    const res = db.importOldInvoice({
      external_invoice_number: form.external_invoice_number,
      invoice_date: form.invoice_date,
      car_number: form.car_number,
      license_location: form.license_location,
      license_details: form.license_details,
      items: form.items.map(i => ({ description: i.description, amount: i.amount })),
      total_amount: form.total_amount
    });

    if (res.success) {
      const sysCreated = res.invoice?.invoice_number || "INV-SYS";
      showMsg(`✅ تم استيراد وحفظ الفاتورة بالسيستم بنجاح بالرقم التلقائي: ${sysCreated}`, 'success');
      setImportedList(prev => [{ num: form.external_invoice_number, car: form.car_number, total: form.total_amount, sysCreatedNum: sysCreated }, ...prev]);
      setForm(emptyForm());
    } else {
      showMsg(res.error || 'حدث خطأ أثناء الاستيراد', 'error');
    }
  };

  return (
    <div className="space-y-5 text-right font-sans" style={{ direction: 'rtl' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-slate-200">استيراد فواتير PDF القديمة إلى قاعدة البيانات</span>
        </div>
        <button
          onClick={() => setShowParser(!showParser)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all"
        >
          <Upload className="w-4 h-4" />
          لصق نص PDF للتحليل التلقائي
        </button>
      </div>

      {/* شاشة تحميل ملف PDF من على الجهاز */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-300 font-extrabold text-[12px] block">📂 قراءة وتحميل ملف الفاتورة PDF مباشرة من جهازك:</span>
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-505/20 px-2 py-0.5 rounded font-black">تحليل تلقائي متكامل</span>
        </div>
        
        <div 
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 p-6 rounded-xl text-center cursor-pointer transition-all space-y-2 group"
        >
          <Upload className="w-7 h-7 text-slate-500 group-hover:text-indigo-400 mx-auto transition-transform group-hover:scale-110" />
          <p className="text-xs font-bold text-slate-300">اسحب وأفلت ملف الـ PDF هنا أو <span className="text-indigo-400 font-black underline">اضغط للاختيار من جهازك</span></p>
          <p className="text-[10px] text-slate-500">يقوم النظام باستخلاص رقم السيارة، التاريخ، والترخيص والبنود للتمكين من تعديلها يدوياً وحفظها.</p>
        </div>
        <input 
          type="file" 
          ref={fileRef} 
          accept=".pdf" 
          onChange={handleFileChange} 
          className="hidden" 
        />
      </div>

      {/* رسائل الحالة */}
      {status.type && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2 ${
          status.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border border-red-500/30 text-red-400'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
          {status.text}
        </div>
      )}

      {/* منطقة لصق نص PDF */}
      {showParser && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-400">الصق محتوى الـ PDF كنص — سيتم استخراج البيانات تلقائياً:</p>
          <textarea
            rows={8}
            className="w-full rounded-lg px-3 py-2 text-xs font-mono text-left resize-y"
            placeholder={`رقم الفاتورة 3360\nالتاريخ 23-05-2026\nرقم السيارة 1215\nمكان الخدمة حملة منياالقمح\nالترخيص تجديد سنوى\n830 استمارة تجديد...\n8565 اجمالى`}
            value={pdfText}
            onChange={e => setPdfText(e.target.value)}
            style={{ direction: 'rtl' }}
          />
          <div className="flex gap-2">
            <button onClick={parsePdfText} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all">
              استخراج البيانات
            </button>
            <button onClick={() => { setShowParser(false); setPdfText(''); }} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-4 py-2 rounded-lg transition-all">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* نموذج الاستيراد */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="border-b border-slate-800 pb-2.5">
          <p className="text-xs text-slate-400 font-bold">📂 بيانات الفاتورة القديمة</p>
          <p className="text-[10px] text-slate-400 mt-1 mr-1">
            ⚠️ ملحوظة: سيقوم السيستم تلقائياً بتوليد رقم الفاتورة الجديد وتاريخ اليوم المالي للاستعلام، مع ربطها تلقائياً بنوع وموديل السيارة المسجلة من النظام وإدراج الرقم الأصلي للفاتورة وتفاصيلها كمرجع مضمون. لن يتم الخصم من أي عهدة مالية.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">رقم الفاتورة الأصلي (المرجع) *</label>
            <input
              type="text" placeholder="مثال: 3360"
              className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-850 focus:outline-none focus:border-indigo-500 text-indigo-300 font-bold"
              value={form.external_invoice_number}
              onChange={e => setForm(p => ({ ...p, external_invoice_number: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">تاريخ الفاتورة الأصلي *</label>
            <input
              type="date"
              className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-850 focus:outline-none focus:border-indigo-500 text-indigo-300"
              value={form.invoice_date}
              onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1 col-span-2">رقم السيارة المكتوب بالفاتورة *</label>
            <input
              type="text" placeholder="مثال: 1215 أو ر ي ص 1215"
              list="cars-list"
              className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-850 focus:outline-none focus:border-indigo-500 text-sky-305 font-extrabold"
              value={form.car_number}
              onChange={e => setForm(p => ({ ...p, car_number: e.target.value }))}
            />
            <datalist id="cars-list">
              {db.cars.map(c => <option key={c.id} value={c.car_number} />)}
            </datalist>

            {/* سحب نوع السيارة تلقائياً من السيستم */}
            {form.car_number && (() => {
              const carObj = db.cars.find(c => c.car_number === form.car_number || c.car_number.includes(form.car_number));
              return (
                <div className="mt-1.5 p-1 px-2 rounded bg-slate-950/60 border border-slate-850 text-[10px] text-slate-400">
                  🚘 نوع السيارة المسجل بالنظام: {" "}
                  <strong className="text-emerald-400">{carObj ? carObj.car_type || 'غير محدد' : 'غير مسجلة'}</strong>
                  {carObj && carObj.brand && <span className="text-slate-500"> ({carObj.brand} - {carObj.model})</span>}
                </div>
              );
            })()}
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">مكان السيارة المرفق بالفاتورة (مثال: منياالقمح) *</label>
            <input
              type="text" placeholder="مثال: حملة منياالقمح"
              className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-850 focus:outline-none focus:border-indigo-500"
              value={form.license_location}
              onChange={e => setForm(p => ({ ...p, license_location: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-bold mb-1">بيان وتفاصيل الترخيص بالفاتورة</label>
            <input
              type="text" placeholder="مثال: تجديد سنوى"
              className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-850 focus:outline-none focus:border-indigo-500"
              value={form.license_details}
              onChange={e => setForm(p => ({ ...p, license_details: e.target.value }))}
            />
          </div>
        </div>

        {/* بنود الفاتورة */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-bold">بنود الفاتورة</p>
            <button onClick={addItem} className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1 font-bold">
              <Plus className="w-3.5 h-3.5" /> إضافة بند
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400">
                  <th className="py-2 px-3 text-right">البيان</th>
                  <th className="py-2 px-3 text-left w-28">المبلغ (ج.م)</th>
                  <th className="py-2 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map(item => (
                  <tr key={item.id} className="border-b border-slate-800">
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        className="w-full rounded px-2 py-1 text-xs"
                        placeholder="وصف البند..."
                        value={item.description}
                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        className="w-full rounded px-2 py-1 text-xs text-left font-mono"
                        value={item.amount || ''}
                        onChange={e => updateItem(item.id, 'amount', e.target.value)}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 font-bold">
                  <td className="py-2 px-3 text-slate-300">الإجمالي</td>
                  <td className="py-2 px-3 text-left font-mono text-emerald-400 text-sm">{form.total_amount.toLocaleString()} ج.م</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
        >
          <Save className="w-4 h-4" />
          حفظ الفاتورة في قاعدة البيانات
        </button>
      </div>

      {/* سجل المستوردة */}
      {importedList.length > 0 && (
        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-4 space-y-2">
          <p className="text-xs text-emerald-400 font-bold">✅ الفواتير المستوردة والمحفوظة بنظام الفواتير الموحد</p>
          <div className="space-y-1">
            {importedList.map((inv, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="font-mono text-emerald-450 font-black">{inv.sysCreatedNum}</span>
                <span className="text-slate-400 text-[10px]">الرقم الأصلي: <strong className="text-indigo-400 font-bold">#{inv.num}</strong></span>
                <span className="text-slate-400">سيارة: <span className="text-sky-400 font-bold">{inv.car}</span></span>
                <span className="font-mono font-bold text-emerald-400">{inv.total.toLocaleString()} ج.م</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

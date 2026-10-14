/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// أدوات تحليل نصوص اللصق من Excel وتنظيف الأرقام — دوال نقية بدون أي اعتماد على React أو المتصفح

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

// تحويل الأرقام العربية/الفارسية لأرقام لاتينية
export function normalizeDigits(s: string): string {
  return String(s ?? '').replace(/[٠-٩۰-۹]/g, ch => {
    const a = AR_DIGITS.indexOf(ch);
    if (a >= 0) return String(a);
    return String(FA_DIGITS.indexOf(ch));
  });
}

// تحويل نص خانة (من لصق أو كتابة) لرقم. بيرجع null لو النص فاضي أو مش رقم
// أمثلة: "1,234.5" → 1234.5 | "١٢٣٫٥" → 123.5 | "1.234,5" → 1234.5 | "(100)" → -100 | "500 ج.م" → 500
export function parseNumberText(raw: string): number | null {
  let s = normalizeDigits(String(raw ?? ''))
    .replace(/[ ‎‏‪-‮\s]/g, '')
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/ج\.?م\.?|جنيه|EGP|LE/gi, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { negative = !negative; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // الفاصل الأخير هو العشري والتاني آلاف
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    // فاصلة واحدة بعدها 3 أرقام بالظبط = آلاف، غير كده = علامة عشرية
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && parts[0].length <= 3)) {
      s = parts.join('');
    } else {
      s = parts.join('.');
    }
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join(''); // 1.234.567 → آلاف
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

// الرقم كنص صالح لخانة إدخال (بدون فواصل آلاف)
export function numberToInputText(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '';
  return String(Math.round(n * 1e6) / 1e6);
}

// نص خانة رقمية → رقم (0 لو فاضي أو غير صالح) — نفس سلوك الدالة num القديمة في الشاشات
export function toNumber(v: string | number | null | undefined): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseNumberText(v ?? '');
  return n === null ? 0 : n;
}

// تحليل نص الحافظة المنسوخ من Excel/Sheets (TSV) لمصفوفة صفوف × أعمدة.
// بيدعم الخانات المحاطة بعلامات تنصيص (اللي فيها سطر جديد أو تاب أو "" مزدوجة)
export function parseClipboardMatrix(text: string): string[][] {
  const src = String(text ?? '');
  if (!src) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && !cellStarted) { inQuotes = true; cellStarted = true; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; cellStarted = false; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row);
      row = []; cell = ''; cellStarted = false;
      continue;
    }
    cell += ch;
    cellStarted = true;
  }
  // آخر سطر (لو النص مش منتهي بسطر جديد)
  if (cell !== '' || row.length > 0 || cellStarted) { row.push(cell); rows.push(row); }
  return rows;
}

// تطبيع رقم لوحة السيارة للمقارنة: بدون مسافات/فواصل، بأرقام لاتينية، وحروف عربية موحّدة
export function normalizePlate(s: string): string {
  return normalizeDigits(String(s ?? ''))
    .replace(/[\s\-_.‎‏]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// الحسابات المالية للفواتير والعهدة (اعتماد الفاتورة، استرداد الإلغاء، التحويل بين الحسابات).
// الكود هنا منقول حرفيًا من store.tsx (نفس الشروط ونفس رسائل الأخطاء ونفس ترتيب الفحص) — المتجر
// بيستدعيها وبيطبّق النتيجة على الحالة؛ ومنفصلة عشان تتختبر بدون React.

import type { CustodyAccount, Invoice, InvoiceItem, Official } from '../../types';

export const isInvoiceApproved = (inv: Invoice) => (inv.approval_status || 'approved') === 'approved';

// حساب الصرف المرتبط ببند: المحدد على البند، وإلا أول حساب للمسؤول بنفس طريقة الدفع
export function resolveItemAccountId(item: InvoiceItem, officialId: string, custodyAccounts: CustodyAccount[]): string {
  let accId = item.account_id || '';
  if (!accId) {
    const match = custodyAccounts.find(a => a.official_id === officialId && a.type === item.payment_method);
    accId = match ? match.id : '';
  }
  return accId;
}

export type ApprovalPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      accountTotals: Record<string, number>;
      newCustodyAccounts: CustodyAccount[];
      changedCustodyAccounts: CustodyAccount[];
      cashCharged: number;
      visaCharged: number;
      updatedOfficial: Official;
    };

// خطة اعتماد المالية للفاتورة: فحص البنود والأرصدة، ثم الأرصدة الجديدة والخصم من عهدة المسؤول
export function planInvoiceApproval(args: {
  invoice: Invoice; items: InvoiceItem[]; custodyAccounts: CustodyAccount[]; official: Official;
}): ApprovalPlan {
  const { invoice, items, custodyAccounts, official } = args;
  if (items.length === 0) return { ok: false, error: 'الفاتورة مفيهاش بنود!' };

  const accountTotals: Record<string, number> = {};
  for (const item of items) {
    const accId = resolveItemAccountId(item, invoice.official_id, custodyAccounts);
    if (!accId) return { ok: false, error: 'مفيش حساب صرف محدد لأحد بنود الفاتورة!' };
    accountTotals[accId] = (accountTotals[accId] || 0) + item.amount;
  }

  for (const [accId, required] of Object.entries(accountTotals)) {
    const acc = custodyAccounts.find(a => a.id === accId);
    if (!acc) return { ok: false, error: 'لم يتم العثور على حساب الصرف المرتبط بالفاتورة!' };
    if (acc.balance < required) {
      return { ok: false, error: `رصيد الحساب (${acc.name}) غير كافٍ للخصم! المتوفر: ${acc.balance} ج.م، المطلوب: ${required} ج.م.` };
    }
  }

  const newCustodyAccounts = custodyAccounts.map(acc => {
    const needed = accountTotals[acc.id];
    return needed ? { ...acc, balance: acc.balance - needed } : acc;
  });
  const changedCustodyAccounts = newCustodyAccounts.filter(acc => accountTotals[acc.id]);

  let cashCharged = 0;
  let visaCharged = 0;
  Object.entries(accountTotals).forEach(([accId, amt]) => {
    const acc = custodyAccounts.find(a => a.id === accId);
    if (acc?.type === 'cash') cashCharged += amt; else visaCharged += amt;
  });
  const updatedOfficial = {
    ...official,
    cash_custody: official.cash_custody - cashCharged,
    visa_custody: official.visa_custody - visaCharged,
  };
  return { ok: true, accountTotals, newCustodyAccounts, changedCustodyAccounts, cashCharged, visaCharged, updatedOfficial };
}

export interface RefundPlan {
  refunds: Record<string, number>;
  newCustodyAccounts: CustodyAccount[];
  changedCustodyAccounts: CustodyAccount[];
  cashRefundSum: number;
  visaRefundSum: number;
}

// خطة استرداد مبالغ فاتورة معتمدة اتلغت: بترجّع كل بند لحسابه
export function planInvoiceRefund(args: { invoice: Invoice; items: InvoiceItem[]; custodyAccounts: CustodyAccount[] }): RefundPlan {
  const { invoice, items, custodyAccounts } = args;
  const refunds: Record<string, number> = {};
  for (const item of items) {
    const accId = resolveItemAccountId(item, invoice.official_id, custodyAccounts);
    if (accId) {
      refunds[accId] = (refunds[accId] || 0) + item.amount;
    }
  }

  const newCustodyAccounts = custodyAccounts.map(a => {
    const refAmt = refunds[a.id];
    if (refAmt) {
      return { ...a, balance: a.balance + refAmt };
    }
    return a;
  });
  const changedCustodyAccounts = newCustodyAccounts.filter(a => refunds[a.id]);

  const cashRefundSum = items.filter(i => {
    const accId = resolveItemAccountId(i, invoice.official_id, custodyAccounts);
    const match = custodyAccounts.find(ca => ca.id === accId);
    return match?.type === 'cash';
  }).reduce((sum, item) => sum + item.amount, 0);

  const visaRefundSum = items.filter(i => {
    const accId = resolveItemAccountId(i, invoice.official_id, custodyAccounts);
    const match = custodyAccounts.find(ca => ca.id === accId);
    return match?.type !== 'cash';
  }).reduce((sum, item) => sum + item.amount, 0);

  return { refunds, newCustodyAccounts, changedCustodyAccounts, cashRefundSum, visaRefundSum };
}

// تكلفة التراخيص المعتمدة لسيارة في يوم معيّن
export const licenseCostForCarDay = (invoices: Invoice[], carId: string, date: string): number =>
  invoices
    .filter(inv => !inv.is_deleted && isInvoiceApproved(inv) && inv.car_id === carId && inv.invoice_date === date)
    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

// فحص التحويل بين حسابين: رسالة الخطأ أو null لو سليم
export function validateCustodyTransfer(fromAcc: CustodyAccount | undefined, toAcc: CustodyAccount | undefined, amount: number): string | null {
  if (!fromAcc || !toAcc) return 'أحد الحسابات أو كلاهما غير متوفر في قواعد البيانات!';
  if (fromAcc.balance < amount) {
    return `رصيد حساب المرسل غير كافٍ! متاح: ${fromAcc.balance} ج.م، ومطلوب تحويل: ${amount} ج.م.`;
  }
  return null;
}

// أثر التحويل على عهدة مسؤول (نقدي/فيزا) — نفس منطق transferCustody
export function applyTransferToOfficial(o: Official, fromAcc: CustodyAccount, toAcc: CustodyAccount, amount: number): { patch: Official; changed: boolean } {
  const patch = { ...o };
  let changed = false;
  if (o.id === fromAcc.official_id) {
    patch.cash_custody = fromAcc.type === 'cash' ? Math.max(0, patch.cash_custody - amount) : patch.cash_custody;
    patch.visa_custody = fromAcc.type !== 'cash' ? Math.max(0, patch.visa_custody - amount) : patch.visa_custody;
    changed = true;
  }
  if (o.id === toAcc.official_id) {
    patch.cash_custody = toAcc.type === 'cash' ? patch.cash_custody + amount : patch.cash_custody;
    patch.visa_custody = toAcc.type !== 'cash' ? patch.visa_custody + amount : patch.visa_custody;
    changed = true;
  }
  return { patch, changed };
}

// قفل الشهور: الشهر المقفول ما يتعدلش غير بأدمن
export const isMonthLockedIn = (lockedMonths: { month: string }[], dateOrMonth: string): boolean =>
  lockedMonths.some(m => m.month === (dateOrMonth || '').slice(0, 7));

export const canEditMonthFor = (lockedMonths: { month: string }[], role: string | undefined, dateOrMonth: string): boolean =>
  !isMonthLockedIn(lockedMonths, dateOrMonth) || role === 'admin';

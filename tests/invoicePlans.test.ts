import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planInvoiceApproval, planInvoiceRefund, licenseCostForCarDay, validateCustodyTransfer,
  applyTransferToOfficial, isMonthLockedIn, canEditMonthFor, isInvoiceApproved, resolveItemAccountId,
} from '../src/db/logic/invoicePlans';

const official: any = { id: 'o1', name: 'مشرف', cash_custody: 1000, visa_custody: 500 };
const accounts = (): any[] => [
  { id: 'cash1', official_id: 'o1', name: 'كاش', type: 'cash', balance: 1000 },
  { id: 'visa1', official_id: 'o1', name: 'فيزا', type: 'visa', balance: 500 },
  { id: 'cashX', official_id: 'o2', name: 'كاش تاني', type: 'cash', balance: 9999 },
];
const invoice: any = { id: 'i1', official_id: 'o1', car_id: 'c1', total_amount: 350, invoice_date: '2026-10-04' };
const item = (o: any): any => ({ id: 'it' + Math.random(), invoice_id: 'i1', ...o });

test('حساب البند: المحدد أولًا ثم أول حساب للمسؤول بنفس طريقة الدفع', () => {
  assert.equal(resolveItemAccountId(item({ account_id: 'visa1', payment_method: 'cash', amount: 1 }), 'o1', accounts()), 'visa1');
  assert.equal(resolveItemAccountId(item({ payment_method: 'cash', amount: 1 }), 'o1', accounts()), 'cash1'); // مش cashX بتاع مسؤول تاني
  assert.equal(resolveItemAccountId(item({ payment_method: 'other_visa', amount: 1 }), 'o1', accounts()), '');
});

test('اعتماد الفاتورة: يخصم من الحسابات وعهدة المسؤول (نقدي/فيزا)', () => {
  const items = [item({ payment_method: 'cash', amount: 200 }), item({ payment_method: 'visa', amount: 100 }), item({ account_id: 'cash1', payment_method: 'cash', amount: 50 })];
  const plan = planInvoiceApproval({ invoice, items, custodyAccounts: accounts(), official });
  if (plan.ok === false) return assert.fail(plan.error);
  assert.deepEqual(plan.accountTotals, { cash1: 250, visa1: 100 });
  const bal = Object.fromEntries(plan.newCustodyAccounts.map(a => [a.id, a.balance]));
  assert.deepEqual(bal, { cash1: 750, visa1: 400, cashX: 9999 });
  assert.deepEqual(plan.changedCustodyAccounts.map(a => a.id).sort(), ['cash1', 'visa1']);
  assert.equal(plan.cashCharged, 250);
  assert.equal(plan.visaCharged, 100);
  assert.equal(plan.updatedOfficial.cash_custody, 750);
  assert.equal(plan.updatedOfficial.visa_custody, 400);
  assert.equal(official.cash_custody, 1000, 'مفيش تعديل في الأصل');
});

test('اعتماد الفاتورة: رفض لو الرصيد مش كفاية (بالمجموع مش بكل بند)', () => {
  const items = [item({ payment_method: 'visa', amount: 300 }), item({ payment_method: 'visa', amount: 300 })];
  const plan = planInvoiceApproval({ invoice, items, custodyAccounts: accounts(), official });
  assert.equal(plan.ok, false);
  if (plan.ok === false) assert.match(plan.error, /رصيد الحساب \(فيزا\) غير كافٍ.*المتوفر: 500.*المطلوب: 600/);
  // بالظبط الرصيد كله مسموح
  const exact = planInvoiceApproval({ invoice, items: [item({ payment_method: 'visa', amount: 500 })], custodyAccounts: accounts(), official });
  assert.ok(exact.ok);
});

test('اعتماد الفاتورة: بدون بنود / بدون حساب صرف / حساب مش موجود', () => {
  const none = planInvoiceApproval({ invoice, items: [], custodyAccounts: accounts(), official });
  assert.deepEqual(none, { ok: false, error: 'الفاتورة مفيهاش بنود!' });
  const noAcc = planInvoiceApproval({ invoice, items: [item({ payment_method: 'other_visa', amount: 5 })], custodyAccounts: accounts(), official });
  assert.deepEqual(noAcc, { ok: false, error: 'مفيش حساب صرف محدد لأحد بنود الفاتورة!' });
  const ghost = planInvoiceApproval({ invoice, items: [item({ account_id: 'ghost', payment_method: 'cash', amount: 5 })], custodyAccounts: accounts(), official });
  assert.deepEqual(ghost, { ok: false, error: 'لم يتم العثور على حساب الصرف المرتبط بالفاتورة!' });
});

test('استرداد الإلغاء: يعكس الاعتماد بالظبط (اعتماد ثم إلغاء = نفس الأرصدة)', () => {
  const items = [item({ payment_method: 'cash', amount: 200 }), item({ payment_method: 'visa', amount: 100 })];
  const approve = planInvoiceApproval({ invoice, items, custodyAccounts: accounts(), official });
  if (approve.ok === false) return assert.fail(approve.error);
  const refund = planInvoiceRefund({ invoice, items, custodyAccounts: approve.newCustodyAccounts });
  assert.deepEqual(refund.refunds, { cash1: 200, visa1: 100 });
  assert.deepEqual(refund.newCustodyAccounts, accounts());
  assert.equal(refund.cashRefundSum, approve.cashCharged);
  assert.equal(refund.visaRefundSum, approve.visaCharged);
});

test('استرداد الإلغاء: بند بدون حساب بيتحسب فيزا في المجموع (سلوك قديم محفوظ) ولا يرجّع رصيد', () => {
  const items = [item({ payment_method: 'other_visa', amount: 70 }), item({ payment_method: 'cash', amount: 30 })];
  const refund = planInvoiceRefund({ invoice, items, custodyAccounts: accounts() });
  assert.deepEqual(refund.refunds, { cash1: 30 });
  assert.equal(refund.cashRefundSum, 30);
  assert.equal(refund.visaRefundSum, 70);
});

test('تكلفة التراخيص اليومية للسيارة: المعتمدة فقط', () => {
  const invs: any[] = [
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 100, approval_status: 'approved' },
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 50 },
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 7, approval_status: 'pending' },
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 8, approval_status: 'returned' },
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 9, is_deleted: true },
    { car_id: 'c2', invoice_date: '2026-10-04', total_amount: 1000 },
    { car_id: 'c1', invoice_date: '2026-10-05', total_amount: 1000 },
  ];
  assert.equal(licenseCostForCarDay(invs, 'c1', '2026-10-04'), 150);
  assert.ok(isInvoiceApproved({} as any));
  assert.ok(!isInvoiceApproved({ approval_status: 'pending' } as any));
});

test('التحويل بين الحسابات: الفحص وأثره على العهدة', () => {
  const [cash, visa] = accounts();
  assert.equal(validateCustodyTransfer(cash, visa, 1000), null);
  assert.match(validateCustodyTransfer(cash, visa, 1001)!, /رصيد حساب المرسل غير كافٍ.*متاح: 1000.*1001/);
  assert.match(validateCustodyTransfer(undefined, visa, 1)!, /غير متوفر/);
  const r = applyTransferToOfficial(official, cash, visa, 300);
  assert.equal(r.changed, true);
  assert.equal(r.patch.cash_custody, 700);
  assert.equal(r.patch.visa_custody, 800);
  // الخصم ما ينزلش تحت الصفر
  const small: any = { id: 'o1', cash_custody: 100, visa_custody: 0 };
  assert.equal(applyTransferToOfficial(small, cash, visa, 300).patch.cash_custody, 0);
  // مسؤول مالوش علاقة
  const other: any = { id: 'zzz', cash_custody: 5, visa_custody: 5 };
  const o = applyTransferToOfficial(other, cash, visa, 300);
  assert.equal(o.changed, false);
  assert.equal(o.patch.cash_custody, 5);
  // تحويل لمسؤول تاني: الأول ينقص والتاني يزيد
  const toOther: any = { id: 'o2', official_id: 'o2', type: 'cash' };
  assert.equal(applyTransferToOfficial({ id: 'o2', cash_custody: 10, visa_custody: 0 } as any, cash, toOther, 40).patch.cash_custody, 50);
});

test('قفل الشهور: التعديل لأدمن البرنامج بس', () => {
  const locked = [{ month: '2026-09' }];
  assert.ok(isMonthLockedIn(locked, '2026-09-15'));
  assert.ok(isMonthLockedIn(locked, '2026-09'));
  assert.ok(!isMonthLockedIn(locked, '2026-10-01'));
  assert.ok(!isMonthLockedIn(locked, ''));
  assert.equal(canEditMonthFor(locked, 'manager', '2026-09-01'), false);
  assert.equal(canEditMonthFor(locked, 'admin', '2026-09-01'), true);
  assert.equal(canEditMonthFor(locked, 'manager', '2026-10-01'), true);
  assert.equal(canEditMonthFor(locked, undefined, '2026-09-01'), false);
});

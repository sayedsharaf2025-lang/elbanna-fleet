import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOfficialLedger, buildAccountLedger } from '../src/utils/custodyLedger';

// الحركات مخزّنة من الأحدث للأقدم زي ما المتجر بيحفظها
const mk = (o: any) => ({ official_id: 'o1', date: '2026-10-01', description: '', ...o });
const m1 = mk({ id: 'm1', to_account_id: 'a1', amount: 100, type: 'deposit', description: 'تغذية' });
const m2 = mk({ id: 'm2', from_account_id: 'a1', to_account_id: 'a2', amount: 40, type: 'transfer' });
const m3 = mk({ id: 'm3', from_account_id: 'a2', amount: 15, type: 'invoice_charge' });
const movements = [m3, m2, m1] as any[];

test('كشف المسؤول: الرصيد الجاري زمنيًا والتحويل الداخلي صافيه صفر', () => {
  const rows = buildOfficialLedger(movements);
  assert.deepEqual(rows.map(r => r.id), ['m3', 'm2', 'm1']); // من الأحدث للأقدم
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byId.m1.inflow, 100); assert.equal(byId.m1.outflow, 0); assert.equal(byId.m1.runningBalanceAfter, 100);
  assert.equal(byId.m2.inflow, 40); assert.equal(byId.m2.outflow, 40); assert.equal(byId.m2.runningBalanceAfter, 100);
  assert.equal(byId.m3.outflow, 15); assert.equal(byId.m3.runningBalanceAfter, 85);
});

test('كشف المسؤول: رصيد جاري منفصل لكل مسؤول', () => {
  const other = mk({ id: 'x1', official_id: 'o2', to_account_id: 'b1', amount: 500, type: 'deposit' });
  const rows = buildOfficialLedger([m3, other, m2, m1] as any[]);
  const x = rows.find(r => r.id === 'x1')!;
  assert.equal(x.runningBalanceAfter, 500);
  assert.equal(rows.find(r => r.id === 'm3')!.runningBalanceAfter, 85);
});

test('كشف حساب فرعي: يقتصر على حركات الحساب والرصيد يتراكم', () => {
  const a1 = buildAccountLedger(movements, 'a1');
  assert.deepEqual(a1.map(r => [r.id, r.inflow, r.outflow, r.running]), [['m2', 0, 40, 60], ['m1', 100, 0, 100]]);
  const a2 = buildAccountLedger(movements, 'a2');
  assert.deepEqual(a2.map(r => [r.id, r.inflow, r.outflow, r.running]), [['m3', 0, 15, 25], ['m2', 40, 0, 40]]);
  assert.deepEqual(buildAccountLedger(movements, 'nope'), []);
});

test('تسوية بدون حساب: عجز/تنزيل/سالب = منصرف، غير كده وارد', () => {
  // الدالة بتفلتر على حركات فيها الحساب، فالتسوية بدون حساب مش بتظهر في كشف حساب فرعي
  const s = mk({ id: 's1', to_account_id: 'a1', amount: 10, type: 'settlement', description: 'تسوية عجز' });
  const rows = buildAccountLedger([s] as any[], 'a1');
  assert.equal(rows[0].inflow, 10); // to_account_id === accId يغلب
});

test('إيداع وسحب بدون حسابات على مستوى المسؤول', () => {
  const dep = mk({ id: 'd', amount: 70, type: 'deposit' });
  const wd = mk({ id: 'w', amount: 20, type: 'withdrawal' });
  const rows = buildOfficialLedger([wd, dep] as any[]);
  assert.equal(rows.find(r => r.id === 'd')!.runningBalanceAfter, 70);
  assert.equal(rows.find(r => r.id === 'w')!.runningBalanceAfter, 50);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVehicleProfitRows, monthOverlapShare } from '../src/utils/vehicleProfit';

test('monthOverlapShare: نسبة تقاطع الشهر مع المدى', () => {
  assert.equal(monthOverlapShare('2026-10', '2026-10-01', '2026-10-31'), 1);
  assert.equal(monthOverlapShare('2026-10', '2026-10-01', '2026-10-10'), 10 / 31);
  assert.equal(monthOverlapShare('2026-10', '2026-09-15', '2026-10-02'), 2 / 31);
  assert.equal(monthOverlapShare('2026-10', '2026-11-01', '2026-11-30'), 0);
  assert.equal(monthOverlapShare('2026-02', '2026-01-01', '2026-12-31'), 1);
  assert.equal(monthOverlapShare('bad', '2026-01-01', '2026-12-31'), 0);
});

const baseDb = (): any => ({
  cars: [{ id: 'c1', car_number: 'ر س ب 1' }, { id: 'c2', car_number: 'خامل' }],
  drivers: [{ id: 'd1', name: 'سائق 1' }],
  carDailyCosts: [
    { car_id: 'c1', date: '2026-10-02', total_distance_km: 100, freight_amount: 500, cards_amount: 50, violations_amount: 999, tire_wash_amount: 20, extra_costs: [{ amount: 30 }] },
    { car_id: 'c1', date: '2026-11-02', total_distance_km: 5, freight_amount: 9999, cards_amount: 0, violations_amount: 0, tire_wash_amount: 0, extra_costs: [] }, // خارج المدى
  ],
  movements: [
    { type: 'deduction', car_id: 'c1', date: '2026-10-03', amount_change: -70 },
    { type: 'deduction', car_id: undefined, date: '2026-10-03', amount_change: -1000 }, // بدون سيارة
    { type: 'violation', car_id: 'c1', date: '2026-10-03', amount_change: -5 },        // مش خصم
  ],
  transportRequests: [{ id: 'r1', assigned_car_id: 'c1', request_date: '2026-10-01', execution_date: '2026-10-02' }, { id: 'r2', assigned_car_id: 'c1', request_date: '2026-12-01' }],
  transportRequestCosts: [{ request_id: 'r1', legs: [{ smoke_amount: 40 }, { smoke_amount: 10 }] }],
  maintenanceInvoices: [{ car_id: 'c1', invoice_date: '2026-10-05' }],
  getMaintenanceCostForCarDay: (carId: string, date: string) => carId === 'c1' ? ({ '2026-10-02': 200, '2026-10-05': 100 } as any)[date] || 0 : 0,
  invoices: [
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 300, approval_status: 'approved' },
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 100 },                              // قديمة بدون حالة = معتمدة
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 999, approval_status: 'pending' },  // لسه
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 888, approval_status: 'returned' }, // مرتجعة
    { car_id: 'c1', invoice_date: '2026-10-04', total_amount: 777, approval_status: 'approved', is_deleted: true },
  ],
  carMonthlyCosts: [{ car_id: 'c1', month: '2026-10', driver_id: 'd1', salary_amount: 3100, diesel_amount: 1550, oil_amount: 310 }],
});

test('ربحية السيارة: كل المكونات والصافي', () => {
  const rows = computeVehicleProfitRows(baseDb(), '2026-10-01', '2026-10-10');
  assert.equal(rows.length, 1, 'السيارة الخاملة بتتشال');
  const r = rows[0];
  assert.equal(r.freight, 500);
  assert.equal(r.distance, 100);
  assert.equal(r.recovered, 70);               // الخصم المربوط بالسيارة بس
  assert.equal(r.smoke, 50);
  assert.equal(r.cards, 50);                   // مبلغ المخالفات اليدوي (999) مش بيتحسب
  assert.equal(r.tireWash, 20);
  assert.equal(r.extra, 30);
  assert.equal(r.maintenance, 300);            // يوم المصروف + يوم فاتورة الصيانة
  assert.equal(r.license, 400);                // المعتمدة + القديمة بدون حالة، من غير المعلّقة/المرتجعة/الملغاة
  assert.equal(r.salary, 1000);                // 3100 × 10/31
  assert.equal(r.diesel, 500);
  assert.equal(r.oil, 100);
  assert.equal(r.driverNames, 'سائق 1');
  assert.equal(r.tripCount, 1);
  assert.equal(r.totalCost, 50 + 50 + 20 + 30 + 300 + 400 + 1000 + 500 + 100);
  assert.equal(r.net, 500 + 70 - r.totalCost);
});

test('ربحية السيارة: مدى مختلف يغيّر التوزيع الشهري ويستبعد اللي برا', () => {
  const rows = computeVehicleProfitRows(baseDb(), '2026-11-01', '2026-11-30');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].freight, 9999);
  assert.equal(rows[0].salary, 0);
  assert.equal(rows[0].recovered, 0);
  assert.equal(computeVehicleProfitRows(baseDb(), '2027-01-01', '2027-01-31').length, 0);
});

import { maintenanceCostForCarDay } from '../src/db/logic/maintenanceCost';

test('تكلفة الصيانة اليومية: البنود ناقص الخصم، من غير المسودات', () => {
  const invs: any[] = [
    { car_id: 'c1', invoice_date: '2026-10-02', status: 'invoiced', items: [{ total: 300 }, { total: 200 }], discount: 50 },
    { car_id: 'c1', invoice_date: '2026-10-02', status: 'closed', items: [{ total: 100 }] },
    { car_id: 'c1', invoice_date: '2026-10-02', status: 'draft', items: [{ total: 9999 }] },
    { car_id: 'c1', invoice_date: '2026-10-03', status: 'invoiced', items: [{ total: 1 }] },
    { car_id: 'c2', invoice_date: '2026-10-02', status: 'invoiced', items: [{ total: 7 }] },
  ];
  assert.equal(maintenanceCostForCarDay(invs, 'c1', '2026-10-02'), 550);
  assert.equal(maintenanceCostForCarDay(invs, 'c1', '2026-10-09'), 0);
});

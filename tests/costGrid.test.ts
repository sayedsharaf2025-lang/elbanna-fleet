import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyCostData, buildMonthlyCostData, dailyCellValue, monthlyCellValue, suggestedFreight,
  findCarByPlate, looksLikePlateColumn, dailyKey,
} from '../src/utils/costGrid';

const rates = { 'جامبو': 2.5, 'دبابة': 4 };
const items = [{ id: 'smoke', name: 'دخان السائق' }, { id: 'park', name: 'انتظار' }];
const existing: any = {
  id: 'cdc1', car_id: 'c1', date: '2026-10-02', total_distance_km: 100, freight_amount: 250,
  cards_amount: 50, violations_amount: 0, tire_wash_amount: 20, maintenance_amount: 0, updated_at: '',
  extra_costs: [{ item_id: 'smoke', item_name: 'دخان السائق', amount: 30 }, { item_id: 'deleted_type', item_name: 'نوع اتمسح', amount: 15 }],
};

test('suggestedFreight: المسافة × سعر النوع، وnull لو ناقص', () => {
  assert.equal(suggestedFreight('100', 'جامبو', rates), 250);
  assert.equal(suggestedFreight('33.3', 'دبابة', rates), 133.2);
  assert.equal(suggestedFreight('', 'جامبو', rates), null);
  assert.equal(suggestedFreight('100', 'ملاكي', rates), null);
  assert.equal(suggestedFreight('100', undefined, rates), null);
  assert.equal(suggestedFreight('١٠٠', 'جامبو', rates), 250);
});

test('dailyCellValue: المسودة تغلب المحفوظ', () => {
  assert.equal(dailyCellValue(existing, undefined, 'distance'), '100');
  assert.equal(dailyCellValue(existing, { distance: '120' }, 'distance'), '120');
  assert.equal(dailyCellValue(existing, { cards: '' }, 'cards'), '');
  assert.equal(dailyCellValue(existing, undefined, 'extra:smoke'), '30');
  assert.equal(dailyCellValue(existing, undefined, 'extra:park'), '');
  assert.equal(dailyCellValue(undefined, undefined, 'distance'), '');
});

test('buildDailyCostData: يدمج المسودة، يحسب النولون، يحافظ على البنود اليتيمة', () => {
  const d = buildDailyCostData(existing, { distance: '200', 'extra:park': '12' }, 'جامبو', rates, items);
  assert.equal(d.total_distance_km, 200);
  assert.equal(d.freight_amount, 500);
  assert.equal(d.cards_amount, 50);          // ما اتلمسش
  assert.equal(d.tire_wash_amount, 20);
  const byId = Object.fromEntries(d.extra_costs.map(i => [i.item_id, i.amount]));
  assert.deepEqual(byId, { smoke: 30, park: 12, deleted_type: 15 });
  // مسح خانة = صفر ويتشال البند
  const cleared = buildDailyCostData(existing, { 'extra:smoke': '' }, 'جامبو', rates, items);
  assert.ok(!cleared.extra_costs.some(i => i.item_id === 'smoke'));
  // سجل جديد بدون سعر نولون
  const fresh = buildDailyCostData(undefined, { distance: '50' }, 'ملاكي', rates, items);
  assert.equal(fresh.freight_amount, 0);
  assert.equal(fresh.total_distance_km, 50);
  assert.deepEqual(fresh.extra_costs, []);
});

test('buildMonthlyCostData / monthlyCellValue', () => {
  const rec: any = { id: 'm1', car_id: 'c1', month: '2026-10', driver_id: 'd1', salary_amount: 5000, diesel_amount: 0, oil_amount: 100 };
  assert.equal(monthlyCellValue(rec, 'dX', undefined, 'driver'), 'd1');
  assert.equal(monthlyCellValue(undefined, 'dX', undefined, 'driver'), 'dX');
  assert.equal(monthlyCellValue(rec, 'dX', { driver: '' }, 'driver'), '');
  const d = buildMonthlyCostData(rec, 'dX', { diesel: '1,250.5', salary: '٦٠٠٠' });
  assert.deepEqual(d, { driver_id: 'd1', salary_amount: 6000, diesel_amount: 1250.5, oil_amount: 100 });
  const none = buildMonthlyCostData(undefined, undefined, {});
  assert.deepEqual(none, { driver_id: undefined, salary_amount: 0, diesel_amount: 0, oil_amount: 0 });
});

test('لصق بأرقام السيارات: مطابقة اللوحات', () => {
  const cars = [{ car_number: 'ر س ب 7352' }, { car_number: 'أ ب ج 1234' }];
  assert.equal(findCarByPlate(cars, 'رسب٧٣٥٢'), cars[0]);
  assert.equal(findCarByPlate(cars, 'ا ب ج 1234'), cars[1]);
  assert.equal(findCarByPlate(cars, 'غير موجود'), undefined);
  assert.ok(looksLikePlateColumn(cars, [['ر س ب 7352', '185'], ['أ ب ج 1234', '92']]));
  assert.ok(!looksLikePlateColumn(cars, [['185', '1'], ['92', '2']]));  // أرقام مسافات مش لوحات
  assert.ok(!looksLikePlateColumn(cars, [['ر س ب 7352']]));             // عمود واحد = لصق عادي
  assert.equal(dailyKey('2026-10-02', 'c1'), '2026-10-02|c1');
});

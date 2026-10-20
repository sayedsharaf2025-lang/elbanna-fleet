import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceTrip, nextTripAction, startTripPatch, closeTripByOfficePatch, describeTrip, normalizeTransportRequest } from '../src/db/logic/tripFlow';

const NOW = '2026-10-20T08:00:00.000Z';
const TODAY = '2026-10-20';
const base = (o: any = {}) => ({ status: 'in_progress', destinations: ['مزرعة أ'], farm_name: 'مزرعة التحميل', trip_status: 'assigned', trip_leg: 0, trip_log: [], ...o });

// يمشّي الرحلة بالإجراءات ويرجّع الطلب بعد التطبيق
const run = (r: any, actions: Array<[any, any?]>) => {
  let cur = r;
  for (const [a, p] of actions) {
    const res = advanceTrip(cur, a, NOW, TODAY, p);
    assert.ok(res.ok, `${a}: ${res.error}`);
    cur = { ...cur, ...res.patch };
  }
  return cur;
};

test('الرد بسيارة بيبدأ الرحلة بحالة assigned وسجل أول حدث', () => {
  const p = startTripPatch(NOW);
  assert.equal(p.trip_status, 'assigned');
  assert.equal(p.trip_leg, 0);
  assert.equal(p.trip_log?.length, 1);
});

test('الرحلة الكاملة بوجهة واحدة بالترتيب المطلوب', () => {
  const r = run(base(), [['accept'], ['arrive_pickup'], ['load'], ['arrive_destination'], ['head_garage'], ['finish', { odometer: 120500, expectedSmoke: 850 }]]);
  assert.equal(r.trip_status, 'finished');
  assert.equal(r.status, 'done');
  assert.equal(r.finish_odometer, 120500);
  assert.equal(r.expected_smoke, 850);
  assert.equal(r.execution_date, TODAY);
  assert.equal(r.delivered_at, NOW);
  assert.deepEqual(r.trip_log.map((e: any) => e.status), ['accepted', 'at_pickup', 'loaded', 'at_destination', 'heading_garage', 'finished']);
});

test('أكتر من وجهة: بعد الوصول يتوجه للوجهة التالية وبعدين الجراج', () => {
  let r = run(base({ destinations: ['أ', 'ب'], trip_status: 'at_destination' }), []);
  assert.equal(nextTripAction(r), 'next_destination');
  r = run(r, [['next_destination']]);
  assert.equal(r.trip_status, 'loaded');
  assert.equal(r.trip_leg, 1);
  r = run(r, [['arrive_destination']]);
  assert.equal(nextTripAction(r), 'head_garage');
  assert.match(describeTrip(r), /2\/2/);
});

test('مفيش قفز بين المراحل ولا تنفيذ بعد الانتهاء', () => {
  assert.equal(advanceTrip(base(), 'load', NOW, TODAY).ok, false);
  assert.equal(advanceTrip(base({ trip_status: 'heading_garage' }), 'accept', NOW, TODAY).ok, false);
  assert.equal(advanceTrip(base({ trip_status: 'finished', status: 'done' }), 'accept', NOW, TODAY).ok, false);
  assert.equal(advanceTrip(base({ status: 'new', trip_status: undefined }), 'accept', NOW, TODAY).ok, false);
});

test('الانتهاء بيتطلب العداد والدخان المتوقع', () => {
  const r = base({ trip_status: 'heading_garage' });
  assert.equal(advanceTrip(r, 'finish', NOW, TODAY, {}).ok, false);
  assert.equal(advanceTrip(r, 'finish', NOW, TODAY, { odometer: 100 }).ok, false);
  assert.equal(advanceTrip(r, 'finish', NOW, TODAY, { odometer: -5, expectedSmoke: 10 }).ok, false);
  assert.equal(advanceTrip(r, 'finish', NOW, TODAY, { odometer: 100, expectedSmoke: 0 }).ok, true);
});

test('تاريخ التنفيذ الموجود مايتغيرش عند الانتهاء', () => {
  const res = advanceTrip(base({ trip_status: 'heading_garage', execution_date: '2026-10-18' }), 'finish', NOW, TODAY, { odometer: 1, expectedSmoke: 1 });
  assert.equal(res.patch?.execution_date, '2026-10-18');
});

test('إنهاء المكتب اليدوي بيقفل الرحلة المعلّقة فقط', () => {
  assert.deepEqual(closeTripByOfficePatch({ trip_status: undefined, trip_log: undefined }, NOW), {});
  assert.deepEqual(closeTripByOfficePatch({ trip_status: 'finished', trip_log: [] }, NOW), {});
  const p = closeTripByOfficePatch({ trip_status: 'loaded', trip_log: [] }, NOW);
  assert.equal(p.trip_status, 'finished');
  assert.equal(p.trip_log?.[0].by, 'office');
});

test('normalizeTransportRequest: null القادمة من السحابة بتتشال ومفيش مفاتيح جديدة بتتضاف', () => {
  const row: any = { id: 'a', status: 'new', destinations: null, trip_status: null, trip_leg: null, trip_log: null, finish_odometer: '1200', expected_smoke: null, assigned_car_id: null };
  const n: any = normalizeTransportRequest(row);
  assert.deepEqual(n.destinations, []);
  assert.equal('trip_status' in n, false);
  assert.equal('trip_leg' in n, false);
  assert.equal('trip_log' in n, false);
  assert.equal(n.finish_odometer, 1200);
  assert.equal('assigned_car_id' in n, false);
  const plain: any = { id: 'b', status: 'new' };
  assert.deepEqual(Object.keys(normalizeTransportRequest(plain)), ['id', 'status']);
  // idempotent
  assert.deepEqual(normalizeTransportRequest(n), n);
});

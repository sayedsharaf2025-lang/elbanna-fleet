import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrackingRows, phaseOfRequest, isStalePhase, formatDuration, tripTimeline, countByPhase, isActiveRequest } from '../src/db/logic/driverTracking';

const car = (id: string, no: string, extra: any = {}): any => ({ id, car_number: no, driver_id: '', ...extra });
const req = (o: any): any => ({ id: 'r', request_number: '2610-0001', status: 'in_progress', destinations: [], assigned_car_id: 'c1', responded_at: '2026-10-20T06:00:00.000Z', ...o });
const drivers: any[] = [{ id: 'd1', name: 'محمد' }];

test('مرحلة الطلب من حالة الرحلة', () => {
  assert.equal(phaseOfRequest({ status: 'in_progress', trip_status: 'assigned' }), 'awaiting_accept');
  assert.equal(phaseOfRequest({ status: 'in_progress', trip_status: 'accepted' }), 'to_pickup');
  assert.equal(phaseOfRequest({ status: 'in_progress', trip_status: 'at_pickup' }), 'at_pickup');
  assert.equal(phaseOfRequest({ status: 'in_progress', trip_status: 'loaded' }), 'to_destination');
  assert.equal(phaseOfRequest({ status: 'in_progress', trip_status: 'at_destination' }), 'delivered');
  assert.equal(phaseOfRequest({ status: 'in_progress', trip_status: 'heading_garage' }), 'to_garage');
  assert.equal(phaseOfRequest({ status: 'in_progress' }), 'untracked');
  assert.equal(phaseOfRequest({ status: 'done', trip_status: 'finished' }), 'garage');
});

test('السيارة بدون رحلة جارية في الجراج، ومعاها آخر رحلة منتهية', () => {
  const rows = buildTrackingRows([car('c1', 'أ 1'), car('c2', 'أ 2')], drivers, [
    req({ id: 'old', status: 'done', trip_status: 'finished', request_number: '2610-0001', delivered_at: '2026-10-19T10:00:00.000Z' }),
    req({ id: 'newer', status: 'done', trip_status: 'finished', request_number: '2610-0002', delivered_at: '2026-10-20T10:00:00.000Z', finish_odometer: 500 }),
  ]);
  const c1 = rows.find(r => r.car.id === 'c1')!;
  assert.equal(c1.phase, 'garage');
  assert.equal(c1.lastTrip?.id, 'newer');
  assert.equal(rows.find(r => r.car.id === 'c2')!.lastTrip, undefined);
});

test('السيارة الجارية بتظهر بمرحلتها وسائقها وبداية المرحلة من آخر حدث', () => {
  const rows = buildTrackingRows([car('c1', 'أ 1', { driver_id: 'd1' })], drivers, [
    req({ trip_status: 'loaded', assigned_driver_id: 'd1', trip_log: [{ status: 'assigned', at: '2026-10-20T06:00:00.000Z' }, { status: 'loaded', at: '2026-10-20T07:30:00.000Z', leg: 0 }] }),
  ]);
  assert.equal(rows[0].phase, 'to_destination');
  assert.equal(rows[0].driverName, 'محمد');
  assert.equal(rows[0].since, '2026-10-20T07:30:00.000Z');
  assert.equal(rows[0].request?.id, 'r');
});

test('الطلب الجديد أو المنتهي مايعتبرش رحلة جارية', () => {
  assert.equal(isActiveRequest(req({ status: 'new', assigned_car_id: undefined })), false);
  assert.equal(isActiveRequest(req({ status: 'done', trip_status: 'finished' })), false);
  assert.equal(isActiveRequest(req({ trip_status: 'accepted' })), true);
  assert.equal(isActiveRequest(req({ trip_status: 'finished' })), false);
});

test('الترتيب: النشطة الأول (الأقدم مرحلة أولًا) والجراج في الآخر', () => {
  const rows = buildTrackingRows([car('c1', 'ب'), car('c2', 'أ'), car('c3', 'ج')], [], [
    req({ id: 'x', assigned_car_id: 'c1', trip_status: 'accepted', trip_log: [{ status: 'accepted', at: '2026-10-20T07:00:00.000Z' }] }),
    req({ id: 'y', assigned_car_id: 'c3', trip_status: 'assigned', trip_log: [{ status: 'assigned', at: '2026-10-20T08:00:00.000Z' }] }),
  ]);
  assert.deepEqual(rows.map(r => r.car.id), ['c3', 'c1', 'c2']);
  const counts = countByPhase(rows);
  assert.equal(counts.awaiting_accept, 1);
  assert.equal(counts.to_pickup, 1);
  assert.equal(counts.garage, 1);
});

test('تنبيه التأخير والمدد', () => {
  assert.equal(isStalePhase('awaiting_accept', 29), false);
  assert.equal(isStalePhase('awaiting_accept', 30), true);
  assert.equal(isStalePhase('to_pickup', 239), false);
  assert.equal(isStalePhase('to_pickup', 240), true);
  assert.equal(isStalePhase('garage', 9999), false);
  assert.equal(isStalePhase('to_pickup', undefined), false);
  assert.equal(formatDuration(0), 'أقل من دقيقة');
  assert.equal(formatDuration(45), '45 دقيقة');
  assert.equal(formatDuration(125), '2 س 5 د');
  assert.equal(formatDuration(180), '3 ساعة');
});

test('الخط الزمني بيحسب المدة بين المراحل', () => {
  const t = tripTimeline({ trip_log: [
    { status: 'assigned', at: '2026-10-20T06:00:00.000Z' },
    { status: 'accepted', at: '2026-10-20T06:07:00.000Z' },
    { status: 'finished', at: '2026-10-20T09:07:00.000Z', by: 'office' },
  ] } as any);
  assert.equal(t[0].minutesFromPrev, undefined);
  assert.equal(t[1].minutesFromPrev, 7);
  assert.equal(t[2].minutesFromPrev, 180);
  assert.equal(t[2].byOffice, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDriverNumber, validatePin, normalizePin, normalizeDriverCode, lockUntilMs, bucketTrips, canAcceptTrip, newAssignments, actionButtonLabel, targetStop, checkFinishInput, localYmd, stopStates } from '../src/driver/driverLogic';

const t = (o: any): any => ({ id: 'a', request_number: '2610-0001', status: 'in_progress', destinations: ['أ'], responded_at: '2026-10-20T06:00:00.000Z', ...o });

test('الأرقام العربية والفواصل', () => {
  assert.equal(parseDriverNumber('١٢٣٤٥'), 12345);
  assert.equal(parseDriverNumber('120,500'), 120500);
  assert.equal(parseDriverNumber('850,5'), 850.5);
  assert.equal(parseDriverNumber('١٢٠٬٥٠٠'), 120500);
  assert.equal(parseDriverNumber('120 500'), 120500);
  assert.equal(parseDriverNumber('٨٥٠٫٥'), 850.5);
  assert.equal(parseDriverNumber(''), undefined);
  assert.equal(parseDriverNumber('12a'), undefined);
  assert.equal(parseDriverNumber('-5'), undefined);
});

test('الرقم السري 4 إلى 8 أرقام', () => {
  assert.equal(validatePin('1234'), null);
  assert.equal(validatePin('١٢٣٤٥٦'), null);
  assert.notEqual(validatePin('123'), null);
  assert.notEqual(validatePin('123456789'), null);
  assert.notEqual(validatePin('12ab'), null);
  assert.equal(normalizePin(' ١٢ ٣٤ '), '1234');
  assert.equal(normalizeDriverCode(' ١٢٣ '), '123');
});

test('القفل بعد 5 محاولات فاشلة بيتضاعف', () => {
  assert.equal(lockUntilMs(4, 1000), 0);
  assert.equal(lockUntilMs(5, 1000), 31000);
  assert.equal(lockUntilMs(6, 1000), 61000);
  assert.equal(lockUntilMs(99, 0), 480000);
});

test('الرحلة الحالية والطلبات القادمة، ومنع القبول أثناء رحلة', () => {
  const trips = [
    t({ id: '1', trip_status: 'assigned', responded_at: '2026-10-20T08:00:00.000Z' }),
    t({ id: '2', trip_status: 'loaded', responded_at: '2026-10-20T06:00:00.000Z' }),
    t({ id: '3', trip_status: 'assigned', responded_at: '2026-10-20T07:00:00.000Z' }),
    t({ id: '4' }),
    t({ id: '5', status: 'done', trip_status: 'finished' }),
  ];
  const b = bucketTrips(trips);
  assert.equal(b.current?.id, '2');
  assert.deepEqual(b.incoming.map(x => x.id), ['3', '1']);
  assert.deepEqual(b.untracked.map(x => x.id), ['4']);
  assert.equal(canAcceptTrip(b), false);
  assert.equal(canAcceptTrip(bucketTrips([t({ id: '1', trip_status: 'assigned' })])), true);
});

test('التنبيه للطلبات الجديدة فقط', () => {
  const trips = [t({ id: '1', trip_status: 'assigned' }), t({ id: '2', trip_status: 'assigned' }), t({ id: '3', trip_status: 'accepted' })];
  assert.deepEqual(newAssignments(new Set(['1']), trips).map(x => x.id), ['2']);
  assert.deepEqual(newAssignments(new Set(['1', '2']), trips), []);
});

test('تسميات الأزرار وهدف المحطة', () => {
  assert.equal(actionButtonLabel('arrive_destination', { destinations: ['أ'], trip_leg: 0 }), 'تم الوصول للوجهة');
  assert.equal(actionButtonLabel('arrive_destination', { destinations: ['أ', 'ب'], trip_leg: 1 }), 'تم الوصول للوجهة 2 من 2');
  assert.equal(actionButtonLabel('finish', { destinations: [], trip_leg: 0 }), 'تم الانتهاء');
  assert.equal(targetStop({ trip_status: 'accepted' }), 'pickup');
  assert.equal(targetStop({ trip_status: 'loaded', trip_leg: 1 }), 1);
  assert.equal(targetStop({ trip_status: 'heading_garage' }), 'garage');
  assert.equal(targetStop({ trip_status: 'assigned' }), null);
});

test('التحقق من العداد والدخان عند الانتهاء', () => {
  assert.equal(checkFinishInput('', '10').ok, false);
  assert.equal(checkFinishInput('100', '').ok, false);
  const ok = checkFinishInput('١٢٠٥٠٠', '٨٥٠', 120000);
  assert.equal(ok.ok, true);
  assert.equal(ok.odometer, 120500);
  assert.equal(ok.smoke, 850);
  assert.equal(ok.warning, undefined);
  assert.match(checkFinishInput('119000', '0', 120000).warning || '', /أقل/);
  assert.match(checkFinishInput('130000', '0', 120000).warning || '', /كبير/);
  assert.equal(checkFinishInput('500', '0').warning, undefined);
});

test('التاريخ المحلي YYYY-MM-DD', () => {
  assert.equal(localYmd(new Date(2026, 9, 5, 23, 30)), '2026-10-05');
});

test('حالة محطات الرحلة (تحميل ← وجهات ← جراج)', () => {
  const two = { destinations: ['أ', 'ب'] };
  assert.deepEqual(stopStates({ ...two, trip_status: 'accepted', trip_leg: 0 }), ['target', 'pending', 'pending', 'pending']);
  assert.deepEqual(stopStates({ ...two, trip_status: 'at_pickup', trip_leg: 0 }), ['here', 'pending', 'pending', 'pending']);
  assert.deepEqual(stopStates({ ...two, trip_status: 'loaded', trip_leg: 0 }), ['done', 'target', 'pending', 'pending']);
  assert.deepEqual(stopStates({ ...two, trip_status: 'at_destination', trip_leg: 0 }), ['done', 'here', 'pending', 'pending']);
  assert.deepEqual(stopStates({ ...two, trip_status: 'loaded', trip_leg: 1 }), ['done', 'done', 'target', 'pending']);
  assert.deepEqual(stopStates({ ...two, trip_status: 'heading_garage', trip_leg: 1 }), ['done', 'done', 'done', 'target']);
  assert.equal(stopStates({ destinations: [], trip_status: 'loaded', trip_leg: 0 }).length, 3);
});

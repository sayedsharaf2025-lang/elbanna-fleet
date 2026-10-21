import { test } from 'node:test';
import assert from 'node:assert/strict';

// ذاكرة وهمية لـ localStorage (supabaseClient بيقراها) — لازم تتعمل قبل استيراد الـ API
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).self = globalThis; // generateId بيستخدم self.crypto (متوفر في المتصفح بس)

const { loginDriver, fetchTrips, applyTripAction, fetchLastOdometer, verifySession, __setClientForTests } = await import('../src/driver/driverApi');
const { hashPassword } = await import('../src/db/passwordUtil');
const { startTripPatch } = await import('../src/db/logic/tripFlow');

// قاعدة بيانات وهمية بسيطة تدعم السلاسل اللي بيستخدمها التطبيق
function makeFake(tables: Record<string, any[]>) {
  const from = (name: string) => {
    const rows = () => (tables[name] = tables[name] || []);
    const make = (mode: 'select' | 'update' | 'delete', patch?: any) => {
      const filters: Array<(r: any) => boolean> = [];
      let order: { col: string; asc: boolean } | null = null;
      let lim = Infinity;
      let single = false;
      const run = () => {
        let list = rows().filter(r => filters.every(f => f(r)));
        if (mode === 'update') { list.forEach(r => Object.assign(r, patch)); return { data: list.map(r => ({ id: r.id })), error: null }; }
        if (mode === 'delete') { tables[name] = rows().filter(r => !list.includes(r)); return { data: null, error: null }; }
        if (order) list = [...list].sort((a, b) => (String(a[order!.col] ?? '').localeCompare(String(b[order!.col] ?? ''))) * (order!.asc ? 1 : -1));
        list = list.slice(0, lim);
        return { data: single ? (list[0] ?? null) : list, error: null };
      };
      const q: any = {
        eq: (c: string, v: any) => { filters.push(r => r[c] === v); return q; },
        neq: (c: string, v: any) => { filters.push(r => r[c] !== v); return q; },
        in: (c: string, v: any[]) => { filters.push(r => v.includes(r[c])); return q; },
        not: (c: string, _op: string, _v: any) => { filters.push(r => r[c] !== null && r[c] !== undefined); return q; },
        ilike: (c: string, v: string) => { filters.push(r => String(r[c]).toLowerCase() === v.toLowerCase()); return q; },
        order: (c: string, o: any) => { order = { col: c, asc: o?.ascending !== false }; return q; },
        limit: (n: number) => { lim = n; return q; },
        select: () => q,
        maybeSingle: () => { single = true; return Promise.resolve(run()); },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return q;
    };
    return {
      select: () => make('select'),
      update: (p: any) => make('update', p),
      delete: () => make('delete'),
      upsert: (list: any[]) => { list.forEach(n => { const i = rows().findIndex(r => r.id === n.id); if (i >= 0) rows()[i] = n; else rows().push(n); }); return Promise.resolve({ error: null }); },
    };
  };
  return { from };
}

const driver = { id: 'd1', driver_code: 'D-7', name: 'محمد' };
const baseTrip = () => ({ id: 'r1', request_number: '2610-0001', requester_name: 'أحمد', farm_name: 'مزرعة أ', destinations: ['مصنع ب'], status: 'in_progress', assigned_car_id: 'c1', assigned_driver_id: 'd1', responded_at: '2026-10-20T06:00:00.000Z', ...startTripPatch('2026-10-20T06:00:00.000Z') });

function setup(extra: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    drivers: [{ ...driver }, { id: 'd2', driver_code: 'D-8', name: 'علي' }],
    driver_app_access: [{ driver_id: 'd1', pin_hash: hashPassword('123456') }],
    cars: [{ id: 'c1', car_number: 'ر س ب 1' }],
    transport_requests: [baseTrip()],
    notifications: [],
    ...extra,
  };
  __setClientForTests(makeFake(tables));
  return tables;
}

test('الدخول: كود + رقم سري صح، وأخطاء واضحة', async () => {
  setup();
  const ok = await loginDriver(' D-7 ', '١٢٣٤٥٦');
  assert.equal(ok.ok, true);
  assert.equal(ok.data?.name, 'محمد');
  assert.equal((await loginDriver('d-7', '123456')).ok, true); // مش حساس لحالة الحروف
  assert.equal((await loginDriver('D-7', '000000')).ok, false);
  assert.equal((await loginDriver('X-1', '123456')).ok, false);
  const noPin = await loginDriver('D-8', '123456');
  assert.equal(noPin.ok, false);
  assert.match(noPin.error || '', /رقم سري/);
  assert.equal((await loginDriver('', '')).ok, false);
});

test('التحقق من استمرار صلاحية الدخول', async () => {
  const t = setup();
  assert.equal((await verifySession({ id: 'd1', code: 'D-7', name: 'محمد' })).data, true);
  t.driver_app_access.length = 0;
  assert.equal((await verifySession({ id: 'd1', code: 'D-7', name: 'محمد' })).data, false);
});

test('رحلات السائق: الجارية والمنتهية وأرقام السيارات', async () => {
  setup({ transport_requests: [baseTrip(), { ...baseTrip(), id: 'other', assigned_driver_id: 'd2' }, { ...baseTrip(), id: 'old', status: 'done', trip_status: 'finished', delivered_at: '2026-10-19T10:00:00.000Z', finish_odometer: 500 }] });
  const res = await fetchTrips('d1');
  assert.equal(res.ok, true);
  assert.deepEqual(res.data!.open.map(t => t.id), ['r1']);
  assert.deepEqual(res.data!.recent.map(t => t.id), ['old']);
  assert.equal(res.data!.cars['c1'], 'ر س ب 1');
  assert.equal(await fetchLastOdometer('c1', 'r1'), 500);
});

test('الرحلة كاملة من القبول للانتهاء وإشعارات المكتب', async () => {
  const t = setup();
  const me = { id: 'd1', code: 'D-7', name: 'محمد' };
  const steps: Array<[any, any?]> = [['accept'], ['arrive_pickup'], ['load'], ['arrive_destination'], ['head_garage'], ['finish', { odometer: 120500, expectedSmoke: 850 }]];
  for (const [action, payload] of steps) {
    const trip: any = (await fetchTrips('d1')).data!.open[0];
    const res = await applyTripAction(trip, action, payload || {}, me, 'ر س ب 1', '2026-10-20');
    assert.equal(res.ok, true, `${action}: ${res.error}`);
  }
  const row = t.transport_requests[0];
  assert.equal(row.trip_status, 'finished');
  assert.equal(row.status, 'done');
  assert.equal(row.finish_odometer, 120500);
  assert.equal(row.expected_smoke, 850);
  assert.equal(row.execution_date, '2026-10-20');
  assert.deepEqual(row.trip_log.map((e: any) => e.status), ['assigned', 'accepted', 'at_pickup', 'loaded', 'at_destination', 'heading_garage', 'finished']);
  // إشعارين للمكتب: القبول والانتهاء
  assert.deepEqual(t.notifications.map((n: any) => n.kind), ['transport_trip_accepted', 'transport_trip_finished']);
  assert.equal(t.notifications[1].created_by, 'محمد');
  assert.deepEqual(t.notifications[1].read_by, []);
  assert.ok(t.notifications[1].target_screens.includes('route_accounting'));
});

test('تعارض: لو المكتب غيّر الحالة في نفس اللحظة الخطوة بتترفض', async () => {
  const t = setup();
  const staleTrip: any = (await fetchTrips('d1')).data!.open[0]; // assigned
  t.transport_requests[0].trip_status = 'accepted'; // اتغيّرت من مكان تاني
  const res = await applyTripAction(staleTrip, 'accept', {}, { id: 'd1', code: 'D-7', name: 'محمد' }, 'x', '2026-10-20');
  assert.equal(res.ok, false);
  assert.match(res.error || '', /اتغيّر/);
  assert.equal(t.transport_requests[0].trip_status, 'accepted');
});

test('خطوة مش في ترتيبها أو إنهاء بدون عداد بيترفضوا قبل أي كتابة', async () => {
  const t = setup();
  const trip: any = (await fetchTrips('d1')).data!.open[0];
  const me = { id: 'd1', code: 'D-7', name: 'محمد' };
  assert.equal((await applyTripAction(trip, 'load', {}, me, 'x', '2026-10-20')).ok, false);
  const heading = { ...trip, trip_status: 'heading_garage' };
  t.transport_requests[0].trip_status = 'heading_garage';
  assert.equal((await applyTripAction(heading, 'finish', { odometer: 100 }, me, 'x', '2026-10-20')).ok, false);
  assert.equal(t.transport_requests[0].status, 'in_progress');
  assert.equal(t.notifications.length, 0);
});

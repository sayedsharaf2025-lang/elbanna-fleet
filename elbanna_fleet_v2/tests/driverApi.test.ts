import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDriverApi } from '../supabase/functions/_shared/driverApiHandler.ts';
import { signDriverToken, verifyDriverToken } from '../supabase/functions/_shared/driverToken.ts';
import { startTripPatch } from '../src/db/logic/tripFlow';

const SECRET = 'x'.repeat(40);
const NOW = new Date('2026-10-20T08:00:00.000Z');

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
  return { from } as any;
}


const driver = { id: 'd1', driver_code: 'D-7', name: 'محمد' };
const baseTrip = () => ({ id: 'r1', request_number: '2610-0001', requester_name: 'أحمد', farm_name: 'مزرعة أ', destinations: ['مصنع ب'], status: 'in_progress', assigned_car_id: 'c1', assigned_driver_id: 'd1', responded_at: '2026-10-20T06:00:00.000Z', ...startTripPatch('2026-10-20T06:00:00.000Z') });

// حالة وهمية لدوال قاعدة البيانات (driver_verify_pin / driver_access_version)
function setup(extra: Record<string, any[]> = {}, pins: Record<string, string> = { d1: '123456' }) {
  const tables: Record<string, any[]> = {
    drivers: [{ ...driver }, { id: 'd2', driver_code: 'D-8', name: 'علي' }],
    cars: [{ id: 'c1', car_number: 'ر س ب 1' }],
    transport_requests: [baseTrip()],
    notifications: [],
    ...extra,
  };
  const state = { pins, versions: { d1: 1, d2: 1 } as Record<string, number>, fails: {} as Record<string, number>, rpcCalls: 0 };
  const fake: any = makeFake(tables);
  fake.rpc = async (fn: string, args: any) => {
    state.rpcCalls++;
    if (fn === 'driver_access_version') return { data: state.pins[args.p_driver_id] ? state.versions[args.p_driver_id] : null, error: null };
    if (fn === 'driver_verify_pin') {
      const id = args.p_driver_id;
      if ((state.fails[id] || 0) >= 5) return { data: { ok: false, locked_seconds: 30 }, error: null };
      if (state.pins[id] && state.pins[id] === args.p_pin) { state.fails[id] = 0; return { data: { ok: true, pv: state.versions[id] }, error: null }; }
      state.fails[id] = (state.fails[id] || 0) + 1;
      return { data: { ok: false }, error: null };
    }
    return { data: null, error: { message: 'unknown rpc' } };
  };
  return { tables, state, call: async (body: any) => {
    const res = await handleDriverApi(new Request('https://x.test/driver-api', { method: 'POST', body: JSON.stringify(body) }), { db: fake, secret: SECRET, now: () => NOW });
    return res.json() as Promise<any>;
  } };
}

const login = async (s: ReturnType<typeof setup>, code = 'D-7', pin = '123456') => s.call({ action: 'login', code, pin });

test('الدخول: كود + رقم سري صح، وأخطاء عامة من غير كشف', async () => {
  const s = setup();
  const ok = await login(s, ' d-7 ', '١٢٣٤٥٦');
  assert.equal(ok.ok, true);
  assert.equal(ok.data.name, 'محمد');
  assert.ok(ok.data.token);
  const bad = await login(s, 'D-7', '000000');
  const noUser = await login(s, 'X-1', '123456');
  const noPin = await login(s, 'D-8', '123456');
  for (const r of [bad, noUser, noPin]) { assert.equal(r.ok, false); assert.match(r.error, /غير صحيح/); }
  assert.equal((await login(s, '', '')).ok, false);
  assert.equal((await login(s, 'D-7', 'abcdef')).ok, false);
});

test('القفل بعد محاولات خاطئة بيجي من السيرفر', async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) await login(s, 'D-7', '000000');
  const locked = await login(s, 'D-7', '123456');
  assert.equal(locked.ok, false);
  assert.equal(locked.locked_seconds, 30);
});

test('بدون توكن أو بتوكن مزوّر أو منتهي: الجلسة بتبطل', async () => {
  const s = setup();
  assert.equal((await s.call({ action: 'trips' })).code, 'session_invalid');
  const real = (await login(s)).data.token as string;
  const forged = real.split('.')[0] + '.' + 'A'.repeat(43);
  assert.equal((await s.call({ action: 'trips', token: forged })).code, 'session_invalid');
  const expired = await signDriverToken(SECRET, { sub: 'd1', pv: 1, exp: Math.floor(NOW.getTime() / 1000) - 10 });
  assert.equal((await s.call({ action: 'trips', token: expired })).code, 'session_invalid');
  const otherSecret = await signDriverToken('y'.repeat(40), { sub: 'd1', pv: 1, exp: Math.floor(NOW.getTime() / 1000) + 1000 });
  assert.equal((await s.call({ action: 'trips', token: otherSecret })).code, 'session_invalid');
});

test('تغيير الرقم السري أو إلغاء الدخول بيبطّل التوكن فورًا', async () => {
  const s = setup();
  const token = (await login(s)).data.token;
  assert.equal((await s.call({ action: 'verify', token })).ok, true);
  s.state.versions.d1 = 2; // المكتب غيّر الرقم
  assert.equal((await s.call({ action: 'verify', token })).code, 'session_invalid');
  s.state.versions.d1 = 1;
  delete s.state.pins.d1; // إلغاء الدخول
  assert.equal((await s.call({ action: 'verify', token })).code, 'session_invalid');
});

test('رحلات السائق: الجارية والمنتهية، ومفيش وصول لرحلات غيره', async () => {
  const s = setup({ transport_requests: [baseTrip(), { ...baseTrip(), id: 'other', assigned_driver_id: 'd2' }, { ...baseTrip(), id: 'old', status: 'done', trip_status: 'finished', delivered_at: '2026-10-19T10:00:00.000Z', finish_odometer: 500 }] });
  const token = (await login(s)).data.token;
  const res = await s.call({ action: 'trips', token });
  assert.deepEqual(res.data.open.map((t: any) => t.id), ['r1']);
  assert.deepEqual(res.data.recent.map((t: any) => t.id), ['old']);
  assert.equal(res.data.cars.c1, 'ر س ب 1');
  assert.equal((await s.call({ action: 'last_odometer', token, carId: 'c1', excludeId: 'r1' })).data, 500);
  assert.equal((await s.call({ action: 'last_odometer', token, carId: 'c9' })).data, null);
  const foreign = await s.call({ action: 'trip_action', token, tripId: 'other', action_name: 'accept' });
  assert.equal(foreign.ok, false);
  assert.match(foreign.error, /مش على حسابك/);
});

test('الرحلة كاملة من القبول للانتهاء وإشعارات المكتب', async () => {
  const s = setup();
  const token = (await login(s)).data.token;
  const steps: Array<[string, any?]> = [['accept'], ['arrive_pickup'], ['load'], ['arrive_destination'], ['head_garage'], ['finish', { odometer: 120500, expectedSmoke: 850 }]];
  for (const [action_name, payload] of steps) {
    const res = await s.call({ action: 'trip_action', token, tripId: 'r1', action_name, payload });
    assert.equal(res.ok, true, `${action_name}: ${res.error}`);
  }
  const row = s.tables.transport_requests[0];
  assert.equal(row.trip_status, 'finished');
  assert.equal(row.status, 'done');
  assert.equal(row.finish_odometer, 120500);
  assert.equal(row.expected_smoke, 850);
  assert.equal(row.execution_date, '2026-10-20');
  assert.deepEqual(row.trip_log.map((e: any) => e.status), ['assigned', 'accepted', 'at_pickup', 'loaded', 'at_destination', 'heading_garage', 'finished']);
  assert.deepEqual(s.tables.notifications.map((n: any) => n.kind), ['transport_trip_accepted', 'transport_trip_finished']);
  assert.equal(s.tables.notifications[1].created_by, 'محمد');
});

test('خطوة مش في ترتيبها أو إنهاء بدون عداد أو عملية مجهولة بتترفض', async () => {
  const s = setup();
  const token = (await login(s)).data.token;
  assert.equal((await s.call({ action: 'trip_action', token, tripId: 'r1', action_name: 'load' })).ok, false);
  assert.equal((await s.call({ action: 'trip_action', token, tripId: 'r1', action_name: 'hack' })).ok, false);
  s.tables.transport_requests[0].trip_status = 'heading_garage';
  assert.equal((await s.call({ action: 'trip_action', token, tripId: 'r1', action_name: 'finish', payload: { odometer: -5 } })).ok, false);
  assert.equal(s.tables.transport_requests[0].status, 'in_progress');
  assert.equal(s.tables.notifications.length, 0);
});

test('السر قصير أو ناقص: الدالة بترفض الشغل', async () => {
  const res = await handleDriverApi(new Request('https://x.test', { method: 'POST', body: '{"action":"login"}' }), { db: {}, secret: 'short' });
  assert.equal((await res.json() as any).ok, false);
});

test('توكن السائق: توقيع وتحقق وانتهاء', async () => {
  const exp = Math.floor(NOW.getTime() / 1000) + 100;
  const t = await signDriverToken(SECRET, { sub: 'd1', pv: 3, exp });
  assert.deepEqual(await verifyDriverToken(SECRET, t, NOW.getTime()), { sub: 'd1', pv: 3, exp });
  assert.equal(await verifyDriverToken(SECRET, t, NOW.getTime() + 200_000), null);
  assert.equal(await verifyDriverToken(SECRET, t + 'x', NOW.getTime()), null);
  assert.equal(await verifyDriverToken(SECRET, 12345, NOW.getTime()), null);
});

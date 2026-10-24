// منطق Edge Function الخاصة بتطبيق السائق (driver-api).
// السائق مالوش حساب Supabase ومابيلمسش الجداول: كل حاجة بتعدي من هنا بـ service_role بعد التحقق من التوكن،
// والـ RLS مقفول على الجداول، والرقم السري بيتفحص جوه قاعدة البيانات (bcrypt + قفل من السيرفر).
import { advanceTrip, normalizeTransportRequest, type TripAction } from './tripFlow.ts';
import { transportNotification } from './notifications.ts';
import { normalizeDriverCode, normalizePin } from './driverLogic.ts';
import { DRIVER_TOKEN_TTL_SECONDS, signDriverToken, verifyDriverToken } from './driverToken.ts';
import { fail, json, preflight, readJson } from './http.ts';
import type { TransportRequest } from './types.ts';

export interface DriverApiDeps {
  /** عميل Supabase بصلاحية service_role (أو بديل وهمي في الاختبارات) */
  db: any;
  /** سر توقيع التوكنات (DRIVER_TOKEN_SECRET) */
  secret: string;
  now?: () => Date;
}

const COMPANY_TZ = 'Africa/Cairo';
const ACTIONS: TripAction[] = ['accept', 'arrive_pickup', 'load', 'arrive_destination', 'next_destination', 'head_garage', 'finish'];
const STARTED = ['accepted', 'at_pickup', 'loaded', 'at_destination', 'heading_garage'];

const GENERIC_LOGIN_ERROR = 'كود السائق أو الرقم السري غير صحيح.';
const SESSION_INVALID = { code: 'session_invalid' };

const todayYmd = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const humanDuration = (seconds: number): string => {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} ثانية`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} دقيقة`;
  return `${Math.round(seconds / 3600)} ساعة`;
};

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export async function handleDriverApi(req: Request, deps: DriverApiDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!deps.secret || deps.secret.length < 32) return fail('تطبيق السائق لسه مش متجهّز على السيرفر — كلّم المكتب (DRIVER_TOKEN_SECRET).');

  const body = await readJson(req);
  if (!body) return fail('طلب غير صالح.');
  const now = deps.now ? deps.now() : new Date();
  const db = deps.db;

  try {
    if (body.action === 'login') return await login(db, deps.secret, now, body);

    // باقي العمليات: توكن صالح + السائق لسه عنده دخول + الرقم السري ماتغيّرش
    const payload = await verifyDriverToken(deps.secret, body.token, now.getTime());
    if (!payload) return fail('انتهت الجلسة — سجّل الدخول من جديد.', SESSION_INVALID);
    const { data: pv, error: pvErr } = await db.rpc('driver_access_version', { p_driver_id: payload.sub });
    if (pvErr) return fail(`تعذر التحقق من الجلسة: ${pvErr.message}`);
    if (pv === null || pv === undefined || Number(pv) !== payload.pv) return fail('انتهت الجلسة — سجّل الدخول من جديد.', SESSION_INVALID);
    const { data: driver, error: dErr } = await db.from('drivers').select('id, driver_code, name').eq('id', payload.sub).maybeSingle();
    if (dErr) return fail(`تعذر التحقق من السائق: ${dErr.message}`);
    if (!driver) return fail('انتهت الجلسة — سجّل الدخول من جديد.', SESSION_INVALID);

    switch (body.action) {
      case 'verify': return json({ ok: true, data: true });
      case 'trips': return await trips(db, driver.id);
      case 'last_odometer': return await lastOdometer(db, driver.id, str(body.carId, 100), str(body.excludeId, 100));
      case 'trip_action': return await tripAction(db, driver, body, now);
      default: return fail('عملية غير معروفة.');
    }
  } catch (e: any) {
    return fail(`تعذر تنفيذ الطلب: ${e?.message || e}`);
  }
}

// ===== الدخول =====
async function login(db: any, secret: string, now: Date, body: Record<string, any>): Promise<Response> {
  const code = normalizeDriverCode(str(body.code, 64));
  const pin = normalizePin(str(body.pin, 64));
  if (!code || !pin) return fail('اكتب كود السائق والرقم السري.');
  // الأرقام السرية القديمة ممكن تبدأ من 4 خانات؛ الجديدة 6–8 (بيتفرضوا عند التعيين)
  if (!/^\d{4,8}$/.test(pin)) return fail(GENERIC_LOGIN_ERROR);

  let { data: drivers, error } = await db.from('drivers').select('id, driver_code, name').eq('driver_code', code).limit(2);
  if (error) return fail(`تعذر تنفيذ الطلب: ${error.message}`);
  if (!drivers || drivers.length === 0) {
    const escaped = code.replace(/[\\%_]/g, (c: string) => `\\${c}`);
    const second = await db.from('drivers').select('id, driver_code, name').ilike('driver_code', escaped).limit(2);
    if (second.error) return fail(`تعذر تنفيذ الطلب: ${second.error.message}`);
    drivers = second.data;
  }
  if (!drivers || drivers.length !== 1) return fail(GENERIC_LOGIN_ERROR);
  const driver = drivers[0] as { id: string; driver_code: string; name: string };

  const { data: res, error: rpcErr } = await db.rpc('driver_verify_pin', { p_driver_id: driver.id, p_pin: pin });
  if (rpcErr) return fail(`تعذر تنفيذ الطلب: ${rpcErr.message}`);
  if (!res?.ok) {
    const wait = Number(res?.locked_seconds || 0);
    if (wait > 0) return fail(`تم قفل الدخول مؤقتًا بسبب محاولات خاطئة كتير. جرّب بعد ${humanDuration(wait)}.`, { locked_seconds: wait });
    return fail(GENERIC_LOGIN_ERROR);
  }
  const exp = Math.floor(now.getTime() / 1000) + DRIVER_TOKEN_TTL_SECONDS;
  const token = await signDriverToken(secret, { sub: driver.id, pv: Number(res.pv), exp });
  return json({ ok: true, data: { id: driver.id, code: driver.driver_code, name: driver.name, token, expires_at: exp * 1000 } });
}

// ===== الرحلات =====
async function trips(db: any, driverId: string): Promise<Response> {
  const [open, recent] = await Promise.all([
    db.from('transport_requests').select('*').eq('assigned_driver_id', driverId).eq('status', 'in_progress').order('responded_at', { ascending: true }),
    db.from('transport_requests').select('*').eq('assigned_driver_id', driverId).eq('status', 'done').order('delivered_at', { ascending: false }).limit(5),
  ]);
  if (open.error) return fail(`تعذر تنفيذ الطلب: ${open.error.message}`);
  if (recent.error) return fail(`تعذر تنفيذ الطلب: ${recent.error.message}`);
  const openRows = (open.data || []).map((r: any) => normalizeTransportRequest(r) as TransportRequest);
  const recentRows = (recent.data || []).map((r: any) => normalizeTransportRequest(r) as TransportRequest);
  const carIds = Array.from(new Set([...openRows, ...recentRows].map(r => r.assigned_car_id).filter(Boolean))) as string[];
  const cars: Record<string, string> = {};
  if (carIds.length > 0) {
    const { data } = await db.from('cars').select('id, car_number').in('id', carIds);
    (data || []).forEach((c: any) => { cars[c.id] = c.car_number; });
  }
  return json({ ok: true, data: { open: openRows, recent: recentRows, cars } });
}

// آخر عداد للسيارة — بس لسيارة السائق على رحلة جارية بتاعته (مش أي سيارة)
async function lastOdometer(db: any, driverId: string, carId: string, excludeId: string): Promise<Response> {
  if (!carId) return json({ ok: true, data: null });
  const { data: mine } = await db.from('transport_requests').select('id').eq('assigned_driver_id', driverId).eq('status', 'in_progress').eq('assigned_car_id', carId).limit(1);
  if (!mine || mine.length === 0) return json({ ok: true, data: null });
  const { data } = await db.from('transport_requests').select('id, finish_odometer')
    .eq('assigned_car_id', carId).not('finish_odometer', 'is', null).neq('id', excludeId)
    .order('delivered_at', { ascending: false }).limit(1);
  const v = data && data[0] ? Number((data[0] as any).finish_odometer) : NaN;
  return json({ ok: true, data: isNaN(v) ? null : v });
}

// تنفيذ خطوة: الباتش بيتحسب هنا من السيرفر (السائق مابيبعتش باتش) والتحديث مشروط بالحالة الحالية
async function tripAction(db: any, driver: { id: string; name: string }, body: Record<string, any>, now: Date): Promise<Response> {
  const tripId = str(body.tripId, 100);
  const action = body.action_name as TripAction;
  if (!tripId || !ACTIONS.includes(action)) return fail('عملية غير معروفة.');

  const { data: row, error } = await db.from('transport_requests').select('*').eq('id', tripId).maybeSingle();
  if (error) return fail(`تعذر تنفيذ الطلب: ${error.message}`);
  if (!row || row.assigned_driver_id !== driver.id) return fail('الطلب ده مش على حسابك.');
  const trip = normalizeTransportRequest(row) as TransportRequest;

  if (action === 'accept') {
    const { data: busy } = await db.from('transport_requests').select('id').eq('assigned_driver_id', driver.id).eq('status', 'in_progress').in('trip_status', STARTED).neq('id', tripId).limit(1);
    if (busy && busy.length > 0) return fail('عندك رحلة لسه ماخلصتش — خلّصها الأول.');
  }

  const p = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const num = (v: unknown, max: number): number | undefined => (typeof v === 'number' && isFinite(v) && v >= 0 && v <= max ? v : undefined);
  const payload = { odometer: num(p.odometer, 9_999_999), expectedSmoke: num(p.expectedSmoke, 1_000_000) };

  const res = advanceTrip(trip, action, now.toISOString(), todayYmd(now), payload);
  if (!res.ok || !res.patch) return fail(res.error || 'تعذر تنفيذ الخطوة.');

  const { data, error: upErr } = await db.from('transport_requests').update(res.patch).eq('id', trip.id).eq('trip_status', trip.trip_status as string).select('id');
  if (upErr) return fail(`تعذر تنفيذ الطلب: ${upErr.message}`);
  if (!data || data.length === 0) return fail('الطلب اتغيّر من المكتب — اتحدّثت الشاشة، راجع الحالة وجرّب تاني.');

  if (action === 'accept' || action === 'finish') {
    let carNumber: string | undefined;
    if (trip.assigned_car_id) {
      const { data: car } = await db.from('cars').select('car_number').eq('id', trip.assigned_car_id).maybeSingle();
      carNumber = car?.car_number;
    }
    const draft = transportNotification(action === 'accept' ? 'trip_accepted' : 'trip_finished', trip, carNumber);
    const note = { ...draft, id: crypto.randomUUID(), created_at: now.toISOString(), created_by: driver.name, read_by: [] as string[] };
    try { await db.from('notifications').upsert([note]); } catch { /* الإشعار مش بيوقف الرحلة */ }
  }
  return json({ ok: true, data: res.patch });
}

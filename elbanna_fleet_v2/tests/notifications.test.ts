import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maintenanceNotification, transportNotification, isVisibleTo, resolveTargetScreen, isUnread,
  normalizeNotification, mergeNotifications, pruneNotifications, notificationsToUpload, notificationUserKey,
} from '../src/db/logic/notifications';

const mreq = { id: 'm1', request_number: 'MT-2610-001', fault_description: 'فرامل' };
const treq = { id: 't1', request_number: '2610-0001', requester_name: 'أحمد', farm_name: 'مزرعة أ', destinations: ['مصنع ب'] };
const N = (o: any = {}) => ({ id: 'n1', kind: 'k', title: 't', body: 'b', entity_type: 'transport', entity_id: 't1', target_screens: ['requests_tracking'], created_at: '2026-10-20T08:00:00.000Z', read_by: [], ...o });

test('كل مرحلة صيانة بتروح للشاشة الصح، والمراحل بدون إشعار بترجع null', () => {
  assert.deepEqual(maintenanceNotification('new', mreq, 'ر س ب 1')?.target_screens, ['maintenance_review']);
  assert.deepEqual(maintenanceNotification('parts_requested', mreq, 'x')?.target_screens, ['maintenance_parts']);
  assert.deepEqual(maintenanceNotification('pending_invoice', mreq, 'x')?.target_screens, ['maintenance_accounting']);
  assert.deepEqual(maintenanceNotification('invoice_review', mreq, 'x')?.target_screens, ['maintenance_review']);
  assert.deepEqual(maintenanceNotification('repaired', mreq, 'x')?.target_screens, ['maintenance_requests']);
  assert.equal(maintenanceNotification('in_workshop', mreq, 'x'), null);
  assert.equal(maintenanceNotification('closed', mreq, 'x'), null);
  const n = maintenanceNotification('new', mreq, 'ر س ب 1')!;
  assert.equal(n.entity_type, 'maintenance');
  assert.equal(n.entity_id, 'm1');
  assert.match(n.body, /ر س ب 1/);
});

test('إشعارات النقل: الطلب الجديد لمتابعة الطلبات، الرد للطالب، الانتهاء للحسابات', () => {
  assert.deepEqual(transportNotification('created', treq).target_screens, ['requests_tracking']);
  assert.deepEqual(transportNotification('responded', treq, '123').target_screens, ['transport_requests']);
  assert.match(transportNotification('responded', treq, '123').body, /123/);
  assert.ok(transportNotification('trip_finished', treq).target_screens.includes('route_accounting'));
  assert.equal(transportNotification('trip_accepted', treq).entity_id, 't1');
});

test('الصلاحيات: الإشعار بيظهر لمن عنده أي شاشة معنية، وبيفتح أول شاشة متاحة', () => {
  const n = N({ target_screens: ['requests_tracking', 'transport_requests', 'route_accounting'] });
  assert.equal(isVisibleTo(n, ['reports']), false);
  assert.equal(isVisibleTo(n, ['route_accounting']), true);
  assert.equal(resolveTargetScreen(n, ['route_accounting', 'transport_requests']), 'transport_requests');
  assert.equal(resolveTargetScreen(n, ['reports']), null);
});

test('حالة القراءة لكل مستخدم', () => {
  const n = N({ read_by: ['u1'] });
  assert.equal(isUnread(n, 'u1'), false);
  assert.equal(isUnread(n, 'u2'), true);
  assert.equal(isUnread(n, ''), false);
  assert.equal(notificationUserKey({ systemUserId: 'su', username: 'x' }), 'su');
  assert.equal(notificationUserKey({ username: 'x' }), 'x');
  assert.equal(notificationUserKey(null), '');
});

test('normalizeNotification: null القادمة من السحابة', () => {
  const n = normalizeNotification({ id: 'a', kind: null, title: 'x', body: null, entity_type: 'maintenance', entity_id: 'm', target_screens: null, created_at: '2026-10-20T08:00:00Z', read_by: '["u1"]', created_by: null });
  assert.deepEqual(n.target_screens, []);
  assert.deepEqual(n.read_by, ['u1']);
  assert.equal(n.body, '');
  assert.equal('created_by' in n, false);
});

test('الدمج بيجمع القراءة من الطرفين ويرفع المحلي الناقص بس', () => {
  const local = [N({ id: 'a', read_by: ['u1'] }), N({ id: 'b', created_at: '2026-10-20T09:00:00.000Z' })];
  const cloud = [N({ id: 'a', read_by: ['u2'] })];
  const merged = mergeNotifications(local, cloud);
  assert.deepEqual(merged.map(n => n.id), ['b', 'a']);
  assert.deepEqual(merged.find(n => n.id === 'a')!.read_by.sort(), ['u1', 'u2']);
  assert.deepEqual(notificationsToUpload(merged, cloud).map(n => n.id).sort(), ['a', 'b']);
  assert.deepEqual(notificationsToUpload(cloud, cloud), []);
});

test('التنضيف: بيشيل الأقدم من 30 يوم ويحدد العدد', () => {
  const now = new Date('2026-10-20T12:00:00Z').getTime();
  const list = [N({ id: 'old', created_at: '2026-08-01T00:00:00Z' }), N({ id: 'new', created_at: '2026-10-19T00:00:00Z' })];
  assert.deepEqual(pruneNotifications(list, now).map(n => n.id), ['new']);
  assert.equal(pruneNotifications([N({ id: '1' }), N({ id: '2' })], now, 30, 1).length, 1);
});

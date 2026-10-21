import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMaintenanceStatus, normalizeMaintenanceRequest, findPreviousFault, kmSinceLastFault } from '../src/db/logic/maintenanceFlow';

const req = (o: any) => ({ id: 'r', car_id: 'c1', request_number: 'MT-2610-001', request_date: '2026-10-01', status: 'new', parts: [], work_performed: '', fault_description: '', workshop_type: 'company', ...o });

test('الحالات القديمة بتتحوّل لأقرب مرحلة جديدة', () => {
  assert.equal(normalizeMaintenanceStatus('pending_parts'), 'parts_requested');
  assert.equal(normalizeMaintenanceStatus('in_progress'), 'in_workshop');
  assert.equal(normalizeMaintenanceStatus('pending_review'), 'pending_invoice');
  assert.equal(normalizeMaintenanceStatus('invoiced', { status: 'draft' }), 'invoice_review');
  assert.equal(normalizeMaintenanceStatus('invoiced', { status: 'approved' }), 'invoice_approved');
  assert.equal(normalizeMaintenanceStatus('closed'), 'closed');
  assert.equal(normalizeMaintenanceStatus('repaired'), 'repaired');
  assert.equal(normalizeMaintenanceStatus('???'), 'new');
});

test('آخر عطل سابق لنفس السيارة والمسافة منه', () => {
  const a = req({ id: 'a', request_number: 'MT-2609-001', request_date: '2026-09-01', odometer: 1000 });
  const b = req({ id: 'b', request_number: 'MT-2609-002', request_date: '2026-09-20', odometer: 1800 });
  const other = req({ id: 'o', car_id: 'c2', request_number: 'MT-2609-003', request_date: '2026-09-25', odometer: 50 });
  const cur = req({ id: 'cur', request_number: 'MT-2610-001', request_date: '2026-10-01' });
  const all = [a, b, other, cur] as any[];
  assert.equal(findPreviousFault(all, cur as any)?.id, 'b');
  assert.equal(kmSinceLastFault(all, cur as any, 2500), 700);
  assert.equal(kmSinceLastFault(all, cur as any, 1500), 0); // مفيش مسافة سالبة
  assert.equal(kmSinceLastFault([cur] as any[], cur as any, 2500), undefined);
});

// طلب جاي من Supabase: الأعمدة الجديدة null — لازم يتحول لقيم آمنة عشان شاشة التفاصيل ماتقعش
test('normalizeMaintenanceRequest يحوّل null القادمة من السحابة لقيم آمنة', () => {
  const r: any = normalizeMaintenanceRequest({ id: 'a', status: 'new', parts: null, stage_history: null, odometer: null, km_since_last: null, workshop_name: null, invoice_id: null, request_date: '2026-10-01T00:00:00Z', request_number: 'M-1', fault_description: 'x' } as any, []);
  assert.deepEqual(r.parts, []);
  assert.deepEqual(r.stage_history, []);
  assert.equal(r.odometer, undefined);
  assert.equal(r.km_since_last, undefined);
  assert.equal(r.request_date, '2026-10-01');
});

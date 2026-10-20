import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMaintenanceStatus, findPreviousFault, kmSinceLastFault } from '../src/db/logic/maintenanceFlow';

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

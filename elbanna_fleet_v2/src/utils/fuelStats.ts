/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDb } from '../db/store';
import type { FuelLog, ServicePlan } from '../types';

type Db = ReturnType<typeof useDb>;

export type FuelRow = FuelLog & {
  carNumber: string;
  kmSince: number | null;
  kmSource: 'odometer' | 'estimate' | null;
  lPer100: number | null;
  flagged: boolean;
};

// حساب الاستهلاك: لترات كل تموين ÷ الكيلومترات من التموين اللي قبله (بالعدّاد لو الاتنين مسجلين، وإلا من المسافات المسجلة في المصاريف اليومية)
export function computeFuelRows(db: Db): { rows: FuelRow[]; avgByCar: Map<string, number> } {
  const byCar = new Map<string, FuelLog[]>();
  db.fuelLogs.forEach(l => {
    if (!byCar.has(l.car_id)) byCar.set(l.car_id, []);
    byCar.get(l.car_id)!.push(l);
  });

  const rows: FuelRow[] = [];
  const avgByCar = new Map<string, number>();

  byCar.forEach((logs, carId) => {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || (a.odometer_km ?? 0) - (b.odometer_km ?? 0) || a.id.localeCompare(b.id));
    const carNumber = db.cars.find(c => c.id === carId)?.car_number || '—';
    const carRows: FuelRow[] = sorted.map((cur, i) => {
      let kmSince: number | null = null;
      let kmSource: 'odometer' | 'estimate' | null = null;
      if (i > 0) {
        const prev = sorted[i - 1];
        if (typeof cur.odometer_km === 'number' && typeof prev.odometer_km === 'number' && cur.odometer_km > prev.odometer_km) {
          kmSince = cur.odometer_km - prev.odometer_km;
          kmSource = 'odometer';
        } else {
          const est = db.carDailyCosts
            .filter(c => c.car_id === carId && c.date > prev.date && c.date <= cur.date)
            .reduce((s, c) => s + (c.total_distance_km || 0), 0);
          if (est > 0) { kmSince = est; kmSource = 'estimate'; }
        }
      }
      const lPer100 = kmSince && kmSince > 0 ? (cur.liters / kmSince) * 100 : null;
      return { ...cur, carNumber, kmSince, kmSource, lPer100, flagged: false };
    });
    const measured = carRows.filter(r => r.kmSince && r.kmSince > 0);
    const totalKm = measured.reduce((s, r) => s + (r.kmSince || 0), 0);
    const totalLiters = measured.reduce((s, r) => s + r.liters, 0);
    const avg = totalKm > 0 ? (totalLiters / totalKm) * 100 : 0;
    if (avg > 0) avgByCar.set(carId, avg);
    carRows.forEach(r => {
      r.flagged = measured.length >= 3 && r.lPer100 !== null && avg > 0 && r.lPer100 > avg * 1.3;
    });
    rows.push(...carRows);
  });

  return { rows, avgByCar };
}

export type ServiceRow = ServicePlan & {
  carNumber: string;
  usedKm: number | null;
  usedSource: 'odometer' | 'estimate' | null;
  remaining: number | null;
  status: 'overdue' | 'soon' | 'ok' | 'unknown';
};

// حالة كل خطة صيانة وقائية: المسافة المقطوعة من آخر تنفيذ (بالعدّاد، أو تقديريًا من المصاريف اليومية) والمتبقي
export function computeServiceRows(db: Db): ServiceRow[] {
  return db.servicePlans.map(plan => {
    const carNumber = db.cars.find(c => c.id === plan.car_id)?.car_number || '—';
    const odo = db.getCarOdometer(plan.car_id);
    let usedKm: number | null = null;
    let usedSource: 'odometer' | 'estimate' | null = null;
    if (typeof plan.last_done_km === 'number' && odo !== null && odo >= plan.last_done_km) {
      usedKm = odo - plan.last_done_km;
      usedSource = 'odometer';
    } else if (plan.last_done_date) {
      usedKm = db.carDailyCosts
        .filter(c => c.car_id === plan.car_id && c.date > plan.last_done_date!)
        .reduce((s, c) => s + (c.total_distance_km || 0), 0);
      usedSource = 'estimate';
    }
    const remaining = usedKm === null ? null : plan.interval_km - usedKm;
    const status: ServiceRow['status'] = remaining === null ? 'unknown'
      : remaining < 0 ? 'overdue'
      : remaining <= Math.max(500, plan.interval_km * 0.1) ? 'soon'
      : 'ok';
    return { ...plan, carNumber, usedKm, usedSource, remaining, status };
  });
}

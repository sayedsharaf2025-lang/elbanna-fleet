/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// منطق جداول الإدخال (المصاريف اليومية والتكاليف الشهرية): دمج المسودة مع السجل المحفوظ وبناء
// البيانات اللي بتتحفظ — دوال نقية (من غير React) عشان تتختبر لوحدها.

import type { CarDailyCost, CarMonthlyCost, TransportRequestExtraCost, CostItemType } from '../types';
import { normalizePlate, toNumber } from './gridParse';

export type DraftMap = Record<string, string>; // مفتاح العمود → النص المكتوب (الخانات المتعدلة بس)

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const dailyKey = (date: string, carId: string) => `${date}|${carId}`;
export const monthlyKey = (month: string, carId: string) => `${month}|${carId}`;
export const EXTRA_PREFIX = 'extra:';

// قيمة خانة يومية للعرض: المسودة لو متعدلة، وإلا القيمة المحفوظة
export function dailyCellValue(existing: CarDailyCost | undefined, draft: DraftMap | undefined, colKey: string): string {
  if (draft && colKey in draft) return draft[colKey];
  if (!existing) return '';
  switch (colKey) {
    case 'distance': return String(existing.total_distance_km);
    case 'cards': return String(existing.cards_amount);
    case 'violations': return String(existing.violations_amount);
    case 'tireWash': return String(existing.tire_wash_amount);
    default:
      if (colKey.startsWith(EXTRA_PREFIX)) {
        const item = (existing.extra_costs || []).find(i => i.item_id === colKey.slice(EXTRA_PREFIX.length));
        return item ? String(item.amount) : '';
      }
      return '';
  }
}

// النولون المقترح = المسافة × سعر الكيلو لنوع السيارة (null لو مفيش مسافة أو مفيش سعر)
export function suggestedFreight(distanceText: string, carType: string | undefined, rates: Record<string, number>): number | null {
  const dist = toNumber(distanceText);
  const rate = carType ? (rates[carType] || 0) : 0;
  if (!dist || !rate) return null;
  return round2(dist * rate);
}

// بيانات سجل المصاريف اليومية اللي بتتحفظ بعد دمج المسودة فوق المحفوظ
export function buildDailyCostData(
  existing: CarDailyCost | undefined,
  draft: DraftMap,
  carType: string | undefined,
  rates: Record<string, number>,
  costItemTypes: CostItemType[]
): Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'> {
  const val = (k: string) => dailyCellValue(existing, draft, k);
  const extraFromTypes: TransportRequestExtraCost[] = costItemTypes
    .map(item => ({ item_id: item.id, item_name: item.name, amount: toNumber(val(EXTRA_PREFIX + item.id)) }))
    .filter(i => i.amount > 0);
  // بنود قديمة لنوع اتمسح من الإعدادات: بنسيبها زي ما هي بدل ما تتمسح بصمت وتتغيّر أرقام الربحية
  const typeIds = new Set(costItemTypes.map(t => t.id));
  const orphans = (existing?.extra_costs || []).filter(i => !typeIds.has(i.item_id));
  return {
    total_distance_km: toNumber(val('distance')),
    freight_amount: suggestedFreight(val('distance'), carType, rates) ?? 0,
    cards_amount: toNumber(val('cards')),
    violations_amount: toNumber(val('violations')),
    tire_wash_amount: toNumber(val('tireWash')),
    // بتتحسب تلقائيًا جوه المتجر من فواتير الصيانة
    maintenance_amount: 0,
    extra_costs: [...extraFromTypes, ...orphans],
  };
}

export function monthlyCellValue(existing: CarMonthlyCost | undefined, fallbackDriverId: string | undefined, draft: DraftMap | undefined, colKey: string): string {
  if (draft && colKey in draft) return draft[colKey];
  switch (colKey) {
    case 'driver': return existing?.driver_id ?? fallbackDriverId ?? '';
    case 'salary': return existing ? String(existing.salary_amount) : '';
    case 'diesel': return existing ? String(existing.diesel_amount) : '';
    case 'oil': return existing ? String(existing.oil_amount) : '';
    default: return '';
  }
}

export function buildMonthlyCostData(
  existing: CarMonthlyCost | undefined,
  fallbackDriverId: string | undefined,
  draft: DraftMap
): Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'> {
  const val = (k: string) => monthlyCellValue(existing, fallbackDriverId, draft, k);
  return {
    driver_id: val('driver') || undefined,
    salary_amount: toNumber(val('salary')),
    diesel_amount: toNumber(val('diesel')),
    oil_amount: toNumber(val('oil')),
  };
}

// مطابقة لوحة سيارة من نص ملصوق على سيارات النظام (بتتجاهل المسافات والهمزات والأرقام العربية)
export function findCarByPlate<T extends { car_number: string }>(cars: T[], text: string): T | undefined {
  const target = normalizePlate(text);
  if (!target) return undefined;
  return cars.find(c => normalizePlate(c.car_number) === target);
}

// هل المصفوفة الملصوقة أول عمود فيها أرقام لوحات سيارات؟ (60% من الصفوف أو أكتر بتطابق سيارة)
export function looksLikePlateColumn<T extends { car_number: string }>(cars: T[], matrix: string[][]): boolean {
  if (matrix.length === 0 || matrix[0].length < 2) return false;
  const hits = matrix.filter(r => findCarByPlate(cars, r[0] ?? '')).length;
  return hits / matrix.length >= 0.6;
}

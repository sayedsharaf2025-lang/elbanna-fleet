/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// حساب كشوف حركات العهدة (الوارد والمنصرف والرصيد الجاري). المنطق منقول حرفيًا من شاشة العهد
// (InvoicesTab) عشان الشاشة والطباعة والاختبارات تستخدم نفس الحساب بالظبط.
// ملاحظة: مصفوفة الحركات عندنا مخزّنة من الأحدث للأقدم، فبنعكسها الأول عشان الرصيد الجاري يتحسب زمنيًا.

import type { CustodyMovement } from '../types';

export interface OfficialLedgerRow extends CustodyMovement {
  inflow: number;
  outflow: number;
  runningBalanceAfter: number; // الرصيد الجاري لعهدة المسؤول كلها (مجموع كل حساباته) بعد الحركة دي
}

export interface AccountLedgerRow extends CustodyMovement {
  inflow: number;
  outflow: number;
  running: number; // الرصيد الجاري للحساب الفرعي بعد الحركة دي
}

// كشف كل الحركات: رصيد جاري لكل مسؤول على حدة. النتيجة من الأحدث للأقدم
export function buildOfficialLedger(movements: CustodyMovement[]): OfficialLedgerRow[] {
  const chronological = [...movements].reverse();
  const officialRunningBalances: Record<string, number> = {};

  const processedMovements = chronological.map(m => {
    let inflow = 0;
    let outflow = 0;

    if (m.to_account_id) {
      inflow = m.amount;
    } else if (m.type === 'deposit') {
      inflow = m.amount;
    }

    if (m.from_account_id) {
      outflow = m.amount;
    } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
      outflow = m.amount;
    }

    if (!m.from_account_id && !m.to_account_id) {
      if (m.type === 'deposit') {
        inflow = m.amount;
      } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
        outflow = m.amount;
      }
    }

    const offId = m.official_id;
    const curBalance = officialRunningBalances[offId] || 0;
    const nextBalance = curBalance + (inflow - outflow);
    officialRunningBalances[offId] = nextBalance;

    return { ...m, inflow, outflow, runningBalanceAfter: nextBalance };
  });

  return [...processedMovements].reverse();
}

// كشف حساب فرعي واحد (كاش/فيزا). النتيجة من الأحدث للأقدم
export function buildAccountLedger(allMovements: CustodyMovement[], accId: string): AccountLedgerRow[] {
  const subMovs = allMovements.filter(m => m.from_account_id === accId || m.to_account_id === accId);
  const chronological = [...subMovs].reverse();
  let running = 0;
  const processed = chronological.map(m => {
    let inflow = 0;
    let outflow = 0;

    if (m.to_account_id === accId) {
      inflow = m.amount;
    } else if (m.type === 'deposit' && !m.from_account_id) {
      inflow = m.amount;
    }

    if (m.from_account_id === accId) {
      outflow = m.amount;
    } else if ((m.type === 'withdrawal' || m.type === 'invoice_charge') && !m.to_account_id) {
      outflow = m.amount;
    }

    if (!m.from_account_id && !m.to_account_id) {
      if (m.type === 'deposit') {
        inflow = m.amount;
      } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
        outflow = m.amount;
      } else if (m.type === 'settlement') {
        if (m.description.includes('-') || m.description.includes('عجز') || m.description.includes('تنزيل')) {
          outflow = m.amount;
        } else {
          inflow = m.amount;
        }
      }
    }

    running += (inflow - outflow);
    return { ...m, inflow, outflow, running };
  });
  return [...processed].reverse();
}

export const MOVEMENT_TYPE_LABEL: Record<CustodyMovement['type'], string> = {
  deposit: 'إيداع وتغذية',
  withdrawal: 'سحب ومصروف',
  transfer: 'تحويل نقود',
  settlement: 'تسوية',
  invoice_charge: 'خصم مصروفات',
};

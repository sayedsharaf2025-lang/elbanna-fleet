/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useDb } from '../db/store';

const LAST_BACKUP_KEY = 'elbanna_last_backup_at';

// تنزيل نسخة احتياطية كاملة من بيانات النظام (للأدمن بس). كلمات المرور مش بتتضمن في الملف.
export function BackupButton() {
  const db = useDb();
  const [lastAt, setLastAt] = useState<string | null>(() => localStorage.getItem(LAST_BACKUP_KEY));

  if (db.currentUser?.role !== 'admin') return null;

  const daysSince = lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000) : null;
  const stale = daysSince === null || daysSince >= 7;

  const handleBackup = () => {
    const payload = {
      app: 'elbanna-fleet',
      version: 1,
      exported_at: new Date().toISOString(),
      data: {
        drivers: db.drivers,
        officials: db.officials.map(({ password, ...rest }: any) => rest),
        cars: db.cars,
        violations: db.violations,
        invoices: db.invoices,
        invoiceItems: db.invoiceItems,
        auditLogs: db.auditLogs,
        driverMovements: db.movements,
        custodyAccounts: db.custodyAccounts,
        custodyMovements: db.custodyMovements,
        transportRequests: db.transportRequests,
        transportRequestCosts: db.transportRequestCosts,
        maintenanceRequests: db.maintenanceRequests,
        maintenanceInvoices: db.maintenanceInvoices,
        carDailyCosts: db.carDailyCosts,
        carMonthlyCosts: db.carMonthlyCosts,
        farms: db.farms,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elbanna-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    localStorage.setItem(LAST_BACKUP_KEY, now);
    setLastAt(now);
  };

  return (
    <button
      type="button"
      onClick={handleBackup}
      title={lastAt ? `آخر نسخة احتياطية: ${lastAt.split('T')[0]} — الملف فيه بيانات حساسة، احتفظ به في مكان آمن` : 'لم تؤخذ نسخة احتياطية بعد'}
      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${stale ? 'bg-amber-950 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'}`}
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">{stale ? 'نسخة احتياطية (مطلوبة)' : 'نسخة احتياطية'}</span>
    </button>
  );
}

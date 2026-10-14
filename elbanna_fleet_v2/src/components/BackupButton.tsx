/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useDb } from '../db/store';

const LAST_BACKUP_KEY = 'elbanna_last_backup_at';

// تنزيل نسخة احتياطية كاملة من بيانات النظام (للأدمن بس). كلمات المرور مش بتتضمن في الملف.
export function BackupButton() {
  const db = useDb();
  const [lastAt, setLastAt] = useState<string | null>(() => localStorage.getItem(LAST_BACKUP_KEY));
  const fileRef = useRef<HTMLInputElement>(null);
  const dbRef = useRef(db);
  dbRef.current = db;

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
        fuelLogs: db.fuelLogs,
        servicePlans: db.servicePlans,
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

  // استرجاع من ملف نسخة احتياطية: معاينة بالأعداد + تأكيد + تنزيل نسخة من البيانات الحالية قبل الاستبدال
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let payload: any;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      window.alert('تعذّرت قراءة الملف — اتأكد إنه ملف نسخة احتياطية (JSON) سليم.');
      return;
    }
    const d = payload?.data;
    if (payload?.app !== 'elbanna-fleet' || !d) {
      window.alert('الملف ده مش نسخة احتياطية صالحة لنظام الأسطول.');
      return;
    }
    const n = (v: any) => (Array.isArray(v) ? v.length : 0);
    const summary = `النسخة بتاريخ ${String(payload.exported_at || '').split('T')[0] || 'غير معروف'} وفيها:\n` +
      `• ${n(d.drivers)} سائق\n• ${n(d.cars)} سيارة\n• ${n(d.invoices)} فاتورة تراخيص\n• ${n(d.transportRequests)} طلب نقل\n• ${n(d.custodyAccounts)} حساب عهدة\n\n` +
      'تحذير: الاسترجاع بيستبدل البيانات الحالية بالكامل (المستخدمين وكلمات المرور والصيانة مش داخلين). ' +
      'هننزّل نسخة من بياناتك الحالية الأول كاحتياطي. تكمل؟';
    if (!window.confirm(summary)) return;
    handleBackup();
    const res = dbRef.current.restoreFromBackup(payload);
    window.alert(res.message + (res.success ? '\n\nهيتم رفع البيانات للسحابة تلقائيًا خلال ثواني. سيب الصفحة مفتوحة.' : ''));
    if (res.success) {
      setTimeout(() => { dbRef.current.uploadLocalDataToCloud(); }, 3500);
    }
  };

  return (
    <>
    <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      title="استرجاع من ملف نسخة احتياطية"
      className="text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
    >
      <Upload className="w-4 h-4" />
      <span className="hidden sm:inline">استرجاع</span>
    </button>
    <button
      type="button"
      onClick={handleBackup}
      title={lastAt ? `آخر نسخة احتياطية: ${lastAt.split('T')[0]} — الملف فيه بيانات حساسة، احتفظ به في مكان آمن` : 'لم تؤخذ نسخة احتياطية بعد'}
      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${stale ? 'bg-amber-950 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'}`}
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">{stale ? 'نسخة احتياطية (مطلوبة)' : 'نسخة احتياطية'}</span>
    </button>
    </>
  );
}

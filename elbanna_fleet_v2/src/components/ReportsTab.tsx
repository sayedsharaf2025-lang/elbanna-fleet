/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { A5PrintPreview } from './A5PrintPreview';
import {
  FileText,
  Filter,
  Download,
  AlertTriangle,
  Coins,
  ShieldCheck,
  Search,
  Printer,
  CalendarCheck,
  TrendingDown,
  User,
  Car,
  ChevronLeft,
  DollarSign
} from 'lucide-react';

export const ReportsTab: React.FC = () => {
  const db = useDb();

  // Active sub-report: 'violations' | 'drivers' | 'custody' | 'cars' | 'deductions_report' | 'car_violations' | 'invoices_query'
  const [activeSubReport, setActiveSubReport] = useState<'violations' | 'drivers' | 'custody' | 'cars' | 'deductions_report' | 'invoices_query' | 'car_violations'>('violations');

  // Search and Filter States
  const [selectedReportCarId, setSelectedReportCarId] = useState('');
  const [carSearchQuery, setCarSearchQuery] = useState('');
  const [searchCarNumber, setSearchCarNumber] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedOfficialId, setSelectedOfficialId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tempSearchQuery, setTempSearchQuery] = useState('');
  const [deductionsYear, setDeductionsYear] = useState('2026');
  const [deductionsMonth, setDeductionsMonth] = useState('all');
  
  // Invoices Query States
  const [invCarSearch, setInvCarSearch] = useState('');
  const [invQuerySearch, setInvQuerySearch] = useState('');
  const [invDateFrom, setInvDateFrom] = useState('');
  const [invDateTo, setInvDateTo] = useState('');
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);

  // Pre-set supervisor ID for selectedOfficialId and lock it on mount
  React.useEffect(() => {
    if (db.currentUser?.role === 'supervisor' && db.currentUser?.officialId) {
      setSelectedOfficialId(db.currentUser.officialId);
    }
  }, [db.currentUser]);

  // Reset Filters helper
  const handleResetFilters = () => {
    setSelectedReportCarId('');
    setCarSearchQuery('');
    setSearchCarNumber('');
    setSelectedDriverId('');
    setSelectedOfficialId(db.currentUser?.role === 'supervisor' ? (db.currentUser.officialId || '') : '');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setTempSearchQuery('');
    setDeductionsYear('2026');
    setDeductionsMonth('all');
    setInvCarSearch('');
    setInvQuerySearch('');
    setInvDateFrom('');
    setInvDateTo('');
    setPrintInvoiceId(null);
  };

  // Helper to resolve the latest car number dynamically based on digits
  const getLatestCarNumber = (carNumber: string): string => {
    if (!carNumber) return carNumber;
    const vDigits = (carNumber.match(/\d+/) || [])[0];
    if (vDigits) {
      const matchedCar = db.cars.find(c => {
        const cDigits = (c.car_number.match(/\d+/) || [])[0];
        return cDigits === vDigits;
      });
      if (matchedCar) return matchedCar.car_number;
    }
    return carNumber;
  };

  // Helper to compute FIFO chronological violation settlements for each driver
  const computeAllViolationsSettlements = (): Record<string, {
    settledAmount: number;
    isFullySettled: boolean;
    remainingAmount: number;
    statusText: string;
  }> => {
    const result: Record<string, {
      settledAmount: number;
      isFullySettled: boolean;
      remainingAmount: number;
      statusText: string;
    }> = {};

    db.drivers.forEach(drv => {
      // 1. All violations for this driver (across any car), sorted chronologically
      const drvViolations = db.violations
        .filter(v => v.driver_id === drv.id)
        .sort((a, b) => a.violation_date.localeCompare(b.violation_date) || a.id.localeCompare(b.id));

      // 2. All actual deductions/credits/payments on driver's ledger (movements from getEnrichedMovements where amount_change is negative)
      const movementsOfDrv = getEnrichedMovements(drv.id);
      const drvCredits = movementsOfDrv
        .filter(m => m.type === 'deduction' || m.amount_change < 0)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

      let totalCredit = drvCredits.reduce((sum, c) => sum + Math.abs(c.amount_change), 0);

      drvViolations.forEach(v => {
        if (totalCredit <= 0) {
          result[v.id] = {
            settledAmount: 0,
            isFullySettled: false,
            remainingAmount: v.amount,
            statusText: 'لم تسدد'
          };
        } else if (totalCredit >= v.amount) {
          result[v.id] = {
            settledAmount: v.amount,
            isFullySettled: true,
            remainingAmount: 0,
            statusText: 'خصمت بالكامل'
          };
          totalCredit -= v.amount;
        } else {
          result[v.id] = {
            settledAmount: totalCredit,
            isFullySettled: false,
            remainingAmount: v.amount - totalCredit,
            statusText: `خصمت جزئياً (${totalCredit} ج.م)`
          };
          totalCredit = 0;
        }
      });
    });

    // Fallback for violations whose driver was deleted or not found
    db.violations.forEach(v => {
      if (!result[v.id]) {
        result[v.id] = {
          settledAmount: 0,
          isFullySettled: false,
          remainingAmount: v.amount,
          statusText: 'لم تسدد'
        };
      }
    });

    return result;
  };

  // Robust matcher for plates that handles strings with mixed digits and arabic letters
  const matchPlateNumberAndLetters = (plate: string, query: string): boolean => {
    if (!query) return true;
    const qClean = query.trim().toLowerCase();
    const pClean = plate.trim().toLowerCase();
    
    // Direct match (either contains the other)
    if (pClean.includes(qClean) || qClean.includes(pClean)) return true;
    
    // Parse digits and letters
    const qDigits = qClean.match(/\d+/)?.[0];
    const qLetters = qClean.replace(/\d+/g, '').replace(/\s+/g, '').trim();
    
    const pDigits = pClean.match(/\d+/)?.[0];
    const pLetters = pClean.replace(/\d+/g, '').replace(/\s+/g, '').trim();
    
    let digitsMatch = true;
    if (qDigits) {
      digitsMatch = pDigits ? pDigits.includes(qDigits) : false;
    }
    
    let lettersMatch = true;
    if (qLetters) {
      lettersMatch = pLetters ? pLetters.includes(qLetters) : false;
    }
    
    return digitsMatch && lettersMatch;
  };

  // 1. Violations Filtering & Summarization
  const filteredViolations = db.violations.filter(v => {
    const drv = db.drivers.find(d => d.id === v.driver_id);
    const drvCode = drv ? drv.driver_code : '';
    const drvName = drv ? drv.name : '';

    const matchesCar = !searchCarNumber || matchPlateNumberAndLetters(v.car_number, searchCarNumber);
    const matchesDriver = !selectedDriverId || v.driver_id === selectedDriverId;
    const matchesDate = (!startDate || v.violation_date >= startDate) && (!endDate || v.violation_date <= endDate);
    const matchesQuery = !searchQuery || 
      v.description.includes(searchQuery) || 
      drvCode.includes(searchQuery) ||
      drvName.includes(searchQuery);

    return matchesCar && matchesDriver && matchesDate && matchesQuery;
  });

  const totalViolationsAmount = filteredViolations.reduce((sum, v) => sum + v.amount, 0);

  // 2. Driver Accounts Filtering & Summarization
  const filteredDrivers = db.drivers.filter(d => {
    const matchesDriver = !selectedDriverId || d.id === selectedDriverId;
    const matchesQuery = !searchQuery || 
      d.name.includes(searchQuery) || 
      d.driver_code.includes(searchQuery) || 
      d.national_id.includes(searchQuery);

    return matchesDriver && matchesQuery;
  });

  const totalDriversDues = filteredDrivers.reduce((sum, d) => sum + d.balance, 0);

  // Helper to enrich movements for drivers who have violations but no explicit ledger rows (e.g. 17060)
  const getEnrichedMovements = (drvId?: string): typeof db.movements => {
    if (!drvId) {
      // Concatenate for all drivers
      let allEnriched: any[] = [];
      const cache = new Set<string>();
      db.drivers.forEach(d => {
        const enriched = getEnrichedMovements(d.id);
        enriched.forEach(m => {
          if (!cache.has(m.id)) {
            cache.add(m.id);
            allEnriched.push(m);
          }
        });
      });
      return allEnriched;
    }

    const explicitMovements = db.movements.filter(m => m.driver_id === drvId);
    const drvViolations = db.violations.filter(v => v.driver_id === drvId);
    const hasViolationMovements = explicitMovements.some(m => m.type === 'violation');

    if (!hasViolationMovements && drvViolations.length > 0) {
      const sortedViolations = [...drvViolations].sort((a, b) => a.violation_date.localeCompare(b.violation_date));
      let runningBalance = 0;
      
      const synthesizedViolations = sortedViolations.map(v => {
        runningBalance += v.amount;
        return {
          id: `synth-viol-${v.id}`,
          driver_id: drvId,
          date: v.violation_date,
          description: `تسجيل مخالفة: ${v.description} (سيارة رقم: ${v.car_number || 'N/A'})`,
          amount_change: v.amount,
          new_balance: runningBalance,
          type: 'violation' as const
        };
      });

      const driverObj = db.drivers.find(d => d.id === drvId);
      const currentBalance = driverObj ? driverObj.balance : 0;
      
      const explicitDelta = explicitMovements.reduce((sum, m) => sum + m.amount_change, 0);
      const expectedBalance = runningBalance + explicitDelta;
      const paymentNeeded = currentBalance - expectedBalance;

      let result = [...synthesizedViolations, ...explicitMovements];

      if (paymentNeeded !== 0) {
        const latestDate = sortedViolations[sortedViolations.length - 1]?.violation_date || new Date().toISOString().split('T')[0];
        result.push({
          id: `synth-settlement-${drvId}`,
          driver_id: drvId,
          date: latestDate,
          description: paymentNeeded < 0 
            ? `خصومات وتفادي تسويات مقتطعة مسددة (إجمالي المبالغ والخصومات المسددة)`
            : `تسوية وتعديل رصيد مدفوعات/مستحقات`,
          amount_change: paymentNeeded,
          new_balance: currentBalance,
          type: paymentNeeded < 0 ? ('payment' as const) : ('deduction' as const)
        });
      }

      return result;
    }

    return explicitMovements;
  };

  // Gather account movements (deductions) matching filter parameters
  const enrichedMovements = getEnrichedMovements(selectedDriverId);

  const filteredMovements = enrichedMovements.filter(m => {
    const drv = db.drivers.find(d => d.id === m.driver_id);
    const drvCode = drv ? drv.driver_code : '';
    const drvName = drv ? drv.name : '';

    const matchesDriver = !selectedDriverId || m.driver_id === selectedDriverId;
    const matchesDate = (!startDate || m.date >= startDate) && (!endDate || m.date <= endDate);
    const matchesQuery = !searchQuery || 
      m.description.includes(searchQuery) || 
      drvCode.includes(searchQuery) || 
      drvName.includes(searchQuery);

    return matchesDriver && matchesDate && matchesQuery;
  });

  const totalDeductionsAmount = filteredMovements
    .filter(m => m.type === 'deduction' || m.type === 'violation')
    .reduce((sum, m) => sum + Math.abs(m.amount_change), 0);

  // 3. Custody & Officials Accounts
  const groupCustodyMovements = db.custodyMovements.filter(m => {
    const matchesOfficial = !selectedOfficialId || m.official_id === selectedOfficialId;
    const matchesDate = (!startDate || m.date >= startDate) && (!endDate || m.date <= endDate);
    const matchesQuery = !searchQuery || m.description.includes(searchQuery);

    return matchesOfficial && matchesDate && matchesQuery;
  });

  // 5. Driver Deductions Report by Month & Year (or by date range if startDate/endDate are set)
  const filteredDeductionsReport = enrichedMovements.filter(m => {
    if (m.type !== 'deduction' && m.type !== 'violation') return false;

    const drv = db.drivers.find(d => d.id === m.driver_id);
    const drvCode = drv ? drv.driver_code : '';
    const drvName = drv ? drv.name : '';

    const matchesDriver = !selectedDriverId || m.driver_id === selectedDriverId;
    
    // Parse Date YYYY-MM-DD
    const mDate = m.date || '';
    const parts = mDate.split('-'); // e.g. ["2026", "06", "07"]

    // If a date range is specified (startDate/endDate), use it — otherwise fall back to year/month filter
    let matchesDate: boolean;
    if (startDate || endDate) {
      matchesDate = (!startDate || mDate >= startDate) && (!endDate || mDate <= endDate);
    } else {
      const matchesYear = !deductionsYear || parts[0] === deductionsYear;
      const matchesMonth = deductionsMonth === 'all' || !deductionsMonth || parts[1] === deductionsMonth;
      matchesDate = matchesYear && matchesMonth;
    }
    
    const matchesQuery = !searchQuery || 
      m.description.includes(searchQuery) ||
      drvCode.includes(searchQuery) ||
      drvName.includes(searchQuery);

    return matchesDriver && matchesDate && matchesQuery;
  });

  const totalDeductionsReportAmount = filteredDeductionsReport.reduce((sum, m) => sum + Math.abs(m.amount_change), 0);

  // Group deductions by driver — show amount deducted IN the filtered period + current remaining balance
  const groupedDeductions = (() => {
    const map = new Map<string, { driverId: string; driverName: string; totalDeducted: number; remainingBalance: number }>();

    filteredDeductionsReport.forEach(m => {
      const drv = db.drivers.find(d => d.id === m.driver_id);
      if (!drv) return;

      const existing = map.get(m.driver_id);
      if (existing) {
        existing.totalDeducted += Math.abs(m.amount_change);
      } else {
        map.set(m.driver_id, {
          driverId: m.driver_id,
          driverName: drv.name,
          totalDeducted: Math.abs(m.amount_change),
          // drv.balance = current total remaining balance owed by this driver (after ALL deductions)
          remainingBalance: drv.balance,
        });
      }
    });

    return Array.from(map.values());
  })();

  // Helper to extract numeric part of a car plate number
  const getCarSortVal = (carNumberStr: string): number => {
    const digits = carNumberStr.match(/\d+/);
    return digits ? parseInt(digits[0], 10) : Infinity;
  };

  // 4. Cars Fleet Filtering & Summarization
  const filteredCars = db.cars.filter(c => {
    const drv = db.drivers.find(d => d.id === c.driver_id);
    const drvName = drv ? drv.name : '';
    const off = db.officials.find(o => o.id === c.license_official_id);
    const offName = off ? off.name : '';

    const matchesCar = !searchCarNumber || matchPlateNumberAndLetters(c.car_number, searchCarNumber);
    const matchesOfficial = !selectedOfficialId || c.license_official_id === selectedOfficialId;
    const matchesQuery = !searchQuery || 
      c.chassis_number.includes(searchQuery) || 
      c.motor_number.includes(searchQuery) || 
      c.owner_company.includes(searchQuery) ||
      drvName.includes(searchQuery) ||
      offName.includes(searchQuery);

    return matchesCar && matchesOfficial && matchesQuery;
  }).sort((a, b) => {
    const numA = getCarSortVal(a.car_number);
    const numB = getCarSortVal(b.car_number);
    if (numA !== numB) {
      return numA - numB;
    }
    return a.car_number.localeCompare(b.car_number, 'ar-EG');
  });

  const totalCarsActive = filteredCars.length;
  const expiredLicensesCount = filteredCars.filter(c => new Date(c.license_end_date) < new Date()).length;

  // Print function handler
  const handlePrintReport = () => {
    window.print();
  };

  // Premium HTML-based Excel Export utility with high-contrast, scalable print setup
  const handleExportCSV = () => {
    const exportToExcelHtml = (filename: string, title: string, tables: { title?: string, headers: string[], rows: (string | number)[][] }[]) => {
      let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Sheet1</x:Name>
                  <x:WorksheetOptions>
                    <x:Print>
                      <x:ValidPrinterInfo/>
                      <x:Scale>85</x:Scale>
                      <x:HorizontalResolution>600</x:HorizontalResolution>
                      <x:VerticalResolution>600</x:VerticalResolution>
                      <x:FitWidth>1</x:FitWidth>
                      <x:FitHeight>99</x:FitHeight>
                    </x:Print>
                    <x:PageLayoutZoom>0</x:PageLayoutZoom>
                    <x:Selected/>
                    <x:ProtectContents>False</x:ProtectContents>
                    <x:ProtectObjects>False</x:ProtectObjects>
                    <x:ProtectScenarios>False</x:ProtectScenarios>
                  </x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background-color: #ffffff; }
            .title { font-size: 16px; font-weight: bold; color: #0284c7; text-align: center; margin-bottom: 12px; }
            table { border-collapse: collapse; direction: rtl; margin-bottom: 24px; width: 100%; border: 1.5px solid #475569; }
            th { background-color: #0284c7; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #475569; text-align: right; font-size: 12px; }
            td { padding: 9px; border: 1px solid #94a3b8; text-align: right; color: #1e293b; font-size: 11px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .section-title { font-size: 13px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; color: #0369a1; text-align: right; border-bottom: 2px solid #0369a1; padding-bottom: 4px; }
          </style>
        </head>
        <body dir="rtl">
          <div class="title">${title}</div>
          ${tables.map(table => `
            ${table.title ? `<div class="section-title">${table.title}</div>` : ''}
            <table>
              <thead>
                <tr>${table.headers.map(h => `<th>${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${table.rows.map(row => `
                  <tr>${row.map(cell => `<td>${cell !== undefined && cell !== null ? cell : ''}</td>`).join('')}</tr>
                `).join('')}
              </tbody>
            </table>
          `).join('')}
        </body>
        </html>
      `;

      // Prepend UTF-8 BOM so Excel opens Arabic letters without corrupted encoding
      const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename}.xls`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (activeSubReport === 'violations') {
      const tables = [{
        headers: ['م', 'تاريخ المخالفة', 'رقم السيارة', 'كود السائق', 'اسم السائق', 'بيان المخالفة', 'المبلغ (ج.م)'],
        rows: filteredViolations.map((v, i) => {
          const drv = db.drivers.find(d => d.id === v.driver_id);
          return [i + 1, v.violation_date, v.car_number, drv ? drv.driver_code : '', drv ? drv.name : '', v.description, v.amount];
        })
      }];
      exportToExcelHtml(`تقرير_مخالفات_البنا_جروب_${new Date().toISOString().split('T')[0]}`, 'تقرير المخالفات والسرعة الزائدة للشركة مصفى ومستخرج', tables);
    } else if (activeSubReport === 'drivers') {
      const tables = [{
        headers: ['م', 'كود السائق', 'اسم السائق', 'الرقم القومي', 'رقم الهاتف', 'الرصيد المالي المستحق (ج.م)'],
        rows: filteredDrivers.map((d, i) => [i + 1, d.driver_code, d.name, d.national_id, d.phone, d.balance])
      }];
      exportToExcelHtml(`تقرير_حسابات_السائقين_البنا_${new Date().toISOString().split('T')[0]}`, 'تقرير حسابات ومتبقي مديونيات السائقين المقيدة', tables);
    } else if (activeSubReport === 'custody') {
      const userAccounts = db.custodyAccounts.filter(acc => !selectedOfficialId || acc.official_id === selectedOfficialId);
      const tables = [{
        headers: ['م', 'المسؤول', 'الخزينة الفرعية', 'النوع', 'الرصيد المحقق (ج.م)'],
        rows: userAccounts.map((acc, i) => {
          const off = db.officials.find(o => o.id === acc.official_id);
          return [i + 1, off ? off.name : '', acc.name, acc.type === 'cash' ? 'نقدي' : 'فيزا بنكية', acc.balance];
        })
      }];
      exportToExcelHtml(`تقرير_العهد_والخزائن_المحاسبية_${new Date().toISOString().split('T')[0]}`, 'تقرير العهد والبطاقات المالية الجارية', tables);
    } else if (activeSubReport === 'deductions_report') {
      const tables = [{
        headers: ['م', 'اسم السائق', 'مبلغ الخصم (ج.م)', 'المتبقى له حتى آخر تاريخ الكشف (ج.م)'],
        rows: groupedDeductions.map((g, i) => [i + 1, g.driverName, g.totalDeducted, g.remainingBalance])
      }];
      exportToExcelHtml(`تقرير_استقطاعات_وخصومات_البنا_شهر_${deductionsMonth}_سنة_${deductionsYear}`, `تقرير الخصومات الشهري المجمع للموظفين والسائقين - شهر ${deductionsMonth} سنة ${deductionsYear}`, tables);
    } else if (activeSubReport === 'car_violations') {
      const targetCar = db.cars.find(c => c.id === selectedReportCarId);
      if (!targetCar) {
        alert("يرجى اختيار سيارة من القائمة أولاً لتصدير البيانات للشركة البنا!");
        return;
      }
      const carViolations = db.violations.filter(v => {
        if (v.car_number === targetCar.car_number) return true;
        const vDigits = (v.car_number.match(/\d+/) || [])[0];
        const cDigits = (targetCar.car_number.match(/\d+/) || [])[0];
        return !!(vDigits && cDigits && vDigits === cDigits);
      });
      const carDeductions = db.movements.filter(m => {
        if (m.type !== 'deduction') return false;
        if (m.car_id === targetCar.id) return true;
        if (m.description.includes(targetCar.car_number)) return true;
        const cDigits = (targetCar.car_number.match(/\d+/) || [])[0];
        return !!(cDigits && m.description.includes(cDigits));
      });
      
      const tables = [
        {
          title: 'ملخص الحساب الإجمالي للسيارة',
          headers: ['البيان وقيم المطابقة', 'سجل القيمة المحققة البيانية'],
          rows: [
            ['رقم لوحة السيارة', targetCar.car_number],
            ['الشركة المالكة للسيارة', targetCar.owner_company],
            ['إجمالي مبالغ المخالفات الأصلية (قبل الخصم)', `${carViolations.reduce((sum, v) => sum + v.amount, 0).toLocaleString()} ج.م`],
            ['إجمالي مبالغ الخصم والاستقطاعات (التي تم خصمها بالفعل)', `${carDeductions.reduce((sum, m) => sum + Math.abs(m.amount_change), 0).toLocaleString()} ج.m`],
            ['صافي المتبقي المعلق على السيارة (بعد الخصم)', `${Math.max(0, carViolations.reduce((sum, v) => sum + v.amount, 0) - carDeductions.reduce((sum, m) => sum + Math.abs(m.amount_change), 0)).toLocaleString()} ج.م`],
          ]
        },
        {
          title: '1. كشف تفاصيل المخالفات المسجلة (قبل الخصم)',
          headers: ['م', 'تاريخ المخالفة', 'السائق المكلف', 'بيان المخالفة وتفاصيلها', 'المبلغ قبل الخصم (ج.م)'],
          rows: carViolations.map((v, i) => {
            const drv = db.drivers.find(d => d.id === v.driver_id);
            return [i + 1, v.violation_date, drv ? drv.name : 'عام', v.description, v.amount];
          })
        },
        {
          title: '2. كشف تفاصيل الخصومات والاستقطاعات المسجلة من حساب السائقين',
          headers: ['م', 'تاريخ الخصم والتسوية', 'السائق المخصوم منه', 'بيان حركة الخصم والسحب', 'مبلغ الخصم (ج.م)'],
          rows: carDeductions.map((m, i) => {
            const drv = db.drivers.find(d => d.id === m.driver_id);
            return [i + 1, m.date, drv ? drv.name : 'عام', m.description, Math.abs(m.amount_change)];
          })
        }
      ];
      exportToExcelHtml(`تقرير_مخالفات_سيارة_${targetCar.car_number}_البنا_${new Date().toISOString().split('T')[0]}`, `تقرير تفاصيل مخالفات وخصومات السيارة رقم (${targetCar.car_number})`, tables);
    } else {
      const tables = [{
        headers: ['م', 'رقم السيارة', 'رقم الشاسيه', 'رقم الموتور', 'الشركة المالكة', 'تاريخ نهاية الترخيص', 'مسؤول العهدة', 'السائق المقر'],
        rows: filteredCars.map((c, i) => {
          const d = db.drivers.find(drv => drv.id === c.driver_id);
          const o = db.officials.find(off => off.id === c.license_official_id);
          return [i + 1, c.car_number, c.chassis_number, c.motor_number, c.owner_company, c.license_end_date, o ? o.name : '', d ? d.name : ''];
        })
      }];
      exportToExcelHtml(`كشف_أسطول_سيارات_البنا_${new Date().toISOString().split('T')[0]}`, 'كشف تراخيص وبيانات أسطول سيارات البنا جروب اللوجستية', tables);
    }
  };

  return (
    <div className="space-y-6" id="reports_tab_container" style={{ direction: 'rtl' }}>
      
      {/* 1. Header & Quick Switch Menu */}
      <div className="bg-slate-900 p-4 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 no-print shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-100">بوابة التقارير السحابية والمطبوعات الموحدة</h2>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">استخراج فوري لكشوف الحركة والمخالفات ومديونيات السائقين والعهد المركزية لعام 2026</p>
          </div>
        </div>

        {/* Export & Print actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintReport}
            type="button"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" />
            <span>طباعة التقرير (A4/A5)</span>
          </button>
          <button
            onClick={handleExportCSV}
            type="button"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>حفظ بنسق Excel CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Sub-Tab Switcher Row */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-px no-print">
        <button
          onClick={() => { setActiveSubReport('violations'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'violations' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          تقرير المخالفات والسرعة الزائدة
        </button>
        <button
          onClick={() => { setActiveSubReport('car_violations'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'car_violations' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Search className="w-4 h-4 text-amber-400 animate-pulse" />
          مخالفات وخصومات السيارات بالتفصيل
        </button>
        <button
          onClick={() => { setActiveSubReport('drivers'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'drivers' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Coins className="w-4 h-4 text-emerald-500" />
          تقرير حسابات وأرصدة السائقين
        </button>
        <button
          onClick={() => { setActiveSubReport('custody'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'custody' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <DollarSign className="w-4 h-4 text-indigo-500" />
          تقارير العهد والخزائن الفرعية
        </button>
        <button
          onClick={() => { setActiveSubReport('cars'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'cars' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Car className="w-4 h-4 text-sky-500" />
          كشف التراخيص وأسطول السيارات
        </button>
        <button
          onClick={() => { setActiveSubReport('deductions_report'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'deductions_report' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <TrendingDown className="w-4 h-4 text-rose-500" />
          تقرير الخصومات الشهري للطباعة
        </button>
        <button
          onClick={() => { setActiveSubReport('invoices_query'); handleResetFilters(); }}
          type="button"
          className={`px-5 py-3 border-b-2 font-bold text-xs md:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeSubReport === 'invoices_query' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <FileText className="w-4 h-4 text-emerald-400" />
          استعلام فواتير مصروف الترخيص
        </button>
      </div>

      {/* 3. Filter Grid Panel */}
      <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl shadow-sm space-y-4 no-print">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-slate-400 text-xs font-bold mb-2">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span>محرك الفلترة والاستعلام المتقدم بالتوازي</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-medium">
          {/* Query Smart search */}
          <div>
            <label className="block text-slate-405 font-bold mb-1 font-sans">كلمة بحث وتدقيق ذكي</label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="رقم، كود، اسم، أو بروتوكول..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-emerald-500 text-slate-200"
                  value={tempSearchQuery}
                  onChange={(e) => setTempSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearchQuery(tempSearchQuery);
                    }
                  }}
                />
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-3" />
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery(tempSearchQuery)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-555 text-white font-extrabold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                بحث
              </button>
            </div>
          </div>

          {/* Conditional filter: Car Select */}
          {(activeSubReport === 'violations' || activeSubReport === 'cars') && (
            <div>
              <label className="block text-slate-405 font-bold mb-1">رقم لوحة المركبة (محدد)</label>
              <input
                type="text"
                placeholder="مثال: ط ي ع 2468"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-emerald-500 text-slate-200 font-bold"
                value={searchCarNumber}
                onChange={(e) => setSearchCarNumber(e.target.value)}
              />
            </div>
          )}

          {/* Conditional filter: Driver Select */}
          {(activeSubReport === 'violations' || activeSubReport === 'drivers' || activeSubReport === 'deductions_report') && (
            <div>
              <label className="block text-slate-405 font-bold mb-1">تحديد سائق مخصص</label>
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2.5 focus:outline-none focus:border-emerald-500 text-slate-205 font-bold"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
              >
                <option value="">كافة سائقين كادر البنا جروب</option>
                {db.drivers.map(d => (
                  <option key={d.id} value={d.id}>[{d.driver_code}] {d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional filter: Deductions Year and Month selection */}
          {activeSubReport === 'deductions_report' && (
            <>
              <div>
                <label className="block text-slate-405 font-bold mb-1">تحديد سنة الخصومات</label>
                <select
                  value={deductionsYear}
                  onChange={(e) => setDeductionsYear(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2.5 focus:outline-none focus:border-rose-500 text-slate-200 font-bold"
                >
                  <option value="">كافة السنوات</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                  <option value="2028">2028</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-405 font-bold mb-1">تحديد شهر الخصومات</label>
                <select
                  value={deductionsMonth}
                  onChange={(e) => setDeductionsMonth(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2.5 focus:outline-none focus:border-rose-500 text-slate-200 font-bold"
                >
                  <option value="all">كل شهور السنة</option>
                  <option value="01">يناير (01)</option>
                  <option value="02">فبراير (02)</option>
                  <option value="03">مارس (03)</option>
                  <option value="04">أبريل (04)</option>
                  <option value="05">مايو (05)</option>
                  <option value="06">يونيو (06)</option>
                  <option value="07">يوليو (07)</option>
                  <option value="08">أغسطس (08)</option>
                  <option value="09">سبتمبر (09)</option>
                  <option value="10">أكتوبر (10)</option>
                  <option value="11">نوفمبر (11)</option>
                  <option value="12">ديسمبر (12)</option>
                </select>
              </div>
            </>
          )}

          {/* Conditional filter: Car Select for car_violations */}
          {activeSubReport === 'car_violations' && (
            <div className="space-y-2">
              <label className="block text-slate-405 font-xs pb-1 font-bold">البحث برقم السيارة، الحروف، أو الشاسيه</label>
              <input
                type="text"
                placeholder="مثال: أ ب ج 1234 أو رقم الشاسيه..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-amber-500 text-slate-200 font-medium text-xs font-sans"
                value={carSearchQuery}
                onChange={(e) => setCarSearchQuery(e.target.value)}
              />
              <label className="block text-slate-405 font-xs pb-1 font-bold">تحديد السيارة المطابقة</label>
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2.5 focus:outline-none focus:border-amber-500 text-slate-200 font-bold"
                value={selectedReportCarId}
                onChange={(e) => setSelectedReportCarId(e.target.value)}
              >
                <option value="">-- اختر لوحة السيارة للمطابقة --</option>
                {db.cars
                  .filter(c => {
                    const q = carSearchQuery.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      c.car_number.toLowerCase().includes(q) ||
                      (c.chassis_number && c.chassis_number.toLowerCase().includes(q)) ||
                      matchPlateNumberAndLetters(c.car_number, q)
                    );
                  })
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      🚗 {c.car_number} {c.chassis_number ? `(شاسيه: ${c.chassis_number})` : ''} - {c.owner_company.split(' ')[0]}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Conditional filter: Supervisor Select */}
          {(activeSubReport === 'custody' || activeSubReport === 'cars') && (
            <div>
              <label className="block text-slate-405 font-bold mb-1">تحديد مسؤول العهدة</label>
              <select
                disabled={db.currentUser?.role === 'supervisor'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2.5 focus:outline-none focus:border-emerald-500 text-slate-205 font-bold disabled:opacity-70 disabled:cursor-not-allowed"
                value={selectedOfficialId}
                onChange={(e) => setSelectedOfficialId(e.target.value)}
              >
                {db.currentUser?.role !== 'supervisor' && <option value="">كافة مسؤولي شركة وعائل البنا</option>}
                {db.officials.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Common Date Range filters */}
          {(activeSubReport === 'violations' || activeSubReport === 'drivers') && (
            <>
              <div>
                <label className="block text-slate-405 font-bold mb-1">من تاريخ القييد</label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-slate-405 font-bold mb-1">إلى تاريخ القييد</label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              type="button"
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg border border-slate-755 transition-colors"
            >
              مسح وإفراغ فلاتر التدقيق
            </button>
          </div>
        </div>
      </div>

      {/* 4. Active Report Metrics Cards (Perfect for summary) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeSubReport === 'violations' && (
          <>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">إجمالي المخالفات المسجلة حالياً</span>
                <span className="text-xl md:text-2xl font-black text-amber-500 mt-1 block">{filteredViolations.length} مخالفة</span>
              </div>
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-550/10 rounded-xl flex items-center justify-center text-amber-500">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">القيمة المالية الكاملة للمخالفات</span>
                <span className="text-xl md:text-2xl font-black text-rose-500 mt-1 block">{totalViolationsAmount.toLocaleString()} ج.م</span>
              </div>
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-550/10 rounded-xl flex items-center justify-center text-rose-500">
                <Coins className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">متوسط قيمة المخالفة المفهرسة</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">
                  {filteredViolations.length > 0 ? Math.round(totalViolationsAmount / filteredViolations.length).toLocaleString() : 0} ج.م
                </span>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-550/10 rounded-xl flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </>
        )}

        {activeSubReport === 'drivers' && (
          <>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">إجمالي مديونيات الكادر المستحقة</span>
                <span className="text-xl md:text-2xl font-black text-red-500 mt-1 block">{totalDriversDues.toLocaleString()} ج.م</span>
              </div>
              <div className="w-12 h-12 bg-red-500/10 border border-red-550/10 rounded-xl flex items-center justify-center text-red-400">
                <Coins className="w-6 h-6 text-red-500" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-550 font-semibold block">مجموع عمليات الخصم التراكمي (المفلترة)</span>
                <span className="text-xl md:text-2xl font-black text-indigo-400 mt-1 block">{totalDeductionsAmount.toLocaleString()} ج.م</span>
              </div>
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-550/10 rounded-xl flex items-center justify-center text-indigo-400">
                <TrendingDown className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">عدد السائقين المفلترين بالسجل</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">{filteredDrivers.length} سائق</span>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-550/10 rounded-xl flex items-center justify-center text-emerald-400">
                <User className="w-6 h-6" />
              </div>
            </div>
          </>
        )}

        {activeSubReport === 'custody' && (
          <>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">إجمالي كاش الخزائن الرئيسي والفرعي</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">
                  {db.custodyAccounts
                    .filter(a => a.type === 'cash' && (!selectedOfficialId || a.official_id === selectedOfficialId))
                    .reduce((sum, a) => sum + a.balance, 0)
                    .toLocaleString()} ج.م
                </span>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-550/10 rounded-xl flex items-center justify-center text-emerald-400">
                <Coins className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">إجمالي فيزا البطاقات البنكية</span>
                <span className="text-xl md:text-2xl font-black text-indigo-455 mt-1 block">
                  {db.custodyAccounts
                    .filter(a => a.type !== 'cash' && (!selectedOfficialId || a.official_id === selectedOfficialId))
                    .reduce((sum, a) => sum + a.balance, 0)
                    .toLocaleString()} ج.م
                </span>
              </div>
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-550/10 rounded-xl flex items-center justify-center text-indigo-400">
                <Coins className="w-6 h-6 text-indigo-400" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">المجموع العام الجاري بالصناديق</span>
                <span className="text-xl md:text-2xl font-black text-amber-500 mt-1 block">
                  {db.custodyAccounts
                    .filter(a => !selectedOfficialId || a.official_id === selectedOfficialId)
                    .reduce((sum, a) => sum + a.balance, 0)
                    .toLocaleString()} ج.م
                </span>
              </div>
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-550/10 rounded-xl flex items-center justify-center text-amber-500">
                <Coins className="w-6 h-6" />
              </div>
            </div>
          </>
        )}

        {activeSubReport === 'cars' && (
          <>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">شاحنات وسيارات الأسطول النشطة</span>
                <span className="text-xl md:text-2xl font-black text-sky-400 mt-1 block">{totalCarsActive} مركبة</span>
              </div>
              <div className="w-12 h-12 bg-sky-500/10 border border-sky-550/10 rounded-xl flex items-center justify-center text-sky-400">
                <Car className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">منتهية الترخيص (تتطلب فحص وعجلة فحص)</span>
                <span className="text-xl md:text-2xl font-black text-rose-500 mt-1 block">{expiredLicensesCount} سيارات</span>
              </div>
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-550/10 rounded-xl flex items-center justify-center text-rose-500">
                <CalendarCheck className="w-6 h-6 text-rose-500" />
              </div>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">الشركات والجهات التابعة للجروب بالأرشيف</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">
                  {Array.from(new Set(db.cars.map(c => c.owner_company))).length} جهات
                </span>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-555/10 rounded-xl flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 5. Printable Report Area */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm space-y-4 print-report-view">
        <div className="border-b border-slate-800 pb-4 flex justify-between items-start">
          <div>
            <h3 className="text-base font-extrabold text-slate-200">مجموعة البنا جروب اللوجستية</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">تقرير إلكتروني مستخرج محاسبياً بتاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
          </div>
          <div className="text-left">
            <span className="px-2.5 py-1 bg-slate-950 border border-slate-850 rounded text-[10px] font-bold text-slate-400">
              {activeSubReport === 'violations' && 'كشف المخالفات المجمع'}
              {activeSubReport === 'drivers' && 'كشف مديونيات وحركات السائقين'}
              {activeSubReport === 'custody' && 'كشف العهد وموازنات الخزائن'}
              {activeSubReport === 'cars' && 'كشف مركبات وتراخيص الأسطول'}
            </span>
          </div>
        </div>

        {/* --- Violations Table Display --- */}
        {activeSubReport === 'violations' && (
          <div className="overflow-x-auto text-xs font-sans">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-2 text-center w-8">م</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">رقم السيارة</th>
                  <th className="py-3 px-3">كود السائق</th>
                  <th className="py-3 px-3">اسم السواق</th>
                  <th className="py-3 px-3">البيان والتقرير التفصيلي</th>
                  <th className="py-3 px-3 text-left">المبلغ المطلوب تسويته</th>
                </tr>
              </thead>
              <tbody>
                {filteredViolations.map((v, i) => {
                  const d = db.drivers.find(drv => drv.id === v.driver_id);
                  return (
                    <tr key={v.id} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                      <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                      <td className="py-3 px-3 font-mono">{v.violation_date}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">{getLatestCarNumber(v.car_number)}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-400">{d ? d.driver_code : 'X'}</td>
                      <td className="py-3 px-3 font-bold text-slate-300">{d ? d.name : 'لا يوجد'}</td>
                      <td className="py-3 px-3 text-slate-400">{v.description}</td>
                      <td className="py-3 px-3 text-left font-mono font-bold text-rose-500">{v.amount.toLocaleString()} ج.م</td>
                    </tr>
                  );
                })}
                {filteredViolations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">لا توجد مخالفات تطابق شروط الفلترة والتدقيق الحالية.</td>
                  </tr>
                )}
              </tbody>
              {filteredViolations.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-950 text-slate-200 border-t border-slate-800 font-extrabold">
                    <td colSpan={6} className="py-3 px-3 text-right text-slate-400">الإجمالي العام الكامل للمخالفات المفلترة:</td>
                    <td className="py-3 px-3 text-left font-mono text-rose-500 text-sm">{totalViolationsAmount.toLocaleString()} ج.م</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* --- Drivers Dues Table Display --- */}
        {activeSubReport === 'drivers' && (
          <div className="space-y-6">
            <div className="overflow-x-auto text-xs font-sans">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-2 text-center w-8">م</th>
                    <th className="py-3 px-3">كود السائق</th>
                    <th className="py-3 px-3">اسم السواق</th>
                    <th className="py-3 px-3">الرقم القومي</th>
                    <th className="py-3 px-3">رقم الهاتف</th>
                    <th className="py-3 px-3 text-left">المديونية المستحقة (الحساب الجاري)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((d, i) => (
                    <tr key={d.id} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                      <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-400">{d.driver_code}</td>
                      <td className="py-3 px-3 font-extrabold text-slate-200">{d.name}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{d.national_id}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{d.phone}</td>
                      <td className="py-3 px-3 text-left font-mono font-black text-rose-500">{d.balance.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                  {filteredDrivers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">لا يوجد أية عمال أو سائقين بقاعدة البيانات للفلترة.</td>
                    </tr>
                  )}
                </tbody>
                {filteredDrivers.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-950 text-slate-200 border-t border-slate-800 font-extrabold">
                      <td colSpan={5} className="py-3 px-3 text-right text-slate-400">إجمالي ديون وخصومات السائقين المطلوبة:</td>
                      <td className="py-3 px-3 text-left font-mono text-rose-500 text-sm">{totalDriversDues.toLocaleString()} ج.م</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Sub movements log */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-extrabold text-slate-300 mb-2 flex items-center gap-1.5 no-print">
                <ChevronLeft className="w-4 h-4 text-emerald-500" />
                سجل حركات الحساب التفصيلي المفلتر للخصومات والمخالفات
              </h4>
              <div className="overflow-x-auto text-[11px] font-sans no-print">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-450 border-b border-slate-800">
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">السائق</th>
                      <th className="py-2.5 px-3">البيان والحركة بالتفصيل</th>
                      <th className="py-2.5 px-3 text-center">النوع</th>
                      <th className="py-2.5 px-3 text-left font-bold">المبلغ المتغير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.slice(0, 30).map((m, idx) => {
                      const d = db.drivers.find(drv => drv.id === m.driver_id);
                      return (
                        <tr key={idx} className="border-b border-slate-850 hover:bg-slate-950/20 text-slate-300">
                          <td className="py-2 px-3 font-mono text-slate-500">{m.date}</td>
                          <td className="py-2 px-3 text-emerald-400 font-bold">{d ? d.name : 'لا يوجد'} ({d ? d.driver_code : 'X'})</td>
                          <td className="py-2 px-3 text-slate-400">{m.description}</td>
                          <td className="py-2 px-3 text-center">
                            {m.type === 'violation' && <span className="bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded text-[9px] text-amber-500">مخالفة</span>}
                            {m.type === 'deduction' && <span className="bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded text-[9px] text-rose-500">استقطاع</span>}
                            {m.type === 'payment' && <span className="bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded text-[9px] text-emerald-500">سداد</span>}
                            {m.type === 'reversal' && <span className="bg-sky-500/10 border border-sky-500/20 px-1 py-0.5 rounded text-[9px] text-sky-500">مرتد</span>}
                          </td>
                          <td className={`py-2 px-3 text-left font-mono font-bold ${m.amount_change < 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                            {m.amount_change > 0 ? `+${m.amount_change}` : m.amount_change}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed target driver violations settlement tracking */}
            {(() => {
              const targetedDriver = selectedDriverId ? db.drivers.find(drv => drv.id === selectedDriverId) : (filteredDrivers.length === 1 ? filteredDrivers[0] : null);
              if (!targetedDriver) return null;
              
              const drvViolations = db.violations.filter(v => v.driver_id === targetedDriver.id);
              const settlements = computeAllViolationsSettlements();
              
              let totalOrig = 0;
              let totalPaid = 0;
              let totalRem = 0;

              return (
                <div className="pt-6 border-t border-slate-800 space-y-3">
                  <div className="p-4 bg-slate-950 rounded-xl border border-amber-500/10">
                    <h4 className="text-xs font-extrabold text-amber-400 font-sans flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-amber-500" />
                      كشف تفاصيل المخالفات وموقف الخصم والتسوية لجميع سيارات السائق: {targetedDriver.name} (كود: {targetedDriver.driver_code})
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">يتم تجميع جميع المخالفات التي سجلت باسمه على سيارة أو عدة سيارات ليصبح مديناً بها، ويتم سدادها تتابعياً (FIFO) من عمليات خصم السائق.</p>
                  </div>
                  <div className="overflow-x-auto text-[11px] font-sans">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <th className="py-2.5 px-2 text-center w-8">م</th>
                          <th className="py-2.5 px-3">تاريخ المخالفة</th>
                          <th className="py-2.5 px-3">رقم السيارة اللوحة</th>
                          <th className="py-2.5 px-3">تفاصيل المخالفة والسبب</th>
                          <th className="py-2.5 px-3 text-left font-bold">المبلغ الأصلي</th>
                          <th className="py-2.5 px-3 text-left font-bold">مبلغ الخصم المسدد بالفعل</th>
                          <th className="py-2.5 px-3 text-left font-bold">صافي المتبقي غير المسدد</th>
                          <th className="py-2.5 px-3 text-center">حالة السداد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drvViolations.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-500 italic font-bold">لا يوجد أية مخالفات مرورية مسجلة مسبقاً بهذا السائق.</td>
                          </tr>
                        ) : (
                          <>
                            {drvViolations.map((v, i) => {
                              const setl = settlements[v.id] || { settledAmount: 0, remainingAmount: v.amount, isFullySettled: false, statusText: 'لم تسدد' };
                              totalOrig += v.amount;
                              totalPaid += setl.settledAmount;
                              totalRem += setl.remainingAmount;
                              const latestCarPlate = getLatestCarNumber(v.car_number);
                              return (
                                <tr key={v.id} className="border-b border-slate-850 hover:bg-slate-950/20 text-slate-300">
                                  <td className="py-2.5 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                                  <td className="py-2.5 px-3 font-mono">{v.violation_date}</td>
                                  <td className="py-2.5 px-3 font-bold text-amber-400">{latestCarPlate}</td>
                                  <td className="py-2.5 px-3">{v.description}</td>
                                  <td className="py-2.5 px-3 text-left font-mono font-black text-slate-300">{v.amount.toLocaleString()} ج.م</td>
                                  <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-400">{setl.settledAmount.toLocaleString()} ج.م</td>
                                  <td className="py-2.5 px-3 text-left font-mono font-black text-rose-400">{setl.remainingAmount.toLocaleString()} ج.م</td>
                                  <td className="py-2.5 px-3 text-center">
                                    {setl.isFullySettled ? (
                                      <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold">خصمت ومسددة</span>
                                    ) : setl.settledAmount > 0 ? (
                                      <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">خصمت جزئياً</span>
                                    ) : (
                                      <span className="bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-0.5 rounded text-[10px] font-bold">لم تسدد</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="bg-slate-950 font-extrabold text-slate-200 border-t border-slate-800">
                              <td colSpan={4} className="py-3 px-3 text-right text-slate-405 text-xs">إجمالي المخالفات والمتبقي للسائق المستهدف:</td>
                              <td className="py-3 px-3 text-left font-mono text-amber-500 text-sm">{totalOrig.toLocaleString()} ج.م</td>
                              <td className="py-3 px-3 text-left font-mono text-emerald-400 text-sm">{totalPaid.toLocaleString()} ج.م</td>
                              <td className="py-3 px-3 text-left font-mono text-rose-500 text-sm">{totalRem.toLocaleString()} ج.م</td>
                              <td></td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* --- Custody Table Display --- */}
        {activeSubReport === 'custody' && (
          <div className="space-y-6">
            <div className="overflow-x-auto text-xs font-sans">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-2 text-center w-8">م</th>
                    <th className="py-3 px-3">رقم الحساب الفرعي بالسيستم</th>
                    <th className="py-3 px-3">المسؤول عن العهدة</th>
                    <th className="py-3 px-3">اسم الصندوق/اسم الكارت البنكي</th>
                    <th className="py-3 px-3">النوع الجاري</th>
                    <th className="py-3 px-3 text-left">الرصيد المتوفر حالياً بالصندوق</th>
                  </tr>
                </thead>
                <tbody>
                  {db.custodyAccounts
                    .filter(a => !selectedOfficialId || a.official_id === selectedOfficialId)
                    .map((acc, i) => {
                      const off = db.officials.find(o => o.id === acc.official_id);
                      return (
                        <tr key={acc.id} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                          <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-400">{acc.id}</td>
                          <td className="py-3 px-3 font-bold text-indigo-400">{off ? off.name : 'مسؤول افتراضي'}</td>
                          <td className="py-3 px-3 font-bold text-slate-200">{acc.name}</td>
                          <td className="py-3 px-3 text-[10px]">
                            {acc.type === 'cash' ? (
                              <span className="bg-emerald-500/10 border border-emerald-555/20 px-2 py-0.5 rounded text-emerald-400 font-bold">عهدة نقدي كاش</span>
                            ) : (
                              <span className="bg-indigo-500/10 border border-indigo-555/20 px-2 py-0.5 rounded text-indigo-400 font-bold">فيزا بنكية سارية</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-left font-mono font-black text-emerald-400">{acc.balance.toLocaleString()} ج.م</td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950 text-slate-200 border-t border-slate-800 font-extrabold">
                    <td colSpan={5} className="py-3 px-3 text-right text-slate-400">إجمالي الأرصدة الشاملة المتوفرة للتراخيص (بجميع العملات):</td>
                    <td className="py-3 px-3 text-left font-mono text-emerald-400 text-sm">
                      {db.custodyAccounts
                        .filter(a => !selectedOfficialId || a.official_id === selectedOfficialId)
                        .reduce((sum, a) => sum + a.balance, 0)
                        .toLocaleString()} ج.م
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Cumulative log of custody movements */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-extrabold text-slate-300 mb-2 flex items-center gap-1.5 no-print">
                <ChevronLeft className="w-4 h-4 text-emerald-500" />
                آخر العمليات والتحويلات المسجلة على الخزائن الفرعية والعهد
              </h4>
              <div className="overflow-x-auto text-[11px] font-sans no-print">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-450 border-b border-slate-800">
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">المشرف المنفذ</th>
                      <th className="py-2.5 px-3">تفاصيل الحركة المحاسبية بالصفة</th>
                      <th className="py-2.5 px-3 text-center">نوع السند</th>
                      <th className="py-2.5 px-3 text-left font-bold">قيمة السند</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupCustodyMovements.slice(0, 15).map((m, idx) => {
                      const o = db.officials.find(of => of.id === m.official_id);
                      return (
                        <tr key={idx} className="border-b border-slate-850 text-slate-300">
                          <td className="py-2 px-3 font-mono text-slate-500">{m.date}</td>
                          <td className="py-2 px-3 font-bold text-slate-200">{o ? o.name : 'مسؤول'}</td>
                          <td className="py-2 px-3 text-slate-400">{m.description}</td>
                          <td className="py-2 px-3 text-center">
                            {m.type === 'deposit' && <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded text-[9px]">إيداع</span>}
                            {m.type === 'withdrawal' && <span className="text-red-400 bg-red-500/10 px-1 py-0.5 rounded text-[9px]">سحب</span>}
                            {m.type === 'transfer' && <span className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded text-[9px]">تحويل</span>}
                            {m.type === 'settlement' && <span className="text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded text-[9px]">تسوية</span>}
                            {m.type === 'invoice_charge' && <span className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded text-[9px]">فاتورة</span>}
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-indigo-455">
                            {m.amount.toLocaleString()} ج.م
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- Cars Table Display --- */}
        {activeSubReport === 'cars' && (
          <div className="overflow-x-auto text-xs font-sans">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-2 text-center w-8">م</th>
                  <th className="py-3 px-3">رقم السيارة اللوحة</th>
                  <th className="py-3 px-3">رقم الشاسيه</th>
                  <th className="py-3 px-3">رقم الموتور</th>
                  <th className="py-3 px-3">الجهة/الشركة المالكة</th>
                  <th className="py-3 px-3">نهاية الترخيص</th>
                  <th className="py-3 px-3">تطبيق طفاية الحريق</th>
                  <th className="py-3 px-3">مسئول العهدة والتراخيص</th>
                  <th className="py-3 px-3">السائق المسند إليه</th>
                </tr>
              </thead>
              <tbody>
                {filteredCars.map((c, i) => {
                  const d = db.drivers.find(drv => drv.id === c.driver_id);
                  const o = db.officials.find(off => off.id === c.license_official_id);
                  const isExpired = new Date(c.license_end_date) < new Date();
                  return (
                    <tr key={c.id} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                      <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">{c.car_number}</td>
                      <td className="py-3 px-3 font-mono max-w-[100px] truncate" title={c.chassis_number}>{c.chassis_number}</td>
                      <td className="py-3 px-3 font-mono max-w-[100px] truncate" title={c.motor_number}>{c.motor_number}</td>
                      <td className="py-3 px-3 font-semibold text-slate-300">{c.owner_company}</td>
                      <td className={`py-3 px-3 font-mono font-bold ${isExpired ? 'text-red-500' : 'text-slate-200'}`}>
                        {c.license_end_date} {isExpired && '[منتهي فحص]'}
                      </td>
                      <td className="py-3 px-3">
                        {c.extinguisher_status === 'valid' && <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[9px] font-bold">سارية ومفحوصة</span>}
                        {c.extinguisher_status === 'expired' && <span className="bg-red-500/10 border border-red-500/20 text-red-500 px-1.5 py-0.5 rounded text-[9px] font-bold">تالفة/منتهية</span>}
                        {c.extinguisher_status === 'warning' && <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded text-[9px] font-bold">أقل من شهر</span>}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-300">{o ? o.name : 'لا يوجد'}</td>
                      <td className="py-3 px-3 font-bold text-indigo-400">{d ? d.name : 'طاقم السوبر'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* --- Deductions Report Table Display --- */}
        {activeSubReport === 'deductions_report' && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-950 rounded-xl border border-rose-500/10 flex flex-wrap justify-between items-center gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block">الفترة المحددة</span>
                <p className="text-sm font-black text-rose-400">
                  {(startDate || endDate)
                    ? `${startDate || '---'} إلى ${endDate || '---'}`
                    : `${deductionsYear || 'كافة السنوات'} — ${deductionsMonth === 'all' ? 'كافة الشهور' : `شهر (${deductionsMonth})`}`}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block">عدد السائقين المخصوم عليهم</span>
                <p className="text-sm font-black text-amber-400">{groupedDeductions.length} سائق</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block">إجمالي مبالغ الخصم في الفترة</span>
                <p className="text-sm font-black text-red-500">{totalDeductionsReportAmount.toLocaleString()} ج.م</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block">إجمالي المتبقي على السائقين</span>
                <p className="text-sm font-black text-amber-400">{groupedDeductions.reduce((sum, g) => sum + g.remainingBalance, 0).toLocaleString()} ج.م</p>
              </div>
            </div>

            <div className="overflow-x-auto text-xs font-sans">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-2 text-center w-8">م</th>
                    <th className="py-3 px-3 text-right">اسم السائق</th>
                    <th className="py-3 px-3 text-left">المخصوم في الفترة</th>
                    <th className="py-3 px-4 text-left">المتبقي عليه (الرصيد الحالي)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDeductions.map((g, i) => {
                    return (
                      <tr key={g.driverId} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                        <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                        <td className="py-3 px-3 font-bold text-slate-200">{g.driverName}</td>
                        <td className="py-3 px-3 font-mono font-black text-red-400 text-left">{g.totalDeducted.toLocaleString()} ج.م</td>
                        <td className="py-3 px-4 font-mono font-black text-amber-400 text-left">{g.remainingBalance > 0 ? `${g.remainingBalance.toLocaleString()} ج.م` : '—'}</td>
                      </tr>
                    );
                  })}
                  {groupedDeductions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-500 font-bold">لا يوجد أية عمال أو سائقين لديهم خصومات مسجلة تطابق محددات البحث المحددة.</td>
                    </tr>
                  )}
                </tbody>
                {groupedDeductions.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-950 text-slate-200 border-t border-slate-800 font-extrabold">
                      <td colSpan={2} className="py-3 px-3 text-right text-slate-405">إجمالي الخصومات المستقطعة خلال الفترة المحددة:</td>
                      <td className="py-3 px-3 text-left font-mono text-rose-500 text-sm">
                        {totalDeductionsReportAmount.toLocaleString()} ج.م
                      </td>
                      <td className="py-3 px-4 text-left font-mono text-amber-500 text-xs">
                        إجمالي المتبقي على السائقين: {groupedDeductions.reduce((sum, g) => sum + g.remainingBalance, 0).toLocaleString()} ج.م
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* --- Car Violations & Deductions Detailed Report --- */}
        {activeSubReport === 'car_violations' && (() => {
          const targetCar = db.cars.find(c => c.id === selectedReportCarId);
          if (!targetCar) {
            return (
              <div className="py-12 text-center text-slate-400 font-bold bg-slate-900/50 border border-slate-800 rounded-2xl">
                ⚠️ يرجى اختيار سيارة من المحددات بالأعلى لتوليد كشف المخالفات والاستقطاعات التفصيلي الخاص بها.
              </div>
            );
          }

           // Fetch all violations for this car
           const carViolations = db.violations.filter(v => {
             if (v.car_number === targetCar.car_number) return true;
             const vDigits = (v.car_number.match(/\d+/) || [])[0];
             const cDigits = (targetCar.car_number.match(/\d+/) || [])[0];
             return !!(vDigits && cDigits && vDigits === cDigits);
           });
 
           // Get unique driver ids who committed violations on this car
           const driverIdsWithViolations = Array.from(new Set(carViolations.map(v => v.driver_id)));
           const driversWithViolations = db.drivers.filter(d => driverIdsWithViolations.includes(d.id));
 
           // Fetch all deductions for this car
           const carDeductions = getEnrichedMovements().filter(m => {
             // must be a credit/deduction/payment (negative change)
             if (m.type !== 'deduction' && m.type !== 'payment' && m.amount_change >= 0) return false;
             
             // condition A: linked directly to this car
             if (m.car_id === targetCar.id) return true;
             if (m.description.includes(targetCar.car_number)) return true;
             const cDigits = (targetCar.car_number.match(/\d+/) || [])[0];
             if (cDigits && m.description.includes(cDigits)) return true;
             
             // condition B: belongs to a driver who has committed violations on this car
             if (driverIdsWithViolations.includes(m.driver_id)) return true;
             
             return false;
           });

          const settlements = computeAllViolationsSettlements();
          const totalViolationsBefore = carViolations.reduce((sum, v) => sum + v.amount, 0);
          const totalDeducted = carViolations.reduce((sum, v) => {
            const setl = settlements[v.id];
            return sum + (setl ? setl.settledAmount : 0);
          }, 0);
          const remainingBalance = Math.max(0, totalViolationsBefore - totalDeducted);

          return (
            <div className="space-y-6">
              {/* Top Dashboard Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-emerald-500/10 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block font-sans">إجمالي مبالغ المخالفات الأصلية (قبل الخصم)</span>
                  <p className="text-xl font-black text-amber-500 font-mono">{totalViolationsBefore.toLocaleString()} ج.م</p>
                  <span className="text-[10px] text-slate-500">مجموع المبالغ الأصلية المسجلة</span>
                </div>
                <div className="p-4 bg-slate-950 rounded-xl border border-red-500/10 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block font-sans">إجمالي الخصومات المستقطعة (التي تم خصمها بالفعل)</span>
                  <p className="text-xl font-black text-rose-500 font-mono">{totalDeducted.toLocaleString()} ج.م</p>
                  <span className="text-[10px] text-slate-500">تم تسييلها وسحبها من أرصدة السائقين</span>
                </div>
                <div className="p-4 bg-slate-950 rounded-xl border border-emerald-500/10 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block font-sans">المبلغ المتبقي المطلوب للتسوية (بعد الخصم)</span>
                  <p className="text-xl font-black text-teal-400 font-mono">{remainingBalance.toLocaleString()} ج.م</p>
                  <span className="text-[10px] text-slate-500">صافي الدين المستحق على السيارة</span>
                </div>
              </div>

              {/* Drivers Status Card */}
              <div className="p-4 bg-slate-900 border border-slate-855 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-slate-300 font-sans">تحليل كادر القيادة المقيد على السيارة:</h4>
                <div className="text-xs">
                  {driversWithViolations.length > 1 ? (
                    <div className="flex items-center gap-2 text-amber-400 bg-amber-500/5 px-3 py-2 rounded-lg border border-amber-500/10 font-sans">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      <span>
                        ⚠️ <strong>تنبيه إداري:</strong> يوجد أكثر من سائق مقيد على لوحة هذه السيارة ارتكبوا المخالفات المذكورة أدناه بالتناوب! الأسماء: {driversWithViolations.map(d => d.name).join(' ، ')} (عدد السائقين: {driversWithViolations.length})
                      </span>
                    </div>
                  ) : driversWithViolations.length === 1 ? (
                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/5 px-3 py-2 rounded-lg border border-emerald-500/10 font-sans">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>
                        🧑‍✈️ <strong>سائق واحد فقط مقيد:</strong> السائق المقر المسجل عليه المخالفات حالياً هو: <strong>{driversWithViolations[0].name}</strong> (رقم الكود: {driversWithViolations[0].driver_code})
                      </span>
                    </div>
                  ) : (
                    <div className="text-slate-500 italic font-sans">لا توجد أية مخالفات مرورية مسجلة على هذه السيارة بنظام النقل البري حالياً.</div>
                  )}
                </div>
              </div>

              {/* Table A: Original Violations */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-200 border-r-2 border-amber-500 pr-2 font-sans">1. ملف المخالفات المرتكبة على المركبة وموقف تسويتها الفردي:</h3>
                <div className="overflow-x-auto text-xs font-sans">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <th className="py-2.5 px-2 text-center w-8">م</th>
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">اسم السائق المقيد</th>
                        <th className="py-2.5 px-3">بيان المخالفة وتفاصيلها</th>
                        <th className="py-2.5 px-3 text-left">المبلغ الأصلي</th>
                        <th className="py-2.5 px-3 text-left">المبلغ المخصوم (سداد)</th>
                        <th className="py-2.5 px-3 text-left">المتبقي المطلوب</th>
                        <th className="py-2.5 px-3 text-center">حالة الخصم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const settlements = computeAllViolationsSettlements();
                        return carViolations.map((v, i) => {
                          const drv = db.drivers.find(d => d.id === v.driver_id);
                          const setl = settlements[v.id] || { settledAmount: 0, remainingAmount: v.amount, isFullySettled: false, statusText: 'لم تسدد' };
                          return (
                            <tr key={v.id} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                              <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                              <td className="py-3 px-3 font-mono">{v.violation_date}</td>
                              <td className="py-3 px-3 font-bold text-indigo-400">{drv ? drv.name : 'سائق غير معرف'}</td>
                              <td className="py-3 px-3">{v.description}</td>
                              <td className="py-3 px-3 text-left font-mono font-black text-amber-500">{v.amount.toLocaleString()} ج.م</td>
                              <td className="py-3 px-3 text-left font-mono font-bold text-emerald-400">{setl.settledAmount.toLocaleString()} ج.م</td>
                              <td className="py-3 px-3 text-left font-mono font-bold text-rose-400">{setl.remainingAmount.toLocaleString()} ج.م</td>
                              <td className="py-3 px-3 text-center">
                                {setl.isFullySettled ? (
                                  <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold">خصمت بالكامل ({setl.settledAmount} ج.م)</span>
                                ) : setl.settledAmount > 0 ? (
                                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">خصم جزء ({setl.settledAmount} ج.م)</span>
                                ) : (
                                  <span className="bg-red-500/10 border border-red-500/20 text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold">لم تسدد</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {carViolations.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500 italic font-sans font-bold">لا يتوفر أية مخالفات مسجلة على المركبة.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table B: Deductions Executed */}
              <div className="space-y-2 pt-4">
                <h3 className="text-sm font-bold text-slate-200 border-r-2 border-rose-500 pr-2 font-sans">2. ملف الخصومات والاستقطاعات المسواة من كشف حساب السائقين:</h3>
                <div className="overflow-x-auto text-xs font-sans">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <th className="py-2.5 px-2 text-center w-8">م</th>
                        <th className="py-2.5 px-3">تاريخ الخصم والتسوية</th>
                        <th className="py-2.5 px-3">اسم السائق المخصوم منه</th>
                        <th className="py-2.5 px-3">بيان حركة الخصم المعتمدة</th>
                        <th className="py-2.5 px-3 text-left">القيمة المخصومة بالفعل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carDeductions.map((m, i) => {
                        const drv = db.drivers.find(d => d.id === m.driver_id);
                        return (
                          <tr key={m.id} className="border-b border-slate-850 hover:bg-slate-950/40 text-slate-300">
                            <td className="py-3 px-2 font-mono text-center text-slate-500">{i + 1}</td>
                            <td className="py-3 px-3 font-mono">{m.date}</td>
                            <td className="py-3 px-3 font-bold text-red-400">{drv ? drv.name : 'سائق غير معرف'}</td>
                            <td className="py-3 px-3">{m.description}</td>
                            <td className="py-3 px-3 text-left font-mono font-black text-rose-500">{Math.abs(m.amount_change).toLocaleString()} ج.م</td>
                          </tr>
                        );
                      })}
                      {carDeductions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500 italic font-bold font-sans">لا يتوفر أية حركات خصم أو استقطاعات مسواة لهذه السيارة بعد.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="border-t border-slate-800 pt-3 text-[10px] text-slate-500 text-center">
          * تم توليد واستخراج هذه الملفات السحابية كشفًا آليًا من بوابة شركة البنا جروب اللوجستية لعام 2026.
        </div>
      </div>

      {/* --- استعلام فواتير مصروف الترخيص --- */}
      {activeSubReport === 'invoices_query' && (() => {
        const filteredInvoices = db.invoices.filter(inv => {
          if (inv.is_deleted) return false;
          const car = db.cars.find(c => c.id === inv.car_id);
          const carNum = car?.car_number || '';
          const matchCar = !invCarSearch || carNum.includes(invCarSearch);
          const matchFrom = !invDateFrom || inv.invoice_date >= invDateFrom;
          const matchTo = !invDateTo || inv.invoice_date <= invDateTo;

          let matchQuery = true;
          if (invQuerySearch) {
            const q = invQuerySearch.toLowerCase().trim();
            const officialObj = db.officials.find(o => o.id === inv.official_id);
            matchQuery = 
              inv.invoice_number.toLowerCase().includes(q) ||
              (inv.license_location || '').toLowerCase().includes(q) ||
              (inv.license_details || '').toLowerCase().includes(q) ||
              (officialObj?.name || '').toLowerCase().includes(q);
          }

          return matchCar && matchFrom && matchTo && matchQuery;
        }).sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));

        const totalFiltered = filteredInvoices.reduce((s, inv) => s + inv.total_amount, 0);

        return (
          <div className="space-y-4">
            {/* فلاتر البحث */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">رقم الفاتورة أو المسؤول</label>
                <input
                  type="text"
                  placeholder="رقم الفاتورة (مثال: INV-2026-0005)..."
                  className="w-full rounded-lg px-3 py-2 bg-slate-950 text-slate-100 border border-slate-800 focus:outline-none focus:border-emerald-500"
                  value={invQuerySearch}
                  onChange={e => setInvQuerySearch(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">رقم السيارة</label>
                <input
                  type="text"
                  placeholder="ابحث برقم السيارة..."
                  className="w-full rounded-lg px-3 py-2 bg-slate-950 text-slate-100 border border-slate-800 focus:outline-none focus:border-emerald-500"
                  value={invCarSearch}
                  onChange={e => setInvCarSearch(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">من تاريخ</label>
                <input type="date" className="w-full rounded-lg px-3 py-2 bg-slate-950 text-slate-100 border border-slate-800 focus:outline-none focus:border-emerald-500" value={invDateFrom} onChange={e => setInvDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">إلى تاريخ</label>
                <input type="date" className="w-full rounded-lg px-3 py-2 bg-slate-950 text-slate-100 border border-slate-800 focus:outline-none focus:border-emerald-500" value={invDateTo} onChange={e => setInvDateTo(e.target.value)} />
              </div>
            </div>

            {/* إجمالي */}
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 text-sm">
              <span className="text-slate-300 font-bold">إجمالي الفواتير المعروضة: <span className="text-emerald-400">{filteredInvoices.length}</span></span>
              <span className="text-slate-300 font-bold">إجمالي المصروف: <span className="text-emerald-400 font-mono">{totalFiltered.toLocaleString()} ج.م</span></span>
            </div>

            {/* جدول الفواتير */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-bold">
                    <th className="py-3 px-3 text-center">#</th>
                    <th className="py-3 px-3">رقم الفاتورة</th>
                    <th className="py-3 px-3">التاريخ</th>
                    <th className="py-3 px-3">رقم السيارة</th>
                    <th className="py-3 px-3">مكان الترخيص</th>
                    <th className="py-3 px-3">بيان الترخيص</th>
                    <th className="py-3 px-3">المسؤول</th>
                    <th className="py-3 px-3 text-left">المبلغ</th>
                    <th className="py-3 px-3 text-center">طباعة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv, i) => {
                    const car = db.cars.find(c => c.id === inv.car_id);
                    const official = db.officials.find(o => o.id === inv.official_id);
                    const items = db.invoiceItems.filter(it => it.invoice_id === inv.id);
                    return (
                      <tr key={inv.id} className="border-b border-slate-800 hover:bg-slate-900/50 text-slate-300">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">{i + 1}</td>
                        <td className="py-2 px-3 font-mono text-indigo-400 font-bold">{inv.invoice_number}</td>
                        <td className="py-2 px-3 font-mono">{inv.invoice_date}</td>
                        <td className="py-2 px-3 font-bold text-sky-400">{car?.car_number || '—'}</td>
                        <td className="py-2 px-3 text-slate-400">{inv.license_location || '—'}</td>
                        <td className="py-2 px-3 text-slate-300 max-w-[180px] truncate">{inv.license_details || '—'}</td>
                        <td className="py-2 px-3 text-slate-400">{official?.name || '—'}</td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-emerald-400">{inv.total_amount.toLocaleString()} ج.م</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => setPrintInvoiceId(printInvoiceId === inv.id ? null : inv.id)}
                            className="bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 mx-auto"
                          >
                            <Printer className="w-3 h-3" />
                            طباعة
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInvoices.length === 0 && (
                    <tr><td colSpan={9} className="py-12 text-center text-slate-500">لا توجد فواتير تطابق البحث.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* A5 Invoice Print Modal */}
      {(() => {
        if (!printInvoiceId) return null;
        const selectedPrintInvoice = db.invoices.find(inv => inv.id === printInvoiceId);
        if (!selectedPrintInvoice) return null;
        const selectedPrintItems = db.invoiceItems.filter(it => it.invoice_id === selectedPrintInvoice.id);
        const officialName = db.officials.find(o => o.id === selectedPrintInvoice.official_id)?.name || 'غير محدد';
        const carsMap = db.cars.reduce((map, car) => {
          map[car.id] = car.car_number;
          return map;
        }, {} as Record<string, string>);

        const carsObjMap = db.cars.reduce((map, car) => {
          map[car.id] = car;
          return map;
        }, {} as Record<string, any>);

        return (
          <A5PrintPreview
            type="invoice"
            invoiceData={{
              invoice: 

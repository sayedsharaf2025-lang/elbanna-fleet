/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb, normalizeDateToYmd } from '../db/store';
import { Car, Driver } from '../types';
import {
  Plus,
  Trash2,
  Edit3,
  Download,
  Upload,
  Search,
  Check,
  AlertTriangle,
  Car as CarIcon,
  Users2,
  FileSpreadsheet,
  X,
  FileCheck,
  SlidersHorizontal
} from 'lucide-react';

export const CarsDriversTab: React.FC = () => {
  const db = useDb();

  // Active sub-tab
  const [panelMode, setPanelMode] = useState<'cars' | 'drivers' | 'import'>('cars');

  // Search terms
  const [carSearch, setCarSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');

  // Editing state
  const [editingCar, setEditingCar] = useState<Car | null>(null);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  // New Car Form State
  const [carNumber, setCarNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [motorNumber, setMotorNumber] = useState('');
  const [ownerCompany, setOwnerCompany] = useState('');
  const [licenseOfficialId, setLicenseOfficialId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [licenseEndDate, setLicenseEndDate] = useState('');
  const [insuranceStatus, setInsuranceStatus] = useState('');
  const [extinguisherStatus, setExtinguisherStatus] = useState<'valid' | 'expired' | 'warning'>('valid');
  const [carModel, setCarModel] = useState('');
  const [carBrand, setCarBrand] = useState('');
  const [carType, setCarType] = useState('');
  const [trafficOffice, setTrafficOffice] = useState('');

  // New Driver Form State
  const [driverCode, setDriverCode] = useState('');
  const [driverName, setDriverName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [driverLicenseEndDate, setDriverLicenseEndDate] = useState('');

  // Excel Import Sandbox State
  const [pastedValue, setPastedValue] = useState('');
  const [importTarget, setImportTarget] = useState<'cars' | 'drivers' | 'violations' | 'deductions'>('cars');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  // Open Car Form for Create or Edit
  const handleSaveCar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!carNumber || !chassisNumber || !motorNumber || !licenseEndDate) {
      alert("الرجاء استكمال الخانات الأساسية للسيارة!");
      return;
    }

    const payload = {
      car_number: carNumber,
      chassis_number: chassisNumber,
      motor_number: motorNumber,
      owner_company: ownerCompany,
      license_official_id: licenseOfficialId || db.officials[0]?.id || '',
      driver_id: driverId || db.drivers[0]?.id || '',
      license_end_date: licenseEndDate,
      insurance_status: insuranceStatus || 'ساري',
      extinguisher_status: extinguisherStatus,
      model: carModel,
      brand: carBrand,
      car_type: carType,
      traffic_office: trafficOffice
    };

    // Automatically save new companies to suggestions list
    if (ownerCompany && ownerCompany.trim()) {
      const trimmedCompany = ownerCompany.trim();
      if (!db.companies.includes(trimmedCompany)) {
        db.addCompany(trimmedCompany);
      }
    }

    if (editingCar) {
      db.updateCar(editingCar.id, payload);
      setEditingCar(null);
    } else {
      db.addCar(payload);
    }

    // Reset Form
    setCarNumber('');
    setChassisNumber('');
    setMotorNumber('');
    setLicenseEndDate('');
    setInsuranceStatus('');
    setExtinguisherStatus('valid');
    setCarModel('');
    setCarBrand('');
    setCarType('');
    setTrafficOffice('');
    setOwnerCompany('');
  };

  const handleEditCarClick = (car: Car) => {
    setEditingCar(car);
    setCarNumber(car.car_number);
    setChassisNumber(car.chassis_number);
    setMotorNumber(car.motor_number);
    setOwnerCompany(car.owner_company);
    setLicenseOfficialId(car.license_official_id);
    setDriverId(car.driver_id);
    setLicenseEndDate(car.license_end_date);
    setInsuranceStatus(car.insurance_status);
    setExtinguisherStatus(car.extinguisher_status);
    setCarModel(car.model || '');
    setCarBrand(car.brand || '');
    setCarType(car.car_type || '');
    setTrafficOffice(car.traffic_office || '');
  };

  // Drivers Save / Edit Callback
  const handleSaveDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverCode || !driverName || !nationalId || !driverLicenseEndDate) {
      alert("الرجاء استكمال البيانات الأساسية للسائق!");
      return;
    }

    const payload = {
      driver_code: driverCode,
      name: driverName,
      national_id: nationalId,
      phone: phone || "لا يوجد",
      license_end_date: driverLicenseEndDate
    };

    if (editingDriver) {
      db.updateDriver(editingDriver.id, payload);
      setEditingDriver(null);
    } else {
      db.addDriver(payload);
    }

    // Reset Driver Form
    setDriverCode('');
    setDriverName('');
    setNationalId('');
    setPhone('');
    setDriverLicenseEndDate('');
  };

  const handleEditDriverClick = (drv: Driver) => {
    setEditingDriver(drv);
    setDriverCode(drv.driver_code);
    setDriverName(drv.name);
    setNationalId(drv.national_id);
    setPhone(drv.phone);
    setDriverLicenseEndDate(drv.license_end_date);
  };

  // Excel Excel Import Process Simulation (Simulates Apache POI file stream parsing)
  const handleProcessImport = () => {
    if (!pastedValue.trim()) {
      setImportStatus({ type: 'error', message: 'الرجاء لصق كود CSV مفصول بالفواصل أو علامات الجدولة للملف!' });
      return;
    }

    const lines = pastedValue.split('\n');
    let successCount = 0;
    let failCount = 0;
    let duplicateWarnings = '';

    // Clean Arabic characters to prevent mismatch on letters like (أ/إ/آ/ا/ة/ه/ى/ي)
    const normalizeArabicText = (str: string) => {
      if (!str) return '';
      return str.trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[ىي]/g, 'ي')
        .replace(/\s+/g, ' ');
    };

    const getParts = (nameStr: string) => {
      return normalizeArabicText(nameStr).split(' ').filter(Boolean);
    };

    const matchDriverByName = (drvName: string) => {
      const inputParts = getParts(drvName || '');
      let targetDriver = null;

      if (drvName && inputParts.length > 0) {
        // Find drivers that match the first two names
        const candidates = db.drivers.filter(d => {
          const dbParts = getParts(d.name);
          if (inputParts.length >= 2 && dbParts.length >= 2) {
            return dbParts[0] === inputParts[0] && dbParts[1] === inputParts[1];
          }
          // Fallback for single names or shorter patterns
          return normalizeArabicText(d.name) === normalizeArabicText(drvName) || 
                 normalizeArabicText(d.name).includes(normalizeArabicText(drvName));
        });

        if (candidates.length === 1) {
          // Exact match by first two names
          targetDriver = candidates[0];
        } else if (candidates.length > 1) {
          // Ambiguity exists! Check the third name
          const matchWithThird = candidates.find(d => {
            const dbParts = getParts(d.name);
            return inputParts.length >= 3 && dbParts.length >= 3 && dbParts[2] === inputParts[2];
          });
          // Fallback to the first candidate if no exact 3rd name match
          targetDriver = matchWithThird || candidates[0];
        } else {
          // Final fallback: standard smart partial inclusion
          targetDriver = db.drivers.find(d => {
            const dbNorm = normalizeArabicText(d.name);
            const inputNorm = normalizeArabicText(drvName);
            return dbNorm === inputNorm || dbNorm.includes(inputNorm) || inputNorm.includes(dbNorm);
          });
        }
      }
      return targetDriver;
    };

    const matchOfficialByName = (offName: string) => {
      const inputNorm = normalizeArabicText(offName || '');
      if (!inputNorm) return null;
      return db.officials.find(o => {
        const dbNorm = normalizeArabicText(o.name);
        return dbNorm === inputNorm || dbNorm.includes(inputNorm) || inputNorm.includes(dbNorm);
      });
    };

    try {
      if (importTarget === 'cars') {
        // Resolve car headers dynamically if first line is a header row
        const firstLine = lines[0];
        const headers = firstLine.includes('\t') ? firstLine.split('\t') : firstLine.split(',');
        
        let carNumIdx = -1;
        let letterIdx = -1;
        let chassisIdx = -1;
        let motorIdx = -1;
        let companyIdx = -1;
        let expDateIdx = -1;
        let modelIdx = -1;
        let brandIdx = -1;
        let typeIdx = -1;
        let officialIdx = -1;
        let driverIdx = -1;
        let insuranceIdx = -1;
        let trafficOfficeIdx = -1;
        let extinguisherIdx = -1;

        const isHeaderRow = firstLine.includes("رقم") || firstLine.includes("حرف") || firstLine.includes("شاسيه") || firstLine.includes("ترخيص") || firstLine.includes("لوحة") || firstLine.includes("مارك") || firstLine.includes("موديل") || firstLine.includes("سائق") || firstLine.includes("مسؤول") || firstLine.includes("مسئول") || firstLine.includes("تأمين") || firstLine.includes("تامين") || firstLine.includes("مرور") || firstLine.includes("طفاية") || firstLine.includes("حالة");

        if (isHeaderRow) {
          headers.forEach((h, idx) => {
            const cleanH = h.trim();
            if (cleanH === "رقم السيارة") carNumIdx = idx;
            else if (cleanH === "حرف" || cleanH === "الحروف") letterIdx = idx;
            else if (cleanH.includes("شاسيه") || cleanH === "رقم الشاسيه") chassisIdx = idx;
            else if (cleanH.includes("موتور") || cleanH === "رقم الموتور") motorIdx = idx;
            else if (cleanH.includes("الشركة") || cleanH === "رقم الشركة" || cleanH === "الشركة المالكة" || cleanH === "الشركة") companyIdx = idx;
            else if (cleanH.includes("الترخيص") || cleanH === "انتهاء الترخيص" || cleanH === "نهاية الترخيص" || cleanH.includes("تاريخ انتهاء الترخيص")) expDateIdx = idx;
            else if (cleanH.includes("الموديل") || cleanH === "موديل" || cleanH === "الموديل") modelIdx = idx;
            else if (cleanH.includes("مارك") || cleanH.includes("ماركة") || cleanH === "ماركه السيارة" || cleanH.includes("ماركة السيارة")) brandIdx = idx;
            else if (cleanH.includes("نوع") || cleanH === "نوع السيارة") typeIdx = idx;
            else if (cleanH.includes("مسؤول") || cleanH.includes("مسئول") || cleanH.includes("مسؤول التراخيص") || cleanH.includes("مسئول التراخيص") || cleanH.includes("مسؤول الترخيص") || cleanH.includes("مسئول الترخيص")) officialIdx = idx;
            else if (cleanH.includes("سائق") || cleanH === "السائق") driverIdx = idx;
            else if (cleanH.includes("تأمين") || cleanH.includes("تامين") || cleanH.includes("التأمينى") || cleanH.includes("التامينى") || cleanH.includes("الرقم التأميني") || cleanH.includes("الرقم التامينى") || cleanH.includes("الرقم التامينى للسيارة") || cleanH.includes("الرقم التأميني للسيارة")) insuranceIdx = idx;
            else if (cleanH.includes("مرور") || cleanH === "جهة المرور" || cleanH === "المرور") trafficOfficeIdx = idx;
            else if (cleanH.includes("طفاية") || cleanH === "حالة الطفاية" || cleanH.includes("طفاية الحريق")) extinguisherIdx = idx;
          });
        }

        lines.forEach((line, idx) => {
          if (idx === 0 && isHeaderRow) return; // Header Row
          if (!line.trim()) return;

          // Split by tab or comma
          const cols = line.includes('\t') ? line.split('\t') : line.split(',');
          if (cols.length < 2) {
            failCount++;
            return;
          }

          let cNum = "";
          let letter = "";
          let chassis = "";
          let motor = "";
          let company = "";
          let expDate = "";
          let model = "";
          let brand = "";
          let type = "";
          let officialName = "";
          let driverName = "";
          let insuranceVal = "";
          let trafficOfficeVal = "";
          let extinguisherVal = "";

          // If headers mapped
          if (carNumIdx !== -1) {
            cNum = cols[carNumIdx]?.trim() || "";
            if (letterIdx !== -1) letter = cols[letterIdx]?.trim() || "";
            if (chassisIdx !== -1) chassis = cols[chassisIdx]?.trim() || "";
            if (motorIdx !== -1) motor = cols[motorIdx]?.trim() || "";
            if (companyIdx !== -1) company = cols[companyIdx]?.trim() || "";
            if (expDateIdx !== -1) expDate = cols[expDateIdx]?.trim() || "";
            if (modelIdx !== -1) model = cols[modelIdx]?.trim() || "";
            if (brandIdx !== -1) brand = cols[brandIdx]?.trim() || "";
            if (typeIdx !== -1) type = cols[typeIdx]?.trim() || "";
            if (officialIdx !== -1) officialName = cols[officialIdx]?.trim() || "";
            if (driverIdx !== -1) driverName = cols[driverIdx]?.trim() || "";
            if (insuranceIdx !== -1) insuranceVal = cols[insuranceIdx]?.trim() || "";
            if (trafficOfficeIdx !== -1) trafficOfficeVal = cols[trafficOfficeIdx]?.trim() || "";
            if (extinguisherIdx !== -1) extinguisherVal = cols[extinguisherIdx]?.trim() || "";
          } else {
            // Fallback: Default positions based on columns length
            if (cols.length >= 14) {
              // Our full template 14-column layout order requested by the user:
              // 1. حرف, 2. رقم السيارة, 3. الموديل, 4. ماركة السيارة, 5. نوع السيارة, 6. رقم الشاسيه, 7. رقم الموتور, 8. الشركة, 9. تاريخ انتهاء الترخيص, 10. المرور, 11. مسؤول الترخيص, 12. الرقم التأميني للسيارة, 13. السائق, 14. حالة الطفاية
              letter = cols[0]?.trim() || "";
              cNum = cols[1]?.trim() || "";
              model = cols[2]?.trim() || "";
              brand = cols[3]?.trim() || "";
              type = cols[4]?.trim() || "";
              chassis = cols[5]?.trim() || "";
              motor = cols[6]?.trim() || "";
              company = cols[7]?.trim() || "";
              expDate = cols[8]?.trim() || "";
              trafficOfficeVal = cols[9]?.trim() || "";
              officialName = cols[10]?.trim() || "";
              insuranceVal = cols[11]?.trim() || "";
              driverName = cols[12]?.trim() || "";
              extinguisherVal = cols[13]?.trim() || "";
            } else if (cols.length >= 13) {
              // Standard 13-column representation without extinguisher status
              cNum = cols[0]?.trim() || "";
              model = cols[1]?.trim() || "";
              brand = cols[2]?.trim() || "";
              type = cols[3]?.trim() || "";
              chassis = cols[4]?.trim() || "";
              motor = cols[5]?.trim() || "";
              expDate = cols[6]?.trim() || "";
              company = cols[7]?.trim() || "";
              letter = cols[8]?.trim() || "";
              officialName = cols[9]?.trim() || "";
              driverName = cols[10]?.trim() || "";
              insuranceVal = cols[11]?.trim() || "";
              trafficOfficeVal = cols[12]?.trim() || "";
            } else if (cols.length >= 9) {
              const col0 = cols[0]?.trim() || "";
              const col0HasLettersOnly = /^[^\d]+$/.test(col0) && col0.length > 0;
              
              if (col0HasLettersOnly) {
                letter = cols[0]?.trim() || "";
                company = cols[1]?.trim() || "";
                expDate = cols[2]?.trim() || "";
                motor = cols[3]?.trim() || "";
                chassis = cols[4]?.trim() || "";
                type = cols[5]?.trim() || "";
                brand = cols[6]?.trim() || "";
                model = cols[7]?.trim() || "";
                cNum = cols[8]?.trim() || "";
              } else {
                cNum = cols[0]?.trim() || "";
                model = cols[1]?.trim() || "";
                brand = cols[2]?.trim() || "";
                type = cols[3]?.trim() || "";
                chassis = cols[4]?.trim() || "";
                motor = cols[5]?.trim() || "";
                expDate = cols[6]?.trim() || "";
                company = cols[7]?.trim() || "";
                letter = cols[8]?.trim() || "";
              }
            } else {
              cNum = cols[0]?.trim() || "";
              chassis = cols[1]?.trim() || "";
              motor = cols[2]?.trim() || "";
              company = cols[3]?.trim() || "البنا جروب";
              expDate = cols[4]?.trim() || "2026-12-31";
            }
          }

          // Format expiration date properly
          let formattedDate = expDate ? expDate.trim() : "2026-12-31";
          if (formattedDate === "0" || formattedDate === "") {
            formattedDate = "2026-12-31";
          }
          if (formattedDate.includes('/')) {
            const dateParts = formattedDate.split('/');
            if (dateParts[0].length === 4) {
              formattedDate = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
            } else if (dateParts[2]?.length === 4) {
              formattedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
            }
          }
          if (formattedDate === "0" || isNaN(Date.parse(formattedDate))) {
            formattedDate = "2026-12-31";
          }

          // Map company
          let mappedCompany = company || "مجموعة البنا للتشييد";
          const companyStr = company ? company.trim() : "";
          if (companyStr === "1" || companyStr.includes("البنا للتشييد") || companyStr.includes("مجموعة البنا")) {
            mappedCompany = "مجموعة البنا للتشييد";
          } else if (companyStr === "2" || companyStr.includes("ترانس")) {
            mappedCompany = "البنا ترانس لخدمات اللوجستيك";
          } else if (companyStr === "3" || companyStr.includes("الخرسانية")) {
            mappedCompany = "البنا الخرسانية";
          }

          // Combine plate letters and number
          let carNumberCombined = cNum;
          if (letter) {
            carNumberCombined = `${letter} ${cNum}`.trim();
          }

          // Real-time unique index checking for car plates/chassis
          const carExists = db.cars.some(c => c.car_number === carNumberCombined || c.chassis_number === chassis);
          if (carExists) {
            duplicateWarnings += ` • السيارة رقم ${carNumberCombined} أو الشاسيه ${chassis} متواجد مسبقاً (تخطي).\n`;
            failCount++;
          } else {
            const matchedOfficial = officialName ? matchOfficialByName(officialName) : null;
            const matchedDriver = driverName ? matchDriverByName(driverName) : null;

            let extStatus: 'valid' | 'expired' | 'warning' = "valid";
            if (extinguisherVal) {
              const normExt = extinguisherVal.trim();
              if (normExt.includes("منته") || normExt.includes("expired") || normExt.includes("غير صالحة")) {
                extStatus = "expired";
              } else if (normExt.includes("تحذير") || normExt.includes("warning") || normExt.includes("تنبيه") || normExt.includes("تقترب")) {
                extStatus = "warning";
              } else {
                extStatus = "valid";
              }
            }

            db.addCar({
              car_number: carNumberCombined,
              chassis_number: chassis || `CH-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
              motor_number: motor || `M-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
              owner_company: mappedCompany,
              license_official_id: matchedOfficial?.id || db.officials[0]?.id || "1",
              driver_id: matchedDriver?.id || db.drivers[0]?.id || "d1",
              license_end_date: formattedDate,
              insurance_status: insuranceVal || "ساري مدمج إكسيل",
              extinguisher_status: extStatus,
              model: model || "",
              brand: brand || "",
              car_type: type || "",
              traffic_office: trafficOfficeVal
            });
            successCount++;
          }
        });
        setImportStatus({
          type: 'success',
          message: `تم تلبية معالجة السجلات إكسيل الذكية: استيراد ${successCount} سيارات بنجاح. فشل/تكرار: ${failCount} صفوف.\n${duplicateWarnings}`
        });
      } else if (importTarget === 'drivers') {
        // Drivers Import
        lines.forEach((line, idx) => {
          if (idx === 0) return; // Header Row
          if (!line.trim()) return;

          const cols = line.includes('\t') ? line.split('\t') : line.split(',');
          if (cols.length < 4) {
            failCount++;
            return;
          }

          const code = cols[0]?.trim();
          const name = cols[1]?.trim();
          const natId = cols[2]?.trim();
          const phoneNum = cols[3]?.trim();
          let licenseEnd = cols[4]?.trim() || "2026-12-31";
          if (licenseEnd === "0" || licenseEnd === "" || isNaN(Date.parse(licenseEnd))) {
            licenseEnd = "2026-12-31";
          }

          const drvExists = db.drivers.some(d => d.driver_code === code || d.national_id === natId);
          if (drvExists) {
            duplicateWarnings += ` • السائق ${name} متواجد كوده أو بطاقته مسبقاً (تخطي).\n`;
            failCount++;
          } else {
            db.addDriver({
              driver_code: code,
              name,
              national_id: natId,
              phone: phoneNum,
              license_end_date: licenseEnd
            });
            successCount++;
          }
        });
        setImportStatus({
          type: 'success',
          message: `تم محاكاة فحص المعاملات إكسيل: استيراد ${successCount} سائقين جدد بنجاح. تخطي/تكرار: ${failCount}.\n${duplicateWarnings}`
        });
      } else if (importTarget === 'violations') {
        // Violations Import
        lines.forEach((line, idx) => {
          if (idx === 0) return; // Header Row
          if (!line.trim()) return;

          const cols = line.includes('\t') ? line.split('\t') : line.split(',');
          if (cols.length < 5) {
            failCount++;
            return;
          }

          const vDate = normalizeDateToYmd(cols[0]?.trim());
          const carNum = cols[1]?.trim();
          const drvName = cols[2]?.trim();
          const desc = cols[3]?.trim();
          const amt = Number(cols[4]?.trim() || '0');

          let resolvedCarNumber = carNum;
          if (carNum) {
            const cleanCarNum = carNum.trim();
            const matchedCar = db.cars.find(c => {
              if (c.car_number.trim().toLowerCase() === cleanCarNum.toLowerCase()) return true;
              const cDigits = (c.car_number.match(/\d+/) || [])[0];
              const importDigits = (cleanCarNum.match(/\d+/) || [])[0];
              return !!(cDigits && importDigits && cDigits === importDigits);
            });
            if (matchedCar) {
              resolvedCarNumber = matchedCar.car_number;
            }
          }

          const targetDriver = matchDriverByName(drvName);

          if (!targetDriver) {
            duplicateWarnings += ` • السائق صاحب الاسم [${drvName}] غير مسجل، تم تخطي المخالفة للسيارة ${resolvedCarNumber}.\n`;
            failCount++;
          } else {
            const res = db.addViolation({
              violation_date: vDate,
              car_number: resolvedCarNumber,
              driver_id: targetDriver.id,
              description: desc,
              amount: amt
            });
            if (res.success) {
              successCount++;
            } else {
              duplicateWarnings += ` • مخالفة مكررة للسيارة ${resolvedCarNumber} بتاريخ ${vDate} (تخطي).\n`;
              failCount++;
            }
          }
        });
        setImportStatus({
          type: 'success',
          message: `تمت تلبية معالجة المخالفات عبر الاسم (إكسيل): استيراد ${successCount} مخالفات بنجاح. فشل/تعديل: ${failCount}.\n${duplicateWarnings}`
        });
      } else if (importTarget === 'deductions') {
        // Deductions Import
        lines.forEach((line, idx) => {
          if (idx === 0) return; // Header Row
          if (!line.trim()) return;

          const cols = line.includes('\t') ? line.split('\t') : line.split(',');
          if (cols.length < 2) {
            failCount++;
            return;
          }

          const drvName = cols[0]?.trim();
          const amt = Number(cols[1]?.trim() || '0');
          const dDate = normalizeDateToYmd(cols[2]?.trim() || new Date().toISOString().split('T')[0]);

          const targetDriver = matchDriverByName(drvName);
          if (!targetDriver) {
            duplicateWarnings += ` • السائق صاحب الاسم [${drvName}] غير مسجل، تعذر تسجيل الخصم المالي له.\n`;
            failCount++;
          } else {
            db.applyIndividualDeduction(targetDriver.id, amt, "خصم مستقطع", dDate);
            successCount++;
          }
        });
        setImportStatus({
          type: 'success',
          message: `تم تلبية استيراد الخصومات والعهد للموظفين بالاسم: تسييل ${successCount} عمليات استقطاع مالي بنجاح. فشل/تعديل: ${failCount}.\n${duplicateWarnings}`
        });
      }
      setPastedValue('');
    } catch (e: any) {
      setImportStatus({ type: 'error', message: `فشل التحليل: ${e.message}` });
    }
  };
  // Export dataset tool logic
  const handleExportData = (target: 'cars' | 'drivers' | 'violations' | 'deductions') => {
    let headers = '';
    let rows = '';

    if (target === 'cars') {
      headers = 'حرف,رقم السيارة,الموديل,ماركة السيارة,نوع السيارة,رقم الشاسيه,رقم الموتور,الشركة,تاريخ انتهاء الترخيص,المرور,مسؤول الترخيص,الرقم التأميني للسيارة,السائق,حالة الطفاية\n';
      rows = db.cars.map(c => {
        const numbersMatch = c.car_number.match(/\d+/);
        let num = '';
        let letters = '';
        if (numbersMatch) {
          num = numbersMatch[0];
          letters = c.car_number.replace(num, '').replace(/\s+/g, ' ').trim();
        } else {
          num = c.car_number;
        }

        const official = db.officials.find(o => o.id === c.license_official_id);
        const driver = db.drivers.find(d => d.id === c.driver_id);
        const officialName = official ? official.name : '';
        const driverName = driver ? driver.name : '';

        let extText = "سليمة";
        if (c.extinguisher_status === "warning") extText = "تحذير";
        else if (c.extinguisher_status === "expired") extText = "منتهية";

        return `${letters},${num},${c.model || ''},${c.brand || ''},${c.car_type || ''},${c.chassis_number},${c.motor_number},${c.owner_company},${c.license_end_date},${c.traffic_office || ''},${officialName},${c.insurance_status || ''},${driverName},${extText}`;
      }).join('\n');
    } else if (target === 'drivers') {
      headers = 'كود السائق,اسم السائق,الرقم القومي,رقم الهاتف,نهاية الترخيص\n';
      rows = db.drivers.map(d => `${d.driver_code},${d.name},${d.national_id},${d.phone},${d.license_end_date}`).join('\n');
    } else if (target === 'violations') {
      headers = 'تاريخ المخالفة,رقم السيارة,اسم السائق,وصف المخالفة,المبلغ\n';
      rows = db.violations.map(v => {
        const d = db.drivers.find(drv => drv.id === v.driver_id);
        const name = d ? d.name : '';
        return `${v.violation_date},${v.car_number},${name},${v.description},${v.amount}`;
      }).join('\n');
    } else if (target === 'deductions') {
      headers = 'اسم السائق,المبلغ,تاريخ الخصم\n';
      rows = db.movements.filter(m => m.type === 'deduction').map(m => {
        const d = db.drivers.find(drv => drv.id === m.driver_id);
        const name = d ? d.name : '';
        return `${name},${Math.abs(m.amount_change)},${m.date}`;
      }).join('\n');
    }
 
     const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.href = url;
     link.setAttribute('download', `${target}_report_${new Date().toISOString().split('T')[0]}.csv`);
     link.click();
   };
  // Quick preset data loaders for client test
  const loadPresetCsvTemplate = (target: 'cars' | 'drivers' | 'violations' | 'deductions') => {
    if (target === 'cars') {
      setPastedValue(`حرف	رقم السيارة	الموديل	ماركة السيارة	نوع السيارة	رقم الشاسيه	رقم الموتور	الشركة	تاريخ انتهاء الترخيص	المرور	مسؤول الترخيص	الرقم التأميني للسيارة	السائق	حالة الطفاية
ط ي ع	2468	2022	مرسيدس أكتروس	شاحنة نقل ثقيل	CH4444444444C	M444444	البنا ترانس لخدمات اللوجستيك	2026-10-15	مرور عبود فرعي الجيزة	م. أحمد البنا	654321	عبد الرحمن السيد	ساري
س ص ع	1357	2021	فولفو FMX	جرار رئيسي	CH5555555555D	M555555	مجموعة البنا للتشييد	2026-12-05	مرور العباسية الرئيسي	أ. محمود عبد العزيز	987654	محمد ربيع الشافعي	تحذير`);
    } else if (target === 'drivers') {
      setPastedValue(`كود السائق,اسم السائق,الرقم القومي,رقم الهاتف,نهاية الترخيص
101,أحمد البنا عبد الله,29104050102345,01099887766,2026-09-18
102,محمود علي الجيار,28905100104321,01122334455,2027-01-20`);
    } else if (target === 'violations') {
      setPastedValue(`تاريخ المخالفة,رقم السيارة,اسم السائق,وصف المخالفة,المبلغ
2026-06-01,ب ب ب 1234,أحمد البنا عبد الله,رادار سرعة زائدة بمحور روض الفرج,500
2026-06-03,أ ع د 9876,محمود علي الجيار,انتظار خاطئ في الممنوع بوسط البلد,150`);
    } else if (target === 'deductions') {
      setPastedValue(`اسم السائق,المبلغ,تاريخ الخصم
أحمد البنا عبد الله,350,2026-06-01
محمود علي الجيار,150,2026-06-03`);
    }
  };

  // Helper to extract numeric part of a car plate number
  const getCarSortVal = (carNumberStr: string): number => {
    const digits = carNumberStr.match(/\d+/);
    return digits ? parseInt(digits[0], 10) : Infinity;
  };

  // Filter lists with natural sorting for cars based on plate numbers
  const filteredCars = db.cars.filter(car =>
    car.car_number.includes(carSearch) ||
    car.chassis_number.includes(carSearch) ||
    car.owner_company.includes(carSearch)
  ).sort((a, b) => {
    const numA = getCarSortVal(a.car_number);
    const numB = getCarSortVal(b.car_number);
    if (numA !== numB) {
      return numA - numB;
    }
    // Secondary fallback: alphabetical sort of the plate characters (locale-aware for Arabic)
    return a.car_number.localeCompare(b.car_number, 'ar-EG');
  });

  const filteredDrivers = db.drivers.filter(drv =>
    drv.name.includes(driverSearch) ||
    drv.driver_code.includes(driverSearch) ||
    drv.national_id.includes(driverSearch)
  );

  // List of all companies dynamically combined: from database store + registered in all cars currently in local db
  const allCompaniesCombined = Array.from(
    new Set([
      ...db.companies,
      ...db.cars.map(c => c.owner_company).filter(Boolean)
    ])
  );

  return (
    <div className="space-y-6" id="cars_drivers_tab" style={{ direction: 'rtl' }}>
      
      {/* Tab select bar */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setPanelMode('cars')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all ${panelMode === 'cars' ? 'border-emerald-600 text-emerald-700 bg-emerald-500/5' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <CarIcon className="w-4 h-4" />
          تهيئة السيارات والأسطول ({db.cars.length})
        </button>
        <button
          onClick={() => setPanelMode('drivers')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all ${panelMode === 'drivers' ? 'border-emerald-600 text-emerald-700 bg-emerald-500/5' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Users2 className="w-4 h-4" />
          سجل السائقين والطاقم ({db.drivers.length})
        </button>
        <button
          onClick={() => setPanelMode('import')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all ${panelMode === 'import' ? 'border-emerald-600 text-emerald-700 bg-emerald-500/5' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          بوابة استيراد وتصدير Excel (POI)
        </button>
      </div>

      {panelMode === 'cars' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Create/Edit Car */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 border-b border-slate-50 pb-2.5 flex items-center gap-2 text-sm md:text-base">
              {editingCar ? <Edit3 className="w-4 h-4 text-emerald-500" /> : <Plus className="w-4 h-4 text-emerald-500" />}
              {editingCar ? 'تحديث مبيانات سيارة حالية' : 'إضافة سيارة جديدة يدويًا'}
            </h3>

            <form onSubmit={handleSaveCar} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">رقم السيارة (لوحة المرور)</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أ ب ج 1234"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                  value={carNumber}
                  onChange={(e) => setCarNumber(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">رقم الشاسيه</label>
                  <input
                    type="text"
                    required
                    placeholder="CH..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono text-[11px]"
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">رقم الموتور</label>
                  <input
                    type="text"
                    required
                    placeholder="M..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono text-[11px]"
                    value={motorNumber}
                    onChange={(e) => setMotorNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-500 font-bold mb-1 text-[11px]">ماركة السيارة</label>
                  <input
                    type="text"
                    placeholder="مثال: مرسيدس"
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 text-[11px]"
                    value={carBrand}
                    onChange={(e) => setCarBrand(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 text-[11px]">الموديل</label>
                  <input
                    type="text"
                    placeholder="مثال: 2022"
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 text-[11px]"
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 text-[11px]">نوع السيارة</label>
                  <input
                    type="text"
                    placeholder="مثال: شاحنة"
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 text-[11px]"
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-500 font-bold text-xs">الشركة المالكة للسيارة</label>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    list="companies-datalist"
                    placeholder="اكتب اسم الشركة أو اختر من القائمة"
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium text-xs"
                    value={ownerCompany}
                    onChange={(e) => setOwnerCompany(e.target.value)}
                  />
                  <datalist id="companies-datalist">
                    {allCompaniesCombined.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </datalist>
                </div>

                {/* قائمة إدارة الشركات المسجلة وإمكانية الحذف السريع والكامل */}
                {allCompaniesCombined.length > 0 && (
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg space-y-1 mt-1">
                    <span className="text-[10px] text-slate-400 font-extrabold block mb-1">الشركات المسجلة (اضغط للاختيار أو على ✕ لحذفها من المقترحات):</span>
                    <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto p-0.5">
                      {allCompaniesCombined.map(c => (
                        <div key={c} className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-[10px] font-bold text-slate-700 transition-colors shadow-sm">
                          <button
                            type="button"
                            onClick={() => setOwnerCompany(c)}
                            className="hover:text-emerald-600 transition-colors block text-right font-black"
                            title="اضغط لاختيار هذه الشركة"
                          >
                            {c}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف الشركة "${c}" نهائياً من قاعدة بيانات مقترحات السيستم؟\n(ملاحظة: لن يتم حذف اسم الشركة من السيارات القديمة المسجلة بها، ولكنها لن تظهر في المقترحات بعد الآن).`)) {
                                db.deleteCompany(c);
                                if (ownerCompany === c) {
                                  setOwnerCompany("");
                                }
                              }
                            }}
                            className="text-rose-500 hover:text-rose-700 font-black px-1 hover:bg-rose-50 rounded transition-all text-[11px]"
                            title="حذف من مقترحات النظام"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">مسؤول التراخيص المشرف</label>
                <select
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium"
                  value={licenseOfficialId}
                  onChange={(e) => setLicenseOfficialId(e.target.value)}
                >
                  <option value="">-- اختر مشرف التراخيص --</option>
                  {db.officials.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">السائق الحالي للمركبة</label>
                <select
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">-- اختر السائق المكلف --</option>
                  {db.drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} (كود: {d.driver_code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">تاريخ نهاية الترخيص الفعلي</label>
                <input
                  type="date"
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                  value={licenseEndDate}
                  onChange={(e) => setLicenseEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">موقف وبيانات التأمين</label>
                <input
                  type="text"
                  placeholder="مثال: ساري - مصر للتأمين"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium"
                  value={insuranceStatus}
                  onChange={(e) => setInsuranceStatus(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">إدارة المرور / جهة الترخيص</label>
                <input
                  type="text"
                  placeholder="مثال: مرور عبود الرئيسي"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-medium"
                  value={trafficOffice}
                  onChange={(e) => setTrafficOffice(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">موقف وحالة طفاية الحريق</label>
                <select
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                  value={extinguisherStatus}
                  onChange={(e) => setExtinguisherStatus(e.target.value as any)}
                >
                  <option value="valid">صاحلة ومطابقة ✔ (سليمة)</option>
                  <option value="warning">تقترب من الفحص ⚠️ (تحذير)</option>
                  <option value="expired">غير صالحة أو منتهية ❌ (حرجة)</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors text-center"
                >
                  {editingCar ? 'حفظ التعديلات' : 'إدراج سيارة جديدة'}
                </button>
                {editingCar && (
                  <button
                    onClick={() => {
                      setEditingCar(null);
                      setCarNumber('');
                      setChassisNumber('');
                      setMotorNumber('');
                      setLicenseEndDate('');
                      setCarModel('');
                      setCarBrand('');
                      setCarType('');
                    }}
                    type="button"
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2.5 rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Cars List rendering */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <h3 className="font-bold text-slate-800 text-sm md:text-base">سجلات أسطول شاحنات وسيارات البنا جروب</h3>
              <div className="relative text-xs w-full max-w-xs">
                <input
                  type="text"
                  placeholder="ابحث بالمرقم، شاسيه أو الشركة..."
                  className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  value={carSearch}
                  onChange={(e) => setCarSearch(e.target.value)}
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-right table-auto border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="py-2.5 px-3 font-semibold text-slate-600">حرف</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">رقم السيارة</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">الموديل</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">ماركة السيارة</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">نوع السيارة</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">رقم الشاسيه</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">رقم الموتور</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">الشركة</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">تاريخ انتهاء الترخيص</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">المرور</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">مسؤول الترخيص</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">الرقم التأميني للسيارة</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">السائق</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-600">حالة الطفاية</th>
                    <th className="py-2.5 px-3 text-left font-semibold text-slate-600">خيارات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCars.map(car => {
                    const official = db.officials.find(o => o.id === car.license_official_id);
                    const driver = db.drivers.find(d => d.id === car.driver_id);
                    
                    const numbersMatch = car.car_number.match(/\d+/);
                    let plateNumber = '';
                    let plateLetters = '';
                    if (numbersMatch) {
                      plateNumber = numbersMatch[0];
                      plateLetters = car.car_number.replace(plateNumber, '').replace(/\s+/g, ' ').trim();
                    } else {
                      plateNumber = car.car_number;
                    }

                    return (
                      <tr key={car.id} className="border-b border-slate-100 hover:bg-slate-50 font-sans">
                        {/* 1. حرف */}
                        <td className="py-3 px-3 font-mono font-bold text-slate-800 text-center bg-slate-50/40">{plateLetters || '-'}</td>
                        {/* 2. رقم السيارة */}
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-1 rounded inline-block text-center font-mono select-all">
                            {plateNumber || '-'}
                          </span>
                        </td>
                        {/* 3. الموديل */}
                        <td className="py-3 px-3 text-slate-600">{car.model || '-'}</td>
                        {/* 4. ماركة السيارة */}
                        <td className="py-3 px-3 text-slate-600">{car.brand || '-'}</td>
                        {/* 5. نوع السيارة */}
                        <td className="py-3 px-3 text-slate-500">{car.car_type || '-'}</td>
                        {/* 6. رقم الشاسيه */}
                        <td className="py-3 px-3 font-mono font-semibold text-slate-700">{car.chassis_number}</td>
                        {/* 7. رقم الموتور */}
                        <td className="py-3 px-3 font-mono text-slate-500">{car.motor_number}</td>
                        {/* 8. الشركة */}
                        <td className="py-3 px-3 text-slate-600 font-medium">{car.owner_company}</td>
                        {/* 9. تاريخ انتهاء الترخيص */}
                        <td className="py-3 px-3 font-mono font-bold text-slate-700">{car.license_end_date}</td>
                        {/* 10. المرور */}
                        <td className="py-3 px-3 font-semibold text-indigo-700">{car.traffic_office || '-'}</td>
                        {/* 11. مسؤول الترخيص */}
                        <td className="py-3 px-3 text-slate-600 font-semibold">{official?.name || "مشرف غير محدد"}</td>
                        {/* 12. الرقم التأميني للسيارة */}
                        <td className="py-3 px-3 font-mono text-slate-500">{car.insurance_status || '-'}</td>
                        {/* 13. السائق */}
                        <td className="py-3 px-3 text-emerald-700 font-bold">{driver?.name || "سائق غير محدد"}</td>
                        {/* 14. حالة الطفاية */}
                        <td className="py-3 px-3">
                          {car.extinguisher_status === 'valid' && <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-500/10">سليمة ✔</span>}
                          {car.extinguisher_status === 'warning' && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-500/10">تحذير ⚠️</span>}
                          {car.extinguisher_status === 'expired' && <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-500/10">منتهية ❌</span>}
                        </td>
                        {/* خيارات */}
                        <td className="py-3 px-3 text-left space-x-1 space-x-reverse">
                          <button
                            onClick={() => handleEditCarClick(car)}
                            type="button"
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-md transition-all inline-block"
                            title="تعديل"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف السيارة ${car.car_number} من قاعدة البيانات؟`)) {
                                db.deleteCar(car.id);
                              }
                            }}
                            type="button"
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-md transition-all inline-block"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCars.length === 0 && (
                    <tr>
                      <td colSpan={15} className="py-10 text-center text-slate-400">لا توجد نتائج مطابقة لبحثك.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {panelMode === 'drivers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Create/Edit Driver */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 border-b border-slate-50 pb-2.5 flex items-center gap-2 text-sm">
              {editingDriver ? <Edit3 className="w-4 h-4 text-emerald-500" /> : <Plus className="w-4 h-4 text-emerald-500" />}
              {editingDriver ? 'تعديل بيانات سائق' : 'إضافة سائق جديد يدويًا'}
            </h3>

            <form onSubmit={handleSaveDriver} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">كود السائق (كود فريد)</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 106"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono"
                  value={driverCode}
                  onChange={(e) => setDriverCode(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">اسم السائق الثلاثي</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: صالح محمود الجوهري"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">رقم بطاقة السائق الوطنية (14 رقمًا)</label>
                <input
                  type="text"
                  required
                  maxLength={14}
                  placeholder="مثال: 29509200101456"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono text-[11px]"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">رقم هاتف السائق</label>
                <input
                  type="text"
                  placeholder="مثال: 0101235678"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">نهاية ترخيص رخصته الشخصية</label>
                <input
                  type="date"
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-800"
                  value={driverLicenseEndDate}
                  onChange={(e) => setDriverLicenseEndDate(e.target.value)}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors text-center"
                >
                  {editingDriver ? 'حفظ التغييرات' : 'إدراج سائق كادر'}
                </button>
                {editingDriver && (
                  <button
                    onClick={() => {
                      setEditingDriver(null);
                      setDriverCode('');
                      setDriverName('');
                      setNationalId('');
                      setPhone('');
                      setDriverLicenseEndDate('');
                    }}
                    type="button"
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2.5 rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Drivers List rendering */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">سجلات وبيانات السائقين الرسميين</h3>
              <div className="relative text-xs w-full max-w-xs">
                <input
                  type="text"
                  placeholder="ابحث بالكود، الاسم، أو الرقم القومي..."
                  className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="py-2.5 px-3">كود السائق</th>
                    <th className="py-2.5 px-3">اسم السواق</th>
                    <th className="py-2.5 px-3">الرقم القومي</th>
                    <th className="py-2.5 px-3">رقم التليفون</th>
                    <th className="py-2.5 px-3">نهاية ترخيص رخصته</th>
                    <th className="py-2.5 px-3 text-left">خيارات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map(drv => (
                    <tr key={drv.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {drv.driver_code}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-800">{drv.name}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{drv.national_id}</td>
                      <td className="py-3 px-3 font-mono text-slate-700">{drv.phone}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">{drv.license_end_date}</td>
                      <td className="py-3 px-3 text-left space-x-1 space-x-reverse">
                        <button
                          onClick={() => handleEditDriverClick(drv)}
                          type="button"
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-md transition-all inline-block"
                          title="تعديل السائق"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`هل ترغب حظر وحذف السائق لقاعدة البيانات؟ السائق: ${drv.name}`)) {
                              db.deleteDriver(drv.id);
                            }
                          }}
                          type="button"
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-md transition-all inline-block"
                          title="حذف السائق"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredDrivers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">لا يوجد أية برامج سائقين مطابقة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {panelMode === 'import' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              منصة استيراد وتصدير حزم Excel والبيانات الكبيرة (Apache POI Simulator)
            </h3>
            <p className="text-xs text-slate-400 mt-1">تتيح لك الاستيراد المباشر لمحاضر الإكسل الخاصة بأسطول السيارات وعرين السائقين دون تكرار البيانات</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-dotted border-slate-300 space-y-3">
                <h4 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  أدوات التصدير وقوالب الإكسل الجاهزة
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">يمكنك تحميل كشوف البيانات الفعلية المتزامنة حاليًا بصيغة Excel CSV لفتحها ببرمجيات الجداول دفتريًا:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleExportData('cars')}
                    type="button"
                    className="bg-slate-800 hover:bg-slate-700 text-white py-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    تصدير ملف السيارات
                  </button>
                  <button
                    onClick={() => handleExportData('drivers')}
                    type="button"
                    className="bg-slate-800 hover:bg-slate-700 text-white py-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    تصدير ملف السائقين
                  </button>
                  <button
                    onClick={() => handleExportData('violations')}
                    type="button"
                    className="bg-slate-800 hover:bg-slate-700 text-white py-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    تصدير ملف المخالفات
                  </button>
                  <button
                    onClick={() => handleExportData('deductions')}
                    type="button"
                    className="bg-slate-800 hover:bg-slate-700 text-white py-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    تصدير ملف الخصومات
                  </button>
                </div>
              </div>

              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-500/10 space-y-3">
                <h4 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  بروتوكولات فحص التداخل ومنع التكرار (Unique Excel Validation)
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  عند سحب ملف CSV، يعمل الكود السحابي آليًا على مطابقة المدخلات بقوانين الفهرس الفريد، ويتخطى تلقائيًا أية قيود مسجلة مسبقاً لحماية تكامل الجداول.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                  <button
                    onClick={() => loadPresetCsvTemplate('cars')}
                    type="button"
                    className="bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-700 rounded transition-all text-[10px]"
                  >
                    تنزيل داتا سيارات تجريبية
                  </button>
                  <button
                    onClick={() => loadPresetCsvTemplate('drivers')}
                    type="button"
                    className="bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-700 rounded transition-all text-[10px]"
                  >
                    تنزيل داتا سائقين تجريبية
                  </button>
                  <button
                    onClick={() => loadPresetCsvTemplate('violations')}
                    type="button"
                    className="bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-700 rounded transition-all text-[10px]"
                  >
                    تنزيل داتا مخالفات تجريبية
                  </button>
                  <button
                    onClick={() => loadPresetCsvTemplate('deductions')}
                    type="button"
                    className="bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-700 rounded transition-all text-[10px]"
                  >
                    تنزيل داتا خصومات تجريبية
                  </button>
                </div>
              </div>

              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-500/10 space-y-2">
                <h4 className="font-bold text-xs text-indigo-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                  الترتيب المطلوب لأعمدة استيراد وتصدير السيارات
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  الترتيب الأساسي حسب ترتيب وحركة الأعمدة في ملف الإكسيل للحفاظ على تطابق البيانات:
                </p>
                <div className="bg-white p-3 rounded-lg border border-indigo-100 font-sans text-xs text-slate-700 space-y-1.5 leading-relaxed">
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-700">1. حرف</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-indigo-700">2. رقم السيارة</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-indigo-700">3. الموديل</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-700">4. ماركة السيارة</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-indigo-700">5. نوع السيارة</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-indigo-700">6. رقم الشاسيه</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-700">7. رقم الموتور</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-indigo-700">8. الشركة</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-indigo-700">9. تاريخ انتهاء الترخيص</span>
                  </div>
                  <div className="flex gap-2 text-emerald-800">
                    <span className="font-bold">10. المرور</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold">11. مسؤول الترخيص</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold">12. الرقم التأميني للسيارة</span>
                  </div>
                  <div className="flex gap-2 text-indigo-800">
                    <span className="font-bold">13. السائق</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold">14. حالة الطفاية</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  * اضغط على زر <strong className="text-indigo-700">"تنزيل داتا سيارات تجريبية"</strong> أعلاه لملء الحقل بملف نموذج تمثيلي جاهز مباشرةً بالصيغة الصحيحة.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-600">هدف الاستيراد البرمجي الحالي:</span>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={importTarget === 'cars'}
                      onChange={() => setImportTarget('cars')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    السيارات والأسطول (Cars)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={importTarget === 'drivers'}
                      onChange={() => setImportTarget('drivers')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    سجل السائقين والطواقم (Drivers)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={importTarget === 'violations'}
                      onChange={() => setImportTarget('violations')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    مخالفات السير والسيارات (Violations)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={importTarget === 'deductions'}
                      onChange={() => setImportTarget('deductions')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    استقطاعات وخصومات السائقين (Deductions)
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-600">
                  ألصق هنا أسطر CSV أو التكست الذكي المراد سحبه:
                </label>
                <textarea
                  className="w-full h-36 bg-slate-900 text-emerald-400 p-3.5 rounded-xl border border-slate-800 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder={
                    importTarget === 'cars'
                      ? "الترتيب المطلوب: حرف,رقم السيارة,الموديل,ماركة السيارة,نوع السيارة,رقم الشاسيه,رقم الموتور,الشركة,تاريخ انتهاء الترخيص,المرور,مسؤول الترخيص,الرقم التأميني للسيارة,السائق,حالة الطفاية"
                      : importTarget === 'drivers'
                      ? "كود السائق,اسم السائق,الرقم القومي,رقم الهاتف,نهاية الترخيص"
                      : importTarget === 'violations'
                      ? "تاريخ المخالفة,رقم السيارة,اسم السائق,وصف المخالفة,المبلغ"
                      : "اسم السائق,المبلغ,تاريخ الخصم"
                  }
                  value={pastedValue}
                  onChange={(e) => setPastedValue(e.target.value)}
                ></textarea>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleProcessImport}
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
                >
                  <Upload className="w-4 h-4" />
                  بدء فحص ومعالجة الرفع الساقي (Apache POI Stream)
                </button>
              </div>

              {importStatus.type && (
                <div className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs ${importStatus.type === 'success' ? 'bg-emerald-50 border-emerald-500/20 text-emerald-800' : 'bg-red-50 border-red-500/20 text-red-800'}`}>
                  {importStatus.type === 'success' ? (
                    <span className="p-1 bg-emerald-500 text-white rounded-full"><Check className="w-3.5 h-3.5" /></span>
                  ) : (
                    <span className="p-1 bg-red-500 text-white rounded-full"><X className="w-3.5 h-3.5" /></span>
                  )}
                  <div className="space-y-1">
                    <h5 className="font-bold">حالة الرفع والفلترة السيرفر:</h5>
                    <pre className="font-sans whitespace-pre-line text-[11px] leading-relaxed">{importStatus.message}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

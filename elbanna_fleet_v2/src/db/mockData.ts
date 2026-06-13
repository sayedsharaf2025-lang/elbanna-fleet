/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Driver, Official, Car, Violation, Invoice, InvoiceItem, InvoiceAuditLog, DriverAccountMovement } from '../types';

export const INITIAL_OFFICIALS: Official[] = [
  {
    id: "1",
    name: "م. أحمد البنا",
    cash_custody: 50000,
    visa_custody: 100000
  },
  {
    id: "2",
    name: "أ. محمود عبد العزيز",
    cash_custody: 25000,
    visa_custody: 40000
  },
  {
    id: "3",
    name: "م. سامح الجارحي",
    cash_custody: 15000,
    visa_custody: 20000
  }
];

export const INITIAL_DRIVERS: Driver[] = [
  {
    id: "d1",
    driver_code: "101",
    name: "عبد الرحمن السيد",
    national_id: "29505120101456",
    phone: "01011223344",
    license_end_date: "2026-12-15",
    balance: 500
  },
  {
    id: "d2",
    driver_code: "102",
    name: "محمد ربيع الشافعي",
    national_id: "29204050101789",
    phone: "01122334455",
    license_end_date: "2026-08-20",
    balance: 1200
  },
  {
    id: "d3",
    driver_code: "103",
    name: "محمود أبو المجد",
    national_id: "28811120103412",
    phone: "01233445566",
    license_end_date: "2026-05-10", // Expired
    balance: 0
  },
  {
    id: "d4",
    driver_code: "104",
    name: "عماد حمدي الديب",
    national_id: "29909240101953",
    phone: "01544556677",
    license_end_date: "2026-06-25", // Near expiry (approx 19 days from June 6, 2026)
    balance: 350
  },
  {
    id: "d5",
    driver_code: "105",
    name: "هاني سلامة غانم",
    national_id: "28401070104123",
    phone: "01099887766",
    license_end_date: "2026-07-12",
    balance: 800
  }
];

export const INITIAL_CARS: Car[] = [
  {
    id: "c1",
    car_number: "أ ب ج 1234",
    chassis_number: "CH9876543210X",
    motor_number: "M112233445",
    owner_company: "مجموعة البنا للتشييد",
    license_official_id: "1",
    driver_id: "d1",
    license_end_date: "2026-11-30",
    insurance_status: "ساري - مصر للتأمين",
    extinguisher_status: "valid",
    model: "2022",
    brand: "مرسيدس أكتروس",
    car_type: "شاحنة نقل ثقيل"
  },
  {
    id: "c2",
    car_number: "د هـ و 5678",
    chassis_number: "CH2468101214Y",
    motor_number: "M246810123",
    owner_company: "البنا ترانس لخدمات اللوجستيك",
    license_official_id: "2",
    driver_id: "d2",
    license_end_date: "2027-02-15",
    insurance_status: "ساري - أليانز للشركات",
    extinguisher_status: "valid",
    model: "2021",
    brand: "فولفو FMX",
    car_type: "جرار رئيسي"
  },
  {
    id: "c3",
    car_number: "ر س ط 9012",
    chassis_number: "CH1357911131Z",
    motor_number: "M135791113",
    owner_company: "مجموعة البنا للتشييد",
    license_official_id: "1",
    driver_id: "d3",
    license_end_date: "2026-05-15", // Expired
    insurance_status: "منتهي الصلاحية",
    extinguisher_status: "expired",
    model: "2018",
    brand: "مان TGS",
    car_type: "مقطورة قلاب"
  },
  {
    id: "c4",
    car_number: "ق ر ش 3456",
    chassis_number: "CH8888888888A",
    motor_number: "M888888888",
    owner_company: "البنا الخرسانية",
    license_official_id: "3",
    driver_id: "d4",
    license_end_date: "2026-06-28", // Near expiry (22 days from current time of June 6, 2026)
    insurance_status: "ساري - قناة السويس",
    extinguisher_status: "warning",
    model: "2023",
    brand: "سكانيا P410",
    car_type: "خلاطة خرسانة"
  },
  {
    id: "c5",
    car_number: "ل م ن 7890",
    chassis_number: "CH7777777777B",
    motor_number: "M777777777",
    owner_company: "البنا ترانس لخدمات اللوجستيك",
    license_official_id: "2",
    driver_id: "d5",
    license_end_date: "2026-10-05",
    insurance_status: "ساري - المجموعة العربية",
    extinguisher_status: "valid",
    model: "2020",
    brand: "مرسيدس أكتروس",
    car_type: "شاحنة نقل ثقيل"
  },
  {
    id: "c_ref_2547",
    car_number: "ر ا ق 2547",
    chassis_number: "CH-2547-XYZ",
    motor_number: "M-2547-ABC",
    owner_company: "مجموعة البنا للتشييد",
    license_official_id: "1",
    driver_id: "d1",
    license_end_date: "2027-06-15",
    insurance_status: "ساري",
    extinguisher_status: "valid",
    model: "2024",
    brand: "مرسيدس أكتروس",
    car_type: "شاحنة نقل ثقيل",
    license_total_cost: 10410
  },
  {
    id: "c_ref_3171",
    car_number: "ر د م 3171",
    chassis_number: "CH-3171-XYZ",
    motor_number: "M-3171-ABC",
    owner_company: "البنا ترانس لخدمات اللوجستيك",
    license_official_id: "1",
    driver_id: "d2",
    license_end_date: "2027-05-20",
    insurance_status: "ساري",
    extinguisher_status: "valid",
    model: "2024",
    brand: "فولفو FMX",
    car_type: "جرار رئيسي",
    license_total_cost: 1130
  }
];

export const INITIAL_VIOLATIONS: Violation[] = [
  {
    id: "v1",
    violation_date: "2026-05-10",
    car_number: "أ ب ج 1234",
    driver_id: "d1",
    description: "تجاوز السرعة المقررة على طريق السويس الإقليمي",
    amount: 500
  },
  {
    id: "v2",
    violation_date: "2026-05-22",
    car_number: "د هـ و 5678",
    driver_id: "d2",
    description: "عدم الالتزام بالحارة المرورية المخصصة للنقل الثقيل",
    amount: 1000
  },
  {
    id: "v3",
    violation_date: "2026-06-01",
    car_number: "ل م ن 7890",
    driver_id: "d5",
    description: "انتظار خاطئ في مكان غير مخصص",
    amount: 300
  }
];

export const INITIAL_INVOICES: Invoice[] = [
  {
    id: "inv1",
    invoice_number: "INV-2026-0001",
    invoice_date: "2026-05-15",
    official_id: "1",
    total_amount: 1800,
    version: 1,
    is_modified: false,
    is_deleted: false
  },
  {
    id: "inv2",
    invoice_number: "INV-2026-0002",
    invoice_date: "2026-05-28",
    official_id: "2",
    total_amount: 2400,
    version: 1,
    is_modified: false,
    is_deleted: false
  },
  {
    id: "inv_ref_2547",
    invoice_number: "INV-2026-0003",
    invoice_date: "2026-06-12",
    official_id: "1",
    total_amount: 10410,
    version: 1,
    is_modified: false,
    is_deleted: false,
    car_id: "c_ref_2547",
    license_details: "رسوم تجديد ترخيص السيارة وجدولة الفحص ومعاينات طفايات الحريق واستصدار الملصق المروري للسيارة ر ا ق 2547"
  },
  {
    id: "inv_ref_3171",
    invoice_number: "INV-2026-0004",
    invoice_date: "2026-06-13",
    official_id: "1",
    total_amount: 1130,
    version: 1,
    is_modified: false,
    is_deleted: false,
    car_id: "c_ref_3171",
    license_details: "رسوم تجديد ترخيص السيارة وجدولة الفحص ومعاينات طفايات الحريق واستصدار الملصق المروري للسيارة ر د م 3171"
  }
];

export const INITIAL_INVOICE_ITEMS: InvoiceItem[] = [
  {
    id: "item1",
    invoice_id: "inv1",
    car_id: "c1",
    description: "رسوم تجديد فحص بيئي مروري وطفاية حريق جديدة",
    amount: 1200,
    payment_method: "cash"
  },
  {
    id: "item2",
    invoice_id: "inv1",
    car_id: "c1",
    description: "شراء ملصق إلكتروني وتأمين إجباري",
    amount: 600,
    payment_method: "visa"
  },
  {
    id: "item3",
    invoice_id: "inv2",
    car_id: "c2",
    description: "رسوم الفحص الفني بمرور التجمع للمقطورة خلفية",
    amount: 2400,
    payment_method: "visa"
  },
  {
    id: "item_ref_2547",
    invoice_id: "inv_ref_2547",
    car_id: "c_ref_2547",
    description: "رسوم تجديد ترخيص وجدولة فحص السيارة ر ا ق 2547 فحص مروري كامل معتمد",
    amount: 10410,
    payment_method: "cash"
  },
  {
    id: "item_ref_3171",
    invoice_id: "inv_ref_3171",
    car_id: "c_ref_3171",
    description: "رسوم ترخيص وتأمين إجباري واستصدار ملصقات للسيارة ر د م 3171 فحص وغيار طفاية وتأمين",
    amount: 1130,
    payment_method: "cash"
  }
];

export const INITIAL_AUDIT_LOGS: InvoiceAuditLog[] = [
  {
    id: "log1",
    invoice_id: "inv1",
    invoice_number: "INV-2026-0001",
    timestamp: "2026-05-15T10:30:00Z",
    supervisor_name: "م. أحمد البنا",
    operation_type: "create",
    old_value: "لا يوجد",
    new_value: "إنشاء فاتورة بقيمة إجمالية 1800 ج.م موزعة كالتالي: نقدي (1200)، فيزا (600)"
  },
  {
    id: "log2",
    invoice_id: "inv2",
    invoice_number: "INV-2026-0002",
    timestamp: "2026-05-28T14:15:00Z",
    supervisor_name: "أ. محمود عبد العزيز",
    operation_type: "create",
    old_value: "لا يوجد",
    new_value: "إنشاء فاتورة بقيمة إجمالية 2400 ج.م موزعة كالتالي: نقدي (0)، فيزا (2400)"
  }
];

export const INITIAL_ACCOUNT_MOVEMENTS: DriverAccountMovement[] = [
  {
    id: "mov1",
    driver_id: "d1",
    date: "2026-05-10",
    description: "مخالفة رقم v1: تجاوز السرعة المقررة على طريق السويس الإقليمي",
    amount_change: 500,
    new_balance: 500,
    type: "violation"
  },
  {
    id: "mov2",
    driver_id: "d2",
    date: "2026-05-22",
    description: "مخالفة رقم v2: عدم الالتزام بالحارة المرورية للنقل الثقيل",
    amount_change: 1000,
    new_balance: 1000,
    type: "violation"
  },
  {
    id: "mov3",
    driver_id: "d2",
    date: "2026-05-25",
    description: "خصم فردي مستقطع من الراتب الشهري لخطأ فني",
    amount_change: 200,
    new_balance: 1200,
    type: "deduction"
  },
  {
    id: "mov4",
    driver_id: "d5",
    date: "2026-06-01",
    description: "مخالفة رقم v3: انتظار خاطئ في مكان غير مخصص",
    amount_change: 300,
    new_balance: 300,
    type: "violation"
  },
  {
    id: "mov5",
    driver_id: "d5",
    date: "2026-06-03",
    description: "خصم مالي إضافي لتعليمات الأمن والسلامة",
    amount_change: 500,
    new_balance: 800,
    type: "deduction"
  }
];

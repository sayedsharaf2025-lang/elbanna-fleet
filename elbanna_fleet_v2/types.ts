/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  username: string;
  role: 'admin' | 'manager' | 'supervisor';
  officialId?: string; // ID of official if role is supervisor
  name: string;
}

export interface Driver {
  id: string; // UUID
  driver_code: string; // كود السواق
  name: string; // اسم السواق
  national_id: string; // رقم البطاقة
  phone: string; // رقم التليفون
  license_end_date: string; // نهاية ترخيص الرخصة
  balance: number; // الرصيد المالي المستحق (الخصومات)
}

export interface Official {
  id: string; // UUID
  name: string; // اسم المشرف/المسؤول
  cash_custody: number; // عهدة نقدي
  visa_custody: number; // عهدة فيزا
  password?: string; // كلمة المرور
}

export interface Car {
  id: string; // UUID
  car_number: string; // رقم السيارة (اللوحة)
  chassis_number: string; // رقم الشاسيه
  motor_number: string; // رقم الموتور
  owner_company: string; // الشركة المالكة
  license_official_id: string; // مسؤول التراخيص (ربط بـ Officials)
  driver_id: string; // السائق (ربط بـ Drivers)
  license_end_date: string; // نهاية الترخيص
  insurance_status: string; // التأمين
  extinguisher_status: 'valid' | 'expired' | 'warning'; // حالة طفاية الحريق
  model?: string; // الموديل
  brand?: string; // ماركة السيارة
  car_type?: string; // نوع السيارة
  traffic_office?: string; // جهة المرور
  license_total_cost?: number; // إجمالي مصروف الترخيص المتراكم
}

export interface Violation {
  id: string; // UUID
  violation_date: string; // تاريخ المخالفة
  car_number: string; // رقم السيارة
  driver_id: string; // السائق المستحق عليه المخالفة (ربط بـ Drivers)
  description: string; // وصف المخالفة
  amount: number; // مبلغ المخالفة
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  car_id: string; // السيارة المستهدفة بالصرف
  description: string; // وصف البند (رسوم فحص، طفاية، تأمين، الخ)
  amount: number; // القيمة المالّية
  payment_method: 'cash' | 'visa'; // طريقة الدفع
  account_id?: string; // الحساب الفرعي المستخدم في الدفع
  sort_order?: number; // ترتيب عرض البند
}

export interface Invoice {
  id: string;
  invoice_number: string; // رقم الفاتورة التسلسلي
  invoice_date: string; // تاريخ الفاتورة
  official_id: string; // المسؤول المنفذ للصرف
  total_amount: number;
  version: number; // رقم النسخة (مثال: نسخة معدلة رقم X)
  is_modified: boolean;
  is_deleted: boolean;
  car_id?: string; // السيارة المستهدفة (لأن الفاتورة لسيارة واحدة فقط)
  license_details?: string; // بيان الترخيص
  license_location?: string; // مكان الترخيص
  car_location?: string; // مكان السيارة
}

export interface CustodyAccount {
  id: string;
  official_id: string; // المسؤول المرتبط به الحساب
  name: string; // اسم الحساب الفرعي (مثال: كاش رئيسي، فيزا بنك مصر، فيزا التراخيص)
  type: 'cash' | 'visa' | 'other_visa';
  balance: number; // رصيد الحساب الحالي
}

export interface CustodyMovement {
  id: string;
  official_id: string;
  from_account_id?: string;
  to_account_id?: string;
  date: string;
  description: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'settlement' | 'invoice_charge';
}

export interface InvoiceAuditLog {
  id: string;
  invoice_id: string;
  invoice_number: string;
  timestamp: string; // وقت الحركة
  supervisor_name: string; // اسم المشرف القائم بالتغيير
  operation_type: 'create' | 'edit' | 'delete'; // نوع العملية
  old_value: string; // القيمة القديمة بصيغة نصية
  new_value: string; // القيمة الجديدة بصيغة نصية
}

export interface DriverAccountMovement {
  id: string;
  driver_id: string;
  car_id?: string; // السيارة المستهدفة بالخصم أو الحركة لتخصيص المخالفات
  date: string; // تاريخ الحركة
  description: string; // تفاصيل الحركة
  amount_change: number; // التغيير في الرصيد (مثال: -200 أو +200)
  new_balance: number; // الرصيد النهائي بعد الحركة
  type: 'deduction' | 'violation' | 'payment' | 'reversal'; // نوع الحركة
}

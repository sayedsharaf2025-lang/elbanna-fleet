/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Driver, Official, Car, Violation, Invoice, InvoiceItem, InvoiceAuditLog, DriverAccountMovement } from '../types';

// بيانات أولية فارغة — التطبيق يعتمد على السحابة فقط
export const INITIAL_OFFICIALS: Official[] = [];
export const INITIAL_DRIVERS: Driver[] = [];
export const INITIAL_CARS: Car[] = [];
export const INITIAL_VIOLATIONS: Violation[] = [];
export const INITIAL_INVOICES: Invoice[] = [];
export const INITIAL_INVOICE_ITEMS: InvoiceItem[] = [];
export const INITIAL_AUDIT_LOGS: InvoiceAuditLog[] = [];
export const INITIAL_ACCOUNT_MOVEMENTS: DriverAccountMovement[] = [];

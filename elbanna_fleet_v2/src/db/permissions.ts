/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// خريطة الصلاحيات الافتراضية للشاشات لكل رتبة — نفس القيم اللي كانت متثبتة (hardcoded) قبل كده
// في App.tsx، وبقت دلوقتي قابلة للتعديل من شاشة "خريطة صلاحيات الشاشات"
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['dashboard', 'transport_requests', 'fleet', 'violations', 'requests_tracking', 'license_tracking', 'custody_licensing', 'deductions', 'cross_accounts', 'reports', 'users_settings', 'transport_cost_settings', 'route_accounting', 'car_daily_costs', 'maintenance_requests', 'maintenance_parts', 'maintenance_review', 'maintenance_accounting', 'license_invoice_approvals', 'car_monthly_costs', 'driver_reports', 'fuel_logs', 'service_plans', 'vehicle_profitability', 'driver_tracking'],
  supervisor: ['custody_licensing', 'license_tracking', 'reports'],
  manager: ['reports', 'route_accounting', 'car_daily_costs', 'car_monthly_costs', 'driver_reports', 'fuel_logs', 'service_plans', 'vehicle_profitability'],
  movement_supervisor: ['requests_tracking', 'driver_tracking'],
  requests_agent: ['transport_requests'],
};

// لو أضفنا شاشة جديدة في تحديث لاحق، صلاحيات الرتب المحفوظة فعليًا (محليًا أو سحابيًا) من قبل
// التحديث ده مش هتعرف عنها حاجة، فالشاشة الجديدة مش هتظهر لحد — حتى لو الأدمن نفسه — رغم إنها
// موجودة في DEFAULT_ROLE_PERMISSIONS. الدالة دي بتحل المشكلة: أي معرّف شاشة مش موجود خالص في أي
// رتبة محفوظة (يعني شاشة جديدة تمامًا لسه محدش شافها) بنضيفه تلقائيًا لكل رتبة من المفروض
// تشوفه حسب الإعداد الافتراضي — من غير ما نلمس أي شاشة الأدمن شايلها بنفسه قبل كده.
export const mergeNewDefaultScreens = (saved: Record<string, string[]>): Record<string, string[]> => {
  const allSavedScreenIds = new Set(Object.values(saved).flat());
  const result: Record<string, string[]> = { ...saved };
  Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([role, defaultScreens]) => {
    if (!result[role]) {
      result[role] = defaultScreens;
      return;
    }
    const missingNewScreens = defaultScreens.filter(s => !allSavedScreenIds.has(s));
    if (missingNewScreens.length > 0) {
      result[role] = [...result[role], ...missingNewScreens];
    }
  });
  return result;
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// قراءة بيانات localStorage بأمان + تنضيف البيانات الوهمية القديمة (منقولة حرفيًا من store.tsx)

export const loadSavedArray = <T,>(key: string, defaultValue: T[]): T[] => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn(`Error parsing localStorage key "${key}":`, e);
  }
  return defaultValue;
};

// زي loadSavedArray بالظبط بس لكائن (object) مش مصفوفة — مستخدمة لخريطة صلاحيات الشاشات لكل رتبة
export const loadSavedObject = <T extends Record<string, any>>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...defaultValue, ...parsed };
      }
    }
  } catch (e) {
    console.warn(`Error parsing localStorage key "${key}":`, e);
  }
  return defaultValue;
};

// مسح البيانات الوهمية من localStorage عند أول تشغيل بعد التحديث
export const cleanupMockData = () => {
  const mockIds = ['d1','d2','d3','d4','d5','c1','c2','c3','c4','c5',
    'c_ref_2547','c_ref_3171','inv1','inv2','inv_ref_2547','inv_ref_3171',
    'item1','item2','item3','item_ref_2547','item_ref_3171',
    'v1','v2','v3','log1','log2','mov1','mov2','mov3','mov4','mov5',
    '1','2','3'];
  const cleaned = localStorage.getItem('elbanna_mock_cleaned_v3');
  if (!cleaned) {
    ['elbanna_drivers','elbanna_officials','elbanna_cars','elbanna_violations',
     'elbanna_invoices','elbanna_invoice_items','elbanna_audit_logs',
     'elbanna_movements','elbanna_custody_accounts','elbanna_companies'].forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const filtered = arr.filter((item: any) => !mockIds.includes(item.id));
            localStorage.setItem(k, JSON.stringify(filtered));
          }
        }
      } catch(e) {}
    });
    localStorage.setItem('elbanna_mock_cleaned_v3', '1');
  }
};

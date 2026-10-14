/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

// حالة بتتحفظ في sessionStorage — بنستخدمها لمسودات جداول الإدخال، عشان لو النظام عمل تسجيل خروج
// تلقائي بسبب الخمول أو الصفحة اتحدّثت، الأرقام اللي لسه ماتحفظتش ماتضيعش (بتتمسح لما التبويب يتقفل)
export function usePersistedState<T extends object>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as T;
      }
    } catch { /* التخزين غير متاح — نكمل بالذاكرة بس */ }
    return initial;
  });
  useEffect(() => {
    try {
      if (Object.keys(value).length === 0) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch { /* تجاهل */ }
  }, [key, value]);
  return [value, setValue];
}

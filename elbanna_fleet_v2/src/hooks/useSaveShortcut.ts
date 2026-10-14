/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { registerSaveHandler } from '../utils/shortcuts';

// الشاشة بتسجّل دالة الحفظ بتاعتها: Ctrl+S (اللي بيتلقطه App.tsx) بينفّذ آخر شاشة سجّلت
export function useSaveShortcut(onSave: () => void | Promise<void>, enabled = true) {
  const ref = useRef(onSave);
  ref.current = onSave;
  useEffect(() => {
    if (!enabled) return;
    return registerSaveHandler(() => ref.current());
  }, [enabled]);
}

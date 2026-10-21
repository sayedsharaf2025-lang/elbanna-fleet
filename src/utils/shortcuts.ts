/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// اختصارات لوحة المفاتيح العامة: Ctrl+S للحفظ و Ctrl+K للبحث السريع.
// الشاشة اللي فيها بيانات قابلة للحفظ بتسجّل "معالج حفظ"، وآخر شاشة اتسجّلت هي اللي بتتنفّذ.

export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const isCombo = (e: KeyLike, latin: string, arabic: string, code: string) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  // الكود الفيزيائي للمفتاح بيشتغل مهما كانت لغة الكيبورد (عربي/إنجليزي)
  if (e.code === code) return true;
  const k = (e.key || '').toLowerCase();
  return k === latin || k === arabic;
};

export const isSaveShortcut = (e: KeyLike) => isCombo(e, 's', 'س', 'KeyS');
export const isPaletteShortcut = (e: KeyLike) => isCombo(e, 'k', 'ن', 'KeyK');

type SaveHandler = () => void | Promise<void>;
const handlers: { id: number; fn: SaveHandler }[] = [];
let nextId = 1;

// تسجيل معالج حفظ. بترجع دالة إلغاء التسجيل
export function registerSaveHandler(fn: SaveHandler): () => void {
  const id = nextId++;
  handlers.push({ id, fn });
  return () => {
    const i = handlers.findIndex(h => h.id === id);
    if (i >= 0) handlers.splice(i, 1);
  };
}

// تنفيذ آخر معالج حفظ مسجّل. بترجع false لو مفيش شاشة مسجّلة
export function triggerSave(): boolean {
  const top = handlers[handlers.length - 1];
  if (!top) return false;
  void top.fn();
  return true;
}

export const __saveHandlerCount = () => handlers.length;

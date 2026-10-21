/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// توليد معرّفات السجلات (منقول حرفيًا من store.tsx)

export const generateId = (prefix: string) => {
  if (self.crypto?.randomUUID) {
    return self.crypto.randomUUID();
  }
  return prefix + "_" + Math.floor(Math.random() * 100000) + "_" + Date.now();
};

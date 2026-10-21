/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// تطبيع التواريخ لصيغة YYYY-MM-DD (منقول حرفيًا من store.tsx)
export const normalizeDateToYmd = (dateStr: string): string => {
  if (!dateStr || typeof dateStr !== 'string') return new Date().toISOString().split('T')[0];
  const cleaned = dateStr.trim();
  
  // Rule 0: ISO timestamp with T (e.g. 2026-06-22T10:30:00+00:00 or 2026-06-22T10:30:00Z)
  if (cleaned.includes('T')) {
    return cleaned.substring(0, 10);
  }

  // Rule 1: Correct format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Rule 2: DD/MM/YYYY or D/M/YYYY or YYYY/MM/DD with / or .
  if (cleaned.includes('/') || cleaned.includes('.')) {
    const sep = cleaned.includes('/') ? '/' : '.';
    const parts = cleaned.split(sep);
    if (parts.length === 3) {
      const part0 = parts[0].trim();
      const part1 = parts[1].trim();
      const part2 = parts[2].trim();
      
      // If it ends with 4-digit year e.g. 26/01/2026 -> part2 is year, part0 is day, part1 is month
      if (part2.length === 4) {
        return `${part2}-${part1.padStart(2, '0')}-${part0.padStart(2, '0')}`;
      }
      // If it starts with 4-digit year e.g. 2026/01/26 -> part0 is year, part1 is month, part2 is day
      if (part0.length === 4) {
        return `${part0}-${part1.padStart(2, '0')}-${part2.padStart(2, '0')}`;
      }
    }
  }

  // Rule 3: DD-MM-YYYY or D-M-YYYY etc.
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    if (parts.length === 3) {
      const part0 = parts[0].trim();
      const part1 = parts[1].trim();
      const part2 = parts[2].trim();
      if (part2.length === 4) {
        return `${part2}-${part1.padStart(2, '0')}-${part0.padStart(2, '0')}`;
      }
      if (part0.length === 4) {
        return `${part0}-${part1.padStart(2, '0')}-${part2.padStart(2, '0')}`;
      }
    }
  }

  // Fallback: If we can parse it conventionally via Date object
  try {
    const dObj = new Date(cleaned);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getFullYear();
      if (y >= 1900 && y <= 2100) {
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  } catch (e) {
    // Ignore
  }

  return cleaned;
};

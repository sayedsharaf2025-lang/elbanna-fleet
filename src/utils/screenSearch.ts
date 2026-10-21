/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// بحث سريع (Ctrl+K) عن أي شاشة بالاسم — بيتجاهل التشكيل واختلاف الهمزات والياء/الألف المقصورة والتاء المربوطة

export interface ScreenItem {
  id: string;
  label: string;
  group?: string;
  keywords?: string[];
}

export function normalizeArabic(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchScreens(items: ScreenItem[], query: string, limit = 8): ScreenItem[] {
  const q = normalizeArabic(query);
  if (!q) return items.slice(0, limit);
  const tokens = q.split(' ').filter(Boolean);
  const scored: { item: ScreenItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const label = normalizeArabic(item.label);
    const hay = [label, normalizeArabic(item.group || ''), ...(item.keywords || []).map(normalizeArabic), normalizeArabic(item.id.replace(/_/g, ' '))].join(' ');
    if (!tokens.every(t => hay.includes(t))) return;
    let score = 0;
    if (label.startsWith(q)) score += 100;
    else if (label.includes(q)) score += 60;
    tokens.forEach(t => {
      const idx = label.indexOf(t);
      if (idx === 0) score += 20;
      else if (idx > 0) score += 10;
      else score += 2; // طابق في المجموعة أو الكلمات المفتاحية بس
    });
    scored.push({ item, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map(s => s.item);
}

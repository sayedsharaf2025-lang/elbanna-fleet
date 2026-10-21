/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string | null; dir: SortDir; }

export const NO_SORT: SortState = { key: null, dir: 'asc' };

// دورة الضغط على عنوان العمود: بدون ترتيب → تصاعدي → تنازلي → بدون ترتيب
export function nextSortState(cur: SortState, key: string): SortState {
  if (cur.key !== key) return { key, dir: 'asc' };
  if (cur.dir === 'asc') return { key, dir: 'desc' };
  return NO_SORT;
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('ar', { numeric: true, sensitivity: 'base' }) : null;

const compareValues = (a: string | number | null | undefined, b: string | number | null | undefined): number => {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;   // الفاضي دايمًا في الآخر (في الاتجاهين — اتعالج تحت)
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a), bs = String(b);
  return collator ? collator.compare(as, bs) : as.localeCompare(bs);
};

// فرز ثابت (stable) من غير تعديل المصفوفة الأصلية. القيم الفاضية بتفضل في الآخر مهما كان الاتجاه
export function sortRows<T>(
  rows: T[],
  state: SortState,
  accessor: (row: T, key: string) => string | number | null | undefined
): T[] {
  if (!state.key) return rows;
  const key = state.key;
  const sign = state.dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: accessor(row, key) }))
    .sort((x, y) => {
      const xe = x.value === null || x.value === undefined || x.value === '';
      const ye = y.value === null || y.value === undefined || y.value === '';
      if (xe || ye) return compareValues(x.value, y.value) || x.index - y.index;
      return sign * compareValues(x.value, y.value) || x.index - y.index;
    })
    .map(x => x.row);
}

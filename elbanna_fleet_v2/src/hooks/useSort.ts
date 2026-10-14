/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useRef, useState } from 'react';
import { NO_SORT, SortState, nextSortState, sortRows } from '../utils/sortRows';

// فرز صفوف جدول بالضغط على العنوان. accessor بيرجّع قيمة الفرز للصف حسب مفتاح العمود.
// لو اتمرر getId (جداول الإدخال) الترتيب بيتثبّت لحد ما يتغيّر العمود/الاتجاه أو تتغيّر مجموعة الصفوف،
// فالصف ما بيقفزش من مكانه وإنت بتكتب فيه (زي Excel بالظبط).
export function useSort<T>(
  rows: T[],
  accessor: (row: T, key: string) => string | number | null | undefined,
  opts: { initial?: SortState; getId?: (row: T) => string } = {}
) {
  const { initial = NO_SORT, getId } = opts;
  const [sort, setSort] = useState<SortState>(initial);
  const orderRef = useRef<string[]>([]);
  const sigRef = useRef<string>('');

  const sig = getId ? `${sort.key}:${sort.dir}#${rows.map(getId).sort().join('|')}` : '';

  const sorted = useMemo(() => {
    if (!getId) return sortRows(rows, sort, accessor);
    if (sigRef.current !== sig) {
      const fresh = sortRows(rows, sort, accessor);
      orderRef.current = fresh.map(getId);
      sigRef.current = sig;
      return fresh;
    }
    const byId = new Map(rows.map(r => [getId(r), r] as [string, T]));
    return orderRef.current.map(id => byId.get(id)).filter((r): r is T => r !== undefined);
  }, getId ? [rows, sig] : [rows, sort]);

  return { sort, setSort, sorted, toggle: (key: string) => setSort(s => nextSortState(s, key)) };
}

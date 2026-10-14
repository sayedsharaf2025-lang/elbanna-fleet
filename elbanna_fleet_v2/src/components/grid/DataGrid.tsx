/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { parseClipboardMatrix, parseNumberText, numberToInputText } from '../../utils/gridParse';
import { SortState, nextSortState } from '../../utils/sortRows';

// جدول إدخال بنمط Excel: تنقّل بـ Tab / Enter / الأسهم، لصق أعمدة كاملة، فرز بالضغط على العنوان،
// وتثبيت صف العناوين وأول عمود أثناء التمرير. الجدول "مُتحكَّم فيه" — الشاشة الأم هي اللي بتمسك المسودات.

export type GridCellKind = 'text' | 'number' | 'select' | 'readonly';

export interface GridColumn<R> {
  key: string;
  header: React.ReactNode;
  kind: GridCellKind;
  minWidth?: number;
  sticky?: boolean;              // عمود مثبّت (أول عمود عادةً)
  options?: { value: string; label: string }[];
  render?: (row: R) => React.ReactNode; // عرض الخانات readonly (وأي عمود تاني لو اتحدد)
  sortable?: boolean;
  title?: string;
  footer?: React.ReactNode;
}

export interface PasteInfo { cells: number; rows: number; skipped: number; }

export interface DataGridProps<R> {
  rows: R[];
  columns: GridColumn<R>[];
  rowId: (row: R) => string;
  getValue: (row: R, colKey: string) => string;
  onChange: (rowId: string, colKey: string, value: string) => void;
  isDirty?: (rowId: string, colKey: string) => boolean;
  isRowDisabled?: (row: R) => boolean;
  disabled?: boolean;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  // لو رجّعت true يبقى اللصق اتعالج من الشاشة الأم (مثلًا لصق بأرقام السيارات)
  onPasteMatrix?: (ctx: { matrix: string[][]; rowIndex: number; colKey: string }) => boolean;
  onPasted?: (info: PasteInfo) => void;
  maxHeight?: string;
  emptyMessage?: string;
  id?: string;
}

const cellSelector = (r: number, c: number) => `[data-cell="${r}:${c}"]`;

export function DataGrid<R>(props: DataGridProps<R>) {
  const { rows, columns, rowId, getValue, onChange, isDirty, isRowDisabled, disabled, sort, onSortChange, onPasteMatrix, onPasted, maxHeight, emptyMessage, id } = props;
  const wrapRef = useRef<HTMLDivElement>(null);

  const editableCols = columns.map((c, i) => (c.kind === 'readonly' ? -1 : i)).filter(i => i >= 0);
  const rowDisabled = (row: R) => !!disabled || !!(isRowDisabled && isRowDisabled(row));

  const focusCell = (r: number, c: number): boolean => {
    const el = wrapRef.current?.querySelector<HTMLElement>(cellSelector(r, c));
    if (!el || (el as HTMLInputElement).disabled) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  };

  // الانتقال لخانة قابلة للتعديل: dr صفوف، dc أعمدة (بترتيب الأعمدة المنطقي). بترجع false لو مفيش وجهة
  const move = (r: number, c: number, dr: number, dc: number): boolean => {
    if (dr !== 0) {
      let nr = r + dr;
      while (nr >= 0 && nr < rows.length) {
        if (focusCell(nr, c)) return true;
        nr += dr; // بنعدّي الصفوف المقفولة
      }
      return false;
    }
    let idx = editableCols.indexOf(c) + dc;
    let nr = r;
    // لف على الصفوف: آخر عمود → أول عمود في الصف اللي بعده (والعكس)
    for (let guard = 0; guard < rows.length * Math.max(editableCols.length, 1) + 1; guard++) {
      if (idx < 0) { nr -= 1; idx = editableCols.length - 1; }
      else if (idx >= editableCols.length) { nr += 1; idx = 0; }
      if (nr < 0 || nr >= rows.length) return false;
      if (focusCell(nr, editableCols[idx])) return true;
      idx += dc;
    }
    return false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    const cell = t.getAttribute('data-cell');
    if (!cell) return;
    const [r, c] = cell.split(':').map(Number);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const isInput = t instanceof HTMLInputElement;
    const isSelect = t instanceof HTMLSelectElement;
    // الأسهم الأفقية بتنقل بين الخانات لو النص كله متحدد (أول ما نوصل للخانة) أو الخانة فاضية، غير كده بتحرك المؤشر
    const arrowNavigates = () => {
      if (isSelect) return true;
      if (!isInput) return true;
      const v = (t as HTMLInputElement).value;
      const s = (t as HTMLInputElement).selectionStart ?? 0;
      const en = (t as HTMLInputElement).selectionEnd ?? 0;
      return v.length === 0 || (s === 0 && en === v.length);
    };
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        move(r, c, e.shiftKey ? -1 : 1, 0);
        break;
      case 'Tab':
        // لو مفيش خانة بعدها بنسيب Tab يخرج من الجدول عادي
        if (move(r, c, 0, e.shiftKey ? -1 : 1)) e.preventDefault();
        break;
      case 'ArrowDown':
        if (isSelect && !e.altKey) { /* بنسيب القايمة تتحرك */ }
        else { e.preventDefault(); move(r, c, 1, 0); }
        break;
      case 'ArrowUp':
        if (isSelect) { /* نفس الكلام */ }
        else { e.preventDefault(); move(r, c, -1, 0); }
        break;
      // الجدول من اليمين لليسار: السهم الأيسر = العمود التالي
      case 'ArrowLeft':
        if (arrowNavigates()) { e.preventDefault(); move(r, c, 0, 1); }
        break;
      case 'ArrowRight':
        if (arrowNavigates()) { e.preventDefault(); move(r, c, 0, -1); }
        break;
      default:
    }
  };

  const normalizeForColumn = (col: GridColumn<R>, raw: string): string | null => {
    if (col.kind === 'number') {
      const trimmed = raw.trim();
      if (trimmed === '') return '';
      const n = parseNumberText(trimmed);
      return n === null ? null : numberToInputText(n);
    }
    if (col.kind === 'select') {
      const t = raw.trim();
      const hit = (col.options || []).find(o => o.value === t || o.label.trim() === t);
      return hit ? hit.value : (t === '' ? '' : null);
    }
    return raw;
  };

  const onPaste = (e: React.ClipboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    const cell = t.getAttribute('data-cell');
    if (!cell) return;
    const text = e.clipboardData.getData('text/plain');
    const matrix = parseClipboardMatrix(text);
    // خانة واحدة: اللصق العادي في الحقل
    if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length === 1)) {
      if (matrix.length === 1 && columns[Number(cell.split(':')[1])]?.kind === 'number') {
        // رقم واحد: ننضّفه (أرقام عربية/فواصل) بدل لصق النص الخام
        const col = columns[Number(cell.split(':')[1])];
        const norm = normalizeForColumn(col, matrix[0][0]);
        if (norm !== null) {
          e.preventDefault();
          const r0 = Number(cell.split(':')[0]);
          const row = rows[r0];
          if (row && !rowDisabled(row)) onChange(rowId(row), col.key, norm);
        }
      }
      return;
    }
    e.preventDefault();
    const [r, c] = cell.split(':').map(Number);
    const startCol = columns[c];
    if (onPasteMatrix && onPasteMatrix({ matrix, rowIndex: r, colKey: startCol.key })) return;

    const startIdx = editableCols.indexOf(c);
    let cells = 0, skipped = 0;
    matrix.forEach((line, i) => {
      const row = rows[r + i];
      if (!row) { skipped += line.length; return; }
      if (rowDisabled(row)) { skipped += line.length; return; }
      line.forEach((raw, j) => {
        const colIdx = editableCols[startIdx + j];
        if (colIdx === undefined) { skipped++; return; }
        const col = columns[colIdx];
        const norm = normalizeForColumn(col, raw);
        if (norm === null) { skipped++; return; }
        onChange(rowId(row), col.key, norm);
        cells++;
      });
    });
    onPasted?.({ cells, rows: Math.min(matrix.length, Math.max(rows.length - r, 0)), skipped });
  };

  const headerClick = (col: GridColumn<R>) => {
    if (!col.sortable || !onSortChange) return;
    onSortChange(nextSortState(sort || { key: null, dir: 'asc' }, col.key));
  };

  const hasFooter = columns.some(c => c.footer !== undefined);

  return (
    <div ref={wrapRef} className="xl-wrap" style={{ maxHeight: maxHeight || '70vh' }} id={id}>
      <table className="xl-table" onKeyDown={onKeyDown} onPaste={onPaste}>
        <thead>
          <tr>
            {columns.map(col => {
              const active = sort && sort.key === col.key;
              return (
                <th
                  key={col.key}
                  title={col.title}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => headerClick(col)}
                  className={`xl-th ${col.sticky ? 'xl-sticky-col' : ''} ${col.sortable ? 'xl-sortable' : ''}`}
                  style={{ minWidth: col.minWidth }}
                >
                  <span className="xl-th-inner">
                    {col.header}
                    {col.sortable && <span className="xl-sort-ind">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const rid = rowId(row);
            const locked = rowDisabled(row);
            return (
              <tr key={rid}>
                {columns.map((col, c) => {
                  const base = `${col.sticky ? 'xl-sticky-col' : ''}`;
                  if (col.kind === 'readonly') {
                    return <td key={col.key} className={`xl-td xl-ro ${base}`}>{col.render ? col.render(row) : getValue(row, col.key)}</td>;
                  }
                  const dirty = !!isDirty && isDirty(rid, col.key);
                  const cls = `xl-td ${base} ${dirty ? 'xl-dirty' : ''}`;
                  const value = getValue(row, col.key);
                  if (col.kind === 'select') {
                    return (
                      <td key={col.key} className={cls}>
                        <select
                          data-cell={`${r}:${c}`}
                          className="xl-input"
                          value={value}
                          disabled={locked}
                          onChange={e => onChange(rid, col.key, e.target.value)}
                        >
                          {(col.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className={cls}>
                      <input
                        data-cell={`${r}:${c}`}
                        className={`xl-input ${col.kind === 'number' ? 'xl-num' : ''}`}
                        type="text"
                        inputMode={col.kind === 'number' ? 'decimal' : 'text'}
                        dir={col.kind === 'number' ? 'ltr' : 'rtl'}
                        autoComplete="off"
                        value={value}
                        disabled={locked}
                        onChange={e => onChange(rid, col.key, e.target.value)}
                        onBlur={e => {
                          // تنضيف الرقم لما نسيب الخانة (أرقام عربية، فواصل آلاف...)
                          if (col.kind !== 'number') return;
                          const raw = e.target.value;
                          if (raw.trim() === '') return;
                          const n = parseNumberText(raw);
                          if (n !== null) {
                            const clean = numberToInputText(n);
                            if (clean !== raw) onChange(rid, col.key, clean);
                          }
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="xl-empty">{emptyMessage || 'لا توجد بيانات.'}</td></tr>
          )}
        </tbody>
        {hasFooter && (
          <tfoot>
            <tr>
              {columns.map(col => (
                <td key={col.key} className={`xl-td xl-foot ${col.sticky ? 'xl-sticky-col' : ''}`}>{col.footer ?? ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

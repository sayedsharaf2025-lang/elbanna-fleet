/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SortState } from '../utils/sortRows';

// عنوان عمود قابل للضغط للفرز (للجداول العادية: الربحية، الفواتير...). بيتثبّت مع التمرير عن طريق class "xl-th"
export function SortableTh({ label, sortKey, sort, onToggle, className = '', sticky = false }: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  className?: string;
  sticky?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onToggle(sortKey)}
      className={`xl-th xl-sortable ${sticky ? 'xl-sticky-col' : ''} ${className}`}
    >
      <span className="xl-th-inner">
        {label}
        <span className="xl-sort-ind">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  );
}

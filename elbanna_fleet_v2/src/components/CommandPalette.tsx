/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScreenItem, searchScreens } from '../utils/screenSearch';
import { Search, CornerDownLeft } from 'lucide-react';

// نافذة البحث السريع (Ctrl+K): اكتب جزء من اسم أي شاشة وافتحها بـ Enter. بتعرض الشاشات المسموحة للمستخدم بس.
export function CommandPalette({ items, open, onClose, onSelect }: {
  items: ScreenItem[];
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchScreens(items, query, 9), [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => { setIndex(0); }, [query]);

  if (!open) return null;

  const choose = (id: string | undefined) => {
    if (!id) return;
    onSelect(id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[index]?.id); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 no-print" style={{ background: 'rgba(2,6,23,0.7)' }} onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="بحث سريع عن شاشة">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden" style={{ direction: 'rtl' }} onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن شاشة... (مثال: ربحية، فواتير، عهدة، سولار)"
            className="flex-1 bg-transparent py-3.5 text-sm text-slate-100 outline-none"
            style={{ border: 0, boxShadow: 'none' }}
          />
          <span className="text-[10px] font-mono text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">Esc</span>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(r.id)}
                className={`w-full text-right px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${i === index ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-300'}`}
              >
                <span className="font-bold">{r.label}</span>
                <span className="flex items-center gap-2 text-[10px] text-slate-500">
                  {r.group}
                  {i === index && <CornerDownLeft className="w-3 h-3" />}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500 font-bold">مفيش شاشة بالاسم ده (أو مش مسموحة ليك).</li>}
        </ul>
      </div>
    </div>
  );
}

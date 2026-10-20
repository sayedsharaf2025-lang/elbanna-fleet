/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

// يمنع الشاشة السودا: أي خطأ في الرسم يتعرض كرسالة واضحة مع زر إعادة المحاولة بدل ما التطبيق كله يختفي.
type Props = { children: React.ReactNode; label?: string; onReset?: () => void; fullScreen?: boolean };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const { fullScreen, label } = this.props;
    return (
      <div
        dir="rtl"
        style={fullScreen ? { minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } : undefined}
      >
        <div className="bg-white border border-rose-200 rounded-2xl p-5 text-right space-y-3 max-w-lg w-full mx-auto shadow">
          <p className="font-black text-rose-700 text-sm">{label || 'حصل خطأ أثناء عرض الشاشة'}</p>
          <p className="text-[11px] text-slate-500 font-mono break-all" dir="ltr">{String(this.state.error.message || this.state.error)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={this.reset} className="bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg">إعادة المحاولة</button>
            {fullScreen && <button type="button" onClick={() => window.location.reload()} className="bg-slate-100 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg">تحديث الصفحة</button>}
          </div>
        </div>
      </div>
    );
  }
}

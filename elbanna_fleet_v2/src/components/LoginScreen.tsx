import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Lock, ShieldAlert, User, Key } from 'lucide-react';

export function LoginScreen() {
  const db = useDb();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Minor delay to show elegant transition
    setTimeout(async () => {
      try {
        const res = await db.loginAuto(username, password);

        setIsSubmitting(false);
        if (!res.success) {
          setError(res.error || 'فشل تسجيل الدخول، يرجى التحقق من المدخلات');
        }
      } catch (err: any) {
        setIsSubmitting(false);
        setError(err.message || 'حدث خطأ غير متوقع أثناء محاولة تسجيل الدخول');
      }
    }, 450);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden select-none font-sans">
      
      {/* Decorative Blur Background Circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10 animate-pulse duration-[8000ms]"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10 animate-pulse duration-[12000ms]"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-3xl p-8 shadow-2xl relative">
        
        {/* Logo and Header Block */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 text-slate-950 text-3xl font-black mb-4 shadow-xl shadow-emerald-500/10 border border-emerald-400/20">
            بـ
          </div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight">مجموعة البنا جروب</h2>
          <p className="text-xs text-emerald-400 font-semibold mt-1">البوابة الآمنة لإدارة الحركة والعهد المالية والتراخيص</p>
        </div>

        {/* Cloud synchronization feedback banner */}
        {db.isCloudSyncing && (
          <div className="bg-emerald-550/15 border border-emerald-500/30 text-emerald-400 rounded-xl p-3 mb-5 flex items-center gap-2.5 text-xs animate-pulse">
            <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0"></span>
            <span className="font-medium">جاري مزامنة الإعدادات والأمان من السحابة الآن...</span>
          </div>
        )}

        {/* Error notification banner */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 mb-5 flex items-center gap-2.5 text-xs">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-bold">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username — works for any account type (admin, manager, supervisor name, movement supervisor, requests agent) */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 text-xs font-bold mr-1">اسم المستخدم</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="اكتب اسم المستخدم..."
                className="w-full text-right outline-none bg-slate-950 border border-slate-800 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 text-slate-100 px-4 py-3 pr-10 rounded-xl text-xs md:text-sm font-bold transition-all placeholder:text-slate-650"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 text-xs font-bold mr-1">كلمة المرور الخاصة بالحساب</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-500">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-right outline-none bg-slate-950 border border-slate-800 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 text-slate-100 px-4 py-3 pr-10 rounded-xl text-xs md:text-sm font-bold transition-all placeholder:text-slate-700"
              />
            </div>
          </div>

          {/* Action button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs md:text-sm py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>تسجيل الدخول الآمن للمنصة ➔</span>
            )}
          </button>
        </form>
      </div>

      <div className="mt-8 text-center text-slate-500 text-[10px] select-none">
        &copy; 2026 مجموعة البنا جروب للتشييد واللوجستيك. بوابة مشفرة بالكامل.
      </div>
    </div>
  );
}

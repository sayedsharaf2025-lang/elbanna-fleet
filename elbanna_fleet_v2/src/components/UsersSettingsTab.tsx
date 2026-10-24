import React, { useState } from 'react';
import { useDb } from '../db/store';
import {
  Users,
  UserPlus,
  UserMinus,
  Key,
  Copy,
  Ban,
  Power,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Pencil,
  Wallet,
  Save,
} from 'lucide-react';

// قائمة كل شاشات النظام (المعرّف + الاسم الظاهر) — لازم تفضل متطابقة مع navStructure في App.tsx
const ALL_SCREENS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'لوحة التحكم والتحليلات الحية' },
  { id: 'transport_requests', label: 'طلبات النقل' },
  { id: 'users_settings', label: 'المستخدمين' },
  { id: 'fleet', label: 'إعدادات السيارات والسائقين (Excel)' },
  { id: 'transport_cost_settings', label: 'إعدادات تكلفة خطوط السير' },
  { id: 'violations', label: 'تسجيل المخالفات وتفادي التكرار' },
  { id: 'requests_tracking', label: 'متابعة الطلبات' },
  { id: 'driver_tracking', label: 'متابعة السائقين' },
  { id: 'license_tracking', label: 'متابعة وتحديث التراخيص المتقدمة' },
  { id: 'custody_licensing', label: 'فواتير تراخيص' },
  { id: 'deductions', label: 'الخصومات الفردية والجماعية' },
  { id: 'cross_accounts', label: 'أرشيف وحسابات السائقين (شهرية)' },
  { id: 'route_accounting', label: 'حساب خطوط السير' },
  { id: 'car_daily_costs', label: 'مصاريف وأرباح السيارات اليومية' },
  { id: 'vehicle_profitability', label: 'ربحية السيارات' },
  { id: 'fuel_logs', label: 'المالية — سجل التموين' },
  { id: 'service_plans', label: 'العمليات — الصيانة الوقائية' },
  { id: 'driver_reports', label: 'التقارير — السائقين وتكلفة الكيلو' },
  { id: 'car_monthly_costs', label: 'المالية — المرتبات والسولار والزيت الشهرية' },
  { id: 'license_invoice_approvals', label: 'المالية — اعتماد فواتير التراخيص' },
  { id: 'maintenance_requests', label: 'الصيانة — طلب الصيانة (الورشة)' },
  { id: 'maintenance_parts', label: 'الصيانة — قطع الغيار' },
  { id: 'maintenance_review', label: 'الصيانة — مدير الصيانة' },
  { id: 'maintenance_accounting', label: 'الصيانة — الفواتير والمصنعية' },
  { id: 'reports', label: 'شاشة التقارير والمطبوعات الموحدة' },
];

const LICENSING_SCREEN_ID = 'custody_licensing';

export function UsersSettingsTab() {
  const db = useDb();

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const showNotification = (type: 'success' | 'error', text: string) => {
    if (type === 'success') { setSuccessMsg(text); setErrorMsg(null); }
    else { setErrorMsg(text); setSuccessMsg(null); }
    setTimeout(() => { setSuccessMsg(null); setErrorMsg(null); }, 4500);
  };

  // ---- إضافة مستخدم جديد ----
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newScreens, setNewScreens] = useState<string[]>([]);

  const resetAddForm = () => {
    setNewName(''); setNewUsername(''); setNewPassword(''); setNewScreens([]); setShowAddForm(false);
  };


  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUsername.trim() || !newPassword) {
      showNotification('error', 'يرجى إدخال الاسم واسم المستخدم وكلمة المرور');
      return;
    }
    const res = await db.addSystemUser(newUsername, newPassword, newName, newScreens);
    if (!res.success) {
      showNotification('error', res.error || 'تعذّر إضافة المستخدم');
      return;
    }
    if (newScreens.includes(LICENSING_SCREEN_ID)) {
      showNotification('success', `تم إضافة "${newName}" بنجاح. لإنشاء عهدة له كمشرف صرف: افتح "فواتير تراخيص".`);
    } else if (newScreens.includes(LICENSING_SCREEN_ID)) {
      showNotification('success', `تم إضافة "${newName}" بنجاح وحفظه في السحابة. لإنشاء عهدة له كمشرف صرف: افتح "فواتير تراخيص ← كشف الحساب والتحويلات ← إدارة مسؤولي الصرف" واضغط "إنشاء عهدة".`);
    } else {
      showNotification('success', `تم إضافة "${newName}" بنجاح وحفظه في السحابة.`);
    }
    resetAddForm();
  };

  // ---- تعديل مستخدم موجود (اسم / يوزر / باسورد / شاشات) ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editOfficialName, setEditOfficialName] = useState('');

  const startEdit = (id: string) => {
    const u = db.systemUsers.find(x => x.id === id);
    if (!u) return;
    setEditingId(id);
    setEditName(u.display_name);
    setEditUsername(u.username);
    setEditPassword('');
    setEditOfficialName(u.linked_official_id ? (db.officials.find(o => o.id === u.linked_official_id)?.name || '') : '');
  };

  const saveEditIdentity = async (id: string) => {
    const res = await db.updateSystemUser(id, { username: editUsername, password: editPassword, display_name: editName, official_name: editOfficialName });
    if (!res.success) {
      showNotification('error', res.error || 'تعذّر الحفظ');
      return;
    }
    showNotification('success', 'تم حفظ بيانات المستخدم بنجاح.');
    setEditingId(null);
  };

  const toggleScreen = async (userId: string, screenId: string, currentScreens: string[]) => {
    const already = currentScreens.includes(screenId);
    const next = already ? currentScreens.filter(s => s !== screenId) : [...currentScreens, screenId];
    const res = await db.updateSystemUser(userId, { allowed_screens: next });
    if (!res.success) {
      showNotification('error', res.error || 'تعذّر تحديث الشاشات');
      return;
    }
  };

  const handleToggleActive = async (id: string, name: string, isActive: boolean) => {
    if (isActive && !window.confirm(`إيقاف حساب "${name}"؟ هيتمنع من الدخول وقراءة البيانات فورًا (الحساب والبيانات مش بتتمسح).`)) return;
    const res = await db.updateSystemUser(id, { active: !isActive });
    if (!res.success) { showNotification('error', res.error || 'تعذّر التغيير'); return; }
    showNotification('success', isActive ? `تم إيقاف "${name}".` : `تم تفعيل "${name}".`);
  };

  // ---- تفعيل دخول المستخدمين المنقولين من النظام القديم (أدمن بس) ----
  const [provisioned, setProvisioned] = useState<Array<{ id: string; username: string; display_name: string; password?: string; error?: string }> | null>(null);
  const pendingLogin = db.systemUsers.filter(u => !u.has_login && u.active !== false);
  const handleProvision = async () => {
    if (!window.confirm(`هيتولّد كلمة سر مؤقتة لـ ${pendingLogin.length} مستخدم وتظهرلك مرة واحدة بس. كمّل؟`)) return;
    const res = await db.provisionSystemUsers();
    if (!res.success) { showNotification('error', res.error || 'تعذّر التفعيل'); return; }
    setProvisioned(res.results);
  };
  const copyProvisioned = () => {
    const text = (provisioned || []).filter(r => r.password).map(r => `${r.display_name} — ${r.username} — ${r.password}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => showNotification('success', 'تم النسخ — سلّم كل مستخدم كلمته واحذف الرسالة بعدها.'));
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${name}"؟ لو عنده حساب عهدة مالية، هيفضل محفوظ زي ما هو ومش هيتحذف (تقدر تحذفه من شاشة إدارة مسؤولي الصرف).`)) return;
    const res = await db.deleteSystemUser(id);
    if (!res.success) showNotification('error', res.error || 'تعذّر الحذف');
    else showNotification('success', `تم حذف المستخدم "${name}".`);
  };

  return (
    <div className="space-y-6" id="users_settings_tab_view">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 tracking-wider block uppercase mb-1">لوحة الأمن والتحكم</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 font-sans tracking-tight">المستخدمين</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            أضف أي عدد من المستخدمين وحدد شاشات كل واحد بحرية تامة — مفيش أقسام أو رتب ثابتة. حساب العهدة المالية (مشرف صرف) بيتنشأ يدويًا من شاشة "إدارة مسؤولي الصرف" داخل فواتير تراخيص، مش تلقائي.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(o => !o)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 self-start md:self-center"
        >
          <UserPlus className="w-4 h-4" /> إضافة مستخدم جديد
        </button>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl p-4 flex items-center gap-3 text-xs md:text-sm font-extrabold">
          <CheckCircle className="w-5 h-5 shrink-0" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl p-4 flex items-center gap-3 text-xs md:text-sm font-extrabold">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" /> {errorMsg}
        </div>
      )}

      {db.currentUser?.role === 'admin' && pendingLogin.length > 0 && !provisioned && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold text-amber-300 leading-relaxed">
            {pendingLogin.length} مستخدم اتنقلوا من النظام القديم ولسه دخولهم مش مفعّل (كلمات السر القديمة اتلغت لأسباب أمنية). فعّل دخولهم بكلمات سر مؤقتة جديدة.
          </p>
          <button type="button" onClick={handleProvision} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2 rounded-lg">تفعيل دخول الكل</button>
        </div>
      )}
      {provisioned && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-black text-emerald-300">كلمات السر المؤقتة — بتظهر مرة واحدة بس. سلّمها لأصحابها وانصحهم يغيّروها.</p>
          <div className="space-y-1 font-mono text-[11px] text-slate-200" dir="ltr">
            {provisioned.map(r => (
              <div key={r.id} className="flex flex-wrap gap-3 bg-slate-950 rounded-lg px-3 py-1.5">
                <span className="text-slate-400">{r.display_name}</span>
                <span>{r.username}</span>
                {r.password ? <span className="text-emerald-300 font-bold">{r.password}</span> : <span className="text-rose-300">{r.error}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={copyProvisioned} className="bg-emerald-500 text-slate-950 font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> نسخ الكل</button>
            <button type="button" onClick={() => setProvisioned(null)} className="bg-slate-800 text-slate-300 font-bold text-xs px-3 py-1.5 rounded-lg">تم — إخفاء</button>
          </div>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddUser} className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-black text-slate-200 flex items-center gap-2"><UserPlus className="w-4 h-4 text-emerald-400" /> مستخدم جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-bold mb-1">الاسم</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">اسم المستخدم (تسجيل الدخول)</label>
              <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500 font-mono" autoComplete="off" />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">كلمة المرور</label>
              <input type="password" autoComplete="new-password" placeholder="8 حروف على الأقل" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-2">الشاشات المسموحة</label>
            <div className="flex flex-wrap gap-2">
              {ALL_SCREENS.map(screen => {
                const checked = newScreens.includes(screen.id);
                return (
                  <label key={screen.id} className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer ${checked ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setNewScreens(prev => e.target.checked ? [...prev, screen.id] : prev.filter(s => s !== screen.id))}
                      className="w-3.5 h-3.5 accent-emerald-500"
                    />
                    {screen.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> حفظ المستخدم</button>
            <button type="button" onClick={resetAddForm} className="bg-slate-800 text-slate-300 font-bold text-xs px-4 py-2 rounded-lg">إلغاء</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {db.systemUsers.map(u => {
          const isEditing = editingId === u.id;
          const isActiveSession = db.currentUser?.systemUserId === u.id;
          return (
            <div key={u.id} className="bg-slate-900 border border-slate-850 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {isEditing ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="الاسم" className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-bold outline-none focus:border-emerald-500 w-32" />
                      <span className="text-slate-600">/</span>
                      <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="اسم المستخدم" className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none focus:border-emerald-500 w-28" />
                      <span className="text-slate-600 flex items-center gap-1"><Key className="w-3 h-3" /></span>
                      <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="كلمة مرور جديدة (اختياري)" className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none focus:border-emerald-500 w-28" />
                      {u.linked_official_id && (
                        <input value={editOfficialName} onChange={(e) => setEditOfficialName(e.target.value)} placeholder="اسم مسؤول التراخيص" title="اسم مسؤول التراخيص (مستقل عن الاسم واسم المستخدم)" className="bg-slate-950 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-amber-300 text-xs font-bold outline-none focus:border-amber-400 w-36" />
                      )}
                      <button type="button" onClick={() => saveEditIdentity(u.id)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1.5 rounded text-[10px] font-black">حفظ</button>
                      <button type="button" onClick={() => setEditingId(null)} className="bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded text-[10px]">إلغاء</button>
                    </>
                  ) : (
                    <>
                      <span className="font-black text-slate-100 text-sm flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-500" /> {u.display_name}</span>
                      <span className="font-mono text-slate-500 text-[11px]">@{u.username}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${u.has_login ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        <Key className="w-3 h-3" /> {u.has_login ? 'الدخول مفعّل' : 'الدخول لسه مش مفعّل'}
                      </span>
                      {u.active === false && (
                        <span className="bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"><Ban className="w-3 h-3" /> موقوف</span>
                      )}
                      {u.linked_official_id && (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <Wallet className="w-3 h-3" /> مسؤول التراخيص: {db.officials.find(o => o.id === u.linked_official_id)?.name || '—'}
                        </span>
                      )}
                      {isActiveSession && (
                        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> جلستك الحالية
                        </span>
                      )}
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => startEdit(u.id)} className="text-slate-500 hover:text-emerald-400 p-1.5 bg-slate-950 border border-slate-800 rounded" title="تعديل الاسم/اليوزر/الباسورد">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isActiveSession && (
                      <button type="button" onClick={() => handleToggleActive(u.id, u.display_name, u.active !== false)} className="text-slate-500 hover:text-amber-400 p-1.5 bg-slate-950 border border-slate-800 rounded" title={u.active === false ? 'تفعيل الحساب' : 'إيقاف الحساب (يمنعه من الدخول فورًا)'}>
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => handleDeleteUser(u.id, u.display_name)} className="text-red-400 hover:bg-red-500/10 p-1.5 bg-slate-950 border border-red-500/10 rounded" title="حذف المستخدم">
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-850/60">
                {ALL_SCREENS.map(screen => {
                  const checked = u.allowed_screens.includes(screen.id);
                  return (
                    <label key={screen.id} className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg border cursor-pointer ${checked ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScreen(u.id, screen.id, u.allowed_screens)}
                        className="w-3.5 h-3.5 accent-emerald-500"
                      />
                      {screen.label}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {db.systemUsers.length === 0 && (
          <div className="bg-slate-900 border border-slate-850 rounded-2xl p-10 text-center text-slate-500 font-bold">
            لا يوجد مستخدمين بعد — دوس "إضافة مستخدم جديد" للبدء.
          </div>
        )}
      </div>
    </div>
  );
}

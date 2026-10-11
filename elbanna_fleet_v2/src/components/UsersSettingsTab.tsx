import React, { useState } from 'react';
import { useDb } from '../db/store';
import {
  Users,
  UserPlus,
  UserMinus,
  Key,
  Eye,
  EyeOff,
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
  { id: 'license_tracking', label: 'متابعة وتحديث التراخيص المتقدمة' },
  { id: 'custody_licensing', label: 'فواتير تراخيص (بيُنشئ حساب عهدة تلقائيًا)' },
  { id: 'deductions', label: 'الخصومات الفردية والجماعية' },
  { id: 'cross_accounts', label: 'أرشيف وحسابات السائقين (شهرية)' },
  { id: 'route_accounting', label: 'حساب خطوط السير' },
  { id: 'car_daily_costs', label: 'مصاريف وأرباح السيارات اليومية' },
  { id: 'vehicle_profitability', label: 'ربحية السيارات' },
  { id: 'maintenance', label: 'قسم الصيانة' },
  { id: 'maintenance_discount', label: 'الصيانة — اعتماد الخصم المحاسبي' },
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

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUsername.trim() || !newPassword) {
      showNotification('error', 'يرجى إدخال الاسم واسم المستخدم وكلمة المرور');
      return;
    }
    const res = db.addSystemUser(newUsername, newPassword, newName, newScreens);
    if (!res.success) {
      showNotification('error', res.error || 'تعذّر إضافة المستخدم');
      return;
    }
    if (newScreens.includes(LICENSING_SCREEN_ID)) {
      showNotification('success', `تم إضافة "${newName}" بنجاح، وتم إنشاء حساب عهدة له تلقائيًا لأنه عنده صلاحية "فواتير تراخيص".`);
    } else {
      showNotification('success', `تم إضافة "${newName}" بنجاح.`);
    }
    resetAddForm();
  };

  // ---- تعديل مستخدم موجود (اسم / يوزر / باسورد / شاشات) ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [visiblePasswordFor, setVisiblePasswordFor] = useState<string | null>(null);

  const startEdit = (id: string) => {
    const u = db.systemUsers.find(x => x.id === id);
    if (!u) return;
    setEditingId(id);
    setEditName(u.display_name);
    setEditUsername(u.username);
    setEditPassword(u.password);
  };

  const saveEditIdentity = (id: string) => {
    const res = db.updateSystemUser(id, { username: editUsername, password: editPassword, display_name: editName });
    if (!res.success) {
      showNotification('error', res.error || 'تعذّر الحفظ');
      return;
    }
    showNotification('success', 'تم حفظ بيانات المستخدم بنجاح.');
    setEditingId(null);
  };

  const toggleScreen = (userId: string, screenId: string, currentScreens: string[]) => {
    const already = currentScreens.includes(screenId);
    const next = already ? currentScreens.filter(s => s !== screenId) : [...currentScreens, screenId];
    const res = db.updateSystemUser(userId, { allowed_screens: next });
    if (!res.success) {
      showNotification('error', res.error || 'تعذّر تحديث الشاشات');
      return;
    }
    if (res.gainedCustodyAccount) {
      showNotification('success', 'تم منح صلاحية "فواتير تراخيص" وإنشاء حساب عهدة جديد لهذا المستخدم تلقائيًا.');
    }
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${name}"؟ لو عنده حساب عهدة مالية، هيفضل محفوظ زي ما هو ومش هيتحذف.`)) return;
    db.deleteSystemUser(id);
    showNotification('success', `تم حذف المستخدم "${name}".`);
  };

  return (
    <div className="space-y-6" id="users_settings_tab_view">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 tracking-wider block uppercase mb-1">لوحة الأمن والتحكم</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 font-sans tracking-tight">المستخدمين</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            أضف أي عدد من المستخدمين وحدد شاشات كل واحد بحرية تامة — مفيش أقسام أو رتب ثابتة. أي مستخدم تدّيله صلاحية "فواتير تراخيص" بيتعمله حساب عهدة مالية تلقائيًا.
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
              <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500 font-mono" autoComplete="off" />
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
                      <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="كلمة المرور" className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none focus:border-emerald-500 w-28" />
                      <button type="button" onClick={() => saveEditIdentity(u.id)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1.5 rounded text-[10px] font-black">حفظ</button>
                      <button type="button" onClick={() => setEditingId(null)} className="bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded text-[10px]">إلغاء</button>
                    </>
                  ) : (
                    <>
                      <span className="font-black text-slate-100 text-sm flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-500" /> {u.display_name}</span>
                      <span className="font-mono text-slate-500 text-[11px]">@{u.username}</span>
                      <span className="font-mono text-slate-600 text-[11px] flex items-center gap-1">
                        <Key className="w-3 h-3" />
                        {visiblePasswordFor === u.id ? u.password : '••••••'}
                        <button type="button" onClick={() => setVisiblePasswordFor(v => v === u.id ? null : u.id)} className="text-slate-500 hover:text-slate-300">
                          {visiblePasswordFor === u.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </span>
                      {u.linked_official_id && (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <Wallet className="w-3 h-3" /> عنده حساب عهدة
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

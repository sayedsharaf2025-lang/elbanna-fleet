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
  Layers, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Info,
  Truck,
  ClipboardList,
  Pencil
} from 'lucide-react';

// قائمة كل شاشات النظام (المعرّف + الاسم الظاهر) — لازم تفضل متطابقة مع navStructure في App.tsx
const ALL_SCREENS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'لوحة التحكم والتحليلات الحية' },
  { id: 'transport_requests', label: 'طلبات النقل' },
  { id: 'users_settings', label: 'حماية وإعدادات حسابات النظام' },
  { id: 'fleet', label: 'إعدادات السيارات والسائقين (Excel)' },
  { id: 'violations', label: 'تسجيل المخالفات وتفادي التكرار' },
  { id: 'requests_tracking', label: 'متابعة الطلبات' },
  { id: 'license_tracking', label: 'متابعة وتحديث التراخيص المتقدمة' },
  { id: 'custody_licensing', label: 'فواتير تراخيص' },
  { id: 'deductions', label: 'الخصومات الفردية والجماعية' },
  { id: 'cross_accounts', label: 'أرشيف وحسابات السائقين (شهرية)' },
  { id: 'reports', label: 'شاشة التقارير والمطبوعات الموحدة' },
];

const ALL_ROLES: { id: 'admin' | 'manager' | 'supervisor' | 'movement_supervisor' | 'requests_agent'; label: string }[] = [
  { id: 'admin', label: 'أدمن النظام' },
  { id: 'manager', label: 'المدير العام' },
  { id: 'supervisor', label: 'مشرف صرف ميداني' },
  { id: 'movement_supervisor', label: 'مشرف الحركة' },
  { id: 'requests_agent', label: 'مستخدم طلبات النقل' },
];

export function UsersSettingsTab() {
  const db = useDb();

  // Selected state for active dynamic tabs/sections in Settings
  const [activeSubTab, setActiveSubTab] = useState<'supervisors' | 'admin_manager' | 'permissions'>('supervisors');

  // Success and Error alert state messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add supervisor state
  const [newOfficialName, setNewOfficialName] = useState('');
  const [newOfficialPassword, setNewOfficialPassword] = useState('123');
  const [newOfficialCash, setNewOfficialCash] = useState(0);
  const [newOfficialVisa, setNewOfficialVisa] = useState(0);

  // Change individual official's password state
  const [editingOfficialId, setEditingOfficialId] = useState('');
  const [newPasswordForOfficial, setNewPasswordForOfficial] = useState('');

  // Change individual official's name (username) state
  const [editingNameOfficialId, setEditingNameOfficialId] = useState('');
  const [newNameForOfficial, setNewNameForOfficial] = useState('');

  // Password visibility maps (by official.id)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Change Admin/Manager state password
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');

  const [currentManagerPass, setCurrentManagerPass] = useState('');
  const [newManagerPass, setNewManagerPass] = useState('');
  const [confirmManagerPass, setConfirmManagerPass] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [showManagerPass, setShowManagerPass] = useState(false);

  // Change Movement Supervisor / Requests Agent password state
  const [currentMovementPass, setCurrentMovementPass] = useState('');
  const [newMovementPass, setNewMovementPass] = useState('');
  const [confirmMovementPass, setConfirmMovementPass] = useState('');
  const [showMovementPass, setShowMovementPass] = useState(false);

  const [currentRequestsPass, setCurrentRequestsPass] = useState('');
  const [newRequestsPass, setNewRequestsPass] = useState('');
  const [confirmRequestsPass, setConfirmRequestsPass] = useState('');
  const [showRequestsPass, setShowRequestsPass] = useState(false);

  const showNotification = (type: 'success' | 'error', text: string) => {
    if (type === 'success') {
      setSuccessMsg(text);
      setErrorMsg(null);
    } else {
      setErrorMsg(text);
      setSuccessMsg(null);
    }
    setTimeout(() => {
      setSuccessMsg(null);
      setErrorMsg(null);
    }, 5000);
  };

  // Add Supervisor User submit action
  const handleAddOfficial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficialName.trim()) {
      showNotification('error', 'يرجى إدخال اسم المسؤول/المشرف بالكامل');
      return;
    }
    if (!newOfficialPassword || newOfficialPassword.length < 3) {
      showNotification('error', 'يجب ألا تقل كلمة المرور للمشرف عن 3 رموز');
      return;
    }

    try {
      db.addOfficial({
        name: newOfficialName.trim(),
        cash_custody: newOfficialCash,
        visa_custody: newOfficialVisa,
        password: newOfficialPassword
      });

      showNotification('success', `تمت إضافة المشرف "${newOfficialName}" بنجاح وتأسيس محافظ العهد الافتراضية له!`);
      
      // Reset input fields
      setNewOfficialName('');
      setNewOfficialPassword('123');
      setNewOfficialCash(0);
      setNewOfficialVisa(0);
    } catch (err: any) {
      showNotification('error', err.message || 'فشل إضافة المستخدم');
    }
  };

  // Delete Supervisor User submit action
  const handleDeleteOfficial = (id: string, name: string) => {
    if (confirm(`تحذير هام جداً: هل أنت متأكد من رغبتك بحذف المستخدم/المشرف "${name}"؟\nسيؤدي هذا إلى تجميد أو إخلاء عهده وحساباته الفرعية أيضاً من شاشة المدخلات.`)) {
      try {
        db.deleteOfficial(id);
        showNotification('success', `تم حذف حساب المستخدم/المشرف "${name}" وحساباته الفرعية بنجاح.`);
      } catch (err: any) {
        showNotification('error', 'عذراً، فشل تنفيذ أمر حذف المستخدم.');
      }
    }
  };

  // Change individual Supervisor's password action
  const handleUpdateOfficialPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOfficialId) return;
    if (!newPasswordForOfficial || newPasswordForOfficial.length < 3) {
      showNotification('error', 'كلمة المرور الجديدة قصيرة جداً (الحد الأدنى 3 رموز)');
      return;
    }

    const official = db.officials.find(o => o.id === editingOfficialId);
    if (!official) return;

    db.updateOfficialPassword(editingOfficialId, newPasswordForOfficial);
    showNotification('success', `تم تغيير كلمة المرور للمشرف "${official.name}" إلى كلمة جديدة بنجاح.`);
    
    // Reset editing states
    setEditingOfficialId('');
    setNewPasswordForOfficial('');
  };

  // Change individual Supervisor's username (name) action
  const handleUpdateOfficialName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNameOfficialId) return;
    const trimmed = newNameForOfficial.trim();
    if (!trimmed) {
      showNotification('error', 'يرجى إدخال اسم مستخدم صحيح (لا يمكن أن يكون فارغًا)');
      return;
    }

    const official = db.officials.find(o => o.id === editingNameOfficialId);
    if (!official) return;

    db.updateOfficialName(editingNameOfficialId, trimmed);
    showNotification('success', `تم تغيير اسم المستخدم من "${official.name}" إلى "${trimmed}" بنجاح.`);

    // Reset editing states
    setEditingNameOfficialId('');
    setNewNameForOfficial('');
  };

  // Change Admin password submit action
  const handleChangeAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const storedAdminPass = db.adminPassword || localStorage.getItem('elbanna_admin_password') || 'admin';
    
    if (currentAdminPass !== storedAdminPass) {
      showNotification('error', 'كلمة مرور الأدمن الحالية غير صحيحة!');
      return;
    }
    if (newAdminPass.length < 4) {
      showNotification('error', 'يجب أن تبلغ كلمة المرور الجديدة للأدمن 4 رموز على الأقل');
      return;
    }
    if (newAdminPass !== confirmAdminPass) {
      showNotification('error', 'يرجى تأكيد كلمة المرور بشكل متطابق؛ لم تتطابق المدخلات.');
      return;
    }

    if (db.updateAdminPassword) {
      db.updateAdminPassword(newAdminPass);
    } else {
      localStorage.setItem('elbanna_admin_password', newAdminPass);
    }
    showNotification('success', 'تم تغيير كلمة مرور الأدمن للنظام بنجاح وتأمين لوحة التحكم!');
    setCurrentAdminPass('');
    setNewAdminPass('');
    setConfirmAdminPass('');
  };

  // Change Manager password submit action
  const handleChangeManagerPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const storedManagerPass = db.managerPassword || localStorage.getItem('elbanna_manager_password') || 'manager';

    if (currentManagerPass !== storedManagerPass) {
      showNotification('error', 'كلمة مرور المدير المالي الحالية غير صحيحة!');
      return;
    }
    if (newManagerPass.length < 4) {
      showNotification('error', 'يجب أن تبلغ كلمة المرور الجديدة للمدير المالي 4 رموز على الأقل');
      return;
    }
    if (newManagerPass !== confirmManagerPass) {
      showNotification('error', 'يرجى تأكيد كلمة المرور بشكل متطابق؛ لم تتطابق مدخلات المدير.');
      return;
    }

    if (db.updateManagerPassword) {
      db.updateManagerPassword(newManagerPass);
    } else {
      localStorage.setItem('elbanna_manager_password', newManagerPass);
    }
    showNotification('success', 'تم تغيير كلمة مرور المدير العام/المالي للحركة بنجاح!');
    setCurrentManagerPass('');
    setNewManagerPass('');
    setConfirmManagerPass('');
  };

  // Change Movement Supervisor password submit action
  const handleChangeMovementPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPass = db.movementSupervisorPassword || localStorage.getItem('elbanna_movement_supervisor_password') || 'movement123';

    if (currentMovementPass !== storedPass) {
      showNotification('error', 'كلمة مرور مشرف الحركة الحالية غير صحيحة!');
      return;
    }
    if (newMovementPass.length < 4) {
      showNotification('error', 'يجب أن تبلغ كلمة المرور الجديدة لمشرف الحركة 4 رموز على الأقل');
      return;
    }
    if (newMovementPass !== confirmMovementPass) {
      showNotification('error', 'يرجى تأكيد كلمة المرور بشكل متطابق؛ لم تتطابق مدخلات مشرف الحركة.');
      return;
    }

    if (db.updateMovementSupervisorPassword) {
      db.updateMovementSupervisorPassword(newMovementPass);
    } else {
      localStorage.setItem('elbanna_movement_supervisor_password', newMovementPass);
    }
    showNotification('success', 'تم تغيير كلمة مرور مشرف الحركة بنجاح!');
    setCurrentMovementPass('');
    setNewMovementPass('');
    setConfirmMovementPass('');
  };

  // Change Requests Agent password submit action
  const handleChangeRequestsPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPass = db.requestsAgentPassword || localStorage.getItem('elbanna_requests_agent_password') || 'requests123';

    if (currentRequestsPass !== storedPass) {
      showNotification('error', 'كلمة مرور مستخدم طلبات النقل الحالية غير صحيحة!');
      return;
    }
    if (newRequestsPass.length < 4) {
      showNotification('error', 'يجب أن تبلغ كلمة المرور الجديدة لمستخدم طلبات النقل 4 رموز على الأقل');
      return;
    }
    if (newRequestsPass !== confirmRequestsPass) {
      showNotification('error', 'يرجى تأكيد كلمة المرور بشكل متطابق؛ لم تتطابق مدخلات طلبات النقل.');
      return;
    }

    if (db.updateRequestsAgentPassword) {
      db.updateRequestsAgentPassword(newRequestsPass);
    } else {
      localStorage.setItem('elbanna_requests_agent_password', newRequestsPass);
    }
    showNotification('success', 'تم تغيير كلمة مرور مستخدم طلبات النقل بنجاح!');
    setCurrentRequestsPass('');
    setNewRequestsPass('');
    setConfirmRequestsPass('');
  };

  // Toggle Visibility of selected password in grid list
  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6" id="users_settings_tab_view">
      
      {/* 1. Page Header Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 tracking-wider block uppercase mb-1">لوحة الأمن والتحكم</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 font-sans tracking-tight">إدارة مستخدمي النظام والصلاحيات</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">بوابة مشرف الأدمن لإضافة وحذف المشرفين، تعديل كلمات المرور، ومراجعة الشاشات المتاحة لكل رتبة.</p>
        </div>
        
        {/* Dynamic Nav Sub-Tabs inside settings */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 self-start md:self-center">
          <button
            onClick={() => setActiveSubTab('supervisors')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'supervisors' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            مشرفي الصرف والعهد
          </button>
          <button
            onClick={() => setActiveSubTab('admin_manager')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'admin_manager' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            كلمات مرور الإدارة والأدمن
          </button>
          <button
            onClick={() => setActiveSubTab('permissions')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'permissions' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            خريطة صلاحيات الشاشات
          </button>
        </div>
      </div>

      {/* Immediate status alerts banners */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl p-4 flex items-center gap-3 text-xs md:text-sm shadow-xl shadow-emerald-500/5 antialiased animate-fade-in">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span className="font-extrabold">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl p-4 flex items-center gap-3 text-xs md:text-sm shadow-xl shadow-rose-500/5 antialiased animate-fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
          <span className="font-extrabold">{errorMsg}</span>
        </div>
      )}

      {/* Tab Case A: Supervisors Control */}
      {activeSubTab === 'supervisors' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main User List panel */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-250 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span>قائمة مشرفي الصرف ومراقبي العهد المسجلين ({db.officials.length})</span>
              </h3>
            </div>

            <div className="overflow-x-auto text-xs font-sans">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-850">
                    <th className="py-3 px-2 text-center w-8">م</th>
                    <th className="py-3 px-3">كود الاتصال</th>
                    <th className="py-3 px-3">اسم مشرف الصرف</th>
                    <th className="py-3 px-3">كلمة المرور الحالية</th>
                    <th className="py-3 px-3 text-left">العهد المبدئية نقدي/فيزا</th>
                    <th className="py-3 px-2 text-center w-28">الإجراءات والتحكم</th>
                  </tr>
                </thead>
                <tbody>
                  {db.officials.map((off, index) => {
                    const isVisible = visiblePasswords[off.id] || false;
                    const plainPassword = off.password || '123';
                    const isEditing = editingOfficialId === off.id;

                    return (
                      <tr key={off.id} className="border-b border-slate-850/60 hover:bg-slate-950/20 text-slate-300">
                        <td className="py-3.5 px-2 font-mono text-center text-slate-500">{index + 1}</td>
                        <td className="py-3.5 px-3 font-mono text-slate-500 text-[10px]">@{off.id}</td>
                        <td className="py-3.5 px-3 font-extrabold text-slate-205">
                          {editingNameOfficialId === off.id ? (
                            <form onSubmit={handleUpdateOfficialName} className="flex gap-1.5 max-w-[190px]">
                              <input
                                type="text"
                                required
                                autoFocus
                                placeholder="اسم المستخدم الجديد"
                                value={newNameForOfficial}
                                onChange={(e) => setNewNameForOfficial(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none w-28 focus:border-emerald-500"
                              />
                              <button
                                type="submit"
                                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2 py-1 rounded text-[10px] font-black"
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNameOfficialId('')}
                                className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[10px]"
                              >
                                إلغاء
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span>{off.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNameOfficialId(off.id);
                                  setNewNameForOfficial(off.name);
                                }}
                                className="text-slate-500 hover:text-emerald-400 p-0.5"
                                title="تغيير اسم المستخدم"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        
                        <td className="py-3.5 px-3">
                          {isEditing ? (
                            <form onSubmit={handleUpdateOfficialPassword} className="flex gap-1.5 max-w-[170px]">
                              <input
                                type="text"
                                required
                                placeholder="باسورد جديد"
                                value={newPasswordForOfficial}
                                onChange={(e) => setNewPasswordForOfficial(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none w-24 focus:border-emerald-500"
                              />
                              <button
                                type="submit"
                                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2 py-1 rounded text-[10px] font-black"
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOfficialId('')}
                                className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[10px]"
                              >
                                إلغاء
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold bg-slate-950 text-emerald-400 border border-slate-800 px-2 py-1 rounded">
                                {isVisible ? plainPassword : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(off.id)}
                                className="text-slate-500 hover:text-slate-300 p-0.5"
                                title={isVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                              >
                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-left font-mono">
                          <span className="text-slate-400">كاش:</span>{' '}
                          <span className="text-emerald-400 font-bold">{(off.cash_custody ?? 0).toLocaleString()}</span>{' '}
                          | <span className="text-slate-400">فيزا:</span>{' '}
                          <span className="text-indigo-400 font-bold">{(off.visa_custody ?? 0).toLocaleString()} ج.م</span>
                        </td>

                        <td className="py-3.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOfficialId(off.id);
                                setNewPasswordForOfficial(plainPassword);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold border border-slate-800 rounded bg-slate-950 hover:bg-slate-850 hover:text-white text-slate-400 transition-all"
                            >
                              تغيير الباسورد
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOfficial(off.id, off.name)}
                              disabled={db.currentUser?.officialId === off.id}
                              className={`p-1 border text-red-400 bg-red-500/5 hover:bg-red-500/15 rounded transition-all ${db.currentUser?.officialId === off.id ? 'opacity-30 cursor-not-allowed border-transparent' : 'border-red-500/10 hover:border-red-500/30'}`}
                              title={db.currentUser?.officialId === off.id ? 'لا يمكن حذف الحساب النشط الحالي للمشرف' : 'حذف المشرف'}
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {db.officials.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-bold italic font-sans">
                        ⚠️ لا يوجد أية حسابات مشرفين مسجلة بقاعدة البيانات الحالية.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick alert details footer box */}
            <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl leading-relaxed text-[11px] text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-slate-300">ماتعلم به عن الخصومات وتتبع الحركات الافتراضية للعهد:</p>
                <p className="mt-1 leading-normal">عند إضافة مشرف صرف جديد يدويًا، يُنشئ النظام له محافظًا محاسبية افتراضية في شاشة الأجهزة (كاش افتراضي، وفيزا افتراضية) ويُغذيها بالقيم المالية المدخلة لتتبع ميزان الرصيد والوارد والصادر فوريًا بالتكامل مع الفواتير.</p>
              </div>
            </div>
          </div>

          {/* Form Create Supervisor User */}
          <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 self-start space-y-4">
            <h3 className="text-sm font-black text-slate-250 flex items-center gap-2 border-b border-slate-800 pb-3">
              <UserPlus className="w-4 h-4 text-indigo-400" />
              <span>إضافة مشرف صرف وحساب عهدة جديد</span>
            </h3>

            <form onSubmit={handleAddOfficial} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">اسم المشرف بالكامل</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: م. أحمد صالح خليل"
                  value={newOfficialName}
                  onChange={(e) => setNewOfficialName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">تعيين كلمة المرور الافتراضية</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="مثال: 123"
                    value={newOfficialPassword}
                    onChange={(e) => setNewOfficialPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-2 text-indigo-400 font-mono font-black outline-none"
                  />
                  <Key className="w-4 h-4 text-slate-600 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-3">
                <p className="font-extrabold text-[10px] text-slate-400 block border-b border-slate-800 pb-1.5 mb-1 text-center">العهدة الافتتاحية للمسؤول عند التسجيل</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-405 font-bold">عهدة نقدي (كاش)</span>
                    <input
                      type="number"
                      min="0"
                      value={newOfficialCash || ''}
                      onChange={(e) => setNewOfficialCash(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="0 ج.م"
                      className="w-28 text-left bg-slate-900 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-mono font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-405 font-bold">عهدة فيزا بنكية</span>
                    <input
                      type="number"
                      min="0"
                      value={newOfficialVisa || ''}
                      onChange={(e) => setNewOfficialVisa(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="0 ج.م"
                      className="w-28 text-left bg-slate-900 border border-slate-800 rounded px-2 py-1 text-indigo-400 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow shadow-indigo-500/10 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>حفظ المسؤول وبدء المحفظة</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab Case B: Change Admin & Manager Password */}
      {activeSubTab === 'admin_manager' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Panel Form 1: Admin admin_pass */}
          <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-rose-400">
              <ShieldCheck className="w-5 h-5 text-rose-500" />
              <div>
                <h3 className="text-sm font-black text-slate-100">تغيير كلمة مرور أدمن النظام</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">الحساب الأساسي للتحليلات والتعديلات الشاملة بقاعدة البيانات.</p>
              </div>
            </div>

            {/* عرض كلمة المرور الحالية للأدمن */}
            <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold">كلمة المرور الحالية للأدمن:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-rose-400 bg-slate-950 border border-slate-805 px-2.5 py-1 rounded">
                    {showAdminPass ? (db.adminPassword || localStorage.getItem('elbanna_admin_password') || 'admin') : '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="text-slate-500 hover:text-slate-300 p-1 bg-slate-900 border border-slate-800 rounded transition-all"
                    title={showAdminPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showAdminPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangeAdminPassword} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-405 font-bold">اسم المستخدم للأدمن (افتراضي وثابت)</label>
                <input
                  type="text"
                  disabled
                  value="admin"
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-2 text-slate-500 font-mono font-bold cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">أدخل كلمة مرور الأدمن الحالية</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={currentAdminPass}
                  onChange={(e) => setCurrentAdminPass(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="حد أدنى 4 رموز"
                    value={newAdminPass}
                    onChange={(e) => setNewAdminPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">تأكيد كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="كرر نفس الكلمة"
                    value={confirmAdminPass}
                    onChange={(e) => setConfirmAdminPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-rose-500 hover:bg-rose-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow-lg shadow-rose-500/5 cursor-pointer"
              >
                تحديث أمان الأدمن
              </button>
            </form>
          </div>

          {/* Panel Form 2: Manager manager_pass */}
          <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-emerald-400">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <div>
                <h3 className="text-sm font-black text-slate-100">تغيير كلمة مرور المدير العام / المالي</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">الحساب المخصص لمدير الحركة لمراجعة وتدقيق التقارير والمطبوعات.</p>
              </div>
            </div>

            {/* عرض كلمة المرور الحالية للمدير */}
            <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold">كلمة المرور الحالية للمدير المالي:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-450 bg-slate-950 border border-slate-805 px-2.5 py-1 rounded">
                    {showManagerPass ? (db.managerPassword || localStorage.getItem('elbanna_manager_password') || 'manager') : '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowManagerPass(!showManagerPass)}
                    className="text-slate-500 hover:text-slate-300 p-1 bg-slate-900 border border-slate-800 rounded transition-all"
                    title={showManagerPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showManagerPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangeManagerPassword} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-405 font-bold">اسم المستخدم للمدير (افتراضي وثابت)</label>
                <input
                  type="text"
                  disabled
                  value="manager"
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-2 text-slate-500 font-mono font-bold cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">أدخل كلمة مرور المدير الحالية</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={currentManagerPass}
                  onChange={(e) => setCurrentManagerPass(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="حد أدنى 4 رموز"
                    value={newManagerPass}
                    onChange={(e) => setNewManagerPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">تأكيد كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="كرر نفس الكلمة"
                    value={confirmManagerPass}
                    onChange={(e) => setConfirmManagerPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/5 cursor-pointer"
              >
                تحديث أمان المدير العام
              </button>
            </form>
          </div>

          {/* Panel Form 3: Movement Supervisor password */}
          <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-indigo-400">
              <Truck className="w-5 h-5 text-indigo-500" />
              <div>
                <h3 className="text-sm font-black text-slate-100">تغيير كلمة مرور مشرف الحركة</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">الحساب المخصص لمشرف الحركة للرد على طلبات النقل وربطها بسيارة وسائق.</p>
              </div>
            </div>

            {/* عرض كلمة المرور الحالية لمشرف الحركة */}
            <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold">كلمة المرور الحالية لمشرف الحركة:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-indigo-400 bg-slate-950 border border-slate-805 px-2.5 py-1 rounded">
                    {showMovementPass ? (db.movementSupervisorPassword || localStorage.getItem('elbanna_movement_supervisor_password') || 'movement123') : '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMovementPass(!showMovementPass)}
                    className="text-slate-500 hover:text-slate-300 p-1 bg-slate-900 border border-slate-800 rounded transition-all"
                    title={showMovementPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showMovementPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangeMovementPassword} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-405 font-bold">اسم المستخدم لمشرف الحركة (افتراضي وثابت)</label>
                <input
                  type="text"
                  disabled
                  value="movement_supervisor"
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-2 text-slate-500 font-mono font-bold cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">أدخل كلمة مرور مشرف الحركة الحالية</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={currentMovementPass}
                  onChange={(e) => setCurrentMovementPass(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="حد أدنى 4 رموز"
                    value={newMovementPass}
                    onChange={(e) => setNewMovementPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">تأكيد كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="كرر نفس الكلمة"
                    value={confirmMovementPass}
                    onChange={(e) => setConfirmMovementPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/5 cursor-pointer"
              >
                تحديث أمان مشرف الحركة
              </button>
            </form>
          </div>

          {/* Panel Form 4: Requests Agent password */}
          <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-amber-400">
              <ClipboardList className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-sm font-black text-slate-100">تغيير كلمة مرور مستخدم طلبات النقل</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">الحساب المخصص لتسجيل طلبات النقل الجديدة من المزارع ومتابعة حالتها.</p>
              </div>
            </div>

            {/* عرض كلمة المرور الحالية لمستخدم طلبات النقل */}
            <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold">كلمة المرور الحالية لمستخدم طلبات النقل:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-400 bg-slate-950 border border-slate-805 px-2.5 py-1 rounded">
                    {showRequestsPass ? (db.requestsAgentPassword || localStorage.getItem('elbanna_requests_agent_password') || 'requests123') : '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRequestsPass(!showRequestsPass)}
                    className="text-slate-500 hover:text-slate-300 p-1 bg-slate-900 border border-slate-800 rounded transition-all"
                    title={showRequestsPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showRequestsPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangeRequestsPassword} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-405 font-bold">اسم المستخدم لطلبات النقل (افتراضي وثابت)</label>
                <input
                  type="text"
                  disabled
                  value="requests_agent"
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-2 text-slate-500 font-mono font-bold cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">أدخل كلمة المرور الحالية لطلبات النقل</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={currentRequestsPass}
                  onChange={(e) => setCurrentRequestsPass(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="حد أدنى 4 رموز"
                    value={newRequestsPass}
                    onChange={(e) => setNewRequestsPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">تأكيد كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    placeholder="كرر نفس الكلمة"
                    value={confirmRequestsPass}
                    onChange={(e) => setConfirmRequestsPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-2.5 py-2 text-slate-200 outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/5 cursor-pointer"
              >
                تحديث أمان مستخدم طلبات النقل
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab Case C: Permissions Mapping — قابلة للتعديل بالكامل (إضافة/تعديل/حذف صلاحية شاشة لكل رتبة) */}
      {activeSubTab === 'permissions' && (
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-slate-250 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span>خريطة وحوكمة الصلاحيات وحظر الشاشات للمستخدمين (Role Matrix)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">فعّل أو ألغِ صلاحية أي شاشة لأي رتبة مباشرة من الجدول — يتم تفعيل التغيير فورًا لكل مستخدمي الرتبة ومزامنته سحابيًا.</p>
          </div>

          <div className="overflow-x-auto text-xs font-sans">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-850">
                  <th className="py-3 px-3 sticky right-0 bg-slate-950">الشاشة</th>
                  {ALL_ROLES.map(role => (
                    <th key={role.id} className="py-3 px-2 text-center min-w-[110px]">{role.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_SCREENS.map(screen => (
                  <tr key={screen.id} className="border-b border-slate-850/60 hover:bg-slate-950/20 text-slate-300">
                    <td className="py-2.5 px-3 font-bold text-slate-250 sticky right-0 bg-slate-900">{screen.label}</td>
                    {ALL_ROLES.map(role => {
                      const currentScreens = db.rolePermissions?.[role.id] || [];
                      const isChecked = currentScreens.includes(screen.id);
                      // نمنع إلغاء صلاحية أدمن النظام على شاشة "حماية وإعدادات حسابات النظام" نفسها
                      // حتى لا يفقد الأدمن قدرته على الرجوع وتعديل الصلاحيات مرة أخرى
                      const isLockedCell = role.id === 'admin' && screen.id === 'users_settings';
                      return (
                        <td key={role.id} className="py-2.5 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isLockedCell}
                            title={isLockedCell ? 'لا يمكن إلغاء وصول الأدمن لشاشة الصلاحيات نفسها، منعًا لفقد السيطرة على النظام' : undefined}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...currentScreens, screen.id]
                                : currentScreens.filter(id => id !== screen.id);
                              db.updateRolePermissions(role.id, next);
                            }}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed text-right border-t border-slate-850/50 pt-3">
            * تنويه أمان: الصكوك المحاسبية للعهد يتم مراجعتها في الوقت الفعلي ومزامنتها سحابياً وتجميدها بمجرد ترحيل الفواتير من قبل الأدمن لموثوقية عالية.
          </p>
        </div>
      )}

    </div>
  );
}

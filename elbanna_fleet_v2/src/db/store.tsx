/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  Driver, 
  Official, 
  Car, 
  Violation, 
  Invoice, 
  InvoiceItem, 
  InvoiceAuditLog, 
  DriverAccountMovement, 
  CustodyAccount, 
  CustodyMovement,
  User,
  TransportRequest,
  AppNotification,
  CostItemType,
  RoutePriceEntry,
  TransportRequestCost,
  CarDailyCost,
  CarMonthlyCost,
  FuelLog,
  ServicePlan,
  SystemUser,
  MaintenanceRequest,
  MaintenancePartItem,
  MaintenanceInvoice,
  MaintenanceInvoiceItem
} from '../types';
import { getSupabaseClient } from './supabaseClient';
import { hashPassword, isHashedPassword, verifyPassword } from './passwordUtil';
import {
  INITIAL_OFFICIALS,
  INITIAL_DRIVERS,
  INITIAL_CARS,
  INITIAL_VIOLATIONS,
  INITIAL_INVOICES,
  INITIAL_INVOICE_ITEMS,
  INITIAL_AUDIT_LOGS,
  INITIAL_ACCOUNT_MOVEMENTS
} from './mockData';

import { normalizeDateToYmd } from './dates';
import { generateId } from './ids';
import { maintenanceCostForCarDay } from './logic/maintenanceCost';
import { normalizeMaintenanceRequest } from './logic/maintenanceFlow';
import {
  NotificationDraft, maintenanceNotification, transportNotification, notificationUserKey, isVisibleTo, resolveTargetScreen, isUnread,
  normalizeNotification, mergeNotifications, pruneNotifications, notificationsToUpload,
} from './logic/notifications';
import { normalizeTransportRequest, startTripPatch, advanceTrip, closeTripByOfficePatch, TripAction, TripPayload } from './logic/tripFlow';
import { loadSavedArray, loadSavedObject, cleanupMockData } from './storage';
import type { DbContextType } from './storeTypes';
import { DEFAULT_ROLE_PERMISSIONS, mergeNewDefaultScreens } from './permissions';
import {
  isInvoiceApproved as isInvoiceApprovedPure, licenseCostForCarDay, planInvoiceApproval, planInvoiceRefund,
  validateCustodyTransfer, applyTransferToOfficial, isMonthLockedIn, canEditMonthFor,
} from './logic/invoicePlans';

// إعادة تصدير عشان باقي الملفات (CarsDriversTab...) تفضل تستورد من store زي ما هي
export { normalizeDateToYmd };

const DbContext = createContext<DbContextType | undefined>(undefined);

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drivers, setDrivers] = useState<Driver[]>(() => 
    loadSavedArray('elbanna_drivers', INITIAL_DRIVERS)
  );

  const [officials, setOfficials] = useState<Official[]>(() => 
    loadSavedArray('elbanna_officials', INITIAL_OFFICIALS)
  );

  const [cars, setCars] = useState<Car[]>(() => loadSavedArray('elbanna_cars', []));

  const [violations, setViolations] = useState<Violation[]>(() => {
    const raw = loadSavedArray('elbanna_violations', INITIAL_VIOLATIONS);
    return raw.map(v => ({ ...v, violation_date: normalizeDateToYmd(v.violation_date) }));
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => loadSavedArray('elbanna_invoices', []));

  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(() => loadSavedArray('elbanna_invoice_items', []));

  const [auditLogs, setAuditLogs] = useState<InvoiceAuditLog[]>(() => 
    loadSavedArray('elbanna_audit_logs', INITIAL_AUDIT_LOGS)
  );

  const [movements, setMovements] = useState<DriverAccountMovement[]>(() => {
    const raw = loadSavedArray('elbanna_movements', INITIAL_ACCOUNT_MOVEMENTS);
    return raw.map(m => ({ ...m, date: normalizeDateToYmd(m.date) }));
  });

  const [adminPassword, _setAdminPassword] = useState<string>(() => 
    localStorage.getItem('elbanna_admin_password') || 'admin'
  );

  const [managerPassword, _setManagerPassword] = useState<string>(() => 
    localStorage.getItem('elbanna_manager_password') || 'manager'
  );

  // أسماء المستخدمين القابلة للتعديل لكل حساب من الحسابات الثابتة (بدل الاسم المقفول قديمًا)
  const [adminUsername, _setAdminUsername] = useState<string>(() =>
    localStorage.getItem('elbanna_admin_username') || 'admin'
  );
  const [managerUsername, _setManagerUsername] = useState<string>(() =>
    localStorage.getItem('elbanna_manager_username') || 'manager'
  );

  const updateAdminUsername = (newUsername: string) => {
    const trimmed = newUsername.trim();
    if (!trimmed) return;
    _setAdminUsername(trimmed);
    localStorage.setItem('elbanna_admin_username', trimmed);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'admin_username', value: trimmed })
        .then(({ error }) => { if (error) console.warn("Supabase save admin_username error:", error); });
    }
  };

  const updateManagerUsername = (newUsername: string) => {
    const trimmed = newUsername.trim();
    if (!trimmed) return;
    _setManagerUsername(trimmed);
    localStorage.setItem('elbanna_manager_username', trimmed);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'manager_username', value: trimmed })
        .then(({ error }) => { if (error) console.warn("Supabase save manager_username error:", error); });
    }
  };

  const updateAdminPassword = (newPass: string) => {
    _setAdminPassword(newPass);
    localStorage.setItem('elbanna_admin_password', newPass);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'admin_password', value: newPass })
        .then(({ error }) => {
          if (error) console.warn("Supabase save admin_password error:", error);
        });
    }
  };

  const updateManagerPassword = (newPass: string) => {
    _setManagerPassword(newPass);
    localStorage.setItem('elbanna_manager_password', newPass);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'manager_password', value: newPass })
        .then(({ error }) => {
          if (error) console.warn("Supabase save manager_password error:", error);
        });
    }
  };

  const [movementSupervisorPassword, _setMovementSupervisorPassword] = useState<string>(() =>
    localStorage.getItem('elbanna_movement_supervisor_password') || 'movement123'
  );

  const [requestsAgentPassword, _setRequestsAgentPassword] = useState<string>(() =>
    localStorage.getItem('elbanna_requests_agent_password') || 'requests123'
  );

  const [movementSupervisorUsername, _setMovementSupervisorUsername] = useState<string>(() =>
    localStorage.getItem('elbanna_movement_supervisor_username') || 'movement_supervisor'
  );
  const [requestsAgentUsername, _setRequestsAgentUsername] = useState<string>(() =>
    localStorage.getItem('elbanna_requests_agent_username') || 'requests_agent'
  );

  const updateMovementSupervisorUsername = (newUsername: string) => {
    const trimmed = newUsername.trim();
    if (!trimmed) return;
    _setMovementSupervisorUsername(trimmed);
    localStorage.setItem('elbanna_movement_supervisor_username', trimmed);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'movement_supervisor_username', value: trimmed })
        .then(({ error }) => { if (error) console.warn("Supabase save movement_supervisor_username error:", error); });
    }
  };

  const updateRequestsAgentUsername = (newUsername: string) => {
    const trimmed = newUsername.trim();
    if (!trimmed) return;
    _setRequestsAgentUsername(trimmed);
    localStorage.setItem('elbanna_requests_agent_username', trimmed);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'requests_agent_username', value: trimmed })
        .then(({ error }) => { if (error) console.warn("Supabase save requests_agent_username error:", error); });
    }
  };

  const updateMovementSupervisorPassword = (newPass: string) => {
    _setMovementSupervisorPassword(newPass);
    localStorage.setItem('elbanna_movement_supervisor_password', newPass);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'movement_supervisor_password', value: newPass })
        .then(({ error }) => {
          if (error) console.warn("Supabase save movement_supervisor_password error:", error);
        });
    }
  };

  const updateRequestsAgentPassword = (newPass: string) => {
    _setRequestsAgentPassword(newPass);
    localStorage.setItem('elbanna_requests_agent_password', newPass);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'requests_agent_password', value: newPass })
        .then(({ error }) => {
          if (error) console.warn("Supabase save requests_agent_password error:", error);
        });
    }
  };

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('elbanna_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = async (
    username: string, 
    role: 'admin' | 'manager' | 'supervisor' | 'movement_supervisor' | 'requests_agent', 
    password?: string, 
    officialId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const supabase = getSupabaseClient();
    
    if (role === 'admin') {
      let savedAdminPass = adminPassword;
      let savedAdminUser = adminUsername;
      if (supabase) {
        try {
          const { data, error } = await supabase.from('system_settings').select('key, value').in('key', ['admin_password', 'admin_username']);
          if (!error && data) {
            const passRow = data.find(r => r.key === 'admin_password');
            const userRow = data.find(r => r.key === 'admin_username');
            if (passRow?.value) {
              savedAdminPass = passRow.value;
              _setAdminPassword(passRow.value);
              localStorage.setItem('elbanna_admin_password', passRow.value);
            }
            if (userRow?.value) {
              savedAdminUser = userRow.value;
              _setAdminUsername(userRow.value);
              localStorage.setItem('elbanna_admin_username', userRow.value);
            }
          }
        } catch (e) {
          console.warn("Direct login check error:", e);
        }
      }
      if (username.trim().toLowerCase() === savedAdminUser.trim().toLowerCase() && password === savedAdminPass) {
        const uObj: User = { username: savedAdminUser, role: 'admin', name: 'أدمن النظام', allowedScreens: rolePermissions.admin || DEFAULT_ROLE_PERMISSIONS.admin };
        setCurrentUser(uObj);
        localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
        return { success: true };
      }
      return { success: false, error: 'اسم المستخدم أو كلمة المرور للأدمن غير صحيحة' };
    } else if (role === 'manager') {
      let savedManagerPass = managerPassword;
      let savedManagerUser = managerUsername;
      if (supabase) {
        try {
          const { data, error } = await supabase.from('system_settings').select('key, value').in('key', ['manager_password', 'manager_username']);
          if (!error && data) {
            const passRow = data.find(r => r.key === 'manager_password');
            const userRow = data.find(r => r.key === 'manager_username');
            if (passRow?.value) {
              savedManagerPass = passRow.value;
              _setManagerPassword(passRow.value);
              localStorage.setItem('elbanna_manager_password', passRow.value);
            }
            if (userRow?.value) {
              savedManagerUser = userRow.value;
              _setManagerUsername(userRow.value);
              localStorage.setItem('elbanna_manager_username', userRow.value);
            }
          }
        } catch (e) {
          console.warn("Direct login check error:", e);
        }
      }
      if (username.trim().toLowerCase() === savedManagerUser.trim().toLowerCase() && password === savedManagerPass) {
        const uObj: User = { username: savedManagerUser, role: 'manager', name: 'مدير عام الحركة', allowedScreens: rolePermissions.manager || DEFAULT_ROLE_PERMISSIONS.manager };
        setCurrentUser(uObj);
        localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
        return { success: true };
      }
      return { success: false, error: 'اسم المستخدم أو كلمة المرور للمدير غير صحيحة' };
    } else if (role === 'supervisor') {
      if (!officialId) {
        return { success: false, error: 'الرجاء اختيار اسم مشرف الصرف' };
      }
      
      let expectedPassword = '123';
      let officialName = '';
      
      if (supabase) {
        try {
          const { data, error } = await supabase.from('officials').select('password, name').eq('id', officialId).maybeSingle();
          if (!error && data) {
            expectedPassword = data.password || '123';
            officialName = data.name;
          }
        } catch (e) {
          console.warn("Direct login official check error:", e);
        }
      }
      
      if (!officialName) {
        const official = officials.find(o => o.id === officialId);
        if (official) {
          expectedPassword = official.password || '123';
          officialName = official.name;
        }
      }
      
      if (officialName) {
        if (password === expectedPassword) {
          const uObj: User = { 
            username: `supervisor_${officialId}`, 
            role: 'supervisor', 
            officialId, 
            name: officialName,
            allowedScreens: officialCustomScreens[officialId] || rolePermissions.supervisor || DEFAULT_ROLE_PERMISSIONS.supervisor
          };
          setCurrentUser(uObj);
          localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
          return { success: true };
        }
        return { success: false, error: 'كلمة المرور لمشرف الصرف غير صحيحة' };
      }
      return { success: false, error: 'مشرف الصرف غير موجود بقاعدة البيانات' };
    } else if (role === 'movement_supervisor') {
      let savedPass = movementSupervisorPassword;
      let savedUser = movementSupervisorUsername;
      if (supabase) {
        try {
          const { data, error } = await supabase.from('system_settings').select('key, value').in('key', ['movement_supervisor_password', 'movement_supervisor_username']);
          if (!error && data) {
            const passRow = data.find(r => r.key === 'movement_supervisor_password');
            const userRow = data.find(r => r.key === 'movement_supervisor_username');
            if (passRow?.value) {
              savedPass = passRow.value;
              _setMovementSupervisorPassword(passRow.value);
              localStorage.setItem('elbanna_movement_supervisor_password', passRow.value);
            }
            if (userRow?.value) {
              savedUser = userRow.value;
              _setMovementSupervisorUsername(userRow.value);
              localStorage.setItem('elbanna_movement_supervisor_username', userRow.value);
            }
          }
        } catch (e) {
          console.warn("Direct login check error:", e);
        }
      }
      if (username.trim().toLowerCase() === savedUser.trim().toLowerCase() && password === savedPass) {
        const uObj: User = { username: savedUser, role: 'movement_supervisor', name: 'مشرف الحركة', allowedScreens: rolePermissions.movement_supervisor || DEFAULT_ROLE_PERMISSIONS.movement_supervisor };
        setCurrentUser(uObj);
        localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
        return { success: true };
      }
      return { success: false, error: 'اسم المستخدم أو كلمة المرور لمشرف الحركة غير صحيحة' };
    } else if (role === 'requests_agent') {
      let savedPass = requestsAgentPassword;
      let savedUser = requestsAgentUsername;
      if (supabase) {
        try {
          const { data, error } = await supabase.from('system_settings').select('key, value').in('key', ['requests_agent_password', 'requests_agent_username']);
          if (!error && data) {
            const passRow = data.find(r => r.key === 'requests_agent_password');
            const userRow = data.find(r => r.key === 'requests_agent_username');
            if (passRow?.value) {
              savedPass = passRow.value;
              _setRequestsAgentPassword(passRow.value);
              localStorage.setItem('elbanna_requests_agent_password', passRow.value);
            }
            if (userRow?.value) {
              savedUser = userRow.value;
              _setRequestsAgentUsername(userRow.value);
              localStorage.setItem('elbanna_requests_agent_username', userRow.value);
            }
          }
        } catch (e) {
          console.warn("Direct login check error:", e);
        }
      }
      if (username.trim().toLowerCase() === savedUser.trim().toLowerCase() && password === savedPass) {
        const uObj: User = { username: savedUser, role: 'requests_agent', name: 'مستخدم طلبات النقل', allowedScreens: rolePermissions.requests_agent || DEFAULT_ROLE_PERMISSIONS.requests_agent };
        setCurrentUser(uObj);
        localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
        return { success: true };
      }
      return { success: false, error: 'اسم المستخدم أو كلمة المرور لمستخدم طلبات النقل غير صحيحة' };
    }
    return { success: false, error: 'نوع الحساب غير معروف' };
  };

  // تسجيل دخول موحّد بدون اختيار قسم/رتبة مقدمًا — يكتب المستخدم اسمه وكلمة المرور بس،
  // والنظام بيجرب يتعرف على نوع الحساب تلقائيًا (مشرف صرف بالاسم، أو أدمن/مدير/مشرف حركة/طلبات نقل باليوزرنيم)
  // تحقق حي من صلاحية "شاشة" معينة للمستخدم الحالي — بنفس منطق allowedTabs في App.tsx تمامًا،
  // لكن قابل لإعادة الاستخدام داخل أي شاشة محتاجة تتحقق من صلاحية فرعية (زي اعتماد خصم الصيانة)
  // من غير ما تضطر تكرر نفس منطق البحث عن systemUser الحي في كل مكان
  const hasScreenPermission = (screenId: string): boolean => {
    const user = currentUser;
    if (!user) return false;
    const liveUser = systemUsers.find(u => u.id === user.systemUserId);
    const screens = liveUser ? liveUser.allowed_screens : (user.allowedScreens || []);
    return screens.includes(screenId);
  };

  const loginAuto = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      return { success: false, error: 'يرجى إدخال اسم المستخدم' };
    }
    if (!password) {
      return { success: false, error: 'يرجى إدخال كلمة المرور' };
    }

    // قبل أي حاجة، نجيب أحدث نسخة من جدول المستخدمين من السحابة مباشرة (مش معتمدين على النسخة
    // المحفوظة محليًا من وقت فتح الصفحة) — عشان لو حد غيّر اسم مستخدم أو باسورد أو شاشات من
    // جهاز تاني، يتفعّل التغيير فورًا هنا من غير ما يستنى أول مزامنة عامة للتطبيق
    let latestSystemUsers = systemUsers;
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'system_users').maybeSingle();
        if (!error && data?.value) {
          const parsed = JSON.parse(data.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            latestSystemUsers = mergeNewScreensIntoAdminUser(parsed);
            setSystemUsers(latestSystemUsers);
            localStorage.setItem('elbanna_system_users', JSON.stringify(latestSystemUsers));
          }
        }
      } catch (e) {
        console.warn("Fetch fresh system_users at login error (falling back to local copy):", e);
      }
    }

    // المصدر الوحيد للدخول دلوقتي: جدول المستخدمين الموحّد — مفيش ارتباط بقسم أو رتبة ثابتة
    const matched = latestSystemUsers.find(u => u.username.trim().toLowerCase() === trimmed.toLowerCase() && verifyPassword(password, u.password));
    if (matched) {
      // ترقية تلقائية: لو الباسورد لسه مخزن كنص عادي نشفّره أول ما صاحبه يدخل بنجاح
      if (!isHashedPassword(matched.password)) {
        const hashedPw = hashPassword(password);
        commitSystemUsers<void>(base => ({ next: base.map(u => u.id === matched.id ? { ...u, password: hashedPw } : u) }));
        if (matched.linked_official_id) setOfficialPasswordHash(matched.linked_official_id, hashedPw);
      }
      // بداية نشاط جديد (لتسجيل الخروج التلقائي بعد الخمول)
      localStorage.setItem('elbanna_last_activity', String(Date.now()));
      const uObj: User = {
        username: matched.username,
        role: matched.linked_official_id ? 'supervisor' : (matched.role_tag === 'custom' ? 'custom' : matched.role_tag),
        officialId: matched.linked_official_id,
        systemUserId: matched.id,
        name: matched.display_name,
        allowedScreens: matched.allowed_screens,
      };
      setCurrentUser(uObj);
      localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
      return { success: true };
    }

    return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('elbanna_current_user');
  };

  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccount[]>(() => {
    try {
      const saved = localStorage.getItem('elbanna_custody_accounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error parsing custody accounts:', e);
    }
    return [];
  });

  const [custodyMovements, setCustodyMovements] = useState<CustodyMovement[]>(() => 
    loadSavedArray('elbanna_custody_movements', [])
  );

  const [companies, setCompanies] = useState<string[]>(() => 
    loadSavedArray('elbanna_companies', [])
  );
  // شركات محذوفة عمداً بواسطة المستخدم — بنستبعدها من قائمة المقترحات حتى لو لسه
  // موجودة كـ owner_company بسيارات قديمة، عشان "الحذف" يبقى فعلي وميرجعش تاني
  const [hiddenCompanies, setHiddenCompanies] = useState<string[]>(() =>
    loadSavedArray('elbanna_hidden_companies', [])
  );

  const addCompany = (companyName: string) => {
    const trimmed = companyName.trim();
    if (!trimmed) return;
    // لو المستخدم بيضيف شركة كانت متعمولها حذف قبل كده، معنى ده إنه قرر يرجّعها فعلياً
    if (hiddenCompanies.includes(trimmed)) {
      const nextHidden = hiddenCompanies.filter(c => c !== trimmed);
      setHiddenCompanies(nextHidden);
      localStorage.setItem('elbanna_hidden_companies', JSON.stringify(nextHidden));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'hidden_companies', value: JSON.stringify(nextHidden) })
          .then(({ error }) => { if (error) console.warn("Supabase save hidden_companies error:", error); });
      }
    }
    if (companies.includes(trimmed)) return;
    const next = [...companies, trimmed];
    setCompanies(next);
    localStorage.setItem('elbanna_companies', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'companies', value: JSON.stringify(next) })
        .then(({ error }) => {
          if (error) console.warn("Supabase save companies error:", error);
        });
    }
  };

  const deleteCompany = (companyName: string) => {
    const next = companies.filter(c => c !== companyName);
    setCompanies(next);
    localStorage.setItem('elbanna_companies', JSON.stringify(next));

    // نسجلها كمخفية عشان مانستنتجهاش تاني من بيانات owner_company بالسيارات القديمة
    const nextHidden = hiddenCompanies.includes(companyName) ? hiddenCompanies : [...hiddenCompanies, companyName];
    setHiddenCompanies(nextHidden);
    localStorage.setItem('elbanna_hidden_companies', JSON.stringify(nextHidden));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'companies', value: JSON.stringify(next) })
        .then(({ error }) => {
          if (error) console.warn("Supabase save companies error:", error);
        });
      supabase.from('system_settings').upsert({ key: 'hidden_companies', value: JSON.stringify(nextHidden) })
        .then(({ error }) => {
          if (error) console.warn("Supabase save hidden_companies error:", error);
        });
    }
  };

  const [transportRequests, setTransportRequests] = useState<TransportRequest[]>(() =>
    loadSavedArray<TransportRequest>('elbanna_transport_requests', []).map(r => normalizeTransportRequest(r))
  );

  // ====== الإشعارات ======
  // كل حدث على طلب نقل/صيانة بيعمل إشعار، بيظهر لكل مستخدم عنده صلاحية على الشاشة المعنية، وبالضغط عليه
  // بيفتح تفاصيل الطلب في الشاشة دي (pendingNav). حالة القراءة لكل مستخدم لوحده (read_by).
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    pruneNotifications(loadSavedArray<any>('elbanna_notifications', []).map(normalizeNotification), Date.now())
  );
  const [pendingNav, setPendingNav] = useState<{ screen: string; entityType: 'transport' | 'maintenance'; entityId: string; nonce: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem('elbanna_notifications', JSON.stringify(notifications)); } catch { /* التخزين ممتلئ — مش مشكلة */ }
  }, [notifications]);

  const notificationScreens = (): string[] => {
    const user = currentUser;
    if (!user) return [];
    const live = systemUsers.find(u => u.id === user.systemUserId);
    return live ? live.allowed_screens : (user.allowedScreens || []);
  };
  // ملحوظة: notificationKey / myNotifications / unreadNotificationCount بيتحسبوا تحت، بعد تعريف
  // systemUsers — لأن notificationScreens() بتقرا systemUsers وبتتنفّذ وقت الرسم، ولو اتنفّذت قبل
  // تعريفه بيحصل "Cannot access before initialization" بعد تسجيل الدخول مباشرة.

  const notifyEvent = (draft: NotificationDraft | null) => {
    if (!draft) return;
    const n: AppNotification = {
      ...draft,
      id: generateId('nt'),
      created_at: new Date().toISOString(),
      created_by: currentUser?.name || currentUser?.username,
      // اللي عمل الحدث نفسه مايتحسبش عنده غير مقروء
      read_by: notificationKey ? [notificationKey] : [],
    };
    setNotifications(prev => pruneNotifications([n, ...prev], Date.now()));
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('notifications').upsert([n]).then(({ error }: any) => {
        if (error) console.warn('Supabase notification upsert error:', error.message);
      });
    }
  };

  const markNotificationsRead = (ids: string[]) => {
    const key = notificationKey;
    if (!key || ids.length === 0) return;
    const changed = notifications
      .filter(n => ids.includes(n.id) && !n.read_by.includes(key))
      .map(n => ({ ...n, read_by: [...n.read_by, key] }));
    if (changed.length === 0) return;
    const byId = new Map(changed.map(n => [n.id, n]));
    setNotifications(prev => prev.map(n => {
      const c = byId.get(n.id);
      return c ? { ...n, read_by: Array.from(new Set([...n.read_by, key])) } : n;
    }));
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('notifications').upsert(changed).then(({ error }: any) => {
        if (error) console.warn('Supabase notification read upsert error:', error.message);
      });
    }
  };
  const markAllNotificationsRead = () => markNotificationsRead(myNotifications.filter(n => isUnread(n, notificationKey)).map(n => n.id));

  // فتح إشعار: تعليمه كمقروء وتحديد الشاشة اللي هتتفتح (أول شاشة معنية متاحة للمستخدم)
  const openNotification = (n: AppNotification): string | null => {
    const screen = resolveTargetScreen(n, notificationScreens());
    markNotificationsRead([n.id]);
    if (!screen) return null;
    setPendingNav({ screen, entityType: n.entity_type, entityId: n.entity_id, nonce: Date.now() });
    return screen;
  };
  const consumeNav = (nonce: number) => setPendingNav(prev => (prev && prev.nonce === nonce ? null : prev));

  // مزامنة الإشعارات مع السحابة كل 15 ثانية وعند رجوع الشاشة للواجهة (لو الجدول لسه ماتنشأش بيفضل محلي بس)
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let busy = false;
    const sync = async () => {
      if (busy || isDownloadingRef.current || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data, error } = await client.from('notifications').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(300);
        if (error || !data) return;
        const cloud = (data as any[]).map(normalizeNotification);
        const local = notificationsRef.current;
        const merged = pruneNotifications(mergeNotifications(local, cloud), Date.now());
        const up = notificationsToUpload(merged, cloud);
        if (up.length > 0) {
          const { error: upErr } = await client.from('notifications').upsert(up);
          if (upErr) console.warn('Supabase notifications upload error:', upErr.message);
        }
        if (JSON.stringify(merged) !== JSON.stringify(local)) setNotifications(merged);
      } catch (e) {
        console.warn('notifications sync failed', e);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(sync, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    sync();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // ====== قسم الصيانة — مبني فوق قاعدة بيانات السيارات الحالية (car_id = Car.id)، بدون أي تكرار لبياناتها ======
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>(() => {
    // الطلبات المحفوظة بالحالات القديمة بتتحوّل لأقرب مرحلة في سير العمل الجديد
    const invs = loadSavedArray<MaintenanceInvoice>('elbanna_maintenance_invoices', []);
    return loadSavedArray<MaintenanceRequest>('elbanna_maintenance_requests', []).map(r => normalizeMaintenanceRequest(r as any, invs) as MaintenanceRequest);
  });
  const [maintenanceInvoices, setMaintenanceInvoices] = useState<MaintenanceInvoice[]>(() =>
    loadSavedArray('elbanna_maintenance_invoices', [])
  );

  const [farms, setFarms] = useState<string[]>(() =>
    loadSavedArray('elbanna_farms', [])
  );

  // خريطة صلاحيات الشاشات القابلة للتعديل لكل رتبة (بدل الثابت المُقفل قديمًا في App.tsx)
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() =>
    mergeNewDefaultScreens(loadSavedObject('elbanna_role_permissions', DEFAULT_ROLE_PERMISSIONS))
  );

  const updateRolePermissions = (role: string, screenIds: string[]) => {
    setRolePermissions(prev => {
      const next = { ...prev, [role]: screenIds };
      localStorage.setItem('elbanna_role_permissions', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'role_permissions', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save role_permissions error:", error); });
      }
      return next;
    });
  };

  // شاشات مخصصة لكل مستخدم (مشرف صرف) بعينه — مستقلة تمامًا عن رتبته المشتركة، عشان تقدر
  // تضيف أي مستخدم جديد وتحدد له شاشاته الخاصة بدل ما يكون مربوط بصلاحيات قسم/رتبة ثابتة.
  // المفتاح هو official.id، والقيمة هي قائمة معرفات الشاشات؛ غياب المفتاح = استخدام صلاحيات
  // رتبة "مشرف صرف" المشتركة بشكل افتراضي.
  const [officialCustomScreens, setOfficialCustomScreens] = useState<Record<string, string[]>>(() =>
    loadSavedObject('elbanna_official_custom_screens', {})
  );

  const updateOfficialScreens = (officialId: string, screenIds: string[] | null) => {
    setOfficialCustomScreens(prev => {
      const next = { ...prev };
      if (screenIds === null) {
        delete next[officialId];
      } else {
        next[officialId] = screenIds;
      }
      localStorage.setItem('elbanna_official_custom_screens', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'official_custom_screens', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save official_custom_screens error:", error); });
      }
      return next;
    });
  };

  // ====== نظام المستخدمين الموحّد — شاشة واحدة، من غير ارتباط بقسم/رتبة ثابتة ======
  // أول مرة يتحمّل فيها النظام بعد التحديث ده، مفيش "systemUsers" محفوظة لسه، فبنعمل ترحيل
  // تلقائي لمرة واحدة: كل حساب موجود فعليًا (أدمن/مدير/مشرف حركة/مستخدم طلبات نقل + كل مشرف
  // صرف) بيتحول لسطر في الجدول الموحد بنفس اليوزر/الباسورد/الشاشات، من غير ما حد يفقد دخوله.
  const buildMigratedSystemUsers = (): SystemUser[] => {
    const fixedAccounts: SystemUser[] = [
      { id: 'sysuser_admin', username: adminUsername, password: adminPassword, display_name: 'أدمن النظام', role_tag: 'admin', allowed_screens: rolePermissions.admin || DEFAULT_ROLE_PERMISSIONS.admin },
      { id: 'sysuser_manager', username: managerUsername, password: managerPassword, display_name: 'المدير العام', role_tag: 'manager', allowed_screens: rolePermissions.manager || DEFAULT_ROLE_PERMISSIONS.manager },
      { id: 'sysuser_movement_supervisor', username: movementSupervisorUsername, password: movementSupervisorPassword, display_name: 'مشرف الحركة', role_tag: 'movement_supervisor', allowed_screens: rolePermissions.movement_supervisor || DEFAULT_ROLE_PERMISSIONS.movement_supervisor },
      { id: 'sysuser_requests_agent', username: requestsAgentUsername, password: requestsAgentPassword, display_name: 'مستخدم طلبات النقل', role_tag: 'requests_agent', allowed_screens: rolePermissions.requests_agent || DEFAULT_ROLE_PERMISSIONS.requests_agent },
    ];
    const officialAccounts: SystemUser[] = officials.map(o => ({
      id: `sysuser_official_${o.id}`,
      username: o.name,
      password: o.password || '123',
      display_name: o.name,
      role_tag: 'custom',
      allowed_screens: officialCustomScreens[o.id] || rolePermissions.supervisor || DEFAULT_ROLE_PERMISSIONS.supervisor,
      linked_official_id: o.id,
    }));
    return [...fixedAccounts, ...officialAccounts];
  };

  // أي شاشة جديدة تتضاف للنظام لاحقًا (زي قسم الصيانة) لازم الأدمن يشوفها تلقائيًا من غير ما
  // يحتاج يروح يفعّلها يدوي بنفسه من شاشة المستخدمين — فبندمج أي شاشة افتراضية لأدمن لسه مش
  // موجودة في أي حساب محفوظ خالص (يعني شاشة جديدة فعلًا) على حساب الأدمن تحديدًا، من غير ما
  // نلمس تخصيصات أي مستخدم تاني عمله الأدمن بنفسه.
  const mergeNewScreensIntoAdminUser = (users: SystemUser[]): SystemUser[] => {
    const allKnownScreenIds = new Set(users.flatMap(u => u.allowed_screens));
    const missingForAdmin = DEFAULT_ROLE_PERMISSIONS.admin.filter(s => !allKnownScreenIds.has(s));
    if (missingForAdmin.length === 0) return users;
    return users.map(u => u.role_tag === 'admin'
      ? { ...u, allowed_screens: [...u.allowed_screens, ...missingForAdmin] }
      : u
    );
  };

  const [systemUsers, setSystemUsers] = useState<SystemUser[]>(() => {
    const saved = loadSavedArray<SystemUser>('elbanna_system_users', []);
    if (saved.length > 0) return mergeNewScreensIntoAdminUser(saved);
    return buildMigratedSystemUsers();
  });

  // نسخة حيّة من المستخدمين (بتتحدث مع كل رسم) + طابور لتسلسل عمليات الحفظ عشان مايحصلش تداخل بينها
  const systemUsersRef = useRef<SystemUser[]>(systemUsers);
  systemUsersRef.current = systemUsers;
  // true لو قايمة المستخدمين اللي على الجهاز ده اتحفظت فعلًا (مش مجرد قايمة افتراضية اتولّدت لأول فتح)
  // — بنستخدمها عشان ماننشرش أبدًا قايمة افتراضية (admin/admin) فوق السحابة
  const systemUsersPersistedRef = useRef<boolean>(loadSavedArray<SystemUser>('elbanna_system_users', []).length > 0);
  const systemUsersQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [systemUsersSyncError, setSystemUsersSyncError] = useState<string | null>(null);

  // مشتقّات الإشعارات — لازم تيجي بعد تعريف systemUsers (شوف الملحوظة فوق عند notificationScreens)
  const notificationKey = notificationUserKey(currentUser);
  const myNotifications = notifications.filter(n => isVisibleTo(n, notificationScreens()));
  const unreadNotificationCount = myNotifications.filter(n => isUnread(n, notificationKey)).length;

  type SystemUsersMutation<T> = { error: string } | { next: SystemUser[]; value?: T };

  // حفظ المستخدمين بشكل مضمون:
  //  1) بنجيب آخر نسخة من السحابة الأول (مش النسخة اللي في الجهاز) ونطبق التعديل عليها —
  //     كده أي جهاز بنسخة قديمة مايقدرش يمسح مستخدم اتضاف من جهاز تاني.
  //  2) الحفظ في السحابة مابقاش مشروط بحالة "isCloudConnected" (كان بيتخطى الحفظ بصمت لو الاتصال لسه ماجهزش
  //     وقت إنشاء المستخدم، فيفضل المستخدم موجود على جهاز الإنشاء بس).
  //  3) لو الحفظ فشل بنعيد المحاولة مرة، ولو فشل تاني بنرجّع cloudSaved=false عشان الشاشة تنبّه الأدمن.
  const commitSystemUsers = <T,>(
    mutator: (base: SystemUser[]) => SystemUsersMutation<T>
  ): Promise<{ success: boolean; error?: string; value?: T; cloudSaved: boolean }> => {
    const run = async () => {
      const client = getSupabaseClient();
      let base = systemUsersRef.current;
      if (client) {
        try {
          const { data, error } = await client.from('system_settings').select('value').eq('key', 'system_users').maybeSingle();
          if (!error && data?.value) {
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed) && parsed.length > 0) base = mergeNewScreensIntoAdminUser(parsed);
          }
        } catch (e) {
          console.warn("commitSystemUsers: fetch latest users failed, using local copy:", e);
        }
      }

      const out = mutator(base);
      if ('error' in out) return { success: false, error: out.error, cloudSaved: false };

      const next = out.next;
      systemUsersRef.current = next;
      systemUsersPersistedRef.current = true;
      setSystemUsers(next);
      localStorage.setItem('elbanna_system_users', JSON.stringify(next));

      if (!client) return { success: true, value: out.value, cloudSaved: false };

      let lastErr = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { error } = await client.from('system_settings').upsert({ key: 'system_users', value: JSON.stringify(next) });
          if (!error) {
            setSystemUsersSyncError(null);
            return { success: true, value: out.value, cloudSaved: true };
          }
          lastErr = error.message;
        } catch (e: any) {
          lastErr = e?.message || String(e);
        }
        await new Promise(r => setTimeout(r, 800));
      }
      console.warn("Supabase save system_users error:", lastErr);
      setSystemUsersSyncError(lastErr || 'تعذّر الحفظ في السحابة');
      return { success: true, value: out.value, cloudSaved: false };
    };
    const p = systemUsersQueueRef.current.then(run, run) as Promise<{ success: boolean; error?: string; value?: T; cloudSaved: boolean }>;
    systemUsersQueueRef.current = p.catch(() => undefined);
    return p;
  };

  const addSystemUser = async (username: string, password: string, displayName: string, allowedScreens: string[]) => {
    const trimmedUser = username.trim();
    const trimmedName = displayName.trim() || trimmedUser;
    if (!trimmedUser || !password) return { success: false, error: 'يرجى إدخال اسم مستخدم وكلمة مرور', cloudSaved: false };
    const hashedPw = hashPassword(password);
    // ملاحظة: إنشاء المستخدم لا ينشئ حساب عهدة تلقائيًا — العهدة بتتنشأ يدويًا من
    // شاشة "🔐 إدارة كلمات مرور مسؤولي الصرف" (زر "إنشاء عهدة") بواسطة الأدمن.
    const newUser: SystemUser = {
      id: generateId('sysuser'),
      username: trimmedUser,
      password: hashedPw,
      display_name: trimmedName,
      role_tag: 'custom',
      allowed_screens: allowedScreens,
    };
    const res = await commitSystemUsers<SystemUser>(base => {
      if (base.some(u => u.username.trim().toLowerCase() === trimmedUser.toLowerCase())) {
        return { error: 'اسم المستخدم ده مستخدم بالفعل' };
      }
      return { next: [...base, newUser], value: newUser };
    });
    return { success: res.success, error: res.error, user: res.value, cloudSaved: res.cloudSaved };
  };

  // تحديث بيانات مستخدم (اسم/يوزر/باسورد/شاشات) — من غير أي إنشاء تلقائي لحساب عهدة
  const updateSystemUser = async (id: string, updates: { username?: string; password?: string; display_name?: string; official_name?: string; allowed_screens?: string[] }) => {
    const newHashed = updates.password ? hashPassword(updates.password) : undefined;
    const res = await commitSystemUsers<SystemUser>(base => {
      // لو المستخدم موجود على الجهاز ده بس (اتعمل قبل الإصلاح ومااترفعش للسحابة) نكمل من نسخة الجهاز
      // ونرفعه للسحابة مع التعديل — كده "حفظ" واحد من جهاز الإنشاء بيصلّح دخوله من باقي الأجهزة
      const target = base.find(u => u.id === id) || systemUsersRef.current.find(u => u.id === id);
      if (!target) return { error: 'المستخدم غير موجود' };
      if (updates.username) {
        const trimmed = updates.username.trim();
        if (base.some(u => u.id !== id && u.username.trim().toLowerCase() === trimmed.toLowerCase())) {
          return { error: 'اسم المستخدم ده مستخدم بالفعل' };
        }
      }
      const updatedUser: SystemUser = {
        ...target,
        username: updates.username?.trim() || target.username,
        password: newHashed || target.password,
        display_name: updates.display_name?.trim() || target.display_name,
        allowed_screens: updates.allowed_screens || target.allowed_screens,
      };
      const existsInBase = base.some(u => u.id === id);
      return { next: existsInBase ? base.map(u => u.id === id ? updatedUser : u) : [...base, updatedUser], value: updatedUser };
    });
    if (!res.success || !res.value) return { success: false, error: res.error, cloudSaved: false };
    const updatedUser = res.value;
    const linkedOfficialId = updatedUser.linked_official_id;

    // اسم مسؤول التراخيص (حساب العهدة) مستقل عن الاسم الظاهر واسم المستخدم.
    // الباسورد بس هو اللي بيفضل متزامن لأنه بيستخدم في الدخول.
    if (linkedOfficialId) {
      if (updates.official_name && updates.official_name.trim()) {
        updateOfficialName(linkedOfficialId, updates.official_name.trim());
      }
      if (newHashed) {
        setOfficialPasswordHash(linkedOfficialId, newHashed);
      }
    }

    // لو المستخدم ده هو نفسه الداخل دلوقتي، نحدّث جلسته النشطة فورًا من غير ما يحتاج يعمل تسجيل خروج
    if (currentUser?.systemUserId === id) {
      const updatedSession = { ...currentUser, name: updatedUser.display_name, username: updatedUser.username, allowedScreens: updatedUser.allowed_screens, officialId: linkedOfficialId };
      setCurrentUser(updatedSession);
      localStorage.setItem('elbanna_current_user', JSON.stringify(updatedSession));
    }

    return { success: true, cloudSaved: res.cloudSaved };
  };

  // حذف مستخدم من الجدول الموحد فقط — حساب العهدة المالية المربوط (لو موجود) بيفضل زي ما هو
  // ومايتمسحش تلقائي، حفاظًا على البيانات المالية؛ يتحذف بشكل منفصل ومقصود لو لزم الأمر
  const deleteSystemUser = async (id: string) => {
    const res = await commitSystemUsers<void>(base => ({ next: base.filter(u => u.id !== id) }));
    return { success: res.success, cloudSaved: res.cloudSaved };
  };

  // إنشاء حساب عهدة (مشرف صرف) يدويًا لمستخدم موجود — بيتم من شاشة إدارة مسؤولي الصرف، مش تلقائي
  const createOfficialForUser = async (userId: string, initial?: { cash_custody?: number; visa_custody?: number }) => {
    const user = systemUsersRef.current.find(u => u.id === userId);
    if (!user) return { success: false, error: 'المستخدم غير موجود', cloudSaved: false };
    if (user.linked_official_id && officials.some(o => o.id === user.linked_official_id)) {
      return { success: false, error: 'المستخدم ده عنده حساب عهدة بالفعل', cloudSaved: false };
    }
    const official = addOfficial({
      name: user.display_name,
      cash_custody: initial?.cash_custody || 0,
      visa_custody: initial?.visa_custody || 0,
      password: user.password,
    });
    const res = await commitSystemUsers<void>(base => {
      if (!base.some(u => u.id === userId)) return { error: 'المستخدم غير موجود' };
      return { next: base.map(u => u.id === userId ? { ...u, linked_official_id: official.id } : u) };
    });
    if (currentUser?.systemUserId === userId) {
      const updatedSession = { ...currentUser, officialId: official.id };
      setCurrentUser(updatedSession);
      localStorage.setItem('elbanna_current_user', JSON.stringify(updatedSession));
    }
    return { success: res.success, error: res.error, official, cloudSaved: res.cloudSaved };
  };

  const addFarmIfNew = (farmName: string) => {
    const trimmed = farmName.trim();
    if (!trimmed) return;
    setFarms(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      localStorage.setItem('elbanna_farms', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'farms', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save farms error:", error); });
      }
      return next;
    });
  };

  // ====== المرحلة 1 من تطوير نظام طلبات النقل: إعدادات تكلفة خطوط السير ======

  // نقطة البداية/النهاية الافتراضية لخط السير لو السيارة مالهاش جراج محدد في بياناتها
  const [defaultGarageLocation, setDefaultGarageLocation] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('elbanna_default_garage_location');
      return saved && saved.trim() ? saved : 'منيا القمح';
    } catch {
      return 'منيا القمح';
    }
  });

  const updateDefaultGarageLocation = (location: string) => {
    const trimmed = location.trim() || 'منيا القمح';
    setDefaultGarageLocation(trimmed);
    localStorage.setItem('elbanna_default_garage_location', trimmed);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'default_garage_location', value: trimmed })
        .then(({ error }) => { if (error) console.warn("Supabase save default_garage_location error:", error); });
    }
  };

  // بنود التكلفة الإضافية القابلة للإضافة من الإعدادات (بجانب دخان السائق)
  const [costItemTypes, setCostItemTypes] = useState<CostItemType[]>(() =>
    loadSavedArray<CostItemType>('elbanna_cost_item_types', [])
  );

  const persistCostItemTypes = (next: CostItemType[]) => {
    setCostItemTypes(next);
    localStorage.setItem('elbanna_cost_item_types', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'cost_item_types', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save cost_item_types error:", error); });
    }
  };

  const addCostItemType = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (costItemTypes.some(i => i.name === trimmed)) return;
    persistCostItemTypes([...costItemTypes, { id: generateId('cost_item'), name: trimmed }]);
  };

  const deleteCostItemType = (id: string) => {
    persistCostItemTypes(costItemTypes.filter(i => i.id !== id));
  };

  // نولون السيارة لكل كيلومتر حسب نوع السيارة — المفتاح هو نوع السيارة (car_type)
  const [vehicleFreightRates, setVehicleFreightRates] = useState<Record<string, number>>(() =>
    loadSavedObject('elbanna_vehicle_freight_rates', {})
  );

  const updateVehicleFreightRate = (carType: string, ratePerKm: number) => {
    setVehicleFreightRates(prev => {
      const next = { ...prev, [carType]: ratePerKm };
      localStorage.setItem('elbanna_vehicle_freight_rates', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'vehicle_freight_rates', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save vehicle_freight_rates error:", error); });
      }
      return next;
    });
  };

  const deleteVehicleFreightRate = (carType: string) => {
    setVehicleFreightRates(prev => {
      const next = { ...prev };
      delete next[carType];
      localStorage.setItem('elbanna_vehicle_freight_rates', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'vehicle_freight_rates', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save vehicle_freight_rates error:", error); });
      }
      return next;
    });
  };

  // لائحة خطوط السير (من - إلى - مبلغ الدخان الافتراضي)
  const [routePriceList, setRoutePriceList] = useState<RoutePriceEntry[]>(() =>
    loadSavedArray<RoutePriceEntry>('elbanna_route_price_list', [])
  );

  const persistRoutePriceList = (next: RoutePriceEntry[]) => {
    setRoutePriceList(next);
    localStorage.setItem('elbanna_route_price_list', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'route_price_list', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save route_price_list error:", error); });
    }
  };

  const addRoutePrice = (fromLocation: string, toLocation: string, smokeAmount: number, distanceKm: number = 0) => {
    const from = fromLocation.trim();
    const to = toLocation.trim();
    if (!from || !to) return;
    persistRoutePriceList([...routePriceList, { id: generateId('route'), from_location: from, to_location: to, smoke_amount: smokeAmount, distance_km: distanceKm }]);
  };

  const updateRoutePrice = (id: string, fromLocation: string, toLocation: string, smokeAmount: number, distanceKm: number = 0) => {
    persistRoutePriceList(routePriceList.map(r => r.id === id ? { ...r, from_location: fromLocation.trim(), to_location: toLocation.trim(), smoke_amount: smokeAmount, distance_km: distanceKm } : r));
  };

  const deleteRoutePrice = (id: string) => {
    persistRoutePriceList(routePriceList.filter(r => r.id !== id));
  };

  // ====== المرحلة 2: بيانات تكلفة خط سير كل طلب نقل (Route Accounting) ======
  const [transportRequestCosts, setTransportRequestCosts] = useState<TransportRequestCost[]>(() =>
    loadSavedArray<TransportRequestCost>('elbanna_transport_request_costs', [])
  );

  const persistTransportRequestCosts = (next: TransportRequestCost[]) => {
    setTransportRequestCosts(next);
    localStorage.setItem('elbanna_transport_request_costs', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'transport_request_costs', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save transport_request_costs error:", error); });
    }
  };

  // إضافة أو تحديث سجل تكلفة خط سير لطلب معين (سجل واحد لكل طلب — upsert حسب request_id)
  const upsertTransportRequestCost = (requestId: string, data: Omit<TransportRequestCost, 'id' | 'request_id' | 'updated_at' | 'updated_by'>) => {
    const existing = transportRequestCosts.find(c => c.request_id === requestId);
    const record: TransportRequestCost = {
      id: existing?.id || generateId('trc'),
      request_id: requestId,
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    const next = existing
      ? transportRequestCosts.map(c => c.request_id === requestId ? record : c)
      : [...transportRequestCosts, record];
    persistTransportRequestCosts(next);
    return record;
  };

  const deleteTransportRequestCost = (requestId: string) => {
    persistTransportRequestCosts(transportRequestCosts.filter(c => c.request_id !== requestId));
  };

  // ====== مصاريف وأرباح السيارات اليومية (CarDailyCost): النولون، كارتات، مخالفات، غسيل كاوتش،
  // صيانة — كل ده مربوط بالسيارة + تاريخ التنفيذ (مش بطلب بعينه)، عشان يدعم حساب ربحية السيارة ======
  const [carDailyCosts, setCarDailyCosts] = useState<CarDailyCost[]>(() =>
    loadSavedArray<CarDailyCost>('elbanna_car_daily_costs', [])
  );

  // لو جداول التكاليف موجودة في Supabase بنكتب الصفوف المتغيّرة بس (مفيش جهاز بيمسح شغل جهاز تاني)، وإلا بنرجع للطريقة القديمة
  const costTablesRef = useRef<{ daily: boolean; monthly: boolean; fuel: boolean; plans: boolean }>({ daily: false, monthly: false, fuel: false, plans: false });
  const syncCostRows = (table: string, onConflict: string, prev: any[], next: any[]) => {
    const client = getSupabaseClient();
    if (!client || !isCloudConnected) return;
    const before = new Map(prev.map(r => [r.id, JSON.stringify(r)]));
    const changed = next.filter(r => before.get(r.id) !== JSON.stringify(r));
    if (changed.length === 0) return;
    client.from(table).upsert(changed, { onConflict })
      .then(({ error }) => { if (error) console.warn(`Supabase save ${table} error:`, error.message); });
  };

  const persistCarDailyCosts = (next: CarDailyCost[]) => {
    const prevRows = carDailyCosts;
    setCarDailyCosts(next);
    localStorage.setItem('elbanna_car_daily_costs', JSON.stringify(next));
    if (costTablesRef.current.daily) {
      syncCostRows('car_daily_costs', 'car_id,date', prevRows, next);
      return;
    }
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'car_daily_costs', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save car_daily_costs error:", error); });
    }
  };

  // إضافة أو تحديث سجل مصاريف يوم معين لسيارة معينة (سجل واحد لكل سيارة+تاريخ — upsert)
  const upsertCarDailyCost = (carId: string, date: string, data: Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'>) => {
    const normalizedDate = normalizeDateToYmd(date);
    const existing = carDailyCosts.find(c => c.car_id === carId && c.date === normalizedDate);
    if (!canEditMonth(normalizedDate)) {
      return existing || ({ id: '', car_id: carId, date: normalizedDate, ...data, updated_at: '' } as CarDailyCost);
    }
    const record: CarDailyCost = {
      id: existing?.id || generateId('cdc'),
      car_id: carId,
      date: normalizedDate,
      ...data,
      // تكلفة الصيانة دايمًا بتتحسب حيًّا من فواتير الصيانة الحقيقية لنفس السيارة/اليوم — مش
      // رقم يدوي، عشان ميتحسبش مرتين (قرار المراجعة بتاريخ اعتماد خطة إعادة الهيكلة)
      maintenance_amount: getMaintenanceCostForCarDay(carId, normalizedDate),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    const next = existing
      ? carDailyCosts.map(c => (c.car_id === carId && c.date === normalizedDate) ? record : c)
      : [...carDailyCosts, record];
    persistCarDailyCosts(next);
    return record;
  };

  // حفظ مصاريف عدة سيارات/أيام مرة واحدة. مهم: الاستدعاء المتكرر لـ upsertCarDailyCost في حلقة بيكتب
  // فوق بعضه (كل استدعاء بيبني على نفس الحالة القديمة) فكان بيتحفظ آخر سجل بس — هنا كله بيتجمّع الأول.
  const upsertCarDailyCostsBatch = (entries: { carId: string; date: string; data: Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'> }[]) => {
    let next = carDailyCosts;
    let saved = 0, skippedLocked = 0;
    entries.forEach(({ carId, date, data }) => {
      const normalizedDate = normalizeDateToYmd(date);
      if (!canEditMonth(normalizedDate)) { skippedLocked++; return; }
      const existing = next.find(c => c.car_id === carId && c.date === normalizedDate);
      const record: CarDailyCost = {
        id: existing?.id || generateId('cdc'),
        car_id: carId,
        date: normalizedDate,
        ...data,
        maintenance_amount: getMaintenanceCostForCarDay(carId, normalizedDate),
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.name || currentUser?.username,
      };
      next = existing
        ? next.map(c => (c.car_id === carId && c.date === normalizedDate) ? record : c)
        : [...next, record];
      saved++;
    });
    if (saved > 0) persistCarDailyCosts(next);
    return { saved, skippedLocked };
  };

  const deleteCarDailyCost = (carId: string, date: string) => {
    const normalizedDate = normalizeDateToYmd(date);
    if (!canEditMonth(normalizedDate)) return;
    persistCarDailyCosts(carDailyCosts.filter(c => !(c.car_id === carId && c.date === normalizedDate)));
  };

  // ===== التكاليف الشهرية (مرتب السائق + سولار + زيت) لكل سيارة — بنفس طريقة حفظ المصاريف اليومية =====
  const [carMonthlyCosts, setCarMonthlyCosts] = useState<CarMonthlyCost[]>(() =>
    loadSavedArray<CarMonthlyCost>('elbanna_car_monthly_costs', [])
  );

  const persistCarMonthlyCosts = (next: CarMonthlyCost[]) => {
    const prevRows = carMonthlyCosts;
    setCarMonthlyCosts(next);
    localStorage.setItem('elbanna_car_monthly_costs', JSON.stringify(next));
    if (costTablesRef.current.monthly) {
      syncCostRows('car_monthly_costs', 'car_id,month', prevRows, next);
      return;
    }
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'car_monthly_costs', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save car_monthly_costs error:", error); });
    }
  };

  const upsertCarMonthlyCost = (carId: string, month: string, data: Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'>) => {
    const existing = carMonthlyCosts.find(c => c.car_id === carId && c.month === month);
    if (!canEditMonth(month)) {
      return existing || ({ id: '', car_id: carId, month, ...data, updated_at: '' } as CarMonthlyCost);
    }
    const record: CarMonthlyCost = {
      id: existing?.id || generateId('cmc'),
      car_id: carId,
      month,
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    persistCarMonthlyCosts(existing
      ? carMonthlyCosts.map(c => (c.car_id === carId && c.month === month) ? record : c)
      : [...carMonthlyCosts, record]);
    return record;
  };

  const upsertCarMonthlyCostsBatch = (entries: { carId: string; month: string; data: Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'> }[]) => {
    let next = carMonthlyCosts;
    let saved = 0, skippedLocked = 0;
    entries.forEach(({ carId, month, data }) => {
      if (!canEditMonth(month)) { skippedLocked++; return; }
      const existing = next.find(c => c.car_id === carId && c.month === month);
      const record: CarMonthlyCost = {
        id: existing?.id || generateId('cmc'),
        car_id: carId,
        month,
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.name || currentUser?.username,
      };
      next = existing
        ? next.map(c => (c.car_id === carId && c.month === month) ? record : c)
        : [...next, record];
      saved++;
    });
    if (saved > 0) persistCarMonthlyCosts(next);
    return { saved, skippedLocked };
  };

  const deleteCarMonthlyCost = (carId: string, month: string) => {
    if (!canEditMonth(month)) return;
    persistCarMonthlyCosts(carMonthlyCosts.filter(c => !(c.car_id === carId && c.month === month)));
  };

  // ===== سجل التموين + خطط الصيانة الوقائية =====
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>(() => loadSavedArray<FuelLog>('elbanna_fuel_logs', []));
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>(() => loadSavedArray<ServicePlan>('elbanna_service_plans', []));

  const persistRows = <T extends { id: string }>(table: string, storageKey: string, tableOk: boolean, prev: T[], next: T[], setter: (rows: T[]) => void) => {
    setter(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (tableOk) {
      syncCostRows(table, 'id', prev, next);
      return;
    }
    const client = getSupabaseClient();
    if (client && isCloudConnected) {
      client.from('system_settings').upsert({ key: table, value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn(`Supabase save ${table} error:`, error); });
    }
  };

  const getCarOdometer = (carId: string): number | null => {
    const readings = fuelLogs.filter(l => l.car_id === carId && typeof l.odometer_km === 'number').map(l => l.odometer_km as number);
    return readings.length > 0 ? Math.max(...readings) : null;
  };

  const upsertFuelLog = (data: Omit<FuelLog, 'id' | 'updated_at' | 'updated_by' | 'total_amount'> & { id?: string; total_amount?: number }): { success: boolean; error?: string } => {
    if (!data.car_id) return { success: false, error: 'اختار السيارة.' };
    if (!(data.liters > 0)) return { success: false, error: 'اكتب عدد اللترات.' };
    if (!canEditMonth(data.date)) return { success: false, error: MONTH_LOCKED_MSG };
    const existing = data.id ? fuelLogs.find(l => l.id === data.id) : undefined;
    if (existing && !canEditMonth(existing.date)) return { success: false, error: MONTH_LOCKED_MSG };
    const record: FuelLog = {
      ...data,
      id: existing?.id || generateId('fuel'),
      total_amount: data.total_amount && data.total_amount > 0 ? data.total_amount : Math.round(data.liters * (data.price_per_liter || 0) * 100) / 100,
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    persistRows('fuel_logs', 'elbanna_fuel_logs', costTablesRef.current.fuel, fuelLogs, existing ? fuelLogs.map(l => l.id === record.id ? record : l) : [...fuelLogs, record], setFuelLogs);
    return { success: true };
  };

  const deleteFuelLog = (id: string): { success: boolean; error?: string } => {
    const target = fuelLogs.find(l => l.id === id);
    if (!target) return { success: false, error: 'التموين غير موجود.' };
    if (!canEditMonth(target.date)) return { success: false, error: MONTH_LOCKED_MSG };
    persistRows('fuel_logs', 'elbanna_fuel_logs', costTablesRef.current.fuel, fuelLogs, fuelLogs.filter(l => l.id !== id), setFuelLogs);
    return { success: true };
  };

  const upsertServicePlan = (data: Omit<ServicePlan, 'id' | 'updated_at' | 'updated_by'> & { id?: string }): { success: boolean; error?: string } => {
    if (!data.car_id) return { success: false, error: 'اختار السيارة.' };
    if (!data.name.trim()) return { success: false, error: 'اكتب اسم الخدمة.' };
    if (!(data.interval_km > 0)) return { success: false, error: 'اكتب المسافة بين كل خدمة والتانية بالكيلومتر.' };
    const existing = data.id ? servicePlans.find(p => p.id === data.id) : undefined;
    const record: ServicePlan = {
      ...data,
      name: data.name.trim(),
      id: existing?.id || generateId('plan'),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    persistRows('service_plans', 'elbanna_service_plans', costTablesRef.current.plans, servicePlans, existing ? servicePlans.map(p => p.id === record.id ? record : p) : [...servicePlans, record], setServicePlans);
    return { success: true };
  };

  const deleteServicePlan = (id: string) => {
    persistRows('service_plans', 'elbanna_service_plans', costTablesRef.current.plans, servicePlans, servicePlans.filter(p => p.id !== id), setServicePlans);
  };

  // تسجيل إن الخدمة اتنفذت دلوقتي (بقراءة العدّاد لو متاحة، وإلا بالتاريخ بس)
  const markServiceDone = (planId: string, odometer?: number) => {
    const plan = servicePlans.find(p => p.id === planId);
    if (!plan) return;
    upsertServicePlan({
      ...plan,
      last_done_date: new Date().toISOString().split('T')[0],
      last_done_km: odometer ?? getCarOdometer(plan.car_id) ?? undefined,
    });
  };

  // ===== قفل الأشهر: بعد ما الأدمن يقفل شهر، مصاريفه وفواتير التراخيص بتاعته مابتتعدّلش غير بأدمن البرنامج =====
  const [lockedMonths, setLockedMonths] = useState<{ month: string; locked_by?: string; locked_at: string }[]>(() =>
    loadSavedArray<{ month: string; locked_by?: string; locked_at: string }>('elbanna_locked_months', [])
  );
  const MONTH_LOCKED_MSG = 'الشهر ده مقفول — التعديل عليه متاح لأدمن البرنامج فقط.';
  const persistLockedMonths = (next: { month: string; locked_by?: string; locked_at: string }[]) => {
    setLockedMonths(next);
    localStorage.setItem('elbanna_locked_months', JSON.stringify(next));
    const client = getSupabaseClient();
    if (client && isCloudConnected) {
      client.from('system_settings').upsert({ key: 'locked_months', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save locked_months error:", error); });
    }
  };
  const isMonthLocked = (dateOrMonth: string): boolean => isMonthLockedIn(lockedMonths, dateOrMonth);
  const canEditMonth = (dateOrMonth: string): boolean => canEditMonthFor(lockedMonths, currentUser?.role, dateOrMonth);
  const lockMonth = (month: string): { success: boolean; error?: string } => {
    if (currentUser?.role !== 'admin') return { success: false, error: 'قفل الشهر متاح لأدمن البرنامج فقط.' };
    if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: 'صيغة الشهر غير صحيحة.' };
    if (isMonthLocked(month)) return { success: true };
    persistLockedMonths([...lockedMonths, { month, locked_by: currentUser?.name || currentUser?.username, locked_at: new Date().toISOString() }]);
    return { success: true };
  };
  const unlockMonth = (month: string): { success: boolean; error?: string } => {
    if (currentUser?.role !== 'admin') return { success: false, error: 'فتح الشهر متاح لأدمن البرنامج فقط.' };
    persistLockedMonths(lockedMonths.filter(m => m.month !== month));
    return { success: true };
  };

  // استرجاع من نسخة احتياطية: بيستبدل البيانات الأساسية بالكامل (السائقين، السيارات، المسؤولين، الفواتير،
  // الحركات، العهد، طلبات النقل، تكاليف السيارات). المستخدمين وكلمات المرور والصيانة مش جوه الاسترجاع.
  const restoreFromBackup = (payload: any): { success: boolean; message: string } => {
    const data = payload?.data;
    if (payload?.app !== 'elbanna-fleet' || !data || typeof data !== 'object') {
      return { success: false, message: 'الملف ده مش نسخة احتياطية صالحة لنظام الأسطول.' };
    }
    const list = (v: any): any[] => (Array.isArray(v) ? v : []);
    const restoredOfficials = list(data.officials).map((o: any) => ({
      ...o,
      // كلمات المرور مش بتتحط في النسخة الاحتياطية: بنحافظ على الموجودة، والجديد بياخد الافتراضي مشفّر
      password: officials.find(x => x.id === o.id)?.password || hashPassword('123'),
    }));

    // السجلات اللي في النسخة لازم تتشال من قائمة المحذوفات عشان ماتتفلترش بعد الاسترجاع
    const idsByTable: Record<string, Set<string>> = {
      drivers: new Set(list(data.drivers).map((r: any) => r.id)),
      officials: new Set(restoredOfficials.map((r: any) => r.id)),
      cars: new Set(list(data.cars).map((r: any) => r.id)),
      violations: new Set(list(data.violations).map((r: any) => r.id)),
      invoices: new Set(list(data.invoices).map((r: any) => r.id)),
      invoice_items: new Set(list(data.invoiceItems).map((r: any) => r.id)),
      driver_account_movements: new Set(list(data.driverMovements).map((r: any) => r.id)),
      custody_accounts: new Set(list(data.custodyAccounts).map((r: any) => r.id)),
      custody_movements: new Set(list(data.custodyMovements).map((r: any) => r.id)),
      transport_requests: new Set(list(data.transportRequests).map((r: any) => r.id)),
    };
    const t: Record<string, string[]> = { ...tombstonesRef.current };
    Object.keys(idsByTable).forEach(tb => {
      if (t[tb]) t[tb] = t[tb].filter(id => !idsByTable[tb].has(id));
    });
    saveTombstones(t);

    setDrivers(list(data.drivers));
    setOfficials(restoredOfficials as Official[]);
    setCars(list(data.cars));
    setViolations(list(data.violations));
    setInvoices(list(data.invoices));
    setInvoiceItems(list(data.invoiceItems));
    setAuditLogs(list(data.auditLogs));
    setMovements(list(data.driverMovements));
    setCustodyAccounts(list(data.custodyAccounts));
    setCustodyMovements(list(data.custodyMovements));
    setTransportRequests(list(data.transportRequests).map((r: any) => normalizeTransportRequest(r)));
    persistCarDailyCosts(list(data.carDailyCosts));
    persistCarMonthlyCosts(list(data.carMonthlyCosts));
    if (Array.isArray(data.fuelLogs)) persistRows('fuel_logs', 'elbanna_fuel_logs', costTablesRef.current.fuel, fuelLogs, data.fuelLogs, setFuelLogs);
    if (Array.isArray(data.servicePlans)) persistRows('service_plans', 'elbanna_service_plans', costTablesRef.current.plans, servicePlans, data.servicePlans, setServicePlans);

    return {
      success: true,
      message: `تم الاسترجاع: ${list(data.drivers).length} سائق، ${list(data.cars).length} سيارة، ${list(data.invoices).length} فاتورة، ${list(data.transportRequests).length} طلب نقل.`,
    };
  };

  const [isRealtimeActive, setRealtimeActive] = useState(true);
  const [latencyMs, setLatencyMs] = useState(50);

  // Cloud management state
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const isDownloadingRef = useRef(false);
  const isFirstMountRef = useRef(true);

  // ===== سجل المحذوفات (Tombstones) =====
  // أي سجل بيتحذف محليًا بنسجل الـ id بتاعه هنا ونرفعه للسحابة (system_settings / deleted_ids).
  // كده أي جهاز/متصفح فيه نسخة قديمة مش هيقدر يرجّع السجل المحذوف تاني، لا عند التحميل ولا عند الرفع.
  const TOMBSTONE_KEY = 'elbanna_deleted_ids_v1';
  // ترتيب الحذف من السحابة (الأبناء قبل الآباء)
  const PURGE_ORDER = ['fuel_logs', 'service_plans', 'car_daily_costs', 'car_monthly_costs', 'invoice_items', 'driver_account_movements', 'violations', 'custody_movements', 'custody_accounts', 'maintenance_invoices', 'maintenance_requests', 'transport_requests', 'invoices', 'cars', 'drivers', 'officials'];
  const readTombstones = (): Record<string, string[]> => {
    try {
      const raw = localStorage.getItem(TOMBSTONE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  };
  const tombstonesRef = useRef<Record<string, string[]>>(readTombstones());
  const prevIdsRef = useRef<Record<string, Set<string>> | null>(null);

  const saveTombstones = (t: Record<string, string[]>) => {
    tombstonesRef.current = t;
    try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(t)); } catch (e) { console.warn('tombstones save error', e); }
  };
  // أسماء المشرفين المحذوفين (عشان الفواتير اللي باسمهم تفضل ظاهرة بالاسم بعد حذف المشرف)
  const DELETED_NAMES_KEY = 'elbanna_deleted_official_names';
  const [deletedOfficialNames, setDeletedOfficialNames] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DELETED_NAMES_KEY) || '{}') || {}; } catch { return {}; }
  });
  const saveDeletedOfficialNames = (next: Record<string, string>) => {
    setDeletedOfficialNames(next);
    try { localStorage.setItem(DELETED_NAMES_KEY, JSON.stringify(next)); } catch {}
    const client = getSupabaseClient();
    if (client) {
      client.from('system_settings').upsert({ key: 'deleted_official_names', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn('push deleted official names error:', error.message); });
    }
  };
  const notDeleted = <T extends { id: string }>(table: string, rows: T[]): T[] => {
    const ids = tombstonesRef.current[table];
    if (!ids || ids.length === 0) return rows;
    const set = new Set(ids);
    return rows.filter(r => !set.has(r.id));
  };
  const pushTombstonesToCloud = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('system_settings').upsert({ key: 'deleted_ids', value: JSON.stringify(tombstonesRef.current) });
      if (error) console.warn('push tombstones error:', error.message);
    } catch (e) { console.warn('push tombstones exception:', e); }
  };
  // حذف فعلي من السحابة مع فحص الخطأ (الحذف بيتعاد تلقائيًا في كل فتح للموقع لو فشل)
  const purgeCloudRows = async (byTable: Record<string, string[]>) => {
    const client = getSupabaseClient();
    if (!client) return;
    for (const table of PURGE_ORDER) {
      const ids = byTable[table];
      if (!ids || ids.length === 0) continue;
      for (let i = 0; i < ids.length; i += 100) {
        try {
          const { error } = await client.from(table).delete().in('id', ids.slice(i, i + 100));
          if (error) console.warn(`purge ${table} error:`, error.message);
        } catch (e) { console.warn(`purge ${table} exception:`, e); }
      }
    }
  };

  // رصد أي سجل اختفى من الحالة (حذف) وتسجيله + حذفه من السحابة
  useEffect(() => {
    const current: Record<string, { id: string }[]> = {
      drivers, officials, cars, violations, invoices,
      invoice_items: invoiceItems,
      driver_account_movements: movements,
      custody_accounts: custodyAccounts,
      custody_movements: custodyMovements,
      transport_requests: transportRequests,
      maintenance_requests: maintenanceRequests,
      maintenance_invoices: maintenanceInvoices,
      car_daily_costs: carDailyCosts,
      car_monthly_costs: carMonthlyCosts,
      fuel_logs: fuelLogs,
      service_plans: servicePlans
    };
    const nextIds: Record<string, Set<string>> = {};
    Object.keys(current).forEach(t => { nextIds[t] = new Set(current[t].map(r => r.id)); });
    const prev = prevIdsRef.current;
    prevIdsRef.current = nextIds;
    if (!prev) return;

    const t: Record<string, string[]> = { ...tombstonesRef.current };
    const removedByTable: Record<string, string[]> = {};
    let changed = false;
    Object.keys(nextIds).forEach(table => {
      const p = prev[table]; const n = nextIds[table];
      if (!p || !n) return;
      const removed = [...p].filter(id => !n.has(id));
      const added = [...n].filter(id => !p.has(id));
      let list = t[table] || [];
      if (added.length && list.length) {
        const addedSet = new Set(added);
        const next = list.filter(id => !addedSet.has(id));
        if (next.length !== list.length) { list = next; changed = true; }
      }
      if (removed.length) {
        list = Array.from(new Set([...list, ...removed]));
        removedByTable[table] = removed;
        changed = true;
      }
      if (list.length > 5000) list = list.slice(-5000);
      t[table] = list;
    });
    if (!changed) return;
    saveTombstones(t);
    (async () => {
      await pushTombstonesToCloud();
      await purgeCloudRows(removedByTable);
    })();
  }, [drivers, officials, cars, violations, invoices, invoiceItems, movements, custodyAccounts, custodyMovements, transportRequests, maintenanceRequests, maintenanceInvoices, carDailyCosts, carMonthlyCosts, fuelLogs, servicePlans]);

  // Persist store state in local storage (local backup)
  useEffect(() => {
    localStorage.setItem('elbanna_drivers', JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    localStorage.setItem('elbanna_officials', JSON.stringify(officials));
  }, [officials]);

  useEffect(() => {
    localStorage.setItem('elbanna_cars', JSON.stringify(cars));
  }, [cars]);

  useEffect(() => {
    localStorage.setItem('elbanna_violations', JSON.stringify(violations));
  }, [violations]);

  useEffect(() => {
    localStorage.setItem('elbanna_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('elbanna_invoice_items', JSON.stringify(invoiceItems));
  }, [invoiceItems]);

  useEffect(() => {
    localStorage.setItem('elbanna_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('elbanna_movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('elbanna_custody_accounts', JSON.stringify(custodyAccounts));
  }, [custodyAccounts]);

  useEffect(() => {
    localStorage.setItem('elbanna_custody_movements', JSON.stringify(custodyMovements));
  }, [custodyMovements]);

  useEffect(() => {
    localStorage.setItem('elbanna_companies', JSON.stringify(companies));
  }, [companies]);

  useEffect(() => {
    localStorage.setItem('elbanna_hidden_companies', JSON.stringify(hiddenCompanies));
  }, [hiddenCompanies]);

  useEffect(() => {
    localStorage.setItem('elbanna_transport_requests', JSON.stringify(transportRequests));
  }, [transportRequests]);

  useEffect(() => {
    localStorage.setItem('elbanna_farms', JSON.stringify(farms));
  }, [farms]);

  // Automatic background silent upload whenever state changes locally (without manual triggers)
  useEffect(() => {
    // Skip the very first run on mount to prevent uploading stale local storage data before downloading fresh cloud data
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    const delayDebounce = setTimeout(async () => {
      if (isDownloadingRef.current) {
        await new Promise(r => setTimeout(r, 3000));
        if (isDownloadingRef.current) return;
      }
      try {
        const res = await uploadLocalDataToCloud();
        if (!res.success) {
          setCloudError(res.message);
          setTimeout(async () => {
            const retry = await uploadLocalDataToCloud();
            if (retry.success) setCloudError(null);
          }, 5000);
        } else {
          setCloudError(null);
        }
      } catch (err: any) {
        console.error("Auto-upload error:", err);
      }
    }, 1500);

    return () => clearTimeout(delayDebounce);
  }, [drivers, officials, cars, violations, invoices, invoiceItems, auditLogs, movements, custodyAccounts, custodyMovements, adminPassword, managerPassword, companies, hiddenCompanies]);

  // Network jitter simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (isRealtimeActive) {
        setLatencyMs(Math.floor(Math.random() * 80) + 30);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isRealtimeActive]);

  // Download Cloud Data to Local (Replaces currently loaded state with database content)
  const downloadCloudDataToLocal = async (isManual: boolean = false): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsCloudConnected(false);
      return { success: false, message: "مفاتيح ربط Supabase السحابية غير مهيأة بعد." };
    }

    setIsCloudSyncing(true);
    setCloudError(null);
    isDownloadingRef.current = true;

    try {
      const [
        resDrivers,
        resOfficials,
        resCars,
        resViolations,
        resInvoices,
        resItems,
        resLogs,
        resMovements,
        resCustodyAccs,
        resCustodyMovs,
        resTransportRequests,
        resMaintenanceRequests,
        resMaintenanceInvoices,
        resDailyCosts,
        resMonthlyCosts,
        resFuelLogs,
        resServicePlans
      ] = await Promise.all([
        supabase.from('drivers').select('*'),
        supabase.from('officials').select('*'),
        supabase.from('cars').select('*'),
        supabase.from('violations').select('*').order('violation_date', { ascending: false }),
        supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('invoice_items').select('*'),
        supabase.from('invoice_audit_logs').select('*').order('timestamp', { ascending: false }),
        supabase.from('driver_account_movements').select('*').order('date', { ascending: false }),
        supabase.from('custody_accounts').select('*'),
        supabase.from('custody_movements').select('*').order('date', { ascending: false }),
        supabase.from('transport_requests').select('*').order('request_number', { ascending: false }),
        supabase.from('maintenance_requests').select('*').order('request_number', { ascending: false }),
        supabase.from('maintenance_invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('car_daily_costs').select('*'),
        supabase.from('car_monthly_costs').select('*'),
        supabase.from('fuel_logs').select('*'),
        supabase.from('service_plans').select('*')
      ]);

      let errorOccurred = false;
      const detailedErrors: string[] = [];

      if (resDrivers.error) {
        errorOccurred = true;
        detailedErrors.push(`drivers: ${resDrivers.error.message} (code: ${resDrivers.error.code})`);
      }
      if (resOfficials.error) {
        errorOccurred = true;
        detailedErrors.push(`officials: ${resOfficials.error.message} (code: ${resOfficials.error.code})`);
      }
      if (resCars.error) {
        errorOccurred = true;
        detailedErrors.push(`cars: ${resCars.error.message} (code: ${resCars.error.code})`);
      }
      if (resViolations.error) {
        errorOccurred = true;
        detailedErrors.push(`violations: ${resViolations.error.message} (code: ${resViolations.error.code})`);
      }
      if (resInvoices.error) {
        errorOccurred = true;
        detailedErrors.push(`invoices: ${resInvoices.error.message} (code: ${resInvoices.error.code})`);
      }
      if (resItems.error) {
        errorOccurred = true;
        detailedErrors.push(`invoice_items: ${resItems.error.message} (code: ${resItems.error.code})`);
      }
      if (resLogs.error) {
        errorOccurred = true;
        detailedErrors.push(`invoice_audit_logs: ${resLogs.error.message} (code: ${resLogs.error.code})`);
      }
      if (resMovements.error) {
        errorOccurred = true;
        detailedErrors.push(`driver_account_movements: ${resMovements.error.message} (code: ${resMovements.error.code})`);
      }
      if (resCustodyAccs.error) {
        errorOccurred = true;
        detailedErrors.push(`custody_accounts: ${resCustodyAccs.error.message} (code: ${resCustodyAccs.error.code})`);
      }
      if (resCustodyMovs.error) {
        errorOccurred = true;
        detailedErrors.push(`custody_movements: ${resCustodyMovs.error.message} (code: ${resCustodyMovs.error.code})`);
      }
      // جدول طلبات النقل قد لا يكون منشأ بعد على مشاريع قديمة، فلا نمنع باقي المزامنة بسببه
      if (resTransportRequests.error && !resTransportRequests.error.message?.includes("does not exist") && !resTransportRequests.error.message?.includes("schema cache")) {
        errorOccurred = true;
        detailedErrors.push(`transport_requests: ${resTransportRequests.error.message} (code: ${resTransportRequests.error.code})`);
      }
      // جداول الصيانة جديدة وقد لا تكون منشأة بعد، فلا نمنع باقي المزامنة بسببها
      if (resMaintenanceRequests.error && !resMaintenanceRequests.error.message?.includes("does not exist") && !resMaintenanceRequests.error.message?.includes("schema cache")) {
        errorOccurred = true;
        detailedErrors.push(`maintenance_requests: ${resMaintenanceRequests.error.message} (code: ${resMaintenanceRequests.error.code})`);
      }
      if (resMaintenanceInvoices.error && !resMaintenanceInvoices.error.message?.includes("does not exist") && !resMaintenanceInvoices.error.message?.includes("schema cache")) {
        errorOccurred = true;
        detailedErrors.push(`maintenance_invoices: ${resMaintenanceInvoices.error.message} (code: ${resMaintenanceInvoices.error.code})`);
      }

      if (errorOccurred) {
        console.warn("Supabase download tables errors:", detailedErrors);
        const mainErrorMsg = detailedErrors.join(" | ");

        // 1. Check for missing columns (error code 42703 or "column ... does not exist" message)
        const isColumnMissing = detailedErrors.some(errMsg => errMsg.includes("42703") || (errMsg.includes("column") && errMsg.includes("does not exist")));
        if (isColumnMissing) {
          setIsCloudConnected(true);
          const customMsg = "تنبيه قاعدة البيانات السحابية: هناك حقل مفقود بجدول السيارات (traffic_office) في مشروع Supabase الخاص بك. لحل هذه المشكلة فورًا لتبسيط الاتصال وعرض جميع بيانات الجداول، يرجى التوجه إلى SQL Editor في Supabase وتشغيل الكود التالي:\n\nALTER TABLE cars ADD COLUMN IF NOT EXISTS traffic_office VARCHAR(100);";
          setCloudError(customMsg);
          return { success: false, message: customMsg };
        }

        // 2. Check for missing tables (relation does not exist)
        const isRelationMissing = detailedErrors.some(errMsg => errMsg.includes("42P01") || (errMsg.includes("relation") && errMsg.includes("does not exist")) || errMsg.includes("schema cache"));
        if (isRelationMissing) {
          const missingTables: string[] = [];
          if (resDrivers.error?.message?.includes("does not exist")) missingTables.push("drivers");
          if (resOfficials.error?.message?.includes("does not exist")) missingTables.push("officials");
          if (resCars.error?.message?.includes("does not exist")) missingTables.push("cars");
          if (resViolations.error?.message?.includes("does not exist")) missingTables.push("violations");
          if (resInvoices.error?.message?.includes("does not exist")) missingTables.push("invoices");
          if (resItems.error?.message?.includes("does not exist")) missingTables.push("invoice_items");
          if (resLogs.error?.message?.includes("does not exist")) missingTables.push("invoice_audit_logs");
          if (resMovements.error?.message?.includes("does not exist")) missingTables.push("driver_account_movements");
          if (resCustodyAccs.error?.message?.includes("does not exist")) missingTables.push("custody_accounts");
          if (resCustodyMovs.error?.message?.includes("does not exist")) missingTables.push("custody_movements");
          if (resTransportRequests.error?.message?.includes("does not exist")) missingTables.push("transport_requests");

          setIsCloudConnected(true);
          const msg = `جداول قاعدة البيانات التالية غير منشأة بالخادم السحابي بعد: [ ${missingTables.join(", ")} ]. يرجى فتح نافذة الـ SQL Editor لتهيئتها لتجربة المزامنة الكاملة وحفظ البيانات فوريًا.`;
          setCloudError(msg);
          return { success: false, message: msg };
        }

        setIsCloudConnected(false);
        setCloudError(mainErrorMsg);
        return { success: false, message: `فشل جلب بعض الجداول السحابية: ${mainErrorMsg}` };
      }

      // ===== تطبيق سجل المحذوفات: دمج المحذوفات السحابية مع المحلية ثم استبعادها =====
      try {
        const { data: tsRow } = await supabase.from('system_settings').select('value').eq('key', 'deleted_ids').maybeSingle();
        if (tsRow?.value) {
          const cloudT = JSON.parse(tsRow.value) as Record<string, string[]>;
          const merged: Record<string, string[]> = { ...tombstonesRef.current };
          Object.keys(cloudT || {}).forEach(tb => {
            merged[tb] = Array.from(new Set([...(merged[tb] || []), ...(cloudT[tb] || [])]));
          });
          saveTombstones(merged);
        }
      } catch (e) { console.warn('load tombstones error', e); }
      try {
        const { data: dnRow } = await supabase.from('system_settings').select('value').eq('key', 'deleted_official_names').maybeSingle();
        if (dnRow?.value) {
          const cloudNames = JSON.parse(dnRow.value) as Record<string, string>;
          const mergedNames = { ...cloudNames, ...JSON.parse(localStorage.getItem(DELETED_NAMES_KEY) || '{}') };
          setDeletedOfficialNames(mergedNames);
          try { localStorage.setItem(DELETED_NAMES_KEY, JSON.stringify(mergedNames)); } catch {}
        }
      } catch (e) { console.warn('load deleted official names error', e); }

      const staleCloud: Record<string, string[]> = {};
      const stripDeleted = (table: string, res: any) => {
        const ids = tombstonesRef.current[table];
        if (!res?.data || !ids || ids.length === 0) return;
        const set = new Set(ids);
        const stale = res.data.filter((r: any) => set.has(r.id)).map((r: any) => r.id);
        if (stale.length > 0) {
          staleCloud[table] = stale;
          res.data = res.data.filter((r: any) => !set.has(r.id));
        }
      };
      stripDeleted('drivers', resDrivers);
      stripDeleted('officials', resOfficials);
      stripDeleted('cars', resCars);
      stripDeleted('violations', resViolations);
      stripDeleted('invoices', resInvoices);
      stripDeleted('invoice_items', resItems);
      stripDeleted('driver_account_movements', resMovements);
      stripDeleted('custody_accounts', resCustodyAccs);
      stripDeleted('custody_movements', resCustodyMovs);
      stripDeleted('transport_requests', resTransportRequests);
      stripDeleted('maintenance_requests', resMaintenanceRequests);
      stripDeleted('maintenance_invoices', resMaintenanceInvoices);
      stripDeleted('car_daily_costs', resDailyCosts);
      stripDeleted('car_monthly_costs', resMonthlyCosts);
      stripDeleted('fuel_logs', resFuelLogs);
      stripDeleted('service_plans', resServicePlans);
      if (Object.keys(staleCloud).length > 0) {
        purgeCloudRows(staleCloud); // تنظيف السحابة من السجلات المحذوفة سابقًا
      }

      // Check if all cloud tables fetched successfully and are empty
      const isDownloadedEmpty = 
        (!resDrivers.data || resDrivers.data.length === 0) &&
        (!resOfficials.data || resOfficials.data.length === 0) &&
        (!resCars.data || resCars.data.length === 0) &&
        (!resViolations.data || resViolations.data.length === 0) &&
        (!resInvoices.data || resInvoices.data.length === 0) &&
        (!resItems.data || resItems.data.length === 0) &&
        (!resLogs.data || resLogs.data.length === 0) &&
        (!resMovements.data || resMovements.data.length === 0) &&
        (!resCustodyAccs.data || resCustodyAccs.data.length === 0) &&
        (!resCustodyMovs.data || resCustodyMovs.data.length === 0);

      if (isDownloadedEmpty) {
        // If the database is completely empty (newly created project)
        // Check if there is local data to protect
        const hasLocalData = drivers.length > 5 || cars.length > 3 || invoices.length > 1;
        if (hasLocalData && !isManual) {
          console.log("Empty Cloud database detected. Proactively auto-uploading local state to seed Cloud DB...");
          // Clean the loading refs shortly so client context is allowed to write
          isDownloadingRef.current = false;
          setIsCloudSyncing(false);
          const uploadRes = await uploadLocalDataToCloud();
          if (uploadRes.success) {
            setIsCloudConnected(true);
            setCloudError(null);
            return {
              success: true,
              message: "تم الاتصال بقاعدة بياناتك السحابية الجديدة الفارغة بنجاح! ⚡\n\nولحماية بياناتك المحلية المتاحة على هذا الجهاز من الضياع، قمنا برفعها تلقائياً بالكامل وتسكينها بمشروع السحابة الجديد لضمان مزامنة سلسة ومستمرة!"
            };
          }
        }
      }

      // Populating tables individually - merging local additions with cloud fetched records
      if (resDrivers.data) {
        const cloudDrivers = resDrivers.data;
        const cloudIds = new Set(cloudDrivers.map(d => d.id));
        const cloudCodes = new Set(cloudDrivers.map(d => d.driver_code));
        const localOnly = notDeleted('drivers', drivers).filter(d => !cloudIds.has(d.id) && !cloudCodes.has(d.driver_code));
        setDrivers([...cloudDrivers, ...localOnly]);
      }
      if (resOfficials.data) {
        const cloudOfficials = resOfficials.data;
        const cloudIds = new Set(cloudOfficials.map(o => o.id));
        const localOnly = notDeleted('officials', officials).filter(o => !cloudIds.has(o.id));
        setOfficials([...cloudOfficials, ...localOnly]);
      }
      if (resCars.data) {
        const cloudCars = resCars.data;
        const cloudIds = new Set(cloudCars.map(c => c.id));
        const cloudNumbers = new Set(cloudCars.map(c => c.car_number));
        const localOnly = notDeleted('cars', cars).filter(c => !cloudIds.has(c.id) && !cloudNumbers.has(c.car_number));
        setCars([...cloudCars, ...localOnly]);
      }
      if (resViolations.data) {
        const cloudViolations = resViolations.data.map(v => ({ ...v, violation_date: normalizeDateToYmd(v.violation_date) }));
        const cloudIds = new Set(cloudViolations.map(v => v.id));
        const localOnly = notDeleted('violations', violations).filter(v => !cloudIds.has(v.id));
        setViolations([...cloudViolations, ...localOnly]);
      }
      if (resInvoices.data) {
        const cloudInvoices = resInvoices.data.map((i: any) => ({ ...i, approval_status: i.approval_status || 'approved' }));
        const cloudIds = new Set(cloudInvoices.map(i => i.id));
        const cloudNumbers = new Set(cloudInvoices.map(i => i.invoice_number));
        const localOnly = notDeleted('invoices', invoices).filter(i => !cloudIds.has(i.id) && !cloudNumbers.has(i.invoice_number));
        setInvoices([...cloudInvoices, ...localOnly]);
      }
      if (resItems.data) {
        const sorted = [...resItems.data].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const cloudItemIds = new Set(sorted.map(i => i.id));
        // بنود الفاتورة بتتحذف وتتحل محلها بنود جديدة (معرفات جديدة) عند أي تعديل على الفاتورة (updateInvoice).
        // لو اعتمدنا على مطابقة الـ id بس، أي جهاز/جلسة لسه محتفظة بالبنود القديمة (قبل التعديل) في
        // التخزين المحلي هترجّعها تاني كـ "بنود محلية لسه مارفعتش" فتتضاعف البنود في الفاتورة نفسها.
        // الحل: لو الفاتورة نفسها موجودة بالفعل في السحابة، نعتبر قائمة بنودها في السحابة هي المرجع
        // الوحيد لها، ونحتفظ بالبنود المحلية بس لو خاصة بفاتورة لسه مارفعتش للسحابة أصلاً.
        const cloudInvoiceIds = new Set((resInvoices.data || []).map((i: any) => i.id));
        const localOnly = notDeleted('invoice_items', invoiceItems).filter(i => !cloudItemIds.has(i.id) && !cloudInvoiceIds.has(i.invoice_id));
        setInvoiceItems([...sorted, ...localOnly]);
      }
      if (resLogs.data) {
        const cloudLogs = resLogs.data;
        const cloudIds = new Set(cloudLogs.map(l => l.id));
        const localOnly = auditLogs.filter(l => !cloudIds.has(l.id));
        setAuditLogs([...cloudLogs, ...localOnly]);
      }
      if (resMovements.data) {
        const cloudMovements = resMovements.data.map(m => ({ ...m, date: normalizeDateToYmd(m.date) }));
        const cloudIds = new Set(cloudMovements.map(m => m.id));
        const localOnly = notDeleted('driver_account_movements', movements).filter(m => !cloudIds.has(m.id));
        setMovements([...cloudMovements, ...localOnly]);

        // رفع الحركات المحلية الغائبة عن السحابة تلقائياً
        if (localOnly.length > 0 && supabase) {
          const sanitized = localOnly.map(m => ({
            ...m,
            date: normalizeDateToYmd(m.date)
          }));
          supabase.from('driver_account_movements').upsert(sanitized)
            .then(({ error }) => {
              if (error) console.warn("Auto-upload local movements error:", error.message);
              else console.log(`✅ Auto-uploaded ${sanitized.length} local movement(s) to Supabase`);
            });
        }
      }
      if (resCustodyAccs.data) {
        const cloudAccs = resCustodyAccs.data;
        const cloudIds = new Set(cloudAccs.map(a => a.id));
        const localOnly = notDeleted('custody_accounts', custodyAccounts).filter(a => !cloudIds.has(a.id));
        setCustodyAccounts([...cloudAccs, ...localOnly]);
      }
      if (resCustodyMovs.data) {
        const cloudMovs = resCustodyMovs.data;
        const cloudIds = new Set(cloudMovs.map(m => m.id));
        const localOnly = notDeleted('custody_movements', custodyMovements).filter(m => !cloudIds.has(m.id));
        setCustodyMovements([...cloudMovs, ...localOnly]);
      }
      if (resTransportRequests.data) {
        const cloudRequests = resTransportRequests.data;
        const cloudIds = new Set(cloudRequests.map((r: any) => r.id));
        const localOnly = notDeleted('transport_requests', transportRequests).filter(r => !cloudIds.has(r.id));
        setTransportRequests([...cloudRequests, ...localOnly].map((r: any) => normalizeTransportRequest(r)));
      }
      if (resMaintenanceRequests.data) {
        const cloudReqs = resMaintenanceRequests.data;
        const cloudIds = new Set(cloudReqs.map((r: any) => r.id));
        const localOnly = notDeleted('maintenance_requests', maintenanceRequests).filter(r => !cloudIds.has(r.id));
        setMaintenanceRequests([...cloudReqs, ...localOnly].map((r: any) => normalizeMaintenanceRequest(r, (resMaintenanceInvoices.data as any[]) || maintenanceInvoices) as MaintenanceRequest));
      }
      if (resMaintenanceInvoices.data) {
        const cloudInvs = resMaintenanceInvoices.data;
        const cloudIds = new Set(cloudInvs.map((i: any) => i.id));
        const localOnly = notDeleted('maintenance_invoices', maintenanceInvoices).filter(i => !cloudIds.has(i.id));
        setMaintenanceInvoices([...cloudInvs, ...localOnly]);
      }

      // ===== جداول التكاليف (car_daily_costs / car_monthly_costs) =====
      // لو الجداول موجودة بنشتغل بيها (صف لكل سجل — مفيش جهاز بيمسح شغل جهاز تاني). لو لسه ماتعملتش بنكمّل بالطريقة القديمة.
      // وأول مرة بينقل أي أرقام قديمة (الملف الواحد في system_settings + اللي على الجهاز) للجداول تلقائيًا.
      const dailyTableOk = !resDailyCosts.error;
      const monthlyTableOk = !resMonthlyCosts.error;
      const fuelTableOk = !resFuelLogs.error;
      const plansTableOk = !resServicePlans.error;
      costTablesRef.current = { daily: dailyTableOk, monthly: monthlyTableOk, fuel: fuelTableOk, plans: plansTableOk };
      const num0 = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };

      const mergeCostTable = async (
        table: string, keyOf: (r: any) => string, res: any, localRows: any[],
        setLocal: (rows: any[]) => void, storageKey: string, onConflict: string, normalize: (r: any) => any
      ) => {
        const cloudRows: any[] = (res.data || []).map(normalize);
        const cloudIds = new Set(cloudRows.map(r => r.id));
        const seen = new Set(cloudRows.map(keyOf));
        let legacyRows: any[] = [];
        try {
          const { data: legacyRow } = await supabase.from('system_settings').select('value').eq('key', table).maybeSingle();
          if (legacyRow?.value) {
            const parsed = JSON.parse(legacyRow.value);
            if (Array.isArray(parsed)) legacyRows = parsed;
          }
        } catch (e) { console.warn(`read legacy ${table} error`, e); }

        const pending: any[] = [];
        [...notDeleted(table, localRows), ...notDeleted(table, legacyRows)].forEach(r => {
          const k = keyOf(r);
          if (cloudIds.has(r.id) || seen.has(k)) return;
          seen.add(k);
          pending.push(r);
        });
        const merged = [...cloudRows, ...pending];
        setLocal(merged);
        localStorage.setItem(storageKey, JSON.stringify(merged));
        if (pending.length > 0) {
          const { error } = await supabase.from(table).upsert(pending, { onConflict });
          if (error) { console.warn(`migrate ${table} error:`, error.message); return; }
        }
        if (legacyRows.length > 0) {
         

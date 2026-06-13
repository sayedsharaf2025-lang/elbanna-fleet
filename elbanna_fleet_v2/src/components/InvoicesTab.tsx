/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Invoice, InvoiceItem, CustodyAccount, CustodyMovement, Official } from '../types';
import { A5PrintPreview } from './A5PrintPreview';
import { PdfInvoiceImport } from './PdfInvoiceImport';
import {
  FileText,
  Plus,
  Trash2,
  DollarSign,
  Printer,
  History,
  ShieldCheck,
  CreditCard,
  UserCheck,
  CheckCircle2,
  AlertOctagon,
  ScrollText,
  RotateCcw,
  ArrowRightLeft,
  Layers,
  Sparkles,
  UserPlus,
  ChevronDown,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Lock,
  Key
} from 'lucide-react';

interface DraftVoucher {
  id: string;
  officialId: string;
  carId: string;
  licenseDetails: string;
  licenseLocation: string;
  carLocation: string;
  invoiceDate: string;
  items: {
    id: string;
    description: string;
    paymentMethod: 'cash' | 'visa';
    accountId: string;
    amount: number;
  }[];
}

interface AdminOfficialPasswordRowProps {
  official: Official;
  currentPass: string;
  onUpdate: (newPass: string) => void;
}

const AdminOfficialPasswordRow: React.FC<AdminOfficialPasswordRowProps> = ({ official, currentPass, onUpdate }) => {
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [showPass, setShowPass] = useState(false);

  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-900/40 text-slate-300">
      <td className="py-2.5 px-3 font-semibold text-right text-slate-100">{official.name}</td>
      <td className="py-2.5 px-3 text-center font-mono text-[11px] font-bold">
        <div className="flex items-center justify-center gap-1.5">
          <span className="bg-slate-950 px-2 py-1 rounded text-yellow-405 border border-slate-800">
            {showPass ? currentPass : '••••••'}
          </span>
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            className="text-[10px] text-indigo-400 hover:text-indigo-305 underline"
          >
            {showPass ? 'إخفاء' : 'عرض'}
          </button>
        </div>
      </td>
      <td className="py-2.5 px-3 text-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPasswordVal.trim().length >= 3) {
              onUpdate(newPasswordVal.trim());
              setNewPasswordVal('');
            } else {
              alert('كلمة المرور يجب أن تكون 3 أحرف على الأقل!');
            }
          }}
          className="flex items-center justify-center gap-1.5"
        >
          <input
            type="password"
            placeholder="كلمة مرور جديدة..."
            value={newPasswordVal}
            onChange={(e) => setNewPasswordVal(e.target.value)}
            className="p-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono w-28 text-center"
          />
          <button
            type="submit"
            className="bg-indigo-900/50 hover:bg-indigo-900 text-indigo-300 font-extrabold px-2.5 py-1 rounded text-[10px] transition-all"
          >
            تحديث
          </button>
        </form>
      </td>
    </tr>
  );
};

export const InvoicesTab: React.FC = () => {
  const db = useDb();

  // Active Main Sub Tab: 'invoices', 'custodies', 'pdf_import' or 'change_password'
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'custodies' | 'pdf_import' | 'change_password'>('invoices');

  // Personal Password Change state
  const [personalOldPassword, setPersonalOldPassword] = useState('');
  const [personalNewPassword, setPersonalNewPassword] = useState('');
  const [personalConfirmPassword, setPersonalConfirmPassword] = useState('');
  const [personalPasswordError, setPersonalPasswordError] = useState('');
  const [personalPasswordSuccess, setPersonalPasswordSuccess] = useState('');

  // Enforce supervisor pre-selectors and locks
  React.useEffect(() => {
    if (db.currentUser?.role === 'supervisor' && db.currentUser?.officialId) {
      setSelectedOfficialForDetail(db.currentUser.officialId);
    }
  }, [db.currentUser]);

  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [showDeletedInvoices, setShowDeletedInvoices] = useState(false);
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string>('all');

  // --- STATS & DIAL STATE ---
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success' | null; text: string }>({ type: null, text: '' });

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ type, text });
    setTimeout(() => {
      setStatusMsg({ type: null, text: '' });
    }, 5000);
  };

  // --- SUB TAB 1: INVOICES EXPENSES & MULTIPLE OPEN VOUCHERS ---
  const [draftVouchers, setDraftVouchers] = useState<DraftVoucher[]>([
    {
      id: "draft_init",
      officialId: "",
      carId: "",
      licenseDetails: "رسوم تجديد فحص قشرة طفاية وتأمين مروري سنوي",
      licenseLocation: "مرور عبود فرعي الجيزة",
      carLocation: "جراج دفرة الرئيسي",
      invoiceDate: new Date().toISOString().split('T')[0],
      items: [
        { id: "init_row_1", description: "رسوم فحص فني وبيئي وتجديد طفايات حريق", paymentMethod: 'cash', accountId: '', amount: 1000 }
      ]
    }
  ]);

  // تحميل المسودات عند الفتح (من السحابة أو المحلي)
  React.useEffect(() => {
    db.loadDraftVouchers().then(saved => {
      if (saved && saved.length > 0) {
        setDraftVouchers(saved);
      }
    });
  }, []);

  // Auto-save المسودات عند أي تغيير (debounce 800ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      db.saveDraftVouchers(draftVouchers);
    }, 800);
    return () => clearTimeout(timer);
  }, [draftVouchers]);

  // Enforce logged-in supervisor's officialId on draft vouchers safely after declaration
  React.useEffect(() => {
    if (db.currentUser?.role === 'supervisor' && db.currentUser?.officialId) {
      const supId = db.currentUser.officialId;
      const needsUpdate = draftVouchers.some(v => v.officialId !== supId);
      if (needsUpdate) {
        setDraftVouchers(prev => prev.map(v => v.officialId !== supId ? { ...v, officialId: supId } : v));
      }
    }
  }, [db.currentUser, draftVouchers]);

  // Open multi expense vouchers helper
  const handleAddNewDraftVoucher = () => {
    const nextId = "draft_" + Date.now();
    const isSup = db.currentUser?.role === 'supervisor';
    setDraftVouchers(prev => [
      ...prev,
      {
        id: nextId,
        officialId: isSup ? (db.currentUser?.officialId || "") : "",
        carId: "",
        licenseDetails: "رسوم تجديد فحص دوري",
        licenseLocation: "مرور العباسية الرئيسي",
        carLocation: "",
        invoiceDate: new Date().toISOString().split('T')[0],
        items: [
          { id: "init_item_" + Date.now(), description: "بند تجديد روتيني وطوابع فحص مائي", paymentMethod: 'cash', accountId: '', amount: 500 }
        ]
      }
    ]);
    showStatus("تم فتح استمارة مسودة صرف جديدة لسيارة إضافية بالتراخيص.", "success");
  };

  const handleRemoveDraftVoucher = (draftId: string) => {
    if (draftVouchers.length === 1) {
      alert("يجب إبقاء استمارة واحدة على الأقل بالذاكرة قيد التحضير!");
      return;
    }
    setDraftVouchers(prev => prev.filter(v => v.id !== draftId));
  };

  const handleUpdateDraftHeader = (draftId: string, field: 'officialId' | 'carId' | 'licenseDetails' | 'licenseLocation' | 'carLocation' | 'invoiceDate', val: string) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        // Automatically default sub-account IDs if official changes
        let updatedItems = [...v.items];
        if (field === 'officialId') {
          updatedItems = v.items.map(itm => {
            const match = db.custodyAccounts.find(ca => ca.official_id === val && ca.type === itm.paymentMethod);
            return {
              ...itm,
              accountId: match ? match.id : ''
            };
          });
        }
        return {
          ...v,
          [field]: val,
          items: updatedItems
        };
      }
      return v;
    }));
  };

  const handleAddRowToDraft = (draftId: string) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        const rowId = "row_item_" + Date.now();
        // default sub-account
        const match = db.custodyAccounts.find(ca => ca.official_id === v.officialId && ca.type === 'cash');
        return {
          ...v,
          items: [
            ...v.items,
            { id: rowId, description: "", paymentMethod: 'cash', accountId: match ? match.id : '', amount: 0 }
          ]
        };
      }
      return v;
    }));
  };

  const handleRemoveRowFromDraft = (draftId: string, itemId: string) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        if (v.items.length <= 1) {
          alert("يجب تخصيص بند صرف واحد على الأقل داخل كارت السيارة!");
          return v;
        }
        return {
          ...v,
          items: v.items.filter(i => i.id !== itemId)
        };
      }
      return v;
    }));
  };

  const handleMoveDraftRow = (draftId: string, itemId: string, direction: 'up' | 'down') => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        const index = v.items.findIndex(i => i.id === itemId);
        if (index === -1) return v;
        const newItems = [...v.items];
        if (direction === 'up' && index > 0) {
          const temp = newItems[index];
          newItems[index] = newItems[index - 1];
          newItems[index - 1] = temp;
        } else if (direction === 'down' && index < newItems.length - 1) {
          const temp = newItems[index];
          newItems[index] = newItems[index + 1];
          newItems[index + 1] = temp;
        }
        return {
          ...v,
          items: newItems
        };
      }
      return v;
    }));
  };

  const handleUpdateDraftRow = (draftId: string, itemId: string, field: 'description' | 'paymentMethod' | 'accountId' | 'amount', val: any) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        const nextItems = v.items.map(itm => {
          if (itm.id === itemId) {
            let updated = { ...itm, [field]: field === 'amount' ? Number(val) : val };
            
            // Auto match compatible account_id when paymentMethod switches
            if (field === 'paymentMethod') {
              const compatible = db.custodyAccounts.find(ca => ca.official_id === v.officialId && ca.type === val);
              updated.accountId = compatible ? compatible.id : '';
            } else if (field === 'accountId') {
              const chosenAcc = db.custodyAccounts.find(ca => ca.id === val);
              if (chosenAcc) {
                updated.paymentMethod = chosenAcc.type === 'cash' ? 'cash' : 'visa';
              }
            }

            return updated;
          }
          return itm;
        });
        return { ...v, items: nextItems };
      }
      return v;
    }));
  };

  // Dispatch Finalized Saved Invoice to persistent database & trigger A5 printable modal
  const handleFinalizeSaveVoucher = (draftId: string) => {
    const voucher = draftVouchers.find(v => v.id === draftId);
    if (!voucher) return;

    if (!voucher.officialId) {
      showStatus("الرجاء تحديد مسؤول تراخيص العهدة لهذه الفاتورة!", "error");
      return;
    }
    if (!voucher.carId) {
      showStatus("الرجاء اختيار المركبة الواحدة المستهدفة بمصروفات هذا المستند!", "error");
      return;
    }
    const emptyRow = voucher.items.some(i => !i.description || i.amount <= 0 || !i.accountId);
    if (emptyRow) {
      showStatus("الرجاء التأكد من كتابة توصيف كافة البنود وتحديد مبالغ وقيم الخصم بنجاح!", "error");
      return;
    }

    const officialObj = db.officials.find(o => o.id === voucher.officialId);
    if (!officialObj) return;

    const payloadItems = voucher.items.map(i => ({
      description: i.description,
      amount: i.amount,
      payment_method: i.paymentMethod,
      account_id: i.accountId
    }));

    const totalAmount = payloadItems.reduce((sum, item) => sum + item.amount, 0);

    const res = db.createInvoice({
      invoice_date: voucher.invoiceDate,
      official_id: voucher.officialId,
      car_id: voucher.carId,
      license_details: voucher.licenseDetails,
      license_location: voucher.licenseLocation,
      car_location: voucher.carLocation,
      total_amount: totalAmount
    }, payloadItems);

    if (res.success) {
      showStatus(`تم حفظ وطباعة الفاتورة المركبة بنجاح، وتدقيق رصيد المسؤول ماليًا السحابي.`, "success");
      
      // Auto reprint
      if (res.invoice) {
        triggerReprint(res.invoice.id);
      }

      // Remove this voucher card from active draft session
      if (draftVouchers.length > 1) {
        setDraftVouchers(prev => prev.filter(v => v.id !== draftId));
      } else {
        // Reset single Card
        setDraftVouchers([
          {
            id: "draft_init_" + Date.now(),
            officialId: "",
            carId: "",
            licenseDetails: "رسوم تجديد فحص قشرة طفاية وتأمين",
            licenseLocation: "مرور عبود",
            carLocation: "",
            invoiceDate: new Date().toISOString().split('T')[0],
            items: [
              { id: "init_row_" + Date.now(), description: "رسوم فحص فني وبيئي وتجديد طفايات حريق", paymentMethod: 'cash', accountId: '', amount: 1000 }
            ]
          }
        ]);
      }
    } else {
      showStatus(res.error || "عجز مالي في رصيد عهدة المسؤول المرتبط!", "error");
    }
  };


  // --- SUB TAB 2: CUSTODY MANAGEMENT & CASH/VISA ACCOUNTS ---
  const [selectedOfficialForDetail, setSelectedOfficialForDetail] = useState<string>('');
  
  // Custom inputs for adding new Licensing Officer (Official) & initial cash
  const [newOfficialName, setNewOfficialName] = useState('');
  const [newOfficialInitialCash, setNewOfficialInitialCash] = useState(0);
  const [newOfficialInitialVisa, setNewOfficialInitialVisa] = useState(0);

  // Custom inputs for adding segment card / sub account
  const [newSubAccName, setNewSubAccName] = useState('');
  const [newSubAccType, setNewSubAccType] = useState<'cash' | 'visa' | 'other_visa'>('visa');
  const [newSubAccBalance, setNewSubAccBalance] = useState(0);

  // Fund balance transfer form state
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferDesc, setTransferDesc] = useState('');

  // Settle manual edit adjustment state
  const [adjustingAccountId, setAdjustingAccountId] = useState<string | null>(null);
  const [adjustingBalance, setAdjustingBalance] = useState(0);

  const handleCreateOfficial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficialName.trim()) {
      alert("يرجى إدخال اسم مسؤول التراخيص!");
      return;
    }
    const added = db.addOfficial({
      name: newOfficialName,
      cash_custody: newOfficialInitialCash,
      visa_custody: newOfficialInitialVisa
    });
    showStatus(`تم بنجاح تشغيل سجل (Licensing_Officials) المعتمد للمسؤول (${added.name}) وتغذية العهد.`, "success");
    setNewOfficialName('');
    setNewOfficialInitialCash(0);
    setNewOfficialInitialVisa(0);
  };

  const handleCreateSubAccount = (officialId: string) => {
    if (!newSubAccName.trim() || newSubAccBalance < 0) {
      alert("الرجاء استيفاء بيانات الحساب الفرعي لتجزئة العهدة!");
      return;
    }
    db.addCustodyAccount({
      official_id: officialId,
      name: newSubAccName,
      type: newSubAccType,
      balance: newSubAccBalance
    });
    showStatus("تم تقسيم وتأسيس حساب فرعي جديد للبطاقة بنجاح.", "success");
    setNewSubAccName('');
    setNewSubAccBalance(0);
  };

  const handleApplyTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId || transferAmount <= 0) {
      alert("برجاء تحديد حساب الخصم وحساب التغذية وقيمة المبلغ المراد تحويله!");
      return;
    }
    const res = db.transferCustody(transferFromId, transferToId, transferAmount, transferDesc || "تحويل مالي تشغيلي داخلي");
    if (res.success) {
      showStatus(`تم ترحيل وتحويل ${transferAmount.toLocaleString()} ج.م ماليًا بنجاح وتحديث الكروت المصرفية سحابيًا.`, "success");
      setTransferAmount(0);
      setTransferDesc('');
    } else {
      showStatus(res.error || "فشل التحويل المالي!", "error");
    }
  };

  const handleStartAdjustBalance = (acc: CustodyAccount) => {
    setAdjustingAccountId(acc.id);
    setAdjustingBalance(acc.balance);
  };

  const handleSaveAdjustment = () => {
    if (adjustingAccountId === null) return;
    db.updateCustodyAccount(adjustingAccountId, { balance: adjustingBalance });
    showStatus("تمت تسوية وتحديث الرصيد الفرعي بنجاح وتسجيل عملية التدقيق.", "success");
    setAdjustingAccountId(null);
  };


  // --- INVOICES AMENDMENT (POST-SAVE EDITING) ---
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editInvoiceTargetCarId, setEditInvoiceTargetCarId] = useState('');
  const [editInvoiceDetails, setEditInvoiceDetails] = useState('');
  const [editInvoiceLocation, setEditInvoiceLocation] = useState('');
  const [editInvoiceCarLocation, setEditInvoiceCarLocation] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editInvoiceOfficialId, setEditInvoiceOfficialId] = useState('');
  const [editInvoiceItems, setEditInvoiceItems] = useState<{ id: string; description: string; paymentMethod: 'cash' | 'visa'; accountId: string; amount: number }[]>([]);

  const handleOpenEditPreFinalized = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    setEditInvoiceTargetCarId(inv.car_id || '');
    setEditInvoiceDetails(inv.license_details || '');
    setEditInvoiceLocation(inv.license_location || '');
    setEditInvoiceCarLocation(inv.car_location || '');
    setEditInvoiceDate(inv.invoice_date);
    setEditInvoiceOfficialId(inv.official_id);

    // Populate lines
    const activeItems = db.invoiceItems.filter(i => i.invoice_id === inv.id);
    setEditInvoiceItems(activeItems.map((itm, idx) => {
      let accId = itm.account_id || '';
      if (!accId) {
        const match = db.custodyAccounts.find(a => a.official_id === inv.official_id && a.type === itm.payment_method);
        accId = match ? match.id : '';
      }
      if (!accId) {
        const match = db.custodyAccounts.find(a => a.official_id === inv.official_id);
        accId = match ? match.id : '';
      }
      return {
        id: "edit_row_" + idx + "_" + Date.now(),
        description: itm.description,
        paymentMethod: itm.payment_method,
        accountId: accId,
        amount: itm.amount
      };
    }));
  };

  const handleAddRowEditInvoice = () => {
    const match = db.custodyAccounts.find(ca => ca.official_id === editInvoiceOfficialId && ca.type === 'cash');
    setEditInvoiceItems(prev => [
      ...prev,
      { id: "edit_row_new_" + Date.now(), description: "", paymentMethod: 'cash', accountId: match ? match.id : '', amount: 0 }
    ]);
  };

  const handleRemoveRowEditInvoice = (id: string) => {
    if (editInvoiceItems.length <= 1) {
      alert("يجب تخصيص بند مالي واحد على الأقل بالفاتورة!");
      return;
    }
    setEditInvoiceItems(prev => prev.filter(i => i.id !== id));
  };

  const handleMoveEditRow = (itemId: string, direction: 'up' | 'down') => {
    setEditInvoiceItems(prev => {
      const index = prev.findIndex(i => i.id === itemId);
      if (index === -1) return prev;
      const newItems = [...prev];
      if (direction === 'up' && index > 0) {
        const temp = newItems[index];
        newItems[index] = newItems[index - 1];
        newItems[index - 1] = temp;
      } else if (direction === 'down' && index < newItems.length - 1) {
        const temp = newItems[index];
        newItems[index] = newItems[index + 1];
        newItems[index + 1] = temp;
      }
      return newItems;
    });
  };

  const handleUpdateEditItemRow = (id: string, field: 'description' | 'paymentMethod' | 'accountId' | 'amount', val: any) => {
    setEditInvoiceItems(prev => prev.map(itm => {
      if (itm.id === id) {
        let updated = { ...itm, [field]: field === 'amount' ? Number(val) : val };
        
        // Auto match compatible account_id when paymentMethod switches
        if (field === 'paymentMethod') {
          const compatible = db.custodyAccounts.find(ca => ca.official_id === editInvoiceOfficialId && ca.type === val);
          updated.accountId = compatible ? compatible.id : '';
        } else if (field === 'accountId') {
          const chosenAcc = db.custodyAccounts.find(ca => ca.id === val);
          if (chosenAcc) {
            updated.paymentMethod = chosenAcc.type === 'cash' ? 'cash' : 'visa';
          }
        }
        return updated;
      }
      return itm;
    }));
  };

  const handleSaveEditedInvoiceTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInvoiceTargetCarId) {
      showStatus("الرجاء اختيار السيارة المرتبطة بالفاتورة السلف!", "error");
      return;
    }
    const emptyRow = editInvoiceItems.some(i => !i.description || i.amount <= 0 || !i.accountId);
    if (emptyRow) {
      showStatus("الرجاء ملء توصيفات وقيم كافة البنود وتحديد كارت الدفع بدقة مسبقًا!", "error");
      return;
    }

    const official = db.officials.find(o => o.id === editInvoiceOfficialId);
    if (!official) return;

    // Convert payload
    const formattedItems = editInvoiceItems.map(itm => ({
      description: itm.description,
      amount: itm.amount,
      payment_method: itm.paymentMethod,
      account_id: itm.accountId
    }));

    // Update invoice header properties first
    db.updateCar(editInvoiceTargetCarId, {}); // dummy update to spark react

    // Call PostgreSQL transactional model reconciliation
    const res = db.updateInvoice(editingInvoiceId!, official.name, formattedItems, {
      car_id: editInvoiceTargetCarId,
      license_details: editInvoiceDetails,
      license_location: editInvoiceLocation,
      car_location: editInvoiceCarLocation,
      invoice_date: editInvoiceDate
    });
    if (res.success) {
      // Manually match headers
      const targetInv = db.invoices.find(v => v.id === editingInvoiceId);
      if (targetInv) {
        targetInv.car_id = editInvoiceTargetCarId;
        targetInv.license_details = editInvoiceDetails;
        targetInv.license_location = editInvoiceLocation;
        targetInv.car_location = editInvoiceCarLocation;
        targetInv.invoice_date = editInvoiceDate;
      }
      
      showStatus(`قامت عملية الموازنة والتسوية للمعاملة بتأكيد مراجعة حركات الفاتورة بنجاح.`, "success");
      setEditingInvoiceId(null);
      // Auto reprint
      triggerReprint(editingInvoiceId!);
    } else {
      showStatus(res.error || "حدث خطأ مالي في تسوية أرصدة بطاقات المسؤول القائم للصرف!", "error");
    }
  };


  // --- REPRINT & PRINT ARCHIVE POPUP ---
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState<{
    invoice: Invoice;
    items: InvoiceItem[];
    officialName: string;
    carsMap: Record<string, string>;
    carsObjMap?: Record<string, any>;
  } | null>(null);

  const [activeCustodyPrint, setActiveCustodyPrint] = useState<{
    accountId?: string;
    official: any;
    accountName: string;
    balance: number;
    movements: any[];
  } | null>(null);

  const triggerReprint = (invoiceId: string) => {
    const targetInvoice = db.invoices.find(inv => inv.id === invoiceId);
    if (!targetInvoice) return;

    const targetItems = db.invoiceItems.filter(i => i.invoice_id === invoiceId);
    const officialObj = db.officials.find(o => o.id === targetInvoice.official_id);
    
    const carsMap: Record<string, string> = {};
    const carsObjMap: Record<string, any> = {};
    db.cars.forEach(c => {
      carsMap[c.id] = c.car_number;
      carsObjMap[c.id] = c;
    });

    setActiveInvoiceForPrint({
      invoice: targetInvoice,
      items: targetItems,
      officialName: officialObj ? officialObj.name : "مسئول تراخيص عام",
      carsMap,
      carsObjMap
    });
  };

  const handlePrintCustodyStatement = (accId: string) => {
    const acc = db.custodyAccounts.find(a => a.id === accId);
    if (!acc) return;
    const officialObj = db.officials.find(o => o.id === acc.official_id);
    const subMovs = db.custodyMovements.filter(m => m.from_account_id === accId || m.to_account_id === accId);

    setActiveCustodyPrint({
      accountId: accId,
      official: officialObj || { name: "غير معروف" },
      accountName: acc.name,
      balance: acc.balance,
      movements: subMovs
    });
  };

  const handleDeleteInvoiceClick = (inv: Invoice) => {
    const sup = db.officials.find(o => o.id === inv.official_id);
    const supName = sup ? sup.name : "مشرف تراخيص";

    if (confirm(`تحذير محاسبي: ستقوم تصفية الفاتورة ${inv.invoice_number} برد مبالغ الصرف بالكامل إلى العهد الفرعية والبطاقات البنكية التي تم سحب المعاملة منها مسبقًا وتصحيح الموازنة ماليًا. هل تريد المتابعة؟`)) {
      const res = db.deleteInvoice(inv.id, supName);
      if (res.success) {
        showStatus("تم حذف وإلغاء قيود الفاتورة وإلغاء كافة معاملات الصارف من الخزن والبطاقات بنجاح.", "success");
      } else {
        showStatus(res.error || "فشل إلغاء المعاملة ماليًا.", "error");
      }
    }
  };

  const handleRestoreInvoiceClick = (inv: Invoice) => {
    const sup = db.officials.find(o => o.id === inv.official_id);
    const supName = sup ? sup.name : "مشرف تراخيص";

    if (confirm(`محاسبة: هل تود إعادة تفعيل الفاتورة الملغاة ${inv.invoice_number}؟ سيقوم هذا الإجراء بإعادة خصم قيمتها من أرصدة العهد الفرعية والبطاقات كما كانت في حالتها الأصلية.`)) {
      const res = db.restoreInvoice(inv.id, supName);
      if (res.success) {
        showStatus("تمت إعادة تفعيل الفاتورة واستعادة موازنتها وخصم البنود من العهد بنجاح.", "success");
      } else {
        showStatus(res.error || "فشل تنشيط المعاملة ماليًا.", "error");
      }
    }
  };

  const handlePurgeInvoiceClick = (inv: Invoice) => {
    const sup = db.officials.find(o => o.id === inv.official_id);
    const supName = sup ? sup.name : "مشرف تراخيص";

    if (confirm(`⚠️ خطر جسيم: ستقوم حالاً بالحذف النهائي والمطلق للفاتورة رقم ${inv.invoice_number} وبنودها التفصيلية بالكامل من خوادم النظام وقاعدة البيانات بشكل تدميري كامل ولا يمكن التراجع أو الاسترجاع بعدها أبداً!\n\nفي حال لم تكن الفاتورة ملغاة مسبقاً، سيقوم النظام تلقائياً أولاً بتعديل العهد ورد المبالغ ماليّاً لتطبيق تسوية الموازنة قبل حذف الفاتورة ومصروفاتها.\n\nهل تود تأكيد الحذف النهائي والتام بلا عودة؟`)) {
      if (db.purgeInvoice) {
        const res = db.purgeInvoice(inv.id, supName);
        if (res.success) {
          showStatus("تم التصفية الكاملة وحذف الفاتورة وبنودها بشكل نهائي ومطلق من خوادم النظام وقاعدة البيانات بنجاح.", "success");
        } else {
          showStatus(res.error || "فشل قيد الحذف النهائي للفاتورة.", "error");
        }
      }
    }
  };


  return (
    <div className="space-y-6" id="unified_custody_system" style={{ direction: 'rtl' }}>
      
      {/* 1. Modal for A5 Print Layout */}
      {activeInvoiceForPrint && (
        <A5PrintPreview
          type="invoice"
          invoiceData={activeInvoiceForPrint}
          onClose={() => setActiveInvoiceForPrint(null)}
        />
      )}

      {/* 2. Modal for Custody Statement A5 Print */}
      {activeCustodyPrint && (
        <A5PrintPreview
          type="custody_statement"
          custodyData={activeCustodyPrint}
          onClose={() => setActiveCustodyPrint(null)}
        />
      )}

      {/* Corporate Notification Banners */}
      {statusMsg.text && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs md:text-sm animate-pulse ${statusMsg.type === 'success' ? 'bg-emerald-900/10 border-emerald-520/20 text-emerald-400' : 'bg-rose-900/10 border-rose-520/20 text-rose-400'}`}>
          {statusMsg.type === 'success' ? (
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertOctagon className="w-5 h-5 flex-shrink-0 text-rose-400" />
          )}
          <span className="font-extrabold">{statusMsg.text}</span>
        </div>
      )}

      {/* لوحة ترحيب مشرف عهد الصرف والأرصدة المتاحة الميدانية فور الدخول */}
      {db.currentUser?.role === 'supervisor' && (() => {
        const supId = db.currentUser.officialId;
        const subAccounts = db.custodyAccounts.filter(ca => ca.official_id === supId);
        const totalBalance = subAccounts.reduce((sum, ca) => sum + ca.balance, 0);
        return (
          <div className="bg-slate-900 border border-emerald-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 no-print shadow-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider block uppercase">بوابة الصرف المباشر</span>
                <h4 className="font-black text-slate-100 text-sm md:text-base">مرحباً بك، {db.currentUser.name || 'مشرف الفواتير المعتمد'}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">تكامل حى مع الخزائن والبطاقات المصرفية للصرف وتسوية فواتير سيارات البنا جروب.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2.5 items-center">
              {subAccounts.map(acc => (
                <div key={acc.id} className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-850 flex items-center gap-2">
                  <span className="text-slate-400 text-xs font-bold">{acc.name}:</span>
                  <span className="font-mono text-xs font-black text-yellow-500">{(acc.balance ?? 0).toLocaleString()} ج.م</span>
                </div>
              ))}
              <div className="bg-slate-950 px-4.5 py-2.5 rounded-xl border border-emerald-500/25 shadow-inner flex items-center gap-3">
                <span className="text-slate-300 text-xs font-black">الرصيد الإجمالي المتاح للاستخدام:</span>
                <span className="font-mono text-base md:text-lg font-black text-emerald-400">{(totalBalance ?? 0).toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SUB TABS NAVIGATION BAR */}
      <div className="flex border-b border-slate-800 gap-1 pb-px no-print">
        <button
          onClick={() => setActiveSubTab('invoices')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'invoices' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Layers className="w-4 h-4 text-emerald-500" />
          <span>شاشة عهد الصرف المفتوحة وتسوية فواتير السيارات المباشرة (A5)</span>
        </button>
        <button
          onClick={() => setActiveSubTab('custodies')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'custodies' ? 'border-indigo-500 text-indigo-400 bg-indigo-505/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
          <span>شاشة كشف الحساب والتحويلات وإدارة الخزن والبطاقات بالتراخيص (Visa)</span>
        </button>
        <button
          onClick={() => setActiveSubTab('pdf_import')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'pdf_import' ? 'border-amber-500 text-amber-400 bg-amber-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <BookOpen className="w-4 h-4 text-amber-400" />
          <span>استيراد فواتير PDF القديمة</span>
        </button>
        {db.currentUser?.role === 'supervisor' && (
          <button
            onClick={() => { setActiveSubTab('change_password'); setPersonalPasswordError(''); setPersonalPasswordSuccess(''); }}
            type="button"
            className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'change_password' ? 'border-rose-500 text-rose-450 bg-rose-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Lock className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>تغيير كلمة المرور الخاصة بك</span>
          </button>
        )}
      </div>

      {/* --- RENDER TAB 1: INVOICES EXPENSES & VOUCHERS --- */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-6">
          
          {/* TOP SECTION: ACTIVE POST-SAVE AMENDMENT MODAL PANEL */}
          {editingInvoiceId && (
            <div className="bg-slate-900 border border-amber-500 p-5 rounded-2xl space-y-4 shadow-xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div>
                  <h3 className="font-black text-amber-400 text-sm flex items-center gap-2">
                    <History className="w-5 h-5" />
                    المراجعة والتعديل المحاسبي المتأخر للفاتورة: ({db.invoices.find(i=>i.id===editingInvoiceId)?.invoice_number})
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">مراجعة التراخيص لسيارة واحدة فقط وتحديث الخزن والمصارف ماليًا بالتاريخ المقر.</p>
                </div>
                <button
                  onClick={() => setEditingInvoiceId(null)}
                  type="button"
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs px-3 py-1.5 rounded-lg"
                >
                  إلغاء التعديل والدخول للمسودات
                </button>
              </div>

              <form onSubmit={handleSaveEditedInvoiceTransaction} className="space-y-4 text-xs font-sans">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">المركبة المستهدفة بالفاتورة</label>
                    <select
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                      value={editInvoiceTargetCarId}
                      onChange={(e) => setEditInvoiceTargetCarId(e.target.value)}
                    >
                      <option value="">-- اختر السيارة --</option>
                      {db.cars.map(c => (
                        <option key={c.id} value={c.id}>{c.car_number} ({c.owner_company.split(' ')[0]})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">بيان الترخيص ومستندات الصرف</label>
                    <input
                      type="text"
                      required
                      placeholder="بيان الترخيص بالفاتورة..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={editInvoiceDetails}
                      onChange={(e) => setEditInvoiceDetails(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">مكان وتوكيل مكتب الترخيص</label>
                    <input
                      type="text"
                      required
                      placeholder="مكان الترخيص بالفاتورة..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={editInvoiceLocation}
                      onChange={(e) => setEditInvoiceLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">مكان السيارة الحالي (يدوي)</label>
                    <input
                      type="text"
                      required
                      placeholder="مكان تواجد السيارة..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={editInvoiceCarLocation}
                      onChange={(e) => setEditInvoiceCarLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">تاريخ اليوم/القيد</label>
                    <input
                      type="date"
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono"
                      value={editInvoiceDate}
                      onChange={(e) => setEditInvoiceDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Sub items inside editing invoice */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>البنود المالية المعدلة بالفاتورة للسيارة:</span>
                    <button
                      type="button"
                      onClick={handleAddRowEditInvoice}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded border border-slate-700 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      إضافة بند مصروف إضافي
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editInvoiceItems.map((itm, itmIdx) => {
                      const officialAccounts = db.custodyAccounts.filter(ca => ca.official_id === editInvoiceOfficialId);
                      return (
                        <div key={itm.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 items-end">
                          <div className="md:col-span-2 flex items-center justify-between bg-slate-900 px-2 py-1.5 rounded border border-slate-800/40 pb-2 text-right self-stretch">
                            <span className="font-mono text-[10px] text-slate-400 font-bold self-center">بند {itmIdx + 1}</span>
                            <div className="flex gap-1 self-center">
                              <button
                                type="button"
                                disabled={itmIdx === 0}
                                onClick={() => handleMoveEditRow(itm.id, 'up')}
                                className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all ${itmIdx === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                title="ترتيب لأعلى"
                              >
                                <ArrowUp className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                disabled={itmIdx === editInvoiceItems.length - 1}
                                onClick={() => handleMoveEditRow(itm.id, 'down')}
                                className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all ${itmIdx === editInvoiceItems.length - 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                title="ترتيب لأسفل"
                              >
                                <ArrowDown className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>

                          <div className="md:col-span-4 text-right">
                            <label className="block text-slate-500 mb-0.5 text-[10px]">الملخص الفني للبند</label>
                            <input
                              type="text"
                              required
                              className="w-full p-2 rounded border border-slate-800 bg-slate-900 text-white text-xs"
                              value={itm.description}
                              onChange={(e) => handleUpdateEditItemRow(itm.id, 'description', e.target.value)}
                            />
                          </div>

                          <div className="md:col-span-3 text-right">
                            <label className="block text-slate-500 mb-0.5 text-[10px]">الحساب / بطاقة الفيزا الفرعية المخصومة</label>
                            <select
                              required
                              className="w-full p-2 rounded border border-slate-800 bg-slate-900 text-white font-bold text-xs"
                              value={itm.accountId}
                              onChange={(e) => handleUpdateEditItemRow(itm.id, 'accountId', e.target.value)}
                            >
                              <option value="">-- اختر بطاقة/خزنة الدفع --</option>
                              {officialAccounts.map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.type === 'cash' ? '💵 كاش' : '💳 فيزا'} | رصيد متوفر: {a.balance} ج.م)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2 text-right">
                            <label className="block text-slate-500 mb-0.5 text-[10px]">القيمة المالية للبند ج.م</label>
                            <input
                              type="number"
                              required
                              min={1}
                              className="w-full p-2 rounded border border-slate-800 bg-slate-900 text-yellow-400 font-mono font-black text-xs"
                              value={itm.amount || ''}
                              onChange={(e) => handleUpdateEditItemRow(itm.id, 'amount', e.target.value)}
                            />
                          </div>

                          <div className="md:col-span-1 flex justify-center pb-0.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveRowEditInvoice(itm.id)}
                              className="bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 p-2 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <div className="text-slate-200 flex items-center font-mono text-xs gap-3 ml-auto">
                    <span>نقدي: <strong className="text-emerald-400 font-bold">{editInvoiceItems.filter(i=>i.paymentMethod==='cash').reduce((sum,i)=>sum+i.amount,0).toLocaleString()} ج.م</strong></span>
                    <span>|</span>
                    <span>فيزا: <strong className="text-sky-450 font-bold">{editInvoiceItems.filter(i=>i.paymentMethod==='visa').reduce((sum,i)=>sum+i.amount,0).toLocaleString()} ج.م</strong></span>
                    <span>|</span>
                    <span>الإجمالي الكلي: <strong className="text-amber-400 font-black">{(editInvoiceItems.reduce((sum,i)=>sum+i.amount,0)).toLocaleString()} ج.م</strong></span>
                  </div>
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-450 text-slate-950 font-black px-6 py-2 rounded-lg transition-all"
                  >
                    💾 حفظ تسويات الفاتورة الفورية وإعادة الطباعة
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* DYNAMIC CARDS CONTAINER: MULTIPLE OPEN SESSIONS FOR VEHICLE EXPENSES */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-100 text-sm flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  استمارات ومسودات مصروفات السيارات والترخيص قيد التحضير المفتوحة بالنا جروب
                </h3>
                <p className="text-[11px] text-slate-400">يمكنك تشغيل وتحضير أكثر من مصروف ومعالجة الفواتير الفردية في آنٍ واحد بأمان تام.</p>
              </div>
              <button
                onClick={handleAddNewDraftVoucher}
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
              >
                <Plus className="w-4 h-4" />
                فتح مصروف إضافي لسيارة / تصفية أخرى
              </button>
            </div>

            {/* List draft vouchers side by side or vertical bento stack */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {draftVouchers.map((v, index) => {
                const voucherTotal = v.items.reduce((sum, i) => sum + i.amount, 0);
                const officialIdToUse = v.officialId || (db.currentUser?.role === 'supervisor' ? db.currentUser?.officialId : '');
                const targetedOfficialAccounts = db.custodyAccounts.filter(ca => ca.official_id === officialIdToUse);

                return (
                  <div key={v.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4 relative overflow-hidden">
                    {/* Ribbon */}
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                    
                    <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs">{index + 1}</span>
                        <h4 className="font-bold text-slate-100 text-xs md:text-sm">مسودة مصروفات ترخيص السيارة المستهدفة الفردية</h4>
                      </div>
                      <button
                        onClick={() => handleRemoveDraftVoucher(v.id)}
                        type="button"
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-bold border border-rose-500/10 hover:bg-rose-500/5 px-2.5 py-1 rounded"
                        title="إلغاء وحذف مسودة الصرف تمامًا"
                      >
                        إلغاء المسودة [X]
                      </button>
                    </div>

                    {/* Form Layout */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 font-bold mb-1">المسؤول عن الصرف (رابط العهد)</label>
                        <select
                          required
                          disabled={db.currentUser?.role === 'supervisor'}
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold disabled:opacity-75 disabled:cursor-not-allowed"
                          value={v.officialId}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'officialId', e.target.value)}
                        >
                          <option value="">-- اختر مشرف الصرف --</option>
                          {db.officials.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.name} (💴 {o.cash_custody} | 💳 {o.visa_custody})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">السيارة الواحدة المستهدفة للطباعة والصرف</label>
                        <select
                          required
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                          value={v.carId}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'carId', e.target.value)}
                        >
                          <option value="">-- اختر السيارة بالفاتورة --</option>
                          {db.cars.map(c => (
                            <option key={c.id} value={c.id}>{c.car_number} ({c.owner_company.split(' ')[0]})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">بيان وتفاصيل الترخيص (رأس الفاتورة)</label>
                        <input
                          type="text"
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold placeholder-slate-650"
                          placeholder="مثال: رسوم فحص وتجديد روتيني طفايات"
                          value={v.licenseDetails}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'licenseDetails', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">مكان الترخيص / إدارة المرور (رأس الفاتورة)</label>
                        <input
                          type="text"
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold placeholder-slate-650"
                          placeholder="مثال: مرور العجمي بالإسكندرية"
                          value={v.licenseLocation}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'licenseLocation', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">مكان السيارة الحالي (يدوي)</label>
                        <input
                          type="text"
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold placeholder-slate-650"
                          placeholder="مثال: جراج طره / موقع التجمع"
                          value={v.carLocation}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'carLocation', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Items table in the draft card */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-extrabold flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                          بنود وجداول الصرف المضمنة بالسيارة (وسط الفاتورة)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddRowToDraft(v.id)}
                          className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-200 px-2 py-1 rounded font-bold"
                        >
                          ＋ إضافة بند صرف
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[180px] overflow-y-auto scrollbar-thin">
                        {v.items.map((row_item, rIdx) => (
                          <div key={row_item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800 items-center">
                            <div className="sm:col-span-2 flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded border border-slate-800/40">
                              <span className="font-mono text-[10px] text-slate-400 font-bold">بند {rIdx + 1}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={rIdx === 0}
                                  onClick={() => handleMoveDraftRow(v.id, row_item.id, 'up')}
                                  className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all ${rIdx === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title="ترتيب لأعلى"
                                >
                                  <ArrowUp className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={rIdx === v.items.length - 1}
                                  onClick={() => handleMoveDraftRow(v.id, row_item.id, 'down')}
                                  className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all ${rIdx === v.items.length - 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title="ترتيب لأسفل"
                                >
                                  <ArrowDown className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="sm:col-span-3">
                              <input
                                type="text"
                                required
                                className="w-full p-1.5 rounded border border-slate-850 bg-slate-950 text-[11px]"
                                placeholder="فحص طفايات / تأمين / طابع..."
                                value={row_item.description}
                                onChange={(e) => handleUpdateDraftRow(v.id, row_item.id, 'description', e.target.value)}
                              />
                            </div>

                            <div className="sm:col-span-4">
                              <select
                                className="w-full p-1.5 rounded border border-slate-850 bg-slate-950 text-[11px] font-bold text-slate-200"
                                value={row_item.accountId}
                                onChange={(e) => handleUpdateDraftRow(v.id, row_item.id, 'accountId', e.target.value)}
                              >
                                <option value="">-- كرت الصرف المالي --</option>
                                {targetedOfficialAccounts.map(a => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.type === 'cash' ? '💵 كاش' : '💳 فيزا'} | رصيد متوفر: {a.balance} ج.م)
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <input
                                type="number"
                                required
                                min={1}
                                className="w-full p-1.5 rounded border border-slate-850 bg-slate-950 font-mono font-black text-yellow-400 text-center text-[11px]"
                                placeholder="المبلغ"
                                value={row_item.amount || ''}
                                onChange={(e) => handleUpdateDraftRow(v.id, row_item.id, 'amount', e.target.value)}
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRowFromDraft(v.id, row_item.id)}
                                className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/5 p-1 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action footer within single card */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center flex-wrap gap-2 text-xs">
                      <div className="font-mono text-slate-330">
                        مجموع قيمة الكارت: <span className="font-black text-emerald-400">{voucherTotal.toLocaleString()} ج.م</span>
                      </div>
                      <button
                        onClick={() => handleFinalizeSaveVoucher(v.id)}
                        type="button"
                        className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 hover:text-white font-extrabold px-5 py-2 rounded-lg transition-all shadow"
                      >
                        💾 ترحيل وحفظ الفاتورة وطباعة A5 بالفور
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* LOWER GRID: COMPLETED INVOICES LEDGER ARCHIVE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
            
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-2.5">
                <h3 className="font-bold text-slate-100 text-sm">أرشيف الفواتير ومصروفات ترخيص السيارات المعتمدة</h3>
                <p className="text-[11px] text-slate-400">سجل المدفوعات الموثق - يدعم التعديل اللاحق (التسوية)، التعطيل المالي والطباعة الفورية على قياس A5 المعتمد.</p>
              </div>

              {/* Universal Search Box & Toggle */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="ابحث برقم الفاتورة (مثال: INV-2026-0005)، رقم السيارة، أو اسم المسؤول..."
                    className="w-full text-xs p-2.5 pl-8 pr-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    value={archiveSearchQuery}
                    onChange={(e) => setArchiveSearchQuery(e.target.value)}
                  />
                  {archiveSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setArchiveSearchQuery('')}
                      className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none font-semibold hover:text-slate-100 text-[11px] whitespace-nowrap bg-slate-950/40 px-2.5 py-2.5 rounded-lg border border-slate-800">
                  <input
                    type="checkbox"
                    className="rounded text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5 bg-slate-950 border-slate-800"
                    checked={showDeletedInvoices}
                    onChange={(e) => setShowDeletedInvoices(e.target.checked)}
                  />
                  <span>عرض الفواتير الملغاة</span>
                </label>
              </div>

              <div className="overflow-x-auto text-[11px]">
                <table className="w-full text-right my-2">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-medium">
                      <th className="py-2 px-2.5">رقم الفاتورة</th>
                      <th className="py-2 px-2.5">السيارة</th>
                      <th className="py-2 px-2.5 font-sans text-center">المسؤول عن الصرف</th>
                      <th className="py-2 px-2.5 text-left">قيمة الفاتورة ج.م</th>
                      <th className="py-2 px-2.5 text-left">تسوية وعمليات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = db.invoices.filter(i => {
                        const q = archiveSearchQuery.toLowerCase().trim();
                        const official = db.officials.find(o => o.id === i.official_id);
                        const targetCar = db.cars.find(c => c.id === i.car_id);
                        const isMatch = !archiveSearchQuery ? true : (
                          i.invoice_number.toLowerCase().includes(q) ||
                          (targetCar?.car_number || '').toLowerCase().includes(q) ||
                          (official?.name || '').toLowerCase().includes(q) ||
                          (i.license_location || '').toLowerCase().includes(q) ||
                          (i.license_details || '').toLowerCase().includes(q)
                        );

                        if (i.is_deleted) {
                          const specificallyTyped = archiveSearchQuery && (i.invoice_number.toLowerCase() === q || i.invoice_number.toLowerCase().includes(q));
                          return showDeletedInvoices || specificallyTyped || (archiveSearchQuery && isMatch);
                        }

                        return isMatch;
                      });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500">
                              لا توجد نتائج تطابق القيمة المبحوث عنها.
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map(inv => {
                        const official = db.officials.find(o => o.id === inv.official_id);
                        const targetCar = db.cars.find(c => c.id === inv.car_id);
                        return (
                          <tr key={inv.id} className={`border-b border-white/5 hover:bg-white/[0.02] ${inv.is_deleted ? 'opacity-50 bg-rose-950/5' : ''}`}>
                            <td className="py-3 px-2 font-mono font-bold text-slate-100 flex flex-wrap items-center gap-1.5 pt-4">
                              <span className={inv.is_deleted ? 'line-through text-rose-450/80' : ''}>
                                {inv.invoice_number}
                              </span>
                              {inv.is_modified && (
                                <span className="text-[8px] bg-amber-950 text-amber-400 border border-amber-500/20 px-1 rounded inline-block" title={`نسخة معدلة رقم ${inv.version}`}>
                                  معدلة ({inv.version})
                                </span>
                              )}
                              {inv.is_deleted && (
                                <span className="text-[8px] bg-rose-950 text-rose-400 border border-rose-500/20 px-1 rounded inline-block">
                                  ملغاة ومحذوفة (مسترد)
                                </span>
                              )}
                            </td>
                            <td className={`py-3 px-2 font-black ${inv.is_deleted ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>{targetCar ? targetCar.car_number : "سيارة عامة"}</td>
                            <td className={`py-3 px-2 text-center font-semibold ${inv.is_deleted ? 'text-slate-500' : 'text-slate-300'}`}>{official?.name || "مشرف تراخيص"}</td>
                            <td className={`py-3 px-2 text-left font-mono font-black ${inv.is_deleted ? 'text-rose-400 line-through' : 'text-yellow-400'}`}>{inv.total_amount.toLocaleString()} ج.م</td>
                            <td className="py-3 px-2 text-left space-x-1.5 space-x-reverse whitespace-nowrap">
                              <button
                                onClick={() => triggerReprint(inv.id)}
                                type="button"
                                className="bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 p-1.5 rounded transition-all"
                                title="طباعة مستند A5 معتمد"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {!inv.is_deleted && (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                <button
                                  onClick={() => handleOpenEditPreFinalized(inv)}
                                  type="button"
                                  className="bg-slate-850 text-slate-300 hover:bg-slate-750 p-1.5 rounded transition-all"
                                  title="تعديل محاسبي وتسوية لاحقة للفاتورة"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {inv.is_deleted ? (
                                (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                  <button
                                    onClick={() => handleRestoreInvoiceClick(inv)}
                                    type="button"
                                    className="bg-amber-900/20 text-text-amber-400 hover:bg-amber-900/40 p-1.5 rounded transition-all"
                                    title="إعادة تنشيط واستعادة الفاتورة خصمًا من العهد"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-amber-405" />
                                  </button>
                                )
                              ) : (
                                (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                  <button
                                    onClick={() => handleDeleteInvoiceClick(inv)}
                                    type="button"
                                    className="bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 p-1.5 rounded transition-all"
                                    title="إلغاء المعاملة واسترداد الأرصدة إلى الخزائن"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                              {db.currentUser?.role !== 'supervisor' && (
                                <button
                                  onClick={() => handlePurgeInvoiceClick(inv)}
                                  type="button"
                                  className="bg-rose-600 text-white hover:bg-rose-700 p-1.5 rounded transition-all"
                                  title="حذف نهائي كلي للفاتورة ومصروفاتها تماماً من خوادم النظام"
                                >
                                  <AlertOctagon className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AUDIT LOG INVOICE_AUDIT_LOGS SCHEMATIC TABLE */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
                <ScrollText className="w-4 h-4 text-emerald-450" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">سجل المحاسبة وتدقيق الحركات المركزي بالبنا جروب</h3>
                  <p className="text-[11px] text-slate-400">سجلات (Invoice_Audit_Logs) - المراجعة وحظر التلاعب بالمللي ثانية</p>
                </div>
              </div>

              <div className="overflow-y-auto text-[10px] space-y-2.5 max-h-[250px] pr-1 scrollbar-thin">
                {db.auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <div className="flex items-center gap-1">
                        {log.operation_type === 'create' && <span className="text-[8px] bg-emerald-950 text-emerald-400 font-bold px-1 rounded border border-emerald-500/20">تأسيس</span>}
                        {log.operation_type === 'edit' && <span className="text-[8px] bg-amber-950 text-amber-400 font-bold px-1 rounded border border-amber-500/20">تعديل محاسبي</span>}
                        {log.operation_type === 'delete' && <span className="text-[8px] bg-rose-950 text-rose-400 font-bold px-1 rounded border border-rose-500/20">إلغاء واسترداد</span>}
                        <span className="font-bold text-slate-200">{log.invoice_number}</span>
                      </div>
                      <span className="text-slate-500">{new Date(log.timestamp).toLocaleString('ar-EG')}</span>
                    </div>
                    <p className="text-slate-300 font-semibold">• المسؤول القائم بالحركة: <span className="font-extrabold text-indigo-400">{log.supervisor_name}</span></p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 bg-slate-900 p-2 rounded border border-slate-800 text-[9px] leading-relaxed">
                      <div><span className="text-slate-500">تفاصيل القيد السلف:</span> <p className="text-rose-400">{log.old_value}</p></div>
                      <div><span className="text-slate-500">البيان الحالي المعتمد:</span> <span className="text-emerald-400 font-semibold">{log.new_value}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}


      {/* --- RENDER TAB 2: CUSTODIES ACCOUNTS & TRANSFER --- */}
      {activeSubTab === 'custodies' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* RIGHT PANELS: CONFIGURE/ADD LICENSING OFFICERS & SPLIT (DIVIDE) CUSTODIES */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* 1. SECTION: REGISTER LICENSING OFFICER (مسؤول تراخيص جديد مع عهدة رئيسية) */}
            {db.currentUser?.role !== 'supervisor' && (
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-black text-slate-100 text-xs md:text-sm flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <UserCheck className="w-5 h-5 text-indigo-400" />
                  <span>إضافة وتوثيق مسؤول تراخيص جديد للعهد المالية (مجموعة البنا)</span>
                </h3>
                
                <form onSubmit={handleCreateOfficial} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end text-xs font-sans">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 font-bold mb-1">اسم مسؤول التراخيص القائم بلجنة الترخيص</label>
                    <input
                      type="text"
                      required
                      placeholder="كتب الاسم الثلاثي والمقر..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={newOfficialName}
                      onChange={(e) => setNewOfficialName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">قيمة العهدة الكاش ج.م</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono font-bold"
                      value={newOfficialInitialCash || ''}
                      onChange={(e) => setNewOfficialInitialCash(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">قيمة عهدة الفيزا ج.م</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono font-bold"
                      value={newOfficialInitialVisa || ''}
                      onChange={(e) => setNewOfficialInitialVisa(Number(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-4 flex justify-end">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-505 text-white font-extrabold px-6 py-2.5 rounded-lg transition-all"
                    >
                      💾 توثيق مسؤول التراخيص وحفظ العهدة المركزية
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 1.5. SECTION: MANAGE PASSWORD FOR ALL OFFICIALS */}
            {db.currentUser?.role !== 'supervisor' && (
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-black text-slate-100 text-xs md:text-sm flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <Lock className="w-5 h-5 text-rose-450 animate-pulse" />
                  <span>🔐 إدارة كلمات مرور مسؤولي الصرف (المشرفين)</span>
                </h3>

                <p className="text-[11px] text-slate-400">
                  تستطيع من هنا معرفة كلمة المرور الحالية لجميع المشرفين والمسؤولين، أو تحديث وتعيين كلمات مرور جديدة لتمكينهم من تسجيل الدخول.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-sans text-right">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3 font-bold text-right">اسم مسؤول الصرف</th>
                        <th className="py-2.5 px-3 font-bold text-center">كلمة السر الحالية</th>
                        <th className="py-2.5 px-3 font-bold text-center">تعيين كلمة سر جديدة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {db.officials.map(o => {
                        const currentPass = o.password || '123';
                        return (
                          <AdminOfficialPasswordRow 
                            key={o.id} 
                            official={o} 
                            currentPass={currentPass} 
                            onUpdate={(newP) => {
                              db.updateOfficialPassword(o.id, newP);
                              showStatus(`تم بنجاح تحديث كلمة المرور للمسؤول (${o.name}) ماليًا.`, "success");
                            }}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. SUB REGION: SPLIT THE MAIN CUSTODY (تقسيم العهد كاش وفيزا وبطاقات أخرى) */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="font-black text-slate-100 text-xs md:text-sm flex items-center gap-2 border-b border-slate-800 pb-2.5">
                <Layers className="w-5 h-5 text-emerald-400" />
                <span>شاشة تقسيم العهدة الرئيسية (خزينة كاش / بنوك وبطاقات فيزا)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Official selector to load their split sub-accounts */}
                <div className="sm:col-span-3">
                  <label className="block text-slate-400 font-bold mb-1">يرجى اختيار مسؤول التراخيص للتقسيم وإدارة حساباته الفرعية</label>
                  <select
                    disabled={db.currentUser?.role === 'supervisor'}
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    value={selectedOfficialForDetail}
                    onChange={(e) => {
                      if (db.currentUser?.role !== 'supervisor') {
                        setSelectedOfficialForDetail(e.target.value);
                      }
                    }}
                  >
                    {db.currentUser?.role !== 'supervisor' && <option value="">-- اختر مسؤول العهدة المالية لقيد الكروت وحساباتها --</option>}
                    {db.officials.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {selectedOfficialForDetail && (
                  <>
                    {/* رصيد العهدة الرئيسية الإجمالي (مجموع العهد الفرعية) */}
                    {(() => {
                      const subAccounts = db.custodyAccounts.filter(ca => ca.official_id === selectedOfficialForDetail);
                      const totalBalance = subAccounts.reduce((sum, ca) => sum + ca.balance, 0);
                      const targetOfficial = db.officials.find(o => o.id === selectedOfficialForDetail);
                      
                      return (
                        <div className="sm:col-span-3 bg-emerald-950/20 border border-emerald-500/25 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-xs text-slate-300 font-bold block mb-1">
                              💎 رصيد العهدة الرئيسية للمشرف ({targetOfficial?.name}):
                            </span>
                            <span className="text-slate-400 text-[10px] block">
                              يمثل هذا المبلغ الرصيد التراكمي الموحّد الفعلي لكافة الخزائن الفرعية وبطاقات الفيزا البنكية المسجلة للمسؤول.
                            </span>
                          </div>
                          <div className="text-left whitespace-nowrap bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800">
                            <span className="font-mono text-base md:text-lg font-black text-yellow-500">
                              {totalBalance.toLocaleString()} ج.م
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Add new Dynamic Card/Sub account Form */}
                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-3 sm:col-span-3">
                      <span className="text-slate-300 font-extrabold text-[12px] block">تأسيس بطاقة فيزا أو خزنة نقود فرعية جديدة:</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-slate-500 text-[10px] mb-0.5">اسم الحساب الفرعي (رقم البطاقة/الفيزا)</label>
                          <input
                            type="text"
                            placeholder="مثال: فيزا فوري (114) أو كاش طوارئ"
                            className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-[11px]"
                            value={newSubAccName}
                            onChange={(e) => setNewSubAccName(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 text-[10px] mb-0.5">نوع الكود المصرفي</label>
                          <select
                            className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-[11px]"
                            value={newSubAccType}
                            onChange={(e) => setNewSubAccType(e.target.value as any)}
                          >
                            <option value="cash">💵 نقدي كاش فرعي</option>
                            <option value="visa">💳 كارت فيزا بنك مصر</option>
                            <option value="other_visa">💳 كارت فيزا البنك الأهلي / آخرى</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-500 text-[10px] mb-0.5">مبلغ تغذية البدء لعهد هذا الحساب ج.م</label>
                          <input
                            type="number"
                            min={0}
                            className="w-full p-2 rounded bg-slate-950 border border-slate-800 font-mono font-bold text-yellow-400 text-[11px]"
                            value={newSubAccBalance || ''}
                            onChange={(e) => setNewSubAccBalance(Number(e.target.value))}
                          />
                        </div>

                        <div className="sm:col-span-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCreateSubAccount(selectedOfficialForDetail)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded text-xs transition-all flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            تأصيل وتجزئة العهد الفرعية
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RENDERING SUB ACCOUNTS FOR THE SELECTED OFFICIAL */}
                    <div className="sm:col-span-3">
                      <span className="text-slate-400 font-bold text-xs mb-2 block">الكروت المصرفية والخزائن المرصودة ماليًا للمشرف:</span>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {db.custodyAccounts.filter(ca => ca.official_id === selectedOfficialForDetail).map(acc => {
                          const isEditingThis = adjustingAccountId === acc.id;

                          return (
                            <div key={acc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative overflow-hidden flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="text-[10px] bg-slate-900 border border-slate-805 text-slate-400 font-bold px-2 py-0.5 rounded px-2">
                                    {acc.type === 'cash' ? '💵 كاش' : acc.type === 'visa' ? '💳 بطاقة فيزا 1' : '💳 بطاقة فيزا 2'}
                                  </span>
                                  <h5 className="font-extrabold text-slate-100 text-xs mt-2">{acc.name}</h5>
                                </div>

                                <button
                                  onClick={() => db.deleteCustodyAccount(acc.id)}
                                  type="button"
                                  className="text-[9px] bg-rose-950 text-rose-400 border border-rose-950 px-1.5 py-0.5 rounded hover:bg-rose-900/30"
                                  title="حذف وإلغاء حساب العهدة والبطاقة بنجاح"
                                >
                                  حذف [X]
                                </button>
                              </div>

                              <div className="bg-slate-900 p-2 rounded border border-slate-850 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 font-bold">الرصيد المشحون:</span>
                                {isEditingThis ? (
                                  <input
                                    type="number"
                                    className="p-1 rounded bg-slate-950 border border-slate-700 text-yellow-400 text-right w-24 font-mono font-extrabold"
                                    value={adjustingBalance}
                                    onChange={(e) => setAdjustingBalance(Number(e.target.value))}
                                  />
                                ) : (
                                  <span className="font-mono text-xs font-black text-emerald-400">{acc.balance.toLocaleString()} ج.م</span>
                                )}
                              </div>

                              <div className="flex justify-end gap-1.5 text-[10px] pt-1">
                                {isEditingThis ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={handleSaveAdjustment}
                                      className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded hover:bg-emerald-550"
                                    >
                                      حفظ التسوية
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setAdjustingAccountId(null)}
                                      className="bg-slate-800 text-slate-400 px-2 py-1 rounded"
                                    >
                                      إلغاء
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartAdjustBalance(acc)}
                                      className="bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 px-2.5 py-1 rounded"
                                    >
                                      تعديل وتسوية الرصيد
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePrintCustodyStatement(acc.id)}
                                      className="bg-indigo-950/50 text-indigo-400 border border-indigo-900/20 px-2 rounded-md hover:bg-indigo-950/85"
                                    >
                                      كشف حركات الكارت
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 3. DATABASE TABLE: HISTORIC CUSTODY MOVEMENT ACTIONS LEDGER */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-2.5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">سجل كشف حساب حركات العهد والتسويات التفصيلي</h3>
                  <p className="text-[11px] text-slate-400">كافة الرواتب، التسويات المباشرة، معاملات التحويلات ومصروفات ترخيص المركبات التاريخية.</p>
                </div>
                <div className="flex items-center gap-1.5 min-w-[200px]">
                  <span className="text-slate-400 text-[10px] whitespace-nowrap font-bold">تصفية العهدة:</span>
                  <select
                    className="w-full text-[10px] bg-slate-950 text-slate-100 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-emerald-500"
                    value={selectedLedgerAccountId}
                    onChange={(e) => setSelectedLedgerAccountId(e.target.value)}
                  >
                    <option value="all">📁 جميع العهد والحسابات</option>
                    {db.officials.filter(o => db.currentUser?.role !== 'supervisor' || o.id === db.currentUser.officialId).map(o => {
                      const accounts = db.custodyAccounts.filter(ca => ca.official_id === o.id);
                      if (accounts.length === 0) return null;
                      return (
                        <optgroup key={o.id} label={o.name}>
                          {accounts.map(ca => (
                            <option key={ca.id} value={ca.id}>
                              {ca.type === 'cash' ? '💵' : '💳'} {ca.name} (الرصيد: {ca.balance.toLocaleString()} ج.م)
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto text-[11px]">
                {selectedLedgerAccountId === 'all' ? (
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400">
                        <th className="py-2 px-2.5">التاريخ</th>
                        <th className="py-2 px-2.5">الحساب الفرعي</th>
                        <th className="py-2 px-2.5">البيان وقيد الحركة</th>
                        <th className="py-2 px-2.5 text-left">الوارد (+)</th>
                        <th className="py-2 px-2.5 text-left">المنصرف (-)</th>
                        <th className="py-2 px-2.5 text-left bg-emerald-950/10 text-emerald-300 font-extrabold">رصيد الحساب الجاري</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const chronological = [...db.custodyMovements].reverse();
                        const officialRunningBalances: Record<string, number> = {};
                        
                        const processedMovements = chronological.map(m => {
                          let inflow = 0;
                          let outflow = 0;
                          
                          if (m.to_account_id) {
                            inflow = m.amount;
                          } else if (m.type === 'deposit') {
                            inflow = m.amount;
                          }
                          
                          if (m.from_account_id) {
                            outflow = m.amount;
                          } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
                            outflow = m.amount;
                          }
                          
                          if (!m.from_account_id && !m.to_account_id) {
                            if (m.type === 'deposit') {
                              inflow = m.amount;
                            } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
                              outflow = m.amount;
                            }
                          }
                          
                          const offId = m.official_id;
                          const curBalance = officialRunningBalances[offId] || 0;
                          const nextBalance = curBalance + (inflow - outflow);
                          officialRunningBalances[offId] = nextBalance;
                          
                          return {
                            ...m,
                            inflow,
                            outflow,
                            runningBalanceAfter: nextBalance
                          };
                        });
                        
                        const newestFirst = [...processedMovements].reverse();
                        
                        if (newestFirst.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">لا توجد حركات صادرة أو واردة مسجلة بعد.</td>
                            </tr>
                          );
                        }

                        return newestFirst.map((cm) => {
                          const fromAcc = db.custodyAccounts.find(ca => ca.id === cm.from_account_id);
                          const toAcc = db.custodyAccounts.find(ca => ca.id === cm.to_account_id);
                          const official = db.officials.find(o => o.id === cm.official_id);

                          let accLabel = "";
                          if (fromAcc && toAcc) {
                            accLabel = `${fromAcc.name} ➔ ${toAcc.name}`;
                          } else if (fromAcc) {
                            accLabel = `${fromAcc.name}`;
                          } else if (toAcc) {
                            accLabel = `${toAcc.name}`;
                          } else {
                            accLabel = official ? `عهدة ${official.name}` : "عام";
                          }

                          return (
                            <tr key={cm.id} className="border-b border-white/5 hover:bg-white/[0.01]">
                              <td className="py-2.5 px-2.5 font-mono text-slate-500 text-[10px]">{cm.date}</td>
                              <td className="py-2.5 px-2.5 font-bold text-slate-300">{accLabel}</td>
                              <td className="py-2.5 px-2.5 text-slate-200">
                                <span className="font-semibold block">{cm.description}</span>
                                <div className="text-[9px] text-slate-500 mt-0.5">
                                  {cm.type === 'deposit' && 'إيداع وتغذية'}
                                  {cm.type === 'withdrawal' && 'سحب ومصروف'}
                                  {cm.type === 'transfer' && 'تحويل نقود'}
                                  {cm.type === 'settlement' && 'تسوية'}
                                  {cm.type === 'invoice_charge' && 'خصم مصروفات'}
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-left font-mono font-bold text-emerald-400">
                                {cm.inflow > 0 ? `${cm.inflow.toLocaleString()} ج.م` : '-'}
                              </td>
                              <td className="py-2.5 px-2.5 text-left font-mono font-bold text-rose-450">
                                {cm.outflow > 0 ? `${cm.outflow.toLocaleString()} ج.م` : '-'}
                              </td>
                              <td className="py-2.5 px-2.5 text-left font-mono font-black text-emerald-450 bg-emerald-950/20 rounded">
                                {cm.runningBalanceAfter.toLocaleString()} ج.م
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400">
                        <th className="py-2 px-2.5">التاريخ</th>
                        <th className="py-2 px-2.5">البيان والحركة</th>
                        <th className="py-2 px-2.5 text-left">الوارد (+)</th>
                        <th className="py-2 px-2.5 text-left">المنصرف (-)</th>
                        <th className="py-2 px-2.5 text-left bg-emerald-950/10 text-emerald-300 font-extrabold">الرصيد الجاري</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const accId = selectedLedgerAccountId;
                        const subMovs = db.custodyMovements.filter(m => m.from_account_id === accId || m.to_account_id === accId);
                        
                        const chronological = [...subMovs].reverse();
                        let running = 0;
                        const processed = chronological.map((m) => {
                          let inflow = 0;
                          let outflow = 0;

                          if (m.to_account_id === accId) {
                            inflow = m.amount;
                          } else if (m.type === 'deposit' && !m.from_account_id) {
                            inflow = m.amount;
                          }

                          if (m.from_account_id === accId) {
                            outflow = m.amount;
                          } else if ((m.type === 'withdrawal' || m.type === 'invoice_charge') && !m.to_account_id) {
                            outflow = m.amount;
                          }

                          if (!m.from_account_id && !m.to_account_id) {
                            if (m.type === 'deposit') {
                              inflow = m.amount;
                            } else if (m.type === 'withdrawal' || m.type === 'invoice_charge') {
                              outflow = m.amount;
                            } else if (m.type === 'settlement') {
                              if (m.description.includes('-') || m.description.includes('عجز') || m.description.includes('تنزيل')) {
                                outflow = m.amount;
                              } else {
                                inflow = m.amount;
                              }
                            }
                          }

                          running += (inflow - outflow);

                          return {
                            ...m,
                            inflow,
                            outflow,
                            running
                          };
                        });

                        const newestFirst = [...processed].reverse();

                        if (newestFirst.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500">لا توجد حركات صادرة أو واردة مسجلة على هذه العهدة الفرعية بعد.</td>
                            </tr>
                          );
                        }

                        return newestFirst.map((m) => (
                          <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.01]">
                            <td className="py-2.5 px-2.5 font-mono text-slate-500">{m.date}</td>
                            <td className="py-2.5 px-2.5 text-slate-200 font-medium">
                              {m.description}
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                {m.type === 'deposit' && 'إيداع وتغذية'}
                                {m.type === 'withdrawal' && 'سحب ومصروف'}
                                {m.type === 'transfer' && 'تحويل نقود'}
                                {m.type === 'settlement' && 'تسوية'}
                                {m.type === 'invoice_charge' && 'خصم مصروفات'}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-left font-mono font-bold text-emerald-400">
                              {m.inflow > 0 ? `${m.inflow.toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-2.5 px-2.5 text-left font-mono font-bold text-rose-450">
                              {m.outflow > 0 ? `${m.outflow.toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-2.5 px-2.5 text-left font-mono font-black text-emerald-450 bg-emerald-950/20 rounded-md">
                              {m.running.toLocaleString()} ج.م
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>

          {/* LEFT AREA: INTER-CUSTODY TRANSFER FORMS (التحويلات المالية الآمنة للفيزا بالمرور) */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-700/30 p-5 rounded-2xl space-y-4 shadow-xl">
              <h4 className="font-extrabold text-indigo-400 text-xs md:text-sm border-b border-white/10 pb-2.5 flex items-center gap-1.5">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                <span>بوابة التحويلات المالية الداخلية للعهدة</span>
              </h4>

              <p className="text-[11px] text-slate-350 leading-relaxed">
                تمنحك هذه البوابة تحويل السيولة النقدية أو كوت الفيزا البنكية بين كافة حسابات مسؤولي الحركة والمشرفين بالشركة محاسبياً وتحديث كشوفاتهم تلقائيًا بالمللي ثانية.
              </p>

              <form onSubmit={handleApplyTransfer} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">من حساب عهدة (السحب الخصم)</label>
                  <select
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                    value={transferFromId}
                    onChange={(e) => setTransferFromId(e.target.value)}
                  >
                    <option value="">-- اختر كاش / فيزا المرسل --</option>
                    {db.officials.map(o => (
                      <optgroup key={o.id} label={`مسؤول: ${o.name}`}>
                        {db.custodyAccounts.filter(ca => ca.official_id === o.id).map(ca => (
                          <option key={ca.id} value={ca.id}>
                            {o.name} - {ca.name} (رصيد متاح: {ca.balance} ج.م)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">إلى حساب عهدة (الإيداع المستلم)</label>
                  <select
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                    value={transferToId}
                    onChange={(e) => setTransferToId(e.target.value)}
                  >
                    <option value="">-- اختر كاش / فيزا المستلم --</option>
                    {db.officials.map(o => (
                      <optgroup key={o.id} label={`مسؤول: ${o.name}`}>
                        {db.custodyAccounts.filter(ca => ca.official_id === o.id).map(ca => (
                          <option key={ca.id} value={ca.id}>
                            {o.name} - {ca.name} (رصيد حالي: {ca.balance} ج.م)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">المبلغ المراد تحويله ج.م</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="كتب قيمة المبلغ..."
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 font-mono font-bold text-yellow-400 text-center"
                    value={transferAmount || ''}
                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">بيان وسبب التحويل الداخلي</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سداد نقدية مستحقة أو قسط غلاف..."
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                    value={transferDesc}
                    onChange={(e) => setTransferDesc(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-505 text-white font-black py-3 rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>تأكيد وتنفيذ التحويل المالي الآمن ✔</span>
                </button>
              </form>
            </div>

            {/* QUICK MONITOR CARD */}
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <span className="text-slate-400 font-semibold block border-b border-white/5 pb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                بروتوكول حماية العهد المالية
              </span>
              <p className="text-[10px] text-slate-500 leading-relaxed text-right">
                يعمل محرك قواعد بيانات شركة البنا جروب بمبدأ (PostgreSQL RLS) والحظر المطلق للتجاوزات المصرفية. تنعكس قيم بطاقات الفيزا الفرعية آليًا على لوحة التحكم ومجاميع كشف عهد المشرفين ومجموعات الترخيص بالتزامن.
              </p>
            </div>

          </div>

        </div>
      )}

      {/* --- RENDER TAB 3: PDF INVOICE IMPORT --- */}
      {activeSubTab === 'pdf_import' && (
        <div className="p-2">
          <PdfInvoiceImport />
        </div>
      )}

      {/* --- RENDER TAB 4: CHANGE PASSWORD --- */}
      {activeSubTab === 'change_password' && db.currentUser?.role === 'supervisor' && (
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 max-w-xl mx-auto mt-6 space-y-6">
          <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
            <Key className="w-5 h-5 text-rose-450 animate-pulse" />
            <div>
              <h3 className="font-extrabold text-slate-100 text-sm">تغيير كلمة المرور الشخصية</h3>
              <p className="text-[11px] text-slate-400">تستطيع هنا تحديث كلمة السر التي تدخل بها إلى حسابك الخاص كمشرف صرف بالبنا جروب.</p>
            </div>
          </div>

          {personalPasswordError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-550 text-rose-400 font-bold text-xs">
              ⚠️ {personalPasswordError}
            </div>
          )}

          {personalPasswordSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-555 text-emerald-400 font-bold text-xs">
              ✔️ {personalPasswordSuccess}
            </div>
          )}

          <form onSubmit={(e) => {
            e.preventDefault();
            setPersonalPasswordError('');
            setPersonalPasswordSuccess('');

            const official = db.officials.find(o => o.id === db.currentUser?.officialId);
            if (!official) {
              setPersonalPasswordError('المسؤول غير متوفر في قاعدة البيانات!');
              return;
            }

            const currentActualPassword = official.password || '123';
            if (personalOldPassword !== currentActualPassword) {
              setPersonalPasswordError('كلمة المرور الحالية غير صحيحة!');
              return;
            }

            if (personalNewPassword.trim().length < 3) {
              setPersonalPasswordError('يجب أن تكون كلمة المرور الجديدة مكونة من 3 أحرف على الأقل!');
              return;
            }

            if (personalNewPassword !== personalConfirmPassword) {
              setPersonalPasswordError('كلمة المرور الجديدة وتأكيدها غير متطابقتين!');
              return;
            }

            db.updateOfficialPassword(official.id, personalNewPassword);
            setPersonalPasswordSuccess('تم تحديث كلمة المرور بنجاح!');
            setPersonalOldPassword('');
            setPersonalNewPassword('');
            setPersonalConfirmPassword('');
          }} className="space-y-4 text-xs font-sans">
            <div>
              <label className="block text-slate-400 font-bold mb-1">كلمة المرور الحالية</label>
              <input
                type="password"
                required
                className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                value={personalOldPassword}
                onChange={(e) => setPersonalOldPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                value={personalNewPassword}
                onChange={(e) => setPersonalNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                value={personalConfirmPassword}
                onChange={(e) => setPersonalConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold px-6 py-2.5 rounded-lg transition-all"
              >
                💾 حفظ كلمة المرور الجديدة
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

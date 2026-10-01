/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import {
  Fuel,
  Plus,
  Trash2,
  Route,
  Gauge,
  CheckCircle,
  AlertTriangle,
  Pencil,
  MapPin,
} from 'lucide-react';

// المرحلة 1 من تطوير نظام طلبات النقل: إعدادات تكلفة خطوط السير
// (بنود التكلفة الإضافية، نولون السيارة لكل كم حسب النوع، لائحة خطوط السير للدخان)
export function TransportCostSettingsTab() {
  const db = useDb();

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    if (type === 'success') { setSuccessMsg(text); setErrorMsg(null); }
    else { setErrorMsg(text); setSuccessMsg(null); }
    setTimeout(() => { setSuccessMsg(null); setErrorMsg(null); }, 4000);
  };

  // ---- نقطة البداية/النهاية الافتراضية لخط السير ----
  const [defaultGarageDraft, setDefaultGarageDraft] = useState(db.defaultGarageLocation);

  const handleSaveDefaultGarage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = defaultGarageDraft.trim();
    if (!trimmed) {
      showNotification('error', 'يرجى إدخال اسم نقطة البداية الافتراضية');
      return;
    }
    db.updateDefaultGarageLocation(trimmed);
    showNotification('success', `تم حفظ "${trimmed}" كنقطة بداية/نهاية افتراضية.`);
  };

  // ---- بنود التكلفة الإضافية ----
  const [newCostItemName, setNewCostItemName] = useState('');

  const handleAddCostItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCostItemName.trim();
    if (!trimmed) {
      showNotification('error', 'يرجى إدخال اسم البند');
      return;
    }
    if (db.costItemTypes.some(i => i.name === trimmed)) {
      showNotification('error', 'البند ده موجود بالفعل');
      return;
    }
    db.addCostItemType(trimmed);
    showNotification('success', `تم إضافة بند "${trimmed}" بنجاح.`);
    setNewCostItemName('');
  };

  // ---- نولون السيارة لكل كم حسب النوع ----
  const carTypesFromFleet = Array.from(new Set(db.cars.map(c => c.car_type).filter((t): t is string => !!t && t.trim() !== '')));
  const [newFreightCarType, setNewFreightCarType] = useState('');
  const [newFreightRate, setNewFreightRate] = useState('');
  const [editingFreightType, setEditingFreightType] = useState<string | null>(null);
  const [editingFreightRate, setEditingFreightRate] = useState('');

  const handleAddFreightRate = (e: React.FormEvent) => {
    e.preventDefault();
    const type = newFreightCarType.trim();
    const rate = parseFloat(newFreightRate);
    if (!type) {
      showNotification('error', 'يرجى إدخال أو اختيار نوع السيارة');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      showNotification('error', 'يرجى إدخال سعر نولون صحيح للكيلومتر');
      return;
    }
    db.updateVehicleFreightRate(type, rate);
    showNotification('success', `تم حفظ نولون الكيلومتر لنوع "${type}" (${rate} ج.م/كم).`);
    setNewFreightCarType('');
    setNewFreightRate('');
  };

  const handleSaveEditedFreightRate = (carType: string) => {
    const rate = parseFloat(editingFreightRate);
    if (isNaN(rate) || rate < 0) {
      showNotification('error', 'يرجى إدخال سعر نولون صحيح للكيلومتر');
      return;
    }
    db.updateVehicleFreightRate(carType, rate);
    showNotification('success', `تم تحديث نولون الكيلومتر لنوع "${carType}".`);
    setEditingFreightType(null);
    setEditingFreightRate('');
  };

  // ---- لائحة خطوط السير (من - إلى - مبلغ الدخان) ----
  const [newRouteFrom, setNewRouteFrom] = useState('');
  const [newRouteTo, setNewRouteTo] = useState('');
  const [newRouteAmount, setNewRouteAmount] = useState('');
  const [newRouteDistance, setNewRouteDistance] = useState('');
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingRouteFrom, setEditingRouteFrom] = useState('');
  const [editingRouteTo, setEditingRouteTo] = useState('');
  const [editingRouteAmount, setEditingRouteAmount] = useState('');
  const [editingRouteDistance, setEditingRouteDistance] = useState('');

  const handleAddRoute = (e: React.FormEvent) => {
    e.preventDefault();
    const from = newRouteFrom.trim();
    const to = newRouteTo.trim();
    const amount = parseFloat(newRouteAmount);
    const distance = parseFloat(newRouteDistance || '0');
    if (!from || !to) {
      showNotification('error', 'يرجى إدخال نقطتي "من" و"إلى" لخط السير');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      showNotification('error', 'يرجى إدخال مبلغ دخان صحيح لخط السير');
      return;
    }
    if (isNaN(distance) || distance < 0) {
      showNotification('error', 'يرجى إدخال مسافة صحيحة بالكيلومتر لخط السير');
      return;
    }
    db.addRoutePrice(from, to, amount, distance);
    showNotification('success', `تم إضافة خط السير "${from} ← ${to}" بمبلغ دخان ${amount} ج.م ومسافة ${distance} كم.`);
    setNewRouteFrom('');
    setNewRouteTo('');
    setNewRouteAmount('');
    setNewRouteDistance('');
  };

  const startEditRoute = (r: { id: string; from_location: string; to_location: string; smoke_amount: number; distance_km: number }) => {
    setEditingRouteId(r.id);
    setEditingRouteFrom(r.from_location);
    setEditingRouteTo(r.to_location);
    setEditingRouteAmount(String(r.smoke_amount));
    setEditingRouteDistance(String(r.distance_km || 0));
  };

  const handleSaveEditedRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRouteId) return;
    const from = editingRouteFrom.trim();
    const to = editingRouteTo.trim();
    const amount = parseFloat(editingRouteAmount);
    const distance = parseFloat(editingRouteDistance || '0');
    if (!from || !to) {
      showNotification('error', 'يرجى إدخال نقطتي "من" و"إلى" لخط السير');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      showNotification('error', 'يرجى إدخال مبلغ دخان صحيح لخط السير');
      return;
    }
    if (isNaN(distance) || distance < 0) {
      showNotification('error', 'يرجى إدخال مسافة صحيحة بالكيلومتر لخط السير');
      return;
    }
    db.updateRoutePrice(editingRouteId, from, to, amount, distance);
    showNotification('success', 'تم تحديث خط السير بنجاح.');
    setEditingRouteId(null);
  };

  return (
    <div className="space-y-6" id="transport_cost_settings_tab_view">

      {/* Page Header */}
      <div className="border-b border-slate-800 pb-4">
        <span className="text-xs font-bold text-emerald-400 tracking-wider block uppercase mb-1">إعدادات طلبات النقل — المرحلة 1</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-100 font-sans tracking-tight">إعدادات تكلفة خطوط السير</h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          إدارة بنود التكلفة الإضافية، نولون كل نوع سيارة لكل كيلومتر، ولائحة مبالغ الدخان الافتراضية لكل خط سير — كل ده الأساس اللي هتعتمد عليه شاشة "حساب خطوط السير" في المراحل الجاية.
        </p>
      </div>

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

      {/* نقطة البداية/النهاية الافتراضية لخط السير */}
      <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-250 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-400" />
          <span>نقطة البداية/النهاية الافتراضية لخط السير</span>
        </h3>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          بتُستخدم كنقطة بداية لأول نقلة في اليوم لأي سيارة مالهاش "جراج" محدد في بياناتها، وكنقطة رجوع تلقائية لآخر نقلة في اليوم.
        </p>
        <form onSubmit={handleSaveDefaultGarage} className="flex gap-2 max-w-md">
          <input
            type="text"
            value={defaultGarageDraft}
            onChange={(e) => setDefaultGarageDraft(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
          />
          <button type="submit" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-black">
            حفظ
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Panel 1: بنود التكلفة الإضافية */}
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-slate-250 flex items-center gap-2">
              <Fuel className="w-4 h-4 text-emerald-500" />
              <span>بنود التكلفة الإضافية ({db.costItemTypes.length})</span>
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            دخان السائق بند أساسي ثابت دايمًا. أي بند تاني تحب تضيفه (غير كارتات/مخالفات/غسيل كاوتش/صيانة، دول بيتسجلوا يدوي على كل طلب) ضيفه هنا.
          </p>

          <form onSubmit={handleAddCostItem} className="flex gap-2">
            <input
              type="text"
              placeholder="اسم البند الجديد..."
              value={newCostItemName}
              onChange={(e) => setNewCostItemName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
            />
            <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> إضافة
            </button>
          </form>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-slate-950 text-slate-400 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px] font-bold">دخان السائق (ثابت)</span>
            {db.costItemTypes.map(item => (
              <span key={item.id} className="bg-slate-950 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5">
                {item.name}
                <button
                  type="button"
                  onClick={() => db.deleteCostItemType(item.id)}
                  className="text-slate-500 hover:text-rose-400"
                  title="حذف البند"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
            {db.costItemTypes.length === 0 && (
              <span className="text-[11px] text-slate-500 italic">لسه مفيش بنود إضافية مضافة.</span>
            )}
          </div>
        </div>

        {/* Panel 2: نولون السيارة لكل كم حسب النوع */}
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-slate-250 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-indigo-400" />
              <span>نولون السيارة لكل كيلومتر حسب النوع ({Object.keys(db.vehicleFreightRates).length})</span>
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            حدد سعر الكيلومتر الواحد لكل نوع سيارة — نولون النقلة هيتحسب تلقائيًا (المسافة × السعر) في شاشة حساب خطوط السير.
          </p>

          <form onSubmit={handleAddFreightRate} className="grid grid-cols-1 sm:grid-cols-[1fr,110px,auto] gap-2">
            <input
              type="text"
              list="fleet-car-types-datalist"
              placeholder="نوع السيارة (جامبو / دبابة / ملاكي...)"
              value={newFreightCarType}
              onChange={(e) => setNewFreightCarType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
            />
            <datalist id="fleet-car-types-datalist">
              {carTypesFromFleet.map(t => <option key={t} value={t} />)}
            </datalist>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="ج.م / كم"
              value={newFreightRate}
              onChange={(e) => setNewFreightRate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono"
            />
            <button type="submit" className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1 justify-center">
              <Plus className="w-3.5 h-3.5" /> إضافة
            </button>
          </form>

          <div className="overflow-x-auto text-xs font-sans">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-850">
                  <th className="py-2.5 px-3">نوع السيارة</th>
                  <th className="py-2.5 px-3">نولون الكيلومتر (ج.م)</th>
                  <th className="py-2.5 px-2 text-center w-20">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(db.vehicleFreightRates).map(([carType, rate]) => (
                  <tr key={carType} className="border-b border-slate-850/60 hover:bg-slate-950/20 text-slate-300">
                    <td className="py-2.5 px-3 font-extrabold text-slate-205">{carType}</td>
                    <td className="py-2.5 px-3 font-mono">
                      {editingFreightType === carType ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus
                          value={editingFreightRate}
                          onChange={(e) => setEditingFreightRate(e.target.value)}
                          className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-indigo-500"
                        />
                      ) : (
                        <span className="text-indigo-400 font-bold">{rate.toLocaleString()} ج.م/كم</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {editingFreightType === carType ? (
                          <>
                            <button type="button" onClick={() => handleSaveEditedFreightRate(carType)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2 py-1 rounded text-[10px] font-black">حفظ</button>
                            <button type="button" onClick={() => setEditingFreightType(null)} className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[10px]">إلغاء</button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditingFreightType(carType); setEditingFreightRate(String(rate)); }}
                              className="text-slate-500 hover:text-indigo-400 p-1"
                              title="تعديل السعر"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => db.deleteVehicleFreightRate(carType)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {Object.keys(db.vehicleFreightRates).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-500 font-bold italic">
                      لسه مفيش أسعار نولون مضافة لأي نوع سيارة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Panel 3: لائحة خطوط السير (الدخان) */}
      <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-black text-slate-250 flex items-center gap-2">
            <Route className="w-4 h-4 text-amber-400" />
            <span>لائحة خطوط السير ومبلغ الدخان الافتراضي ({db.routePriceList.length})</span>
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          حدد مبلغ الدخان الافتراضي لكل خط سير (من ← إلى). المبلغ ده هيظهر تلقائيًا عند اختيار نفس الخط في شاشة حساب خطوط السير، مع إمكانية التعديل اليدوي لكل طلب على حدة.
        </p>

        <form onSubmit={handleAddRoute} className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,100px,110px,auto] gap-2">
          <input
            type="text"
            list="transport-farms-datalist"
            placeholder="من"
            value={newRouteFrom}
            onChange={(e) => setNewRouteFrom(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
          />
          <input
            type="text"
            list="transport-farms-datalist"
            placeholder="إلى"
            value={newRouteTo}
            onChange={(e) => setNewRouteTo(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
          />
          <datalist id="transport-farms-datalist">
            {db.farms.map(f => <option key={f} value={f} />)}
          </datalist>
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder="المسافة كم"
            value={newRouteDistance}
            onChange={(e) => setNewRouteDistance(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="مبلغ الدخان"
            value={newRouteAmount}
            onChange={(e) => setNewRouteAmount(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
          />
          <button type="submit" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1 justify-center">
            <Plus className="w-3.5 h-3.5" /> إضافة خط سير
          </button>
        </form>

        <div className="overflow-x-auto text-xs font-sans">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-850">
                <th className="py-2.5 px-3">من</th>
                <th className="py-2.5 px-3">إلى</th>
                <th className="py-2.5 px-3">المسافة (كم)</th>
                <th className="py-2.5 px-3">مبلغ الدخان الافتراضي</th>
                <th className="py-2.5 px-2 text-center w-20">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {db.routePriceList.map(r => (
                <tr key={r.id} className="border-b border-slate-850/60 hover:bg-slate-950/20 text-slate-300">
                  {editingRouteId === r.id ? (
                    <td colSpan={5} className="py-2.5 px-3">
                      <form onSubmit={handleSaveEditedRoute} className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,100px,110px,auto] gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={editingRouteFrom}
                          onChange={(e) => setEditingRouteFrom(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-amber-500"
                        />
                        <input
                          type="text"
                          value={editingRouteTo}
                          onChange={(e) => setEditingRouteTo(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-amber-500"
                        />
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={editingRouteDistance}
                          onChange={(e) => setEditingRouteDistance(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-amber-500 font-mono"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editingRouteAmount}
                          onChange={(e) => setEditingRouteAmount(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-amber-500 font-mono"
                        />
                        <div className="flex gap-1.5">
                          <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1 rounded text-[10px] font-black flex-1">حفظ</button>
                          <button type="button" onClick={() => setEditingRouteId(null)} className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-[10px] flex-1">إلغاء</button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="py-2.5 px-3 font-extrabold text-slate-205">{r.from_location}</td>
                      <td className="py-2.5 px-3 font-extrabold text-slate-205">{r.to_location}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">{(r.distance_km || 0).toLocaleString()} كم</td>
                      <td className="py-2.5 px-3 font-mono text-amber-400 font-bold">{r.smoke_amount.toLocaleString()} ج.م</td>
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditRoute(r)}
                            className="text-slate-500 hover:text-amber-400 p-1"
                            title="تعديل"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => db.deleteRoutePrice(r.id)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {db.routePriceList.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-bold italic">
                    لسه مفيش خطوط سير مضافة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { TransportRequest } from '../types';
import { canSeeAllTransport, ownerNameOf, TransportScreen } from '../db/logic/transportScope';

const byNumberDesc = (a: TransportRequest, b: TransportRequest) =>
  String(b.request_number || '').localeCompare(String(a.request_number || ''));

type Counts = { new: number; in_progress: number; done: number };

/**
 * عرض طلبات النقل حسب الحساب:
 *  - visible: طلبات المستخدم (أو الكل للأدمن/مشرف الحركة) الموجودة في الحالة العامة
 *  - counts: العدادات من السيرفر (استعلام عدّ خفيف) بدل ما نحمّل كل الطلبات
 *  - matches: نتايج البحث (بأي حالة، حتى المنتهي) — البحث بيجيب من السيرفر ويضيف للحالة العامة
 * الطلبات الجارية (جديد/جاري) بتتحمّل مرة واحدة عند فتح الشاشة، والمنتهية ماتتحملش غير بالبحث.
 */
export function useScopedTransportRequests(screen: TransportScreen, searchTerm: string) {
  const db = useDb();
  const seeAll = canSeeAllTransport(db.currentUser, screen);
  const me = ownerNameOf(db.currentUser);
  const canQuery = seeAll || !!me;
  const createdBy = seeAll ? undefined : me;
  const term = searchTerm.trim();

  const visible = useMemo(
    () => (canQuery ? db.transportRequests.filter(r => seeAll || (r.created_by || '').trim() === me) : []),
    [db.transportRequests, seeAll, me, canQuery]
  );

  const localCounts: Counts = useMemo(() => ({
    new: visible.filter(r => r.status === 'new').length,
    in_progress: visible.filter(r => r.status === 'in_progress').length,
    done: visible.filter(r => r.status === 'done').length,
  }), [visible]);

  const [cloudCounts, setCloudCounts] = useState<Counts | null>(null);
  const signature = `${localCounts.new}|${localCounts.in_progress}|${localCounts.done}`;

  // العدادات من السيرفر — بتتحدّث لما حالة الطلبات تتغيّر
  useEffect(() => {
    if (!canQuery) return;
    let cancelled = false;
    db.fetchTransportCounts(createdBy).then(c => { if (!cancelled && c) setCloudCounts(c); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery, createdBy, signature]);

  // الطلبات الجارية فقط (جديد/جاري) — مرة واحدة عند فتح الشاشة
  useEffect(() => {
    if (!canQuery) return;
    db.fetchTransportScope({ createdBy, statuses: ['new', 'in_progress'], limit: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery, createdBy]);

  // البحث: بيتجاهل فلتر الحالة، فالطلب المنتهي بيظهر
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!term || !canQuery) { setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      db.fetchTransportScope({ createdBy, term, limit: 50 }).finally(() => { if (!cancelled) setSearching(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, canQuery, createdBy]);

  const matches = useMemo(() => {
    if (!term) return [] as TransportRequest[];
    const q = term.toLowerCase();
    return visible
      .filter(r =>
        (r.request_number || '').toLowerCase().includes(q) ||
        (r.farm_name || '').toLowerCase().includes(q) ||
        (r.request_date || '').includes(q)
      )
      .sort(byNumberDesc);
  }, [visible, term]);

  return { seeAll, me, visible, counts: cloudCounts ?? localCounts, matches, searching };
}

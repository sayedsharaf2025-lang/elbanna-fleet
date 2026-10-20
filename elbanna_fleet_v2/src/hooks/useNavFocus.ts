/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useDb } from '../db/store';

// لما المستخدم يضغط على إشعار، الشاشة المستهدفة بتستلم الطلب المعلّق (pendingNav) وتفتح الطلب بنفسها.
// الـ hook بيشتغل مرة لما الشاشة تتفتح، ولما يتغير الطلب المعلّق (لو المستخدم أصلًا على نفس الشاشة).
export function useNavFocus(screen: string, onFocus: (nav: { entityType: 'transport' | 'maintenance'; entityId: string }) => void) {
  const db = useDb();
  const nav = db.pendingNav;
  useEffect(() => {
    if (!nav || nav.screen !== screen) return;
    onFocus({ entityType: nav.entityType, entityId: nav.entityId });
    db.consumeNav(nav.nonce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav?.nonce, nav?.screen]);
}

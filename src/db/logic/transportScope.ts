/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { User } from '../../types';

export type TransportScreen = 'requests_tracking' | 'transport_requests';

// نفس صيغة created_by اللي بتتسجل بيها الطلبات في store.tsx
export const ownerNameOf = (u?: User | null): string => (u?.name || u?.username || '').trim();

// الأدمن بيشوف كل الطلبات. مشرف الحركة بيشوف الكل في شاشة "متابعة الطلبات" بس (لأنه اللي بيرد على كل المزارع).
// أي مستخدم تاني بيشوف الطلبات اللي هو عملها.
export const canSeeAllTransport = (u: User | null | undefined, screen: TransportScreen): boolean => {
  if (!u) return false;
  const role = (u.role as string) || '';
  if (role === 'admin') return true;
  return screen === 'requests_tracking' && role === 'movement_supervisor';
};

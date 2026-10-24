// تهريب نص قبل ما يتحط جوه HTML بيتكتب في نافذة الطباعة (يمنع حقن سكربتات من بيانات السيارات/السائقين)
export const escapeHtml = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

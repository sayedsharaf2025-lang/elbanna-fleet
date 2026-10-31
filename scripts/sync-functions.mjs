#!/usr/bin/env node
// بينسخ الملفات المشتركة (منطق الرحلة/الإشعارات/الأنواع...) من src لـ supabase/functions/_shared
// عشان الـ Edge Functions تستخدم نفس الكود بالظبط بدل نسخة مكررة تتفرق.
//   node scripts/sync-functions.mjs          ← ينسخ
//   node scripts/sync-functions.mjs --check  ← بيفشل (exit 1) لو النسخة المنسوخة مش مطابقة (للاختبارات/CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'supabase/functions/_shared');
const FILES = [
  'src/types.ts',
  'src/db/permissions.ts',
  'src/db/passwordUtil.ts',
  'src/db/authEmail.ts',
  'src/db/logic/tripFlow.ts',
  'src/db/logic/notifications.ts',
  'src/driver/driverLogic.ts',
];
const flat = new Map(FILES.map(f => [path.join(root, f), path.basename(f)]));
const HEADER = '// ⚠️ ملف متولّد تلقائيًا من {src} — ماتعدّلوش هنا. عدّل الأصل ثم شغّل: npm run sync:functions\n';

function transform(srcRel) {
  const abs = path.join(root, srcRel);
  let text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  text = text.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (m, a, spec, c) => {
    const resolved = [spec, spec + '.ts'].map(s => path.resolve(path.dirname(abs), s)).find(p => flat.has(p));
    if (!resolved) throw new Error(`${srcRel}: استيراد "${spec}" مش ضمن الملفات المشتركة — ضيفه لقايمة FILES`);
    return `${a}./${flat.get(resolved)}${c}`;
  });
  return HEADER.replace('{src}', srcRel) + text;
}

const check = process.argv.includes('--check');
let bad = 0;
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  const target = path.join(OUT, path.basename(f));
  const want = transform(f);
  const have = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
  if (have === want) continue;
  if (check) { console.error(`غير متزامن: supabase/functions/_shared/${path.basename(f)} (شغّل npm run sync:functions)`); bad++; }
  else { fs.writeFileSync(target, want); console.log('تم نسخ', f); }
}
if (check && bad) process.exit(1);
if (check) console.log('الملفات المشتركة متزامنة ✔');

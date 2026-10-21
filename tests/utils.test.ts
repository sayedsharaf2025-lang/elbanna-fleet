import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, parseNumberText, parseClipboardMatrix, numberToInputText, toNumber, normalizePlate } from '../src/utils/gridParse';
import { nextSortState, sortRows, NO_SORT } from '../src/utils/sortRows';
import { isSaveShortcut, isPaletteShortcut, registerSaveHandler, triggerSave, __saveHandlerCount } from '../src/utils/shortcuts';
import { searchScreens, normalizeArabic } from '../src/utils/screenSearch';
import { buildA4ReportHtml, formatPrintStamp } from '../src/utils/printA4';

test('parseNumberText: أرقام عربية وفواصل وعملة', () => {
  assert.equal(parseNumberText('1,234.5'), 1234.5);
  assert.equal(parseNumberText('١٢٣٫٥'), 123.5);
  assert.equal(parseNumberText('1.234,5'), 1234.5);
  assert.equal(parseNumberText('12,5'), 12.5);
  assert.equal(parseNumberText('1,500'), 1500);
  assert.equal(parseNumberText('1.234.567'), 1234567);
  assert.equal(parseNumberText('(100)'), -100);
  assert.equal(parseNumberText('-45'), -45);
  assert.equal(parseNumberText('500 ج.م'), 500);
  assert.equal(parseNumberText(' 7 352 '), 7352);
  assert.equal(parseNumberText(''), null);
  assert.equal(parseNumberText('abc'), null);
  assert.equal(parseNumberText('12abc'), null);
});

test('toNumber / numberToInputText', () => {
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber('x'), 0);
  assert.equal(toNumber('١٠'), 10);
  assert.equal(toNumber(5), 5);
  assert.equal(numberToInputText(12.5), '12.5');
  assert.equal(numberToInputText(null), '');
  assert.equal(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
});

test('parseClipboardMatrix: TSV من Excel', () => {
  assert.deepEqual(parseClipboardMatrix('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseClipboardMatrix('185\n92\n'), [['185'], ['92']]);
  assert.deepEqual(parseClipboardMatrix('x\ty'), [['x', 'y']]);
  assert.deepEqual(parseClipboardMatrix('"سطر 1\nسطر 2"\t5\n'), [['سطر 1\nسطر 2', '5']]);
  assert.deepEqual(parseClipboardMatrix('"قال ""مرحبا"""\t1'), [['قال "مرحبا"', '1']]);
  assert.deepEqual(parseClipboardMatrix('a\t\tc'), [['a', '', 'c']]); // خانة فاضية في النص
  assert.deepEqual(parseClipboardMatrix(''), []);
});

test('normalizePlate: يتجاهل المسافات والهمزات والأرقام العربية', () => {
  assert.equal(normalizePlate('ر س ب 7352'), normalizePlate('رسب٧٣٥٢'));
  assert.equal(normalizePlate('أ ب ج 1234'), normalizePlate('ا ب ج 1234'));
});

test('sortRows: ثابت، الفاضي في الآخر، عربي، أرقام', () => {
  const rows = [{ n: 'ب', v: 5 }, { n: 'أ', v: null }, { n: 'ج', v: 2 }, { n: 'د', v: 5 }];
  const acc = (r: typeof rows[0], k: string) => (k === 'v' ? r.v : r.n);
  assert.deepEqual(sortRows(rows, { key: 'v', dir: 'asc' }, acc).map(r => r.n), ['ج', 'ب', 'د', 'أ']);
  assert.deepEqual(sortRows(rows, { key: 'v', dir: 'desc' }, acc).map(r => r.n), ['ب', 'د', 'ج', 'أ']); // الفاضي آخر حتى تنازليًا + ثبات 5/5
  assert.equal(sortRows(rows, NO_SORT, acc), rows);
  const before = JSON.stringify(rows);
  sortRows(rows, { key: 'n', dir: 'asc' }, acc);
  assert.equal(JSON.stringify(rows), before, 'مفيش تعديل في المصفوفة الأصلية');
  // ترتيب رقمي طبيعي للنصوص اللي فيها أرقام
  const plates = ['س 10', 'س 9', 'س 100'].map(p => ({ p }));
  assert.deepEqual(sortRows(plates, { key: 'p', dir: 'asc' }, r => r.p).map(r => r.p), ['س 9', 'س 10', 'س 100']);
});

test('nextSortState: تصاعدي ثم تنازلي ثم إلغاء', () => {
  let s = nextSortState(NO_SORT, 'a');
  assert.deepEqual(s, { key: 'a', dir: 'asc' });
  s = nextSortState(s, 'a'); assert.deepEqual(s, { key: 'a', dir: 'desc' });
  s = nextSortState(s, 'a'); assert.deepEqual(s, NO_SORT);
  s = nextSortState({ key: 'a', dir: 'desc' }, 'b'); assert.deepEqual(s, { key: 'b', dir: 'asc' });
});

const key = (o: Partial<{ key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }>) =>
  ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

test('اختصارات: Ctrl+S / Ctrl+K بالإنجليزي والعربي', () => {
  assert.ok(isSaveShortcut(key({ key: 's', ctrlKey: true })));
  assert.ok(isSaveShortcut(key({ key: 'س', code: 'KeyS', ctrlKey: true })));
  assert.ok(isSaveShortcut(key({ key: 's', metaKey: true })));
  assert.ok(!isSaveShortcut(key({ key: 's' })));
  assert.ok(!isSaveShortcut(key({ key: 's', ctrlKey: true, shiftKey: true })));
  assert.ok(isPaletteShortcut(key({ key: 'k', ctrlKey: true })));
  assert.ok(isPaletteShortcut(key({ key: 'ن', code: 'KeyK', ctrlKey: true })));
  assert.ok(!isPaletteShortcut(key({ key: 'k', ctrlKey: true, altKey: true })));
});

test('معالج الحفظ: آخر شاشة مسجّلة هي اللي تتنفذ', () => {
  assert.equal(triggerSave(), false);
  const calls: string[] = [];
  const off1 = registerSaveHandler(() => { calls.push('a'); });
  const off2 = registerSaveHandler(() => { calls.push('b'); });
  assert.equal(triggerSave(), true);
  off2();
  triggerSave();
  off1();
  assert.deepEqual(calls, ['b', 'a']);
  assert.equal(__saveHandlerCount(), 0);
});

test('searchScreens: بحث عربي متسامح', () => {
  const items = [
    { id: 'vehicle_profitability', label: 'ربحية السيارات', group: 'المالية' },
    { id: 'custody_licensing', label: 'فواتير تراخيص', group: 'المالية' },
    { id: 'car_monthly_costs', label: 'المرتبات والسولار والزيت الشهرية', group: 'المالية' },
    { id: 'fuel_logs', label: 'سجل التموين', group: 'المالية' },
    { id: 'violations', label: 'تسجيل المخالفات وتفادي التكرار', group: 'العمليات' },
  ];
  assert.equal(searchScreens(items, 'ربحيه')[0].id, 'vehicle_profitability'); // ة/ه
  assert.equal(searchScreens(items, 'سولار')[0].id, 'car_monthly_costs');
  assert.equal(searchScreens(items, 'فواتير')[0].id, 'custody_licensing');
  assert.equal(searchScreens(items, 'العمليات')[0].id, 'violations'); // بالمجموعة
  assert.equal(searchScreens(items, 'xyz').length, 0);
  assert.equal(searchScreens(items, '').length, 5);
  assert.equal(normalizeArabic('إلى أحمد'), 'الي احمد');
});

test('printA4: رأس وتذييل فيهم التاريخ واسم المستخدم + هروب HTML', () => {
  const html = buildA4ReportHtml({
    title: 'تقرير <script>', user: 'أحمد & علي', printedAt: new Date(2026, 9, 14, 7, 5),
    headers: ['أ', 'ب'], rows: [['x<y', -5], ['z', 10]], totalsRow: ['الإجمالي', 5], signedColumns: [1],
    summary: [{ label: 'ص', value: '5' }], orientation: 'portrait',
  });
  assert.ok(html.includes('2026-10-14 07:05'));
  assert.ok(html.includes('أحمد &amp; علي'));
  assert.ok(html.includes('تقرير &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('A4 portrait'));
  assert.ok(html.includes('<tfoot>') && html.includes('<thead>'));
  assert.ok(html.includes('class="neg">-5'));
  assert.ok(html.includes('class="pos">10'));
  assert.equal(formatPrintStamp(new Date(2026, 0, 2, 3, 4)), '2026-01-02 03:04');
});

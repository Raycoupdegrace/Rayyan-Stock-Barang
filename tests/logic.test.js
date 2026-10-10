/* Logic harness: loads script.js in a stubbed DOM and exercises core rules. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

// ---- Minimal DOM stub -------------------------------------------------
function makeEl(id) {
  const el = {
    id, hidden: false, value: '', textContent: '', innerHTML: '', dataset: {},
    style: {}, files: [], disabled: false, isConnected: true,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    closest() { return el; },
    querySelector() { return makeEl('stub'); },
    querySelectorAll() { return []; },
    addEventListener() {}, focus() {}, click() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, appendChild() {},
    reset() {},
  };
  return el;
}

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const doc = {
  readyState: 'complete',
  title: '',
  body: { style: {}, appendChild() {} },
  activeElement: null,
  contains() { return true; },
  addEventListener() {},
  createElement: (t) => makeEl(t),
  querySelector: (sel) => makeEl(sel),
  querySelectorAll: () => [],
  getElementById: (id) => makeEl(id),
};

const sandbox = {
  console,
  localStorage,
  document: doc,
  window: { addEventListener() {}, scrollTo() {} },
  Intl, Date, Math, JSON, Number, String, Array, Object, Set, Map, RegExp,
  Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  setTimeout, clearTimeout, Promise, Intl,
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: 'script.js' });
} catch (err) {
  console.log('BOOT ERROR (likely a DOM stub gap, not app code):', err.message);
}

const api = sandbox;
// `state` is a top-level lexical binding inside the VM realm, so it is read and
// written through vm.runInContext rather than as a sandbox property.
const getState = () => vm.runInContext('state', sandbox);
const setState = (s) => { sandbox.__tmp = s; vm.runInContext('state = __tmp', sandbox); };

console.log('\n=== Exposed functions present ===');
for (const fn of ['applyMovement','createProduct','updateProduct','deleteProduct','stockStatus','buildDemoState','sanitizeState','parseIntStrict','recomputeBalances']) {
  console.log(` ${fn}: ${typeof api[fn]}`);
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ---- Test 1: strict integer parsing --------------------------------
console.log('\n=== parseIntStrict ===');
check('"5" -> 5', api.parseIntStrict('5', { min: 0 }) === 5);
check('"abc" -> null', api.parseIntStrict('abc') === null);
check('"" -> null', api.parseIntStrict('') === null);
check('"-3" min0 -> null', api.parseIntStrict('-3', { min: 0 }) === null);
check('"2.5" -> null', api.parseIntStrict('2.5') === null);
check('null -> null', api.parseIntStrict(null) === null);
check('undefined -> null', api.parseIntStrict(undefined) === null);
check('"1e3" -> null', api.parseIntStrict('1e3') === null);
check('" 7 " -> 7', api.parseIntStrict(' 7 ') === 7);
check('"Infinity" -> null', api.parseIntStrict('Infinity') === null);

// ---- Test 2: demo state integrity ----------------------------------
console.log('\n=== buildDemoState ===');
const demo = api.buildDemoState();
check('has products', demo.products.length === 10, `got ${demo.products.length}`);
check('has transactions', demo.transactions.length > 10, `got ${demo.transactions.length}`);
check('no negative stock', demo.products.every((p) => p.stock >= 0));
check('every product has an opening movement',
  demo.products.every((p) => demo.transactions.some((t) => t.productId === p.id && t.kind === 'opening')));
check('unique product ids', new Set(demo.products.map((p) => p.id)).size === demo.products.length);
check('unique transaction ids', new Set(demo.transactions.map((t) => t.id)).size === demo.transactions.length);
check('unique SKUs', new Set(demo.products.map((p) => p.sku)).size === demo.products.length);
// balances reconcile with product stock
for (const p of demo.products) {
  const last = demo.transactions.filter((t) => t.productId === p.id).sort((a, b) => a.createdAt - b.createdAt).pop();
  if (last && last.balance !== p.stock) check(`balance reconciles for ${p.sku}`, false, `last=${last.balance} stock=${p.stock}`);
}
check('balances reconcile with product.stock', true);

// ---- Test 3: corrupted data handling -------------------------------
console.log('\n=== sanitizeState (corrupted input) ===');
const bad = [
  ['null', null],
  ['array', [1, 2, 3]],
  ['missing arrays', { foo: 'bar' }],
  ['string', 'not json'],
];
for (const [name, input] of bad) {
  let threw = false;
  try { api.sanitizeState(input); } catch (_) { threw = true; }
  check(`rejects ${name}`, threw);
}
const dirty = {
  products: [
    { sku: 'A-1', name: 'Good', stock: '12', minStock: '3' },
    { sku: 'A-1', name: 'Dup SKU', stock: 5 },
    { sku: '', name: 'No SKU', stock: 1 },
    { sku: 'B-2', name: '', stock: 1 },
    null,
    { sku: 'C-3', name: 'BadStock', stock: 'abc', minStock: -4 },
  ],
  transactions: [
    { productId: 'nope', type: 'in', qty: 3, date: '2024-01-01' },
    { productId: 'x', type: 'weird', qty: 1 },
    { productId: 'x', type: 'out', qty: 0 },
    { productId: 'x', type: 'in', qty: 5, date: 'garbage' },
  ],
};
const clean = api.sanitizeState(dirty);
check('drops blank-SKU/name products', clean.products.length === 3, `got ${clean.products.length}`);
check('de-duplicates SKUs', new Set(clean.products.map((p) => p.sku.toUpperCase())).size === clean.products.length);
check('coerces bad stock to 0', clean.products.find((p) => p.sku === 'C-3').stock === 0);
check('coerces bad minStock to 0', clean.products.find((p) => p.sku === 'C-3').minStock === 0);
check('drops invalid movement types', clean.transactions.every((t) => t.type === 'in' || t.type === 'out'));
check('drops zero/negative qty', clean.transactions.every((t) => t.qty >= 1));
check('fixes bad dates', clean.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date)));

// ---- Test 4: movement rules ----------------------------------------
console.log('\n=== applyMovement ===');
setState(api.buildDemoState());
let st = getState();
const target = st.products[0];
const before = target.stock;

let r = api.applyMovement({ productId: target.id, type: 'in', qty: 10, date: '2024-05-01', notes: 'test' });
check('stock in increases stock', r.ok && target.stock === before + 10, `stock=${target.stock}`);
check('stock in records balance', r.tx.balance === before + 10);
check('stock in appended to history', r.ok && getState().transactions.includes(r.tx));

const afterIn = target.stock;
r = api.applyMovement({ productId: target.id, type: 'out', qty: 4, date: '2024-05-02' });
check('stock out decreases stock', r.ok && target.stock === afterIn - 4, `stock=${target.stock}`);

r = api.applyMovement({ productId: target.id, type: 'out', qty: 999999, date: '2024-05-03' });
check('overdraw is rejected', r.ok === false);
check('overdraw leaves stock unchanged', target.stock === afterIn - 4);
check('overdraw message is helpful', /cannot go negative/i.test(r.error));

r = api.applyMovement({ productId: target.id, type: 'out', qty: target.stock, date: '2024-05-04' });
check('exact-stock out is allowed', r.ok && target.stock === 0, `stock=${target.stock}`);
r = api.applyMovement({ productId: target.id, type: 'out', qty: 1, date: '2024-05-05' });
check('out from zero rejected', r.ok === false && target.stock === 0);

r = api.applyMovement({ productId: target.id, type: 'in', qty: 0, date: '2024-05-06' });
check('qty 0 rejected', r.ok === false);
r = api.applyMovement({ productId: target.id, type: 'in', qty: -5, date: '2024-05-06' });
check('negative qty rejected', r.ok === false);
r = api.applyMovement({ productId: 'missing', type: 'in', qty: 1, date: '2024-05-06' });
check('unknown product rejected', r.ok === false);

// ---- Test 5: duplicate SKU + edit adjustments -----------------------
console.log('\n=== createProduct / updateProduct ===');
setState(api.emptyState());
const c1 = api.createProduct({ sku: 'NEW-1', name: 'Widget', category: 'X', unit: 'pcs', minStock: 5, openingStock: 20 });
check('creates product', c1.ok);
check('opening stock applied', c1.product.stock === 20);
check('opening stock in history', getState().transactions.some((t) => t.kind === 'opening' && t.qty === 20));

const c2 = api.createProduct({ sku: 'new-1', name: 'Dupe', category: '', unit: '', minStock: 0, openingStock: 0 });
check('duplicate SKU (case-insensitive) rejected', c2.ok === false);
check('duplicate SKU reports field', c2.field === 'sku');

const u1 = api.updateProduct(c1.product.id, { sku: 'NEW-1', name: 'Widget v2', category: 'Y', unit: 'box', minStock: 8, stock: 20 });
check('edit without stock change adds no movement',
  u1.ok && getState().transactions.filter((t) => t.productId === c1.product.id).length === 1);

const u2 = api.updateProduct(c1.product.id, { sku: 'NEW-1', name: 'Widget v2', category: 'Y', unit: 'box', minStock: 8, stock: 15 });
check('stock decrease becomes adjustment out', u2.ok && c1.product.stock === 15, `stock=${c1.product.stock}`);
check('adjustment recorded as movement',
  getState().transactions.some((t) => t.productId === c1.product.id && t.kind === 'adjustment' && t.type === 'out' && t.qty === 5));

const u3 = api.updateProduct(c1.product.id, { sku: 'NEW-1', name: 'Widget v2', category: 'Y', unit: 'box', minStock: 8, stock: 40 });
check('stock increase becomes adjustment in', u3.ok && c1.product.stock === 40);
check('renames propagate to history',
  getState().transactions.filter((t) => t.productId === c1.product.id).every((t) => t.productName === 'Widget v2'));

const u4 = api.updateProduct(c1.product.id, { sku: 'NEW-1', name: 'Widget v2', category: 'Y', unit: 'box', minStock: 8, stock: -3 });
check('negative stock on edit is ignored (stock kept)', u4.ok === true && c1.product.stock === 40, `stock=${c1.product.stock}`);

const u5 = api.updateProduct(c1.product.id, { sku: 'OTHER', name: 'Widget v2', category: 'Y', unit: 'box', minStock: 8, stock: 40 });
check('SKU can be changed when unique', u5.ok && c1.product.sku === 'OTHER');

// ---- Test 6: delete preserves history --------------------------------
console.log('\n=== deleteProduct ===');
const pid = c1.product.id;
const txCount = getState().transactions.length;
api.deleteProduct(pid);
check('product removed', vm.runInContext(`productById(${JSON.stringify(pid)})`, sandbox) === null);
check('history preserved', getState().transactions.length === txCount);
check('history flagged orphan', getState().transactions.filter((t) => t.productId === pid).every((t) => t.orphan === true));

// ---- Test 7: stock status -------------------------------------------
console.log('\n=== stockStatus ===');
check('0 -> out', api.stockStatus({ stock: 0, minStock: 5 }) === 'out');
check('below min -> low', api.stockStatus({ stock: 3, minStock: 5 }) === 'low');
check('equal min -> low', api.stockStatus({ stock: 5, minStock: 5 }) === 'low');
check('above min -> ok', api.stockStatus({ stock: 6, minStock: 5 }) === 'ok');
check('zero min zero stock -> out', api.stockStatus({ stock: 0, minStock: 0 }) === 'out');

// ---- Test 8: persistence round-trip through localStorage -------------
console.log('\n=== persistence round-trip ===');
setState(api.buildDemoState());
api.saveState();
const storedRaw = localStorage.getItem('thestock.v1');
check('state written to localStorage', !!storedRaw);
const reloaded = api.sanitizeState(JSON.parse(storedRaw));
check('products survive reload', reloaded.products.length === 10, `got ${reloaded.products.length}`);
check('transactions survive reload', reloaded.transactions.length === getState().transactions.length);
check('stock values survive reload',
  JSON.stringify(reloaded.products.map((p) => p.stock).sort((a, b) => a - b)) ===
  JSON.stringify(getState().products.map((p) => p.stock).sort((a, b) => a - b)));

// ---- Test 9: CSV escaping -------------------------------------------
console.log('\n=== CSV escaping ===');
check('plain value unchanged', api.csvCell('hello') === 'hello');
check('comma is quoted', api.csvCell('a,b') === '"a,b"');
check('quote is doubled', api.csvCell('say "hi"') === '"say ""hi"""');
check('newline is quoted', api.csvCell('line1\nline2') === '"line1\nline2"');

console.log(`\n===============================\n  ${pass} passed, ${fail} failed\n===============================`);
process.exit(fail ? 1 : 0);

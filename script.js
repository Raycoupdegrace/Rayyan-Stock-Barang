/* =========================================================================
   thestock — Your inventory, simplified.
   Vanilla JS MVP · persistence via localStorage · no dependencies
   -------------------------------------------------------------------------
   Data model
     product     : { id, sku, name, category, unit, stock, minStock, createdAt, updatedAt }
     transaction : { id, productId, sku, productName, type:'in'|'out', qty,
                     date:'YYYY-MM-DD', notes, balance, kind:'opening'|'movement'|'adjustment',
                     createdAt }
   product.stock is the authoritative balance and is only ever changed by
   applying a transaction, so history and balances can never disagree.
   ========================================================================= */
'use strict';

/* ============================ Constants ============================ */
const STORAGE_KEY = 'thestock.v1';
const SCHEMA_VERSION = 1;

const CATEGORY_PRESETS = ['Beverages','Packaging','Coffee & Tea','Bakery','Cleaning','Electronics','Office Supplies'];
const UNIT_PRESETS = ['pcs','box','pack','bag','kg','litre','bottle','roll','set'];

/* ============================ Utilities ============================ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Escape a value for safe insertion into an HTML template string. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

const nf = new Intl.NumberFormat('en-US');
const fmtNum = (n) => nf.format(Number.isFinite(n) ? n : 0);

/** Strict non-negative integer parse. Returns null when invalid. */
function parseIntStrict(raw, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** Today as YYYY-MM-DD in local time. */
function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Format an ISO date (YYYY-MM-DD) for display without timezone drift. */
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '—';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d.toISOString().slice(0, 10))}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

function debounce(fn, wait = 180) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* ============================ Demo data ============================ */
function buildDemoState() {
  const now = Date.now();
  const mk = (sku, name, category, unit, minStock) => ({
    id: uid('prd'), sku, name, category, unit,
    stock: 0, minStock, createdAt: now, updatedAt: now,
  });

  const products = [
    mk('BEV-001', 'House Blend Coffee Beans 1kg', 'Coffee & Tea', 'bag', 12),
    mk('BEV-002', 'Cold Brew Concentrate 500ml', 'Beverages', 'bottle', 8),
    mk('PKG-010', 'Kraft Paper Cups 8oz (sleeve of 50)', 'Packaging', 'pack', 20),
    mk('PKG-011', 'Compostable Lids 8oz (sleeve of 50)', 'Packaging', 'pack', 20),
    mk('BAK-100', 'Butter Croissant (frozen)', 'Bakery', 'box', 6),
    mk('BAK-101', 'Sourdough Loaf', 'Bakery', 'pcs', 5),
    mk('CLN-200', 'Espresso Machine Cleaning Tablets', 'Cleaning', 'box', 4),
    mk('ELC-300', 'Bluetooth Receipt Printer', 'Electronics', 'pcs', 2),
    mk('ELC-301', 'USB-C Charging Cable 2m', 'Electronics', 'pcs', 10),
    mk('OFF-400', 'Thermal Receipt Rolls 57mm (box of 20)', 'Office Supplies', 'box', 6),
  ];

  // Realistic opening stock per SKU.
  const openings = {
    'BEV-001': 40, 'BEV-002': 18, 'PKG-010': 60, 'PKG-011': 55, 'BAK-100': 24,
    'BAK-101': 12, 'CLN-200': 9, 'ELC-300': 2, 'ELC-301': 26, 'OFF-400': 15,
  };

  // Movements expressed as day-offsets from today (negative = in the past).
  const movements = [
    { sku: 'BEV-001', type: 'out', qty: 6,  day: -12, notes: 'Weekly café consumption' },
    { sku: 'PKG-010', type: 'in',  qty: 40, day: -11, notes: 'Supplier delivery — PackRight' },
    { sku: 'BEV-002', type: 'out', qty: 4,  day: -10, notes: 'Counter restock' },
    { sku: 'BAK-100', type: 'out', qty: 8,  day: -9,  notes: 'Morning bake' },
    { sku: 'ELC-301', type: 'out', qty: 12, day: -8,  notes: 'Online order #1042' },
    { sku: 'OFF-400', type: 'out', qty: 5,  day: -7,  notes: 'Front till restock' },
    { sku: 'PKG-011', type: 'out', qty: 22, day: -6,  notes: 'Bulk catering order' },
    { sku: 'BEV-001', type: 'in',  qty: 15, day: -5,  notes: 'Roastery delivery' },
    { sku: 'BAK-101', type: 'out', qty: 4,  day: -4,  notes: 'Morning bake' },
    { sku: 'CLN-200', type: 'out', qty: 2,  day: -3,  notes: 'Monthly deep clean' },
    { sku: 'ELC-300', type: 'out', qty: 1,  day: -2,  notes: 'Installed at second till' },
    { sku: 'BEV-002', type: 'out', qty: 3,  day: -1,  notes: 'Counter restock' },
    { sku: 'PKG-010', type: 'out', qty: 25, day: 0,   notes: 'Peak-hour usage' },
    { sku: 'BEV-001', type: 'out', qty: 9,  day: 0,   notes: 'Weekly café consumption' },
  ];

  const state = { version: SCHEMA_VERSION, products, transactions: [], settings: { seeded: true } };
  const byId = new Map(products.map((p) => [p.sku, p]));

  const at = (dayOffset, minuteOffset) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(9, 0, 0, 0);
    return d.getTime() + minuteOffset * 60000;
  };

  // 1) Opening stock — always recorded first so history stays consistent.
  let i = 0;
  for (const p of products) {
    const qty = openings[p.sku] ?? 0;
    if (qty <= 0) continue;
    const createdAt = at(-20, i++);
    const date = new Date(createdAt).toISOString().slice(0, 10);
    p.stock = qty;
    state.transactions.push({
      id: uid('tx'), productId: p.id, sku: p.sku, productName: p.name,
      type: 'in', qty, date, notes: 'Opening stock', balance: qty,
      kind: 'opening', createdAt,
    });
  }

  // 2) Realistic movements applied in chronological order.
  const sorted = [...movements].sort((a, b) => a.day - b.day);
  let k = 0;
  for (const m of sorted) {
    const p = byId.get(m.sku);
    if (!p) continue;
    if (m.type === 'out' && m.qty > p.stock) continue; // never go negative
    const createdAt = at(m.day, 100 + k++);
    const date = new Date(createdAt).toISOString().slice(0, 10);
    p.stock = m.type === 'in' ? p.stock + m.qty : p.stock - m.qty;
    p.updatedAt = createdAt;
    state.transactions.push({
      id: uid('tx'), productId: p.id, sku: p.sku, productName: p.name,
      type: m.type, qty: m.qty, date, notes: m.notes, balance: p.stock,
      kind: 'movement', createdAt,
    });
  }

  state.transactions.sort((a, b) => a.createdAt - b.createdAt);
  return state;
}

/* ============================ Persistence ============================ */
let storageAvailable = true;

function emptyState() {
  return { version: SCHEMA_VERSION, products: [], transactions: [], settings: { seeded: true } };
}

function saveState() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    storageAvailable = false;
    toast('error', 'Could not save to localStorage — your browser may be in private mode. Changes are kept in memory only.');
  }
}

/** Coerce an unknown record into a valid product, or null when unusable. */
function sanitizeProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sku = String(raw.sku ?? '').trim();
  const name = String(raw.name ?? '').trim();
  if (!sku || !name) return null;
  const stock = parseIntStrict(raw.stock, { min: 0 });
  const minStock = parseIntStrict(raw.minStock, { min: 0 });
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('prd'),
    sku,
    name,
    category: String(raw.category ?? '').trim(),
    unit: String(raw.unit ?? '').trim(),
    stock: stock === null ? 0 : stock,
    minStock: minStock === null ? 0 : minStock,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

function sanitizeTransaction(raw, productIds) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'out' ? 'out' : raw.type === 'in' ? 'in' : null;
  if (!type) return null;
  const qty = parseIntStrict(raw.qty, { min: 1 });
  if (qty === null) return null;
  const productId = typeof raw.productId === 'string' ? raw.productId : '';
  if (!productId) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? String(raw.date) : todayISO();
  const balance = parseIntStrict(raw.balance, { min: 0 });
  const kind = ['opening', 'movement', 'adjustment'].includes(raw.kind) ? raw.kind : 'movement';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('tx'),
    productId,
    sku: String(raw.sku ?? '').trim(),
    productName: String(raw.productName ?? '').trim() || '(deleted product)',
    type, qty, date,
    notes: String(raw.notes ?? '').slice(0, 500),
    balance: balance === null ? 0 : balance,
    kind,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    orphan: !productIds.has(productId),
  };
}

/** Normalise arbitrary parsed JSON into a safe state object. */
function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not an object');
  const productsIn = Array.isArray(raw.products) ? raw.products : null;
  const txIn = Array.isArray(raw.transactions) ? raw.transactions : null;
  if (!productsIn || !txIn) throw new Error('Missing products or transactions arrays');

  const products = [];
  const seenSku = new Set();
  for (const p of productsIn) {
    const clean = sanitizeProduct(p);
    if (!clean) continue;
    const key = clean.sku.toUpperCase();
    if (seenSku.has(key)) { clean.sku = `${clean.sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`; }
    seenSku.add(clean.sku.toUpperCase());
    products.push(clean);
  }

  const ids = new Set(products.map((p) => p.id));
  const transactions = [];
  for (const t of txIn) {
    const clean = sanitizeTransaction(t, ids);
    if (clean) transactions.push(clean);
  }
  transactions.sort((a, b) => a.createdAt - b.createdAt);

  return {
    version: SCHEMA_VERSION,
    products,
    transactions,
    settings: (raw.settings && typeof raw.settings === 'object') ? raw.settings : { seeded: true },
  };
}

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    storageAvailable = false;
    return { state: buildDemoState(), recovered: false, firstRun: true };
  }
  if (!raw) return { state: buildDemoState(), recovered: false, firstRun: true };

  try {
    const parsed = JSON.parse(raw);
    return { state: sanitizeState(parsed), recovered: false, firstRun: false };
  } catch (err) {
    // Corrupted or incompatible payload — never destroy it silently.
    try { localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw); } catch (_) {}
    return { state: buildDemoState(), recovered: true, firstRun: true };
  }
}

/* ============================ App state ============================ */
let state = emptyState();
let ui = {
  view: 'dashboard',
  inv: { search: '', category: '', status: '', sort: 'name-asc' },
  rep: { search: '', type: '', from: '', to: '' },
  moveType: 'in',
};

/* ============================ Derived helpers ============================ */
const productById = (id) => state.products.find((p) => p.id === id) || null;

function stockStatus(p) {
  if (p.stock <= 0) return 'out';
  if (p.stock <= p.minStock) return 'low';
  return 'ok';
}

const STATUS_META = {
  ok:  { label: 'Healthy',      cls: 'pill-ok'  },
  low: { label: 'Low stock',    cls: 'pill-low' },
  out: { label: 'Out of stock', cls: 'pill-out' },
};

function transactionsFor(productId) {
  return state.transactions.filter((t) => t.productId === productId);
}

/** Recompute balances for every transaction of a product (oldest → newest). */
function recomputeBalances(productId) {
  const list = transactionsFor(productId).sort((a, b) => a.createdAt - b.createdAt);
  let running = 0;
  for (const t of list) {
    running = t.type === 'in' ? running + t.qty : Math.max(0, running - t.qty);
    t.balance = running;
  }
  return running;
}

/* ============================ Transactions ============================ */
/**
 * Apply a movement to a product. Single entry point for every stock change.
 * @returns {{ok:true, tx:object, product:object}|{ok:false, error:string}}
 */
function applyMovement({ productId, type, qty, date, notes, kind = 'movement' }) {
  const product = productById(productId);
  if (!product) return { ok: false, error: 'That product no longer exists.' };
  if (type !== 'in' && type !== 'out') return { ok: false, error: 'Invalid movement type.' };

  const quantity = parseIntStrict(qty, { min: 1, max: 100000000 });
  if (quantity === null) return { ok: false, error: 'Quantity must be a whole number of 1 or more.' };

  if (type === 'out' && quantity > product.stock) {
    return {
      ok: false,
      error: `Only ${fmtNum(product.stock)} ${product.unit || 'unit(s)'} of ${product.name} in stock. Stock cannot go negative.`,
    };
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : todayISO();
  const nextStock = type === 'in' ? product.stock + quantity : product.stock - quantity;

  product.stock = nextStock;
  product.updatedAt = Date.now();

  const tx = {
    id: uid('tx'),
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    type,
    qty: quantity,
    date: isoDate,
    notes: String(notes ?? '').trim().slice(0, 500),
    balance: nextStock,
    kind,
    createdAt: Date.now(),
  };
  state.transactions.push(tx);
  return { ok: true, tx, product };
}

/* ============================ Product CRUD ============================ */
function skuTaken(sku, exceptId = null) {
  const key = String(sku).trim().toUpperCase();
  return state.products.some((p) => p.sku.toUpperCase() === key && p.id !== exceptId);
}

function createProduct({ sku, name, category, unit, minStock, openingStock }) {
  const cleanSku = String(sku).trim();
  if (skuTaken(cleanSku)) return { ok: false, field: 'sku', error: `SKU “${cleanSku}” is already used by another product.` };

  const now = Date.now();
  const product = {
    id: uid('prd'),
    sku: cleanSku,
    name: String(name).trim(),
    category: String(category).trim(),
    unit: String(unit).trim() || 'pcs',
    stock: 0,
    minStock,
    createdAt: now,
    updatedAt: now,
  };
  state.products.push(product);

  if (openingStock > 0) {
    applyMovement({
      productId: product.id, type: 'in', qty: openingStock,
      date: todayISO(), notes: 'Opening stock', kind: 'opening',
    });
  }
  return { ok: true, product };
}

function updateProduct(id, { sku, name, category, unit, minStock, stock }) {
  const product = productById(id);
  if (!product) return { ok: false, error: 'Product not found.' };

  const cleanSku = String(sku).trim();
  if (skuTaken(cleanSku, id)) return { ok: false, field: 'sku', error: `SKU “${cleanSku}” is already used by another product.` };

  product.sku = cleanSku;
  product.name = String(name).trim();
  product.category = String(category).trim();
  product.unit = String(unit).trim() || 'pcs';
  product.minStock = minStock;
  product.updatedAt = Date.now();

  // A stock correction becomes an explicit adjustment movement, never a silent overwrite.
  const target = parseIntStrict(stock, { min: 0 });
  if (target !== null && target !== product.stock) {
    const delta = target - product.stock;
    const res = applyMovement({
      productId: id,
      type: delta > 0 ? 'in' : 'out',
      qty: Math.abs(delta),
      date: todayISO(),
      notes: 'Stock adjustment from product edit',
      kind: 'adjustment',
    });
    if (!res.ok) return { ok: false, error: res.error };
  }

  // Keep denormalised names in sync for historical rows of this product.
  for (const t of state.transactions) {
    if (t.productId === id) { t.sku = product.sku; t.productName = product.name; }
  }
  return { ok: true, product };
}

function deleteProduct(id) {
  const idx = state.products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  state.products.splice(idx, 1);
  // Movement history is deliberately preserved and flagged as orphaned.
  for (const t of state.transactions) {
    if (t.productId === id) t.orphan = true;
  }
  return true;
}

/* ============================ Filtering ============================ */
function filteredProducts() {
  const { search, category, status, sort } = ui.inv;
  const q = search.trim().toLowerCase();

  let rows = state.products.filter((p) => {
    if (q && !(`${p.name} ${p.sku} ${p.category} ${p.unit}`.toLowerCase().includes(q))) return false;
    if (category && p.category !== category) return false;
    if (status && stockStatus(p) !== status) return false;
    return true;
  });

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const sorters = {
    'name-asc':  (a, b) => collator.compare(a.name, b.name),
    'name-desc': (a, b) => collator.compare(b.name, a.name),
    'stock-asc': (a, b) => a.stock - b.stock || collator.compare(a.name, b.name),
    'stock-desc':(a, b) => b.stock - a.stock || collator.compare(a.name, b.name),
    'recent':    (a, b) => b.updatedAt - a.updatedAt,
  };
  rows.sort(sorters[sort] || sorters['name-asc']);
  return rows;
}

function filteredTransactions() {
  const { search, type, from, to } = ui.rep;
  const q = search.trim().toLowerCase();

  let rows = state.transactions.filter((t) => {
    if (q && !(`${t.productName} ${t.sku} ${t.notes}`.toLowerCase().includes(q))) return false;
    if (type && t.type !== type) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  });

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return rows;
}

/* ============================ Rendering ============================ */
const VIEW_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of your stock health' },
  inventory: { title: 'Inventory', subtitle: 'Manage your product catalogue' },
  movements: { title: 'Stock In & Out', subtitle: 'Record incoming and outgoing goods' },
  reports:   { title: 'Reports', subtitle: 'Inventory movement history' },
  data:      { title: 'Backup & Data', subtitle: 'Preserve, restore or reset your data' },
};

function render() {
  renderSidebar();
  renderDashboard();
  renderInventory();
  renderMovements();
  renderReports();
  renderDataView();
  renderTopbarAction();
}

/* ---- Sidebar ---- */
function renderSidebar() {
  const low = state.products.filter((p) => stockStatus(p) !== 'ok').length;
  const badge = $('#navBadgeLow');
  badge.hidden = low === 0;
  badge.textContent = low > 99 ? '99+' : String(low);
  $('#sidebarStorage').textContent =
    `${state.products.length} product${state.products.length === 1 ? '' : 's'} · ${state.transactions.length} movement${state.transactions.length === 1 ? '' : 's'}`;
}

/* ---- Topbar ---- */
function renderTopbarAction() {
  const host = $('#topbarAction');
  const map = {
    dashboard: { label: 'Record movement', view: 'movements', primary: true },
    inventory: { label: 'Add product', action: 'add-product', primary: true },
    movements: { label: 'View reports', view: 'reports' },
    reports:   { label: 'Export CSV', action: 'export-csv', primary: true },
    data:      { label: 'Export backup', action: 'export-json' },
  };
  const cfg = map[ui.view];
  if (!cfg) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <button class="btn ${cfg.primary ? 'btn-primary' : 'btn-secondary'}" type="button"
      data-action="${cfg.action || 'go'}" ${cfg.view ? `data-view="${cfg.view}"` : ''}>
      ${esc(cfg.label)}
    </button>`;
}

/* ---- Dashboard ---- */
function renderDashboard() {
  const products = state.products;
  const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const lowList = products.filter((p) => stockStatus(p) !== 'ok')
    .sort((a, b) => (a.stock - a.minStock) - (b.stock - b.minStock));
  const categories = new Set(products.map((p) => p.category).filter(Boolean));

  $('#statProducts').textContent = fmtNum(products.length);
  $('#statProductsSub').textContent = products.length
    ? `${categories.size} categor${categories.size === 1 ? 'y' : 'ies'}`
    : 'No products yet';

  $('#statUnits').textContent = fmtNum(totalUnits);
  $('#statUnitsSub').textContent = products.length ? 'Units available across all products' : 'Nothing in stock';

  $('#statLow').textContent = fmtNum(lowList.length);
  const outCount = lowList.filter((p) => p.stock <= 0).length;
  $('#statLowSub').textContent = lowList.length
    ? `${outCount} out of stock · ${lowList.length - outCount} at or below minimum`
    : 'All products above minimum';

  const ins = state.transactions.filter((t) => t.type === 'in').reduce((s, t) => s + t.qty, 0);
  const outs = state.transactions.filter((t) => t.type === 'out').reduce((s, t) => s + t.qty, 0);
  $('#statValue').textContent = fmtNum(state.transactions.length);
  $('#statValueSub').textContent = `${fmtNum(ins)} in · ${fmtNum(outs)} out`;

  // Recent activity
  const recent = [...state.transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const body = $('#recentTxBody');
  const empty = $('#recentEmpty');
  const table = body.closest('table');

  if (!recent.length) {
    body.innerHTML = '';
    table.hidden = true;
    empty.hidden = false;
  } else {
    table.hidden = false;
    empty.hidden = true;
    body.innerHTML = recent.map((t) => `
      <tr>
        <td class="mono">${esc(fmtDate(t.date))}</td>
        <td>
          <div class="cell-name">${esc(t.productName)}</div>
          <div class="cell-sub mono">${esc(t.sku || '—')}</div>
        </td>
        <td><span class="type-badge type-${t.type}">${t.type === 'in' ? 'Stock in' : 'Stock out'}</span></td>
        <td class="ta-right ${t.type === 'in' ? 'value-in' : 'value-out'}" style="font-weight:700">
          ${t.type === 'in' ? '+' : '−'}${fmtNum(t.qty)}
        </td>
        <td class="ta-right balance-cell">${fmtNum(t.balance)}</td>
      </tr>`).join('');
  }

  // Low stock alerts
  const list = $('#lowStockList');
  const lowEmpty = $('#lowEmpty');
  if (!lowList.length) {
    list.innerHTML = '';
    list.hidden = true;
    lowEmpty.hidden = false;
  } else {
    list.hidden = false;
    lowEmpty.hidden = true;
    list.innerHTML = lowList.slice(0, 6).map((p) => {
      const st = stockStatus(p);
      return `
        <li class="alert-item">
          <span class="alert-icon">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 4.5 21 19.5H3L12 4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.2M12 17.1v.1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
          </span>
          <div class="info">
            <p>${esc(p.name)}</p>
            <span>${esc(p.sku)} · min ${fmtNum(p.minStock)} ${esc(p.unit || '')}</span>
          </div>
          <span class="pill ${STATUS_META[st].cls}">${STATUS_META[st].label}</span>
          <span class="qty">${fmtNum(p.stock)}</span>
        </li>`;
    }).join('');
  }
}

/* ---- Inventory ---- */
function renderInventory() {
  const rows = filteredProducts();
  const body = $('#invBody');
  const empty = $('#invEmpty');
  const table = body.closest('table');

  $('#invSubtitle').textContent =
    `${rows.length} of ${state.products.length} product${state.products.length === 1 ? '' : 's'} shown`;

  if (!rows.length) {
    body.innerHTML = '';
    table.hidden = true;
    empty.hidden = false;
    const filtered = state.products.length > 0;
    $('#invEmptyTitle').textContent = filtered ? 'No products match your filters' : 'No products yet';
    $('#invEmptyText').textContent = filtered
      ? 'Try a different search term, or clear the category and status filters.'
      : 'Add your first product to start tracking stock levels.';
    $('#invEmptyBtn').textContent = filtered ? 'Clear filters' : 'Add product';
    $('#invEmptyBtn').dataset.mode = filtered ? 'clear' : 'add';
    return;
  }

  table.hidden = false;
  empty.hidden = true;

  body.innerHTML = rows.map((p) => {
    const st = stockStatus(p);
    return `
      <tr data-id="${esc(p.id)}">
        <td class="mono">${esc(p.sku)}</td>
        <td>
          <div class="cell-name">${esc(p.name)}</div>
          ${p.unit ? `<div class="cell-sub">per ${esc(p.unit)}</div>` : ''}
        </td>
        <td>${p.category ? esc(p.category) : '<span class="cell-sub">—</span>'}</td>
        <td>${esc(p.unit || '—')}</td>
        <td class="ta-right balance-cell">${fmtNum(p.stock)}</td>
        <td class="ta-right">${fmtNum(p.minStock)}</td>
        <td><span class="pill ${STATUS_META[st].cls}">${STATUS_META[st].label}</span></td>
        <td class="ta-right">
          <div class="row-actions">
            <button class="icon-btn" type="button" data-act="in" title="Stock in" aria-label="Stock in ${esc(p.name)}">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn" type="button" data-act="out" title="Stock out" aria-label="Stock out ${esc(p.name)}">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0 5.5-5.5M12 19l-5.5-5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn" type="button" data-act="edit" title="Edit product" aria-label="Edit ${esc(p.name)}">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14.5 5.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
            <button class="icon-btn danger" type="button" data-act="delete" title="Delete product" aria-label="Delete ${esc(p.name)}">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.5 6.5 7.4 19c.1.9.8 1.5 1.7 1.5h5.8c.9 0 1.6-.6 1.7-1.5l.9-12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ---- Stock In & Out ---- */
function renderMovements() {
  const select = $('#moveProduct');
  const previous = select.value;

  if (!state.products.length) {
    select.innerHTML = '<option value="">No products yet — add one first</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
    const sorted = [...state.products].sort((a, b) =>
      new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare(a.name, b.name));
    select.innerHTML = '<option value="">Select a product…</option>' + sorted.map((p) =>
      `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.sku)} (${fmtNum(p.stock)} in stock)</option>`).join('');
    if (previous && productById(previous)) select.value = previous;
  }

  updateMoveProductHint();
  updateMoveSubmit();

  const recent = [...state.transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const list = $('#movementList');
  const empty = $('#movementEmpty');

  if (!recent.length) {
    list.innerHTML = '';
    list.hidden = true;
    empty.hidden = false;
  } else {
    list.hidden = false;
    empty.hidden = true;
    list.innerHTML = recent.map((t) => `
      <li class="movement-item">
        <span class="move-icon ${t.type}">
          <svg viewBox="0 0 24 24" fill="none">${t.type === 'in'
            ? '<path d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            : '<path d="M12 5v14m0 0 5.5-5.5M12 19l-5.5-5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'}</svg>
        </span>
        <div class="info">
          <p>${esc(t.productName)}</p>
          <span>${esc(fmtDate(t.date))}${t.notes ? ` · ${esc(t.notes)}` : ''}${t.kind === 'opening' ? ' · opening stock' : t.kind === 'adjustment' ? ' · adjustment' : ''}</span>
        </div>
        <span class="qty ${t.type}">${t.type === 'in' ? '+' : '−'}${fmtNum(t.qty)}</span>
      </li>`).join('');
  }
}

function updateMoveProductHint() {
  const product = productById($('#moveProduct').value);
  const hint = $('#moveProductHint');
  if (!product) {
    hint.textContent = 'Choose the product this movement applies to.';
    hint.style.color = '';
    return;
  }
  const st = stockStatus(product);
  hint.textContent = `Currently ${fmtNum(product.stock)} ${product.unit || 'unit(s)'} in stock · minimum ${fmtNum(product.minStock)}`
    + (st === 'out' ? ' · out of stock' : st === 'low' ? ' · below minimum' : '');
  hint.style.color = st === 'out' ? 'var(--rose)' : st === 'low' ? 'var(--amber)' : '';
}

function updateMoveSubmit() {
  const btn = $('#moveSubmit');
  btn.textContent = ui.moveType === 'in' ? 'Record stock in' : 'Record stock out';
  btn.classList.toggle('btn-primary', ui.moveType === 'in');
  btn.classList.toggle('btn-danger', ui.moveType === 'out');
}

/* ---- Reports ---- */
function renderReports() {
  const rows = filteredTransactions();
  const all = state.transactions;

  $('#repCount').textContent = fmtNum(rows.length);
  $('#repInTotal').textContent = fmtNum(rows.filter((t) => t.type === 'in').reduce((s, t) => s + t.qty, 0));
  $('#repOutTotal').textContent = fmtNum(rows.filter((t) => t.type === 'out').reduce((s, t) => s + t.qty, 0));

  const body = $('#repBody');
  const empty = $('#repEmpty');
  const table = body.closest('table');

  if (!rows.length) {
    body.innerHTML = '';
    table.hidden = true;
    empty.hidden = false;
    $('.empty-title', empty).textContent = all.length ? 'No movements match your filters' : 'No movements recorded yet';
    $('.empty-text', empty).textContent = all.length
      ? 'Try widening the date range or clearing the search.'
      : 'Record stock in or stock out and the full history will appear here.';
    return;
  }

  table.hidden = false;
  empty.hidden = true;

  body.innerHTML = rows.map((t) => `
    <tr>
      <td class="mono">${esc(fmtDate(t.date))}</td>
      <td>
        <div class="cell-name">${esc(t.productName)}</div>
        ${t.orphan ? '<div class="cell-sub">deleted product</div>' : t.kind === 'opening' ? '<div class="cell-sub">opening stock</div>' : t.kind === 'adjustment' ? '<div class="cell-sub">adjustment</div>' : ''}
      </td>
      <td class="mono">${esc(t.sku || '—')}</td>
      <td><span class="type-badge type-${t.type}">${t.type === 'in' ? 'Stock in' : 'Stock out'}</span></td>
      <td class="ta-right ${t.type === 'in' ? 'value-in' : 'value-out'}" style="font-weight:700">
        ${t.type === 'in' ? '+' : '−'}${fmtNum(t.qty)}
      </td>
      <td class="ta-right balance-cell">${fmtNum(t.balance)}</td>
      <td>${t.notes ? esc(t.notes) : '<span class="cell-sub">—</span>'}</td>
    </tr>`).join('');
}

/* ---- Data view ---- */
function renderDataView() {
  $('#storageProducts').textContent = fmtNum(state.products.length);
  $('#storageTx').textContent = fmtNum(state.transactions.length);
  let bytes = 0;
  try { bytes = (localStorage.getItem(STORAGE_KEY) || '').length * 2; } catch (_) {}
  $('#storageSize').textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  const last = state.transactions.length ? Math.max(...state.transactions.map((t) => t.createdAt)) : null;
  $('#storageUpdated').textContent = last ? fmtDateTime(last) : '—';
}

/* ---- Category / unit datalists ---- */
function renderDatalists() {
  const cats = [...new Set([...state.products.map((p) => p.category).filter(Boolean), ...CATEGORY_PRESETS])].sort();
  const units = [...new Set([...state.products.map((p) => p.unit).filter(Boolean), ...UNIT_PRESETS])].sort();
  $('#categoryOptions').innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
  $('#unitOptions').innerHTML = units.map((u) => `<option value="${esc(u)}"></option>`).join('');

  const select = $('#invCategory');
  const current = select.value;
  const used = [...new Set(state.products.map((p) => p.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All categories</option>' +
    used.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (used.includes(current)) select.value = current;
}

/* ============================ Toast ============================ */
function toast(kind, message, timeout = 4200) {
  const host = $('#toasts');
  const icons = {
    success: '<path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    error:   '<path d="M12 7v6.5M12 17.2v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/>',
    info:    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v5.5M12 7.6v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  };
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">${icons[kind] || icons.info}</svg>
    <div class="toast-body"></div>
    <button class="toast-close" type="button" aria-label="Dismiss">&times;</button>`;
  $('.toast-body', el).textContent = message;

  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  };
  $('.toast-close', el).addEventListener('click', remove);
  host.appendChild(el);
  if (timeout) setTimeout(remove, timeout);
}

/* ============================ Confirm dialog ============================ */
let confirmResolver = null;

function confirmDialog({ title, message, okText = 'Confirm', cancelText = 'Cancel', danger = true }) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    const ok = $('#confirmOk');
    ok.textContent = okText;
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    $('#confirmCancel').textContent = cancelText;
    openModal('#confirmModal');
    setTimeout(() => ok.focus(), 60);
  });
}

function settleConfirm(result) {
  closeModal('#confirmModal');
  if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
}

/* ============================ Modal plumbing ============================ */
let lastFocused = null;

function syncBodyScrollLock() {
  const anyOpen = !$('#productModal').hidden || !$('#confirmModal').hidden;
  document.body.style.overflow = anyOpen ? 'hidden' : '';
}

function openModal(sel) {
  lastFocused = document.activeElement;
  $(sel).hidden = false;
  syncBodyScrollLock();
}

function closeModal(sel) {
  const modal = $(sel);
  if (modal.hidden) return;
  modal.hidden = true;
  syncBodyScrollLock();
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

/* ============================ Product modal ============================ */
function openProductModal(product = null) {
  const form = $('#productForm');
  form.reset();
  clearFieldErrors(form);

  if (product) {
    $('#productModalTitle').textContent = 'Edit product';
    $('#productModalSub').textContent = `Updating ${product.sku}`;
    $('#pId').value = product.id;
    $('#pSku').value = product.sku;
    $('#pName').value = product.name;
    $('#pCategory').value = product.category;
    $('#pUnit').value = product.unit;
    $('#pMinStock').value = String(product.minStock);
    $('#pStockLabel').textContent = 'Current stock';
    $('#pStock').value = String(product.stock);
    $('#pStockHint').textContent = 'Changing this records a stock adjustment movement so history stays consistent.';
    $('#productSaveBtn').textContent = 'Save changes';
  } else {
    $('#productModalTitle').textContent = 'Add product';
    $('#productModalSub').textContent = 'Create a new item to track in inventory.';
    $('#pId').value = '';
    $('#pMinStock').value = '0';
    $('#pStock').value = '0';
    $('#pStockLabel').textContent = 'Opening stock';
    $('#pStockHint').textContent = 'Recorded as an opening-stock movement so history stays consistent.';
    $('#productSaveBtn').textContent = 'Save product';
  }

  renderDatalists();
  openModal('#productModal');
  setTimeout(() => $('#pSku').focus(), 60);
}

function clearFieldErrors(root) {
  $$('.field', root).forEach((f) => f.classList.remove('has-error'));
  $$('.field-error', root).forEach((e) => { e.hidden = true; e.textContent = ''; });
}

function showFieldError(inputId, errorId, message) {
  const input = $(`#${inputId}`);
  const err = $(`#${errorId}`);
  if (input) input.closest('.field')?.classList.add('has-error');
  if (err) { err.textContent = message; err.hidden = false; }
}

function handleProductSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearFieldErrors(form);

  const id = $('#pId').value;
  const sku = $('#pSku').value.trim();
  const name = $('#pName').value.trim();
  const category = $('#pCategory').value.trim();
  const unit = $('#pUnit').value.trim();
  const minStock = parseIntStrict($('#pMinStock').value, { min: 0, max: 100000000 });
  const stockRaw = $('#pStock').value;
  const stock = parseIntStrict(stockRaw, { min: 0, max: 100000000 });

  let valid = true;
  if (!sku) { showFieldError('pSku', 'pSkuError', 'SKU is required.'); valid = false; }
  else if (sku.length > 40) { showFieldError('pSku', 'pSkuError', 'SKU must be 40 characters or fewer.'); valid = false; }
  else if (skuTaken(sku, id || null)) { showFieldError('pSku', 'pSkuError', `SKU “${sku}” is already used by another product.`); valid = false; }

  if (!name) { showFieldError('pName', 'pNameError', 'Product name is required.'); valid = false; }
  else if (name.length > 120) { showFieldError('pName', 'pNameError', 'Product name must be 120 characters or fewer.'); valid = false; }

  if (minStock === null) { showFieldError('pMinStock', 'pMinStockError', 'Minimum stock must be a whole number of 0 or more.'); valid = false; }
  if (stock === null) {
    showFieldError('pStock', 'pStockError', 'Stock must be a whole number of 0 or more.');
    valid = false;
  }

  if (!valid) {
    const firstError = $('.field.has-error input', form);
    if (firstError) firstError.focus();
    toast('error', 'Please fix the highlighted fields.');
    return;
  }

  let result;
  if (id) {
    result = updateProduct(id, { sku, name, category, unit, minStock, stock });
    if (!result.ok) {
      if (result.field === 'sku') showFieldError('pSku', 'pSkuError', result.error);
      toast('error', result.error || 'Could not update the product.');
      return;
    }
    toast('success', `${name} updated.`);
  } else {
    result = createProduct({ sku, name, category, unit, minStock, openingStock: stock });
    if (!result.ok) {
      if (result.field === 'sku') showFieldError('pSku', 'pSkuError', result.error);
      toast('error', result.error || 'Could not create the product.');
      return;
    }
    toast('success', `${name} added${stock > 0 ? ` with ${fmtNum(stock)} opening stock` : ''}.`);
  }

  closeModal('#productModal');
  saveState();
  renderDatalists();
  render();
}

/* ============================ Movement form ============================ */
function handleMovementSubmit(event) {
  event.preventDefault();
  clearFieldErrors($('#moveForm'));

  const productId = $('#moveProduct').value;
  const qty = $('#moveQty').value;
  const date = $('#moveDate').value || todayISO();
  const notes = $('#moveNotes').value;

  if (!state.products.length) { toast('error', 'Add a product before recording a movement.'); return; }
  if (!productId || !productById(productId)) {
    toast('error', 'Please select a product.');
    $('#moveProduct').focus();
    return;
  }

  const parsed = parseIntStrict(qty, { min: 1, max: 100000000 });
  if (parsed === null) {
    showFieldError('moveQty', 'moveQtyError', 'Enter a whole number of 1 or more.');
    $('#moveQty').focus();
    return;
  }

  const result = applyMovement({ productId, type: ui.moveType, qty: parsed, date, notes });
  if (!result.ok) {
    showFieldError('moveQty', 'moveQtyError', result.error);
    toast('error', result.error);
    return;
  }

  const verb = ui.moveType === 'in' ? 'Stock in' : 'Stock out';
  toast('success', `${verb} recorded: ${result.tx.type === 'in' ? '+' : '−'}${fmtNum(parsed)} ${result.product.name} · new balance ${fmtNum(result.product.stock)}.`);

  // Reset the form but keep the type and date for fast repeated entry.
  $('#moveQty').value = '';
  $('#moveNotes').value = '';
  $('#moveQty').closest('.field').classList.remove('has-error');
  $('#moveQtyError').hidden = true;

  saveState();
  render();
  $('#moveQty').focus();
}

/* ============================ Navigation ============================ */
function navigate(view, options = {}) {
  if (!VIEW_META[view]) view = 'dashboard';
  ui.view = view;

  $$('.view').forEach((el) => el.classList.toggle('is-active', el.id === `view-${view}`));
  $$('.nav-item').forEach((el) => el.classList.toggle('is-active', el.dataset.view === view));

  $('#pageTitle').textContent = VIEW_META[view].title;
  $('#pageSubtitle').textContent = VIEW_META[view].subtitle;
  document.title = `${VIEW_META[view].title} · thestock`;

  if (options.filter) {
    ui.inv.status = options.filter;
    ui.inv.search = '';
    ui.inv.category = '';
    $('#invStatus').value = options.filter;
    $('#invSearch').value = '';
    $('#invCategory').value = '';
    renderInventory();
  }
  if (options.focusProductId) {
    $('#moveProduct').value = options.focusProductId;
  }

  renderTopbarAction();
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================ Sidebar (mobile) ============================ */
function openSidebar() {
  $('#sidebar').classList.add('is-open');
  $('#sidebarScrim').hidden = false;
}
function closeSidebar() {
  $('#sidebar').classList.remove('is-open');
  $('#sidebarScrim').hidden = true;
}

/* ============================ Theme (light / dark) ============================ */
const THEME_KEY = 'thestock.theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Reflect the active theme on the toggle button (label + tooltip). */
function syncThemeToggle(theme) {
  const btn = $('#themeToggle');
  if (!btn) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} mode`);
  btn.setAttribute('title', `Switch to ${next} mode`);
}

/** Apply a theme, persist it and keep the browser UI colour in sync. */
function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1211' : '#f6f5f1');
  syncThemeToggle(theme);
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  // Brief cross-fade so the switch does not feel abrupt.
  const root = document.documentElement;
  root.classList.add('theme-transition');
  window.clearTimeout(toggleTheme._timer);
  toggleTheme._timer = window.setTimeout(() => root.classList.remove('theme-transition'), 220);
  applyTheme(next);
}

/* ============================ Export helpers ============================ */
function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const rows = filteredTransactions();
  if (!rows.length) { toast('info', 'Nothing to export — no movements match the current filters.'); return; }

  const header = ['Date', 'Product', 'SKU', 'Movement type', 'Quantity', 'Balance after movement', 'Notes'];
  const lines = [header.map(csvCell).join(',')];
  for (const t of rows) {
    lines.push([
      t.date,
      t.productName,
      t.sku,
      t.type === 'in' ? 'Stock in' : 'Stock out',
      t.type === 'in' ? t.qty : -t.qty,
      t.balance,
      t.notes || '',
    ].map(csvCell).join(','));
  }
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  download(`thestock-movements-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('success', `Exported ${rows.length} movement${rows.length === 1 ? '' : 's'} to CSV.`);
}

function exportJson() {
  const payload = {
    app: 'thestock',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    products: state.products,
    transactions: state.transactions,
    settings: state.settings,
  };
  download(`thestock-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('success', 'Backup downloaded.');
}

async function importJsonFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('error', 'That file is too large (max 8 MB).'); return; }

  let text;
  try { text = await file.text(); }
  catch (err) { toast('error', 'Could not read that file.'); return; }

  let next;
  try {
    next = sanitizeState(JSON.parse(text));
  } catch (err) {
    toast('error', 'That file is not a valid thestock backup.');
    return;
  }

  if (!next.products.length && !next.transactions.length) {
    toast('error', 'The backup contains no products or movements.');
    return;
  }

  const ok = await confirmDialog({
    title: 'Restore from backup?',
    message: `This replaces your current data (${state.products.length} products, ${state.transactions.length} movements) with ${next.products.length} products and ${next.transactions.length} movements from the file. Consider exporting a backup first.`,
    okText: 'Restore',
  });
  if (!ok) return;

  state = next;
  saveState();
  renderDatalists();
  render();
  toast('success', `Restored ${next.products.length} products and ${next.transactions.length} movements.`);
}

/* ============================ Demo / clear ============================ */
async function resetDemo() {
  const ok = await confirmDialog({
    title: 'Reset to demo data?',
    message: 'This replaces all current products and movement history with the original sample catalogue. Export a backup first if you want to keep your data.',
    okText: 'Reset demo data',
  });
  if (!ok) return;

  state = buildDemoState();
  saveState();
  renderDatalists();
  render();
  toast('success', 'Demo data restored.');
}

async function clearAll() {
  const ok = await confirmDialog({
    title: 'Delete all data?',
    message: `This permanently removes ${state.products.length} products and ${state.transactions.length} movements from this browser. This cannot be undone.`,
    okText: 'Delete everything',
  });
  if (!ok) return;

  const reallySure = await confirmDialog({
    title: 'Are you absolutely sure?',
    message: 'There is no undo. Export a JSON backup first if you might need this data later.',
    okText: 'Yes, delete all data',
  });
  if (!reallySure) return;

  state = emptyState();
  state.settings.seeded = true;
  saveState();
  renderDatalists();
  render();
  toast('success', 'All data deleted.');
}

/* ============================ Event wiring ============================ */
function bindEvents() {
  /* --- Navigation (sidebar, brand, topbar, in-page buttons) --- */
  document.addEventListener('click', (event) => {
    const navTarget = event.target.closest('[data-view]');
    if (navTarget) {
      event.preventDefault();
      navigate(navTarget.dataset.view, { filter: navTarget.dataset.filter });
      return;
    }
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === 'add-product') openProductModal();
      if (action === 'export-csv') exportCsv();
      if (action === 'export-json') exportJson();
    }
  });

  /* --- Theme toggle --- */
  const themeBtn = $('#themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  // Sync button label + <meta theme-color> to the theme the head script chose
  // (without re-persisting, since nothing changed yet).
  applyTheme(currentTheme(), false);

  /* --- Mobile sidebar --- */
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#sidebarClose').addEventListener('click', closeSidebar);
  $('#sidebarScrim').addEventListener('click', closeSidebar);

  /* Reset the mobile drawer when the viewport grows back to the desktop
     layout (window resize, device rotation or zoom). Without this the drawer
     would stay in the "open" state while the scrim is no longer fixed, which
     pushed the main content down and left a large empty gap at the top. */
  const desktopQuery = window.matchMedia('(min-width: 1025px)');
  const handleDesktop = (e) => { if (e.matches) closeSidebar(); };
  if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', handleDesktop);
  else if (desktopQuery.addListener) desktopQuery.addListener(handleDesktop);

  /* --- Inventory toolbar --- */
  $('#addProductBtn').addEventListener('click', () => openProductModal());
  $('#invSearch').addEventListener('input', debounce((e) => {
    ui.inv.search = e.target.value;
    renderInventory();
  }, 160));
  $('#invCategory').addEventListener('change', (e) => { ui.inv.category = e.target.value; renderInventory(); });
  $('#invStatus').addEventListener('change', (e) => { ui.inv.status = e.target.value; renderInventory(); });
  $('#invSort').addEventListener('change', (e) => { ui.inv.sort = e.target.value; renderInventory(); });

  $('#invEmptyBtn').addEventListener('click', (e) => {
    if (e.currentTarget.dataset.mode === 'clear') {
      ui.inv = { search: '', category: '', status: '', sort: ui.inv.sort };
      $('#invSearch').value = '';
      $('#invCategory').value = '';
      $('#invStatus').value = '';
      renderInventory();
    } else {
      openProductModal();
    }
  });

  /* --- Inventory row actions (delegated) --- */
  $('#invBody').addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-act]');
    if (!btn) return;
    const row = btn.closest('tr');
    const product = productById(row?.dataset.id);
    if (!product) return;

    const act = btn.dataset.act;
    if (act === 'edit') { openProductModal(product); return; }

    if (act === 'in' || act === 'out') {
      ui.moveType = act;
      $$('.seg').forEach((s) => s.classList.toggle('is-active', s.dataset.type === act));
      navigate('movements', { focusProductId: product.id });
      renderMovements();
      updateMoveSubmit();
      $('#moveQty').focus();
      toast('info', `Recording stock ${act} for ${product.name}.`);
      return;
    }

    if (act === 'delete') {
      const history = transactionsFor(product.id).length;
      const ok = await confirmDialog({
        title: `Delete ${product.name}?`,
        message: history
          ? `This removes the product from inventory. Its ${history} movement record${history === 1 ? '' : 's'} will be kept in history for auditing, marked as a deleted product.`
          : 'This removes the product from inventory. This cannot be undone.',
        okText: 'Delete product',
      });
      if (!ok) return;
      deleteProduct(product.id);
      saveState();
      renderDatalists();
      render();
      toast('success', `${product.name} deleted.`);
    }
  });

  /* --- Movement form --- */
  $$('.seg').forEach((seg) => {
    seg.addEventListener('click', () => {
      ui.moveType = seg.dataset.type;
      $$('.seg').forEach((s) => s.classList.toggle('is-active', s === seg));
      updateMoveSubmit();
      clearFieldErrors($('#moveForm'));
    });
  });
  $('#moveProduct').addEventListener('change', () => {
    updateMoveProductHint();
    clearFieldErrors($('#moveForm'));
  });
  $('#moveForm').addEventListener('submit', handleMovementSubmit);
  $('#moveForm').addEventListener('reset', () => {
    setTimeout(() => {
      $('#moveDate').value = todayISO();
      ui.moveType = 'in';
      $$('.seg').forEach((s) => s.classList.toggle('is-active', s.dataset.type === 'in'));
      updateMoveSubmit();
      updateMoveProductHint();
      clearFieldErrors($('#moveForm'));
    }, 0);
  });
  $('#moveQty').addEventListener('input', () => {
    $('#moveQty').closest('.field').classList.remove('has-error');
    $('#moveQtyError').hidden = true;
  });

  /* --- Product modal --- */
  $('#productForm').addEventListener('submit', handleProductSubmit);
  $('#pSku').addEventListener('input', () => {
    $('#pSku').closest('.field').classList.remove('has-error');
    $('#pSkuError').hidden = true;
  });
  $('#pName').addEventListener('input', () => {
    $('#pName').closest('.field').classList.remove('has-error');
    $('#pNameError').hidden = true;
  });

  /* --- Modal close buttons --- */
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-close]')) return;
    const modal = event.target.closest('.modal');
    if (!modal) return;
    if (modal.id === 'confirmModal') settleConfirm(false);
    else closeModal(`#${modal.id}`);
  });

  $('#confirmOk').addEventListener('click', () => settleConfirm(true));
  $('#confirmCancel').addEventListener('click', () => settleConfirm(false));

  /* --- Reports toolbar --- */
  $('#repSearch').addEventListener('input', debounce((e) => { ui.rep.search = e.target.value; renderReports(); }, 160));
  $('#repType').addEventListener('change', (e) => { ui.rep.type = e.target.value; renderReports(); });
  $('#repFrom').addEventListener('change', (e) => { ui.rep.from = e.target.value; renderReports(); });
  $('#repTo').addEventListener('change', (e) => { ui.rep.to = e.target.value; renderReports(); });
  $('#repClear').addEventListener('click', () => {
    ui.rep = { search: '', type: '', from: '', to: '' };
    $('#repSearch').value = '';
    $('#repType').value = '';
    $('#repFrom').value = '';
    $('#repTo').value = '';
    renderReports();
  });
  $('#exportCsvBtn').addEventListener('click', exportCsv);

  /* --- Data view --- */
  $('#exportJsonBtn').addEventListener('click', exportJson);
  $('#importBtn').addEventListener('click', () => $('#importJsonInput').click());
  $('#importJsonInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    importJsonFile(file);
  });
  $('#resetDemoBtn').addEventListener('click', resetDemo);
  $('#clearAllBtn').addEventListener('click', clearAll);

  /* --- Keyboard --- */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#confirmModal').hidden) { settleConfirm(false); return; }
    if (!$('#productModal').hidden) { closeModal('#productModal'); return; }
    if ($('#sidebar').classList.contains('is-open')) closeSidebar();
  });

  /* --- Cross-tab sync --- */
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      state = sanitizeState(JSON.parse(event.newValue));
      renderDatalists();
      render();
      toast('info', 'Data refreshed from another tab.');
    } catch (_) { /* ignore malformed external writes */ }
  });
}

/* ============================ Boot ============================ */
function init() {
  const loaded = loadState();
  state = loaded.state;

  // Reconcile product.stock with transaction history. Opening stock is always
  // represented as a movement, so a product with stock but no history (e.g. an
  // older backup) gets a synthetic opening movement rather than losing stock.
  let reconciled = false;
  for (const p of state.products) {
    const history = transactionsFor(p.id);
    if (!history.length) {
      if (p.stock > 0) {
        state.transactions.push({
          id: uid('tx'), productId: p.id, sku: p.sku, productName: p.name,
          type: 'in', qty: p.stock, date: todayISO(), notes: 'Opening stock',
          balance: p.stock, kind: 'opening', createdAt: p.createdAt || Date.now(),
        });
        reconciled = true;
      }
      continue;
    }
    const derived = recomputeBalances(p.id);
    if (derived !== p.stock) { p.stock = derived; reconciled = true; }
  }
  if (reconciled) state.transactions.sort((a, b) => a.createdAt - b.createdAt);

  // Persist whenever the seed OR the reconciliation changed the data, so the
  // synthetic opening movements above are written back and never regenerated
  // (with a new id) on the next reload.
  if (loaded.firstRun || reconciled) saveState();

  ui.moveType = 'in';
  $('#moveDate').value = todayISO();
  $('#invSort').value = ui.inv.sort;

  bindEvents();
  renderDatalists();
  navigate('dashboard');
  render();

  if (loaded.recovered) {
    toast('error', 'Your saved data could not be read, so the demo catalogue was loaded. The unreadable data was preserved under a backup key.', 8000);
  } else if (loaded.firstRun) {
    toast('info', 'Welcome to thestock — sample data is loaded so you can explore. Reset or clear it any time from Backup & Data.', 7000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

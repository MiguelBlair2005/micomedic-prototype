/* MicoMedic prototype: in-memory + localStorage, seeded Jamaican pharmacy data */
'use strict';

const EXPIRY_WINDOW_DAYS = 60;
const JMD = n => 'J$' + Number(n).toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS = 86400000;

const seed = {
  users: [
    { userId: 1, username: 'owner', password: 'owner', role: 'owner' },
    { userId: 2, username: 'pharmacist', password: 'pharmacist', role: 'pharmacist' },
    { userId: 3, username: 'cashier', password: 'cashier', role: 'cashier' },
  ],
  suppliers: [
    { supplierId: 1, name: 'Ace Pharmaceutical Distributors', contact: 'Marcia Reid', phone: '876-555-0142' },
    { supplierId: 2, name: 'Caribbean Medical Wholesale', contact: 'Devon Clarke', phone: '876-555-0198' },
  ],
  drugs: [
    { drugId: 1, name: 'Paracetamol 500mg', form: 'tablet', strength: '500mg', reorderLevel: 40, price: 150, rx: false, supplierId: 1 },
    { drugId: 2, name: 'Amoxicillin 250mg', form: 'capsule', strength: '250mg', reorderLevel: 25, price: 800, rx: true, supplierId: 1 },
    { drugId: 3, name: 'Vitamin C 100mg', form: 'tablet', strength: '100mg', reorderLevel: 20, price: 300, rx: false, supplierId: 2 },
    { drugId: 4, name: 'ORS Sachet', form: 'sachet', strength: '-', reorderLevel: 30, price: 120, rx: false, supplierId: 2 },
    { drugId: 5, name: 'Metformin 500mg', form: 'tablet', strength: '500mg', reorderLevel: 30, price: 250, rx: true, supplierId: 1 },
    { drugId: 6, name: 'Chlo-Pheniramine Syrup', form: 'syrup', strength: '2mg/5ml', reorderLevel: 15, price: 950, rx: false, supplierId: 2 },
  ],
  batches: [
    { batchId: 1, drugId: 1, supplierId: 1, batchNo: 'P-118', qty: 240, expiry: addDays(400) },
    { batchId: 2, drugId: 2, supplierId: 1, batchNo: 'AX-2041', qty: 36, expiry: addDays(45) },   // expiry alert
    { batchId: 3, drugId: 2, supplierId: 1, batchNo: 'AX-1980', qty: 80, expiry: addDays(300) },
    { batchId: 4, drugId: 3, supplierId: 2, batchNo: 'C-077', qty: 18, expiry: addDays(100) },    // low stock
    { batchId: 5, drugId: 4, supplierId: 2, batchNo: 'O-311', qty: 410, expiry: addDays(700) },
    { batchId: 6, drugId: 5, supplierId: 1, batchNo: 'M-551', qty: 90, expiry: addDays(15) },     // expiry alert (severe)
    { batchId: 7, drugId: 6, supplierId: 2, batchNo: 'S-140', qty: 60, expiry: addDays(500) },
  ],
  sales: [
    // seeded history so reports/dashboard have content
    { saleId: 1, userId: 3, soldAt: todayAt(9, 14), receiptNo: 'RCT-0001', lines: [{ batchId: 1, qty: 4, price: 150 }, { batchId: 5, qty: 2, price: 120 }] },
    { saleId: 2, userId: 2, soldAt: todayAt(11, 2), receiptNo: 'RCT-0002', lines: [{ batchId: 3, qty: 1, price: 800 }] },
    { saleId: 3, userId: 3, soldAt: todayAt(13, 47), receiptNo: 'RCT-0003', lines: [{ batchId: 1, qty: 2, price: 150 }, { batchId: 4, qty: 1, price: 300 }] },
  ],
  orders: [],
  prescriptions: [],
};

function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function todayAt(h, min) { const d = new Date(); d.setHours(h, min, 0, 0); return d.toISOString(); }

let state = loadState();
function loadState() {
  try { const raw = localStorage.getItem('micomedic'); if (raw) return JSON.parse(raw); } catch (e) { /* fresh */ }
  return structuredClone(seed);
}
function save() { localStorage.setItem('micomedic', JSON.stringify(state)); }
function resetDemo() { localStorage.removeItem('micomedic'); state = structuredClone(seed); save(); }

let currentUser = null;
let cart = [];

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const fmtDate = iso => new Date(iso).toLocaleDateString('en-JM', { year: 'numeric', month: 'short', day: 'numeric' });
const daysUntil = iso => Math.ceil((new Date(iso) - new Date()) / DAYS);

/* ---------- auth ---------- */
$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const u = state.users.find(u => u.username === $('#in-user').value.trim() && u.password === $('#in-pass').value);
  if (!u) { alert('Invalid credentials'); return; }
  currentUser = u; cart = [];
  $('#view-login').classList.add('hidden');
  $('#view-app').classList.remove('hidden');
  $('#who').textContent = `${u.username} (${u.role})`;
  buildNav();
  showScreen(u.role === 'cashier' ? 'screen-pos' : 'screen-dashboard');
});
$('#btn-logout').addEventListener('click', () => { currentUser = null; $('#view-app').classList.add('hidden'); $('#view-login').classList.remove('hidden'); });

const NAV = [
  { id: 'screen-dashboard', label: 'Dashboard', roles: ['owner', 'pharmacist'] },
  { id: 'screen-pos', label: 'POS', roles: ['owner', 'pharmacist', 'cashier'] },
  { id: 'screen-inventory', label: 'Inventory', roles: ['owner', 'pharmacist'] },
  { id: 'screen-orders', label: 'Purchase Orders', roles: ['owner', 'pharmacist'] },
  { id: 'screen-reports', label: 'Reports', roles: ['owner'] },
  { id: 'screen-admin', label: 'Users', roles: ['owner'] },
];
function buildNav() {
  $('#nav').innerHTML = '';
  for (const item of NAV.filter(i => i.roles.includes(currentUser.role))) {
    const b = document.createElement('button');
    b.textContent = item.label; b.dataset.screen = item.id;
    b.addEventListener('click', () => showScreen(item.id));
    $('#nav').appendChild(b);
  }
}
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  render(id);
}

/* ---------- POS ---------- */
function fefoBatches(drugId) {
  return state.batches.filter(b => b.drugId === drugId && b.qty > 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
}
function drugById(id) { return state.drugs.find(d => d.drugId === id); }

$('#drug-search').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const ul = $('#search-results'); ul.innerHTML = '';
  if (q.length < 2) return;
  for (const d of state.drugs.filter(d => d.name.toLowerCase().includes(q)).slice(0, 6)) {
    const li = document.createElement('li');
    li.innerHTML = `${d.name} ${d.rx ? '<small>⚠ Rx</small>' : ''}<br><small>${JMD(d.price)} · ${drugStock(d.drugId)} in stock</small>`;
    li.addEventListener('click', () => { addToCart(d); e.target.value = ''; ul.innerHTML = ''; });
    ul.appendChild(li);
  }
});
function drugStock(drugId) { return state.batches.filter(b => b.drugId === drugId).reduce((s, b) => s + b.qty, 0); }
function addToCart(d) {
  const line = cart.find(l => l.drugId === d.drugId);
  if (line) line.qty += 1; else cart.push({ drugId: d.drugId, qty: 1, price: d.price });
  renderCart();
}
function renderCart() {
  const tbody = $('#cart-table tbody'); tbody.innerHTML = '';
  for (const l of cart) {
    const d = drugById(l.drugId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.name}</td><td><input type="number" min="1" value="${l.qty}" style="width:56px"></td><td>${JMD(l.price)}</td><td>${JMD(l.qty * l.price)}</td><td><button class="link">✕</button></td>`;
    tr.querySelector('input').addEventListener('change', e => { l.qty = Math.max(1, +e.target.value || 1); renderCart(); });
    tr.querySelector('button').addEventListener('click', () => { cart = cart.filter(x => x !== l); renderCart(); });
    tbody.appendChild(tr);
  }
  $('#cart-total').textContent = 'Total: ' + JMD(cart.reduce((s, l) => s + l.qty * l.price, 0));
  const hasRx = cart.some(l => drugById(l.drugId).rx);
  $('#rx-panel').classList.toggle('hidden', !hasRx);
}
$('#btn-complete-sale').addEventListener('click', () => {
  if (!cart.length) return;
  const rxLines = cart.filter(l => drugById(l.drugId).rx);
  if (rxLines.length && (!$('#rx-prescriber').value.trim() || !$('#rx-patient').value.trim())) {
    alert('Enter the prescriber and patient for prescription items.'); return;
  }
  // FEFO deduction with stock check
  for (const l of cart) {
    let need = l.qty, avail = drugStock(l.drugId);
    if (avail < need) { alert(`Not enough stock for ${drugById(l.drugId).name} (have ${avail})`); return; }
  }
  const sale = { saleId: nextId(state.sales, 'saleId'), userId: currentUser.userId, soldAt: new Date().toISOString(), receiptNo: 'RCT-' + String(Date.now()).slice(-6), lines: [] };
  let lineId = 1;
  for (const l of cart) {
    let need = l.qty;
    for (const b of fefoBatches(l.drugId)) {
      if (need <= 0) break;
      const take = Math.min(b.qty, need);
      b.qty -= take; need -= take;
      sale.lines.push({ saleLineId: lineId++, batchId: b.batchId, qty: take, price: l.price });
    }
  }
  sale.total = sale.lines.reduce((s, l) => s + l.qty * l.price, 0);
  if (rxLines.length) {
    const prescriber = $('#rx-prescriber').value.trim();
    const patient = $('#rx-patient').value.trim();
    for (const l of rxLines) {
      const saleLine = sale.lines.find(sl => drugById(state.batches.find(b => b.batchId === sl.batchId).drugId).drugId === l.drugId);
      state.prescriptions.push({ prescriptionId: nextId(state.prescriptions, 'prescriptionId'), saleLineId: saleLine.saleLineId, prescriber, patient, date: new Date().toISOString().slice(0, 10) });
    }
  }
  state.sales.push(sale); save();
  showReceipt(sale);
  cart = []; $('#rx-prescriber').value = ''; $('#rx-patient').value = ''; renderCart();
});
function nextId(arr, key) { return arr.length ? Math.max(...arr.map(x => x[key])) + 1 : 1; }
function showReceipt(sale) {
  const r = $('#receipt'); r.classList.remove('hidden');
  const lines = sale.lines.map(l => {
    const b = state.batches.find(b => b.batchId === l.batchId);
    let line = `${drugById(b.drugId).name}\n  batch ${b.batchNo}  ${l.qty} × ${JMD(l.price)}`;
    const rx = state.prescriptions.find(p => p.saleLineId === l.saleLineId);
    if (rx) line += `\n  Rx: ${rx.patient} / ${rx.prescriber}`;
    return line;
  }).join('\n');
  r.textContent = `MICOMEDIC PHARMACY\nKingston, Jamaica\nReceipt ${sale.receiptNo}\n${new Date(sale.soldAt).toLocaleString('en-JM')}\n------------------------\n${lines}\n------------------------\nTOTAL ${JMD(sale.total)}\nThank you!`;
}

/* ---------- Inventory & alerts ---------- */
function renderInventory() {
  const tbody = $('#inventory-table tbody'); tbody.innerHTML = '';
  let alerts = 0;
  for (const b of [...state.batches].sort((a, b) => a.expiry.localeCompare(b.expiry))) {
    const d = drugById(b.drugId); const du = daysUntil(b.expiry);
    const expiring = du <= EXPIRY_WINDOW_DAYS;
    const low = drugStock(d.drugId) <= d.reorderLevel;
    if (expiring || low) alerts++;
    const tr = document.createElement('tr');
    if (expiring) tr.className = 'expiry'; else if (low) tr.className = 'low';
    const status = expiring ? `<span class="status-pill s-expiry">Expires in ${du}d</span>` : low ? `<span class="status-pill s-low">Low stock</span>` : `<span class="status-pill s-ok">OK</span>`;
    tr.innerHTML = `<td>${d.name}</td><td>${b.batchNo}</td><td>${fmtDate(b.expiry)}</td><td>${b.qty}</td><td>${d.reorderLevel}</td><td>${status}</td>`;
    tbody.appendChild(tr);
  }
  $('#alert-count').textContent = alerts ? `${alerts} alert${alerts > 1 ? 's' : ''}` : '';
  return alerts;
}

/* ---------- Purchase orders ---------- */
function renderOrders() {
  const sel = $('#po-supplier');
  if (!sel.options.length) for (const s of state.suppliers) sel.add(new Option(s.name, s.supplierId));
  $('#po-lines').innerHTML = '';
  addPoLine();
  const tbody = $('#po-table tbody'); tbody.innerHTML = '';
  for (const o of state.orders) {
    const tr = document.createElement('tr');
    const action = o.status === 'received' ? 'received' : `<button class="link receive-po" data-id="${o.purchaseOrderId}">Receive delivery</button>`;
    tr.innerHTML = `<td>#${o.purchaseOrderId}</td><td>${state.suppliers.find(s => s.supplierId === +o.supplierId)?.name ?? o.supplierId}</td><td>${o.lines.length}</td><td>${o.status}</td><td>${fmtDate(o.createdAt)}</td><td>${action}</td>`;
    tbody.appendChild(tr);
  }
  $$('.receive-po').forEach(btn => btn.addEventListener('click', () => receiveDelivery(+btn.dataset.id)));
}
function receiveDelivery(id) {
  const o = state.orders.find(x => x.purchaseOrderId === id);
  if (!o || o.status === 'received') return;
  const batchNo = prompt('Batch number for this delivery');
  if (!batchNo) return;
  const expiry = prompt('Expiry date (YYYY-MM-DD)');
  if (!expiry || Number.isNaN(Date.parse(expiry))) { alert('Enter a valid expiry date.'); return; }
  for (const [i, line] of o.lines.entries()) {
    state.batches.push({ batchId: nextId(state.batches, 'batchId'), drugId: line.drugId, supplierId: o.supplierId, batchNo: `${batchNo}-${i + 1}`, qty: line.qty, expiry, receivedAt: new Date().toISOString() });
  }
  o.status = 'received'; save(); renderOrders();
  alert('Delivery received. Batches added to inventory.');
}
function addPoLine() {
  const div = document.createElement('div'); div.className = 'po-line';
  div.innerHTML = `<select class="po-drug">${state.drugs.map(d => `<option value="${d.drugId}">${d.name}</option>`).join('')}</select><input type="number" class="po-qty" min="1" value="20" style="width:70px">`;
  $('#po-lines').appendChild(div);
}
$('#po-add-line').addEventListener('click', addPoLine);
$('#po-send').addEventListener('click', () => {
  const lines = $$('.po-line').map(l => ({ drugId: +l.querySelector('.po-drug').value, qty: +l.querySelector('.po-qty').value })).filter(l => l.qty > 0);
  if (!lines.length) return;
  state.orders.push({ purchaseOrderId: nextId(state.orders, 'purchaseOrderId'), supplierId: +$('#po-supplier').value, createdBy: currentUser.userId, createdAt: new Date().toISOString(), status: 'sent', lines });
  save(); renderOrders(); alert('Purchase order sent.');
});

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const today = new Date().toDateString();
  const todaySales = state.sales.filter(s => new Date(s.soldAt).toDateString() === today);
  $('#d-sales').textContent = JMD(todaySales.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.qty * l.price, 0), 0));
  $('#d-count').textContent = todaySales.length;
  $('#d-low').textContent = state.drugs.filter(d => drugStock(d.drugId) <= d.reorderLevel).length;
  $('#d-val').textContent = JMD(state.batches.reduce((s, b) => s + b.qty * drugById(b.drugId).price, 0));
  const ul = $('#d-alerts'); ul.innerHTML = '';
  for (const b of state.batches) {
    const d = drugById(b.drugId); const du = daysUntil(b.expiry);
    if (du <= EXPIRY_WINDOW_DAYS) { const li = document.createElement('li'); li.textContent = `${d.name}, batch ${b.batchNo} expires in ${du} days (${b.qty} units)`; ul.appendChild(li); }
  }
  for (const d of state.drugs) if (drugStock(d.drugId) <= d.reorderLevel) { const li = document.createElement('li'); li.textContent = `${d.name}: ${drugStock(d.drugId)} left (reorder at ${d.reorderLevel})`; ul.appendChild(li); }
  if (!ul.children.length) ul.innerHTML = '<li>No alerts. Stock healthy.</li>';
}

/* ---------- Reports ---------- */
$('.report-tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  $$('.report-tabs .tab').forEach(t => t.classList.toggle('active', t === b));
  renderReport(b.dataset.r);
});
function renderReport(kind) {
  const out = $('#report-out');
  if (kind === 'daily') {
    const today = new Date().toDateString();
    const rows = state.sales.filter(s => new Date(s.soldAt).toDateString() === today)
      .map(s => `<tr><td>${s.receiptNo}</td><td>${new Date(s.soldAt).toLocaleTimeString('en-JM')}</td><td>${s.lines.reduce((a, l) => a + l.qty, 0)} items</td><td>${JMD(s.lines.reduce((a, l) => a + l.qty * l.price, 0))}</td></tr>`).join('');
    out.innerHTML = `<table><thead><tr><th>Receipt</th><th>Time</th><th>Items</th><th>Total</th></tr></thead><tbody>${rows || '<tr><td colspan=4>No sales yet today.</td></tr>'}</tbody></table>`;
  } else if (kind === 'expiry') {
    const rows = [...state.batches].sort((a, b) => a.expiry.localeCompare(b.expiry))
      .map(b => `<tr class="${daysUntil(b.expiry) <= EXPIRY_WINDOW_DAYS ? 'expiry' : ''}"><td>${drugById(b.drugId).name}</td><td>${b.batchNo}</td><td>${fmtDate(b.expiry)}</td><td>${daysUntil(b.expiry)}d</td><td>${b.qty}</td></tr>`).join('');
    out.innerHTML = `<table><thead><tr><th>Drug</th><th>Batch</th><th>Expiry</th><th>In</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (kind === 'valuation') {
    const rows = state.drugs.map(d => {
      const qty = drugStock(d.drugId);
      return `<tr><td>${d.name}</td><td>${qty}</td><td>${JMD(d.price)}</td><td>${JMD(qty * d.price)}</td></tr>`;
    }).join('');
    const total = state.batches.reduce((s, b) => s + b.qty * drugById(b.drugId).price, 0);
    out.innerHTML = `<table><thead><tr><th>Drug</th><th>Qty</th><th>Unit</th><th>Value</th></tr></thead><tbody>${rows}<tr><th colspan="3">Total</th><th>${JMD(total)}</th></tr></tbody></table>`;
  } else if (kind === 'reorder') {
    const rows = state.drugs.filter(d => drugStock(d.drugId) <= d.reorderLevel)
      .map(d => `<tr><td>${d.name}</td><td>${drugStock(d.drugId)}</td><td>${d.reorderLevel}</td><td>${state.suppliers.find(s => s.supplierId === d.supplierId)?.name}</td></tr>`).join('');
    out.innerHTML = `<table><thead><tr><th>Drug</th><th>On hand</th><th>Reorder at</th><th>Supplier</th></tr></thead><tbody>${rows || '<tr><td colspan=4>Nothing below reorder level.</td></tr>'}</tbody></table>`;
  } else if (kind === 'rx') {
    const rows = state.prescriptions.map(p => {
      const rx = state.sales.flatMap(s => s.lines).find(l => l.saleLineId === p.saleLineId);
      const b = rx && state.batches.find(b => b.batchId === rx.batchId);
      const name = b ? drugById(b.drugId).name : 'Sale line';
      return `<tr><td>${p.date}</td><td>${name}</td><td>${p.patient}</td><td>${p.prescriber}</td></tr>`;
    }).join('');
    out.innerHTML = `<table><thead><tr><th>Date</th><th>Drug</th><th>Patient</th><th>Prescriber</th></tr></thead><tbody>${rows || '<tr><td colspan=4>No prescriptions captured yet.</td></tr>'}</tbody></table>`;
  }
}

/* ---------- Admin ---------- */
function renderAdmin() {
  $('#admin-users').innerHTML = `<table><thead><tr><th>Username</th><th>Role</th></tr></thead><tbody>${state.users.map(u => `<tr><td>${u.username}</td><td>${u.role}</td></tr>`).join('')}</tbody></table>`;
}
$('#admin-add').addEventListener('submit', e => {
  e.preventDefault();
  const username = $('#adm-user').value.trim(); if (!username) return;
  state.users.push({ userId: nextId(state.users, 'userId'), username, password: username, role: $('#adm-role').value });
  save(); renderAdmin(); e.target.reset();
});

/* ---------- render dispatch ---------- */
function render(id) {
  if (id === 'screen-inventory') renderInventory();
  else if (id === 'screen-orders') renderOrders();
  else if (id === 'screen-dashboard') renderDashboard();
  else if (id === 'screen-reports') renderReport($('.report-tabs .tab.active').dataset.r);
  else if (id === 'screen-admin') renderAdmin();
  else if (id === 'screen-pos') { renderCart(); $('#receipt').classList.add('hidden'); }
}
window.resetDemo = resetDemo;

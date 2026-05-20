// Escape Velocity — App v7 (mobile, localStorage)
const API_BASE = 'https://exorcism-private-exception.ngrok-free.dev';
const HEADERS  = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

const STORAGE_KEY = 'ev_profile_v1';
const RESULT_KEY  = 'ev_result_v1';

// ── Presets ────────────────────────────────────────────────────────
const INVEST_PRESETS = [
  { id: 'bank_savings',  label: 'Bank Savings Account',         annualReturn: 0.015, type: 'savings'    },
  { id: 'fixed_deposit', label: 'Fixed Deposit (1 yr)',         annualReturn: 0.025, type: 'savings'    },
  { id: 'gov_bond',      label: 'Government Savings Bond',      annualReturn: 0.030, type: 'bond'       },
  { id: 'money_market',  label: 'Money Market Fund',            annualReturn: 0.020, type: 'fund'       },
  { id: 'set50_index',   label: 'SET50 Index Fund',             annualReturn: 0.070, type: 'index_fund' },
  { id: 'sp500_index',   label: 'S&P500 Index Fund',            annualReturn: 0.070, type: 'index_fund' },
  { id: 'ssf',           label: 'SSF (Super Savings Fund)',     annualReturn: 0.055, type: 'index_fund' },
  { id: 'rmf',           label: 'RMF (Retirement Mutual Fund)', annualReturn: 0.055, type: 'fund'       },
];

const DEBT_TYPES = [
  { value: 'credit_card',  label: 'Credit Card'           },
  { value: 'car_loan',     label: 'Car Loan'              },
  { value: 'mortgage',     label: 'Mortgage'              },
  { value: 'student_loan', label: 'Student Loan'          },
  { value: 'informal',     label: 'หนี้นอกระบบ (Informal)' },
  { value: 'other',        label: 'Other'                 },
];

// Rate interval: what the user types, how often it applies
const RATE_INTERVALS = [
  { value: 'year',  label: '% / year',  perYear: 1   },
  { value: 'month', label: '% / month', perYear: 12  },
  { value: 'week',  label: '% / week',  perYear: 52  },
  { value: 'day',   label: '% / day',   perYear: 365 },
];

// Convert user-entered rate to annual decimal for the optimizer
function toAnnualDecimal(rateValue, interval) {
  const multiplier = RATE_INTERVALS.find(r => r.value === interval)?.perYear ?? 1;
  return (rateValue / 100) * multiplier;
}

// Reverse: given annual decimal, show equivalent in chosen interval
function fromAnnualDecimal(annualDecimal, interval) {
  const multiplier = RATE_INTERVALS.find(r => r.value === interval)?.perYear ?? 1;
  return (annualDecimal * 100) / multiplier;
}

function updateAprHint(id) {
  const val      = parseFloat(qs(`d-rate-${id}`)?.value) || 0;
  const interval = qs(`d-interval-${id}`)?.value || 'year';
  const hint     = qs(`d-apr-${id}`);
  if (!hint) return;
  if (val > 0 && interval !== 'year') {
    const apr = toAnnualDecimal(val, interval) * 100;
    hint.textContent = `= ${apr.toLocaleString(undefined, {maximumFractionDigits: 1})}% APR`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

// Same logic for investments
const INVEST_INTERVALS = [
  { value: 'year',  label: '% p.a.',   perYear: 1   },
  { value: 'month', label: '% / month', perYear: 12  },
  { value: 'week',  label: '% / week',  perYear: 52  },
  { value: 'day',   label: '% / day',   perYear: 365 },
];

function updateInvestHint(presetId) {
  const val      = parseFloat(qs(`inv-rate-val-${presetId}`)?.value) || 0;
  const interval = qs(`inv-rate-int-${presetId}`)?.value || 'year';
  const hint     = qs(`inv-rate-hint-${presetId}`);
  if (!hint) return;
  const perYear  = INVEST_INTERVALS.find(r => r.value === interval)?.perYear ?? 1;
  const apr      = (val / 100) * perYear * 100;
  if (val > 0 && interval !== 'year') {
    hint.textContent = `= ${apr.toLocaleString(undefined, {maximumFractionDigits: 2})}% p.a.`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

const TYPE_LABELS = {
  credit_card: 'Credit Card', car_loan: 'Car Loan', mortgage: 'Mortgage',
  student_loan: 'Student Loan', informal: 'หนี้นอกระบบ', other: 'Other',
};

// ── State ──────────────────────────────────────────────────────────
let debtCount    = 0;
let expCount     = 0;
let currentMode  = 'pure';
let lastResult   = null;
let lastRefi     = null;

// (no wizard state needed)

// ── Storage ────────────────────────────────────────────────────────
function loadProfile() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveProfile(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}
function loadResult() {
  try { return JSON.parse(localStorage.getItem(RESULT_KEY)); } catch { return null; }
}
function saveResult(r) {
  localStorage.setItem(RESULT_KEY, JSON.stringify(r));
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt   = n  => '฿' + Math.round(n).toLocaleString();
const fmtMo = n  => n === 1 ? '1 month' : `${n} months`;
const qs    = id => document.getElementById(id);

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  qs(id)?.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════
// SETUP — just name + occupation
// ═══════════════════════════════════════════════════════════════════
function startSetup() {
  goTo('screen-setup');
  // Focus name field after transition
  setTimeout(() => qs('su-name')?.focus(), 100);
}

function completeSetup() {
  const name       = qs('su-name')?.value.trim()       || 'Pilot';
  const occupation = qs('su-occupation')?.value.trim() || '';

  const profile = {
    name, occupation,
    debts: [], income: 0, initialCash: 0, expenses: [],
    investments: [], mode: 'pure',
    emergencyFund: { monthlyContrib: 0, target: 0 },
  };
  saveProfile(profile);
  initHome(profile);
  goTo('screen-home');
  // Open the debts section so they know where to start
  toggleSection('debts');
}

// ═══════════════════════════════════════════════════════════════════
// HOME APP
// ═══════════════════════════════════════════════════════════════════
function initHome(profile) {
  buildInvestList();
  populateProfileForm(profile);
  refreshHero();
  refreshSubs();
}

function switchTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  qs(`tab-${tab}`)?.classList.add('active');
  qs(`nav-${tab}`)?.classList.add('active');

  // Update FAB label
  const fab = qs('fab');
  if (tab === 'roadmap') {
    qs('fab-label').textContent = 'Recalculate';
    qs('fab-icon').textContent  = '↺';
  } else {
    qs('fab-label').textContent = 'Save & Calculate';
    qs('fab-icon').textContent  = '💾';
  }
}

// Populate home form from a saved profile object
function populateProfileForm(profile) {
  if (!profile) return;
  // Name/occupation live only in the hero — no form fields for them here

  // Clear existing cards
  debtCount = 0; expCount = 0;
  qs('debt-cards').innerHTML  = '';
  qs('expense-list').innerHTML = '';

  // Debts
  (profile.debts || []).forEach(d => {
    debtCount++;
    const id   = debtCount;
    const card = document.createElement('div');
    card.className = 'debt-card' + (d.type === 'informal' ? ' informal-debt' : '');
    card.id = `debt-card-${id}`;
    card.innerHTML = debtCardHTML(id, d);
    qs('debt-cards').appendChild(card);
    // Show APR hint if non-annual
    updateAprHint(id);
  });

  // Income
  if (qs('income'))       qs('income').value       = profile.income       || '';
  if (qs('initial-cash')) qs('initial-cash').value = profile.initialCash  || '';

  // Expenses
  (profile.expenses || []).forEach(e => {
    expCount++;
    const id  = expCount;
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.id = `exp-row-${id}`;
    row.innerHTML = `
      <input type="text"   id="exp-name-${id}" value="${escHtml(e.name)}"   placeholder="e.g. Rent">
      <input type="number" id="exp-amt-${id}"  value="${e.amount}" placeholder="฿" min="0">
      <label class="cut-label"><input type="checkbox" id="exp-cut-${id}" ${e.cuttable?'checked':''}> Can cut</label>
      <button class="btn-danger-sm" onclick="removeExpense(${id})">✕</button>
    `;
    qs('expense-list').appendChild(row);
  });

  // Mode
  currentMode = profile.mode || 'pure';
  qs('mode-pure-btn')?.classList.toggle('active', currentMode === 'pure');
  qs('mode-risk-btn')?.classList.toggle('active', currentMode === 'risk_adjusted');
  if (qs('ef-fields')) qs('ef-fields').style.display = currentMode === 'risk_adjusted' ? 'block' : 'none';
  if (profile.emergencyFund) {
    if (qs('ef-contrib')) qs('ef-contrib').value = profile.emergencyFund.monthlyContrib || '';
    if (qs('ef-target'))  qs('ef-target').value  = profile.emergencyFund.target         || '';
  }

  // Investments — restore toggle, balance, and any rate override
  (profile.investments || []).forEach(inv => {
    const chk      = qs(`inv-chk-${inv.id}`);
    const bal      = qs(`inv-bal-${inv.id}`);
    const override = qs(`inv-override-${inv.id}`);
    if (!chk) return;
    chk.checked = true;
    if (bal)      { bal.style.display = 'block'; bal.value = inv.existingBalance || ''; }
    if (override) override.style.display = 'block';
    if (inv.rateValue > 0) {
      const rateValInp = qs(`inv-rate-val-${inv.id}`);
      const rateIntSel = qs(`inv-rate-int-${inv.id}`);
      if (rateValInp) rateValInp.value = inv.rateValue;
      if (rateIntSel) rateIntSel.value = inv.rateInterval || 'year';
      onInvestRateChange(inv.id);
    }
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ── Debt management ────────────────────────────────────────────────
function debtCardHTML(id, d = {}) {
  const typeOpts     = DEBT_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === (d.type||'credit_card') ? 'selected' : ''}>${t.label}</option>`
  ).join('');
  const intervalOpts = RATE_INTERVALS.map(r =>
    `<option value="${r.value}" ${r.value === (d.rateInterval||'year') ? 'selected' : ''}>${r.label}</option>`
  ).join('');
  const informal = d.type === 'informal';
  return `
    <div class="debt-card-hdr">
      <span class="debt-card-num">Debt #${id}</span>
      <button class="btn-danger-sm" onclick="removeDebt(${id})">Remove</button>
    </div>
    <div class="informal-warning">⚠ หนี้นอกระบบ — priority override. Paid first.</div>
    <div class="field-group">
      <label>Debt name</label>
      <input type="text" id="d-name-${id}" value="${escHtml(d.name||'')}" placeholder="e.g. KBank Credit Card">
    </div>
    <div class="field-group">
      <label>Balance (฿)</label>
      <input type="number" id="d-bal-${id}" value="${d.balance||''}" placeholder="50000" min="0" oninput="refreshHero()">
    </div>
    <div class="field-group">
      <label>Interest Rate</label>
      <div class="rate-group">
        <input type="number" id="d-rate-${id}" value="${d.rateValue||''}" placeholder="28" min="0" step="0.01"
               oninput="updateAprHint(${id})">
        <select id="d-interval-${id}" onchange="updateAprHint(${id})">${intervalOpts}</select>
      </div>
      <span class="apr-hint" id="d-apr-${id}"></span>
    </div>
    <div class="field-row-2">
      <div class="field-group">
        <label>Min payment (฿/mo)</label>
        <input type="number" id="d-min-${id}" value="${d.minPayment||''}" placeholder="1500" min="0">
      </div>
      <div class="field-group">
        <label>Type</label>
        <select id="d-type-${id}" onchange="onDebtType(${id})">${typeOpts}</select>
      </div>
    </div>
  `;
}

function addDebt() {
  debtCount++;
  const id   = debtCount;
  const card = document.createElement('div');
  card.className = 'debt-card';
  card.id = `debt-card-${id}`;
  card.innerHTML = debtCardHTML(id);
  qs('debt-cards').appendChild(card);
  refreshHero();
}

function removeDebt(id) { qs(`debt-card-${id}`)?.remove(); refreshHero(); }

function onDebtType(id) {
  const type = qs(`d-type-${id}`)?.value;
  qs(`debt-card-${id}`)?.classList.toggle('informal-debt', type === 'informal');
}

// ── Expense management ─────────────────────────────────────────────
function addExpense() {
  expCount++;
  const id  = expCount;
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.id = `exp-row-${id}`;
  row.innerHTML = `
    <input type="text"   id="exp-name-${id}" placeholder="e.g. Rent">
    <input type="number" id="exp-amt-${id}"  placeholder="฿" min="0">
    <label class="cut-label"><input type="checkbox" id="exp-cut-${id}"> Can cut</label>
    <button class="btn-danger-sm" onclick="removeExpense(${id})">✕</button>
  `;
  qs('expense-list').appendChild(row);
}

function removeExpense(id) { qs(`exp-row-${id}`)?.remove(); }

// ── Investments ────────────────────────────────────────────────────
function buildInvestList() {
  const list = qs('invest-list');
  if (!list) return;
  list.innerHTML = '';
  INVEST_PRESETS.forEach(p => {
    const intervalOpts = INVEST_INTERVALS.map(r =>
      `<option value="${r.value}" ${r.value==='year'?'selected':''}>${r.label}</option>`
    ).join('');
    const row = document.createElement('div');
    row.className = 'invest-row';
    row.innerHTML = `
      <div class="invest-info">
        <div class="invest-name">${p.label}</div>
        <div class="invest-rate" id="inv-rate-display-${p.id}">+${(p.annualReturn*100).toFixed(1)}% p.a.</div>
      </div>
      <div class="invest-toggle">
        <input type="number" class="invest-bal-input" id="inv-bal-${p.id}" placeholder="฿ existing" min="0">
        <label class="toggle-sw">
          <input type="checkbox" id="inv-chk-${p.id}" onchange="onInvestToggle('${p.id}')">
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="invest-rate-override" id="inv-override-${p.id}" style="display:none;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Override rate (optional)</div>
        <div class="rate-group">
          <input type="number" id="inv-rate-val-${p.id}" placeholder="${(p.annualReturn*100).toFixed(1)}"
                 min="0" step="0.01" oninput="onInvestRateChange('${p.id}')">
          <select id="inv-rate-int-${p.id}" onchange="onInvestRateChange('${p.id}')">${intervalOpts}</select>
        </div>
        <span class="apr-hint" id="inv-rate-hint-${p.id}"></span>
      </div>
    `;
    list.appendChild(row);
  });
}

function onInvestToggle(id) {
  const on       = qs(`inv-chk-${id}`)?.checked;
  const balInp   = qs(`inv-bal-${id}`);
  const override = qs(`inv-override-${id}`);
  if (balInp)   balInp.style.display   = on ? 'block' : 'none';
  if (override) override.style.display = on ? 'block' : 'none';
  refreshSubs();
}

function onInvestRateChange(id) {
  updateInvestHint(id);
  // Update the displayed rate line
  const val      = parseFloat(qs(`inv-rate-val-${id}`)?.value);
  const interval = qs(`inv-rate-int-${id}`)?.value || 'year';
  const display  = qs(`inv-rate-display-${id}`);
  if (!display) return;
  const preset   = INVEST_PRESETS.find(p => p.id === id);
  if (val > 0) {
    const perYear  = INVEST_INTERVALS.find(r => r.value === interval)?.perYear ?? 1;
    const apr      = (val / 100) * perYear * 100;
    display.textContent = `+${apr.toFixed(2)}% p.a. (custom)`;
    display.style.color = 'var(--primary)';
  } else {
    display.textContent = `+${(preset?.annualReturn*100||0).toFixed(1)}% p.a.`;
    display.style.color = '';
  }
}

// ── Mode ───────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  qs('mode-pure-btn')?.classList.toggle('active', mode === 'pure');
  qs('mode-risk-btn')?.classList.toggle('active', mode === 'risk_adjusted');
  if (qs('ef-fields')) qs('ef-fields').style.display = mode === 'risk_adjusted' ? 'block' : 'none';
  if (qs('sub-mode')) qs('sub-mode').textContent = mode === 'pure' ? 'Pure Optimizer' : 'Risk-Adjusted';
}

// ── Section accordions ────────────────────────────────────────────
function toggleSection(name) {
  const card  = qs(`sec-${name}`);
  const chev  = qs(`chev-${name}`);
  if (!card) return;
  card.classList.toggle('open');
}

// ── Profile hero & section subtitles ─────────────────────────────
function refreshHero() {
  let total = 0;
  document.querySelectorAll('[id^="d-bal-"]').forEach(inp => {
    total += parseFloat(inp.value) || 0;
  });
  if (qs('hero-total')) qs('hero-total').textContent = fmt(total);

  // Name line from saved profile
  const profile = loadProfile();
  const nameEl  = qs('hero-name');
  if (nameEl && profile?.name) {
    nameEl.textContent = profile.occupation
      ? `${profile.name} · ${profile.occupation}`
      : profile.name;
  }

  const debtCount_ = document.querySelectorAll('.debt-card').length;
  const income_    = parseFloat(qs('income')?.value) || 0;
  const chips      = qs('hero-chips');
  if (chips) {
    chips.innerHTML = [
      debtCount_ > 0 ? `<span class="hero-chip">${debtCount_} debt${debtCount_>1?'s':''}</span>` : '',
      income_ > 0    ? `<span class="hero-chip">${fmt(income_)}/mo</span>` : '',
    ].join('');
  }
}

function refreshSubs() {
  // Debts sub
  const dCount = document.querySelectorAll('.debt-card').length;
  let totalBal = 0;
  document.querySelectorAll('[id^="d-bal-"]').forEach(i => totalBal += parseFloat(i.value)||0);
  if (qs('sub-debts')) qs('sub-debts').textContent = dCount ? `${dCount} debt${dCount>1?'s':''} · ${fmt(totalBal)} total` : 'No debts added';

  // Income sub
  const inc = parseFloat(qs('income')?.value) || 0;
  if (qs('sub-income')) qs('sub-income').textContent = inc ? `${fmt(inc)}/mo` : 'Not set';

  // Expenses sub
  let totalExp = 0;
  document.querySelectorAll('[id^="exp-amt-"]').forEach(i => totalExp += parseFloat(i.value)||0);
  const eCount = document.querySelectorAll('.expense-row').length;
  if (qs('sub-expenses')) qs('sub-expenses').textContent = eCount ? `${eCount} item${eCount>1?'s':''} · ${fmt(totalExp)}/mo` : 'None added';

  // Invest sub
  const active = INVEST_PRESETS.filter(p => qs(`inv-chk-${p.id}`)?.checked).map(p => p.label.split(' ')[0]);
  if (qs('sub-invest')) qs('sub-invest').textContent = active.length ? active.slice(0,2).join(', ') + (active.length>2 ? ` +${active.length-2}` : '') : 'None selected';

  // Mode sub
  if (qs('sub-mode')) qs('sub-mode').textContent = currentMode === 'pure' ? 'Pure Optimizer' : 'Risk-Adjusted';
}

// ── Collect profile from form ──────────────────────────────────────
function collectProfile() {
  const debts = [];
  document.querySelectorAll('.debt-card').forEach(card => {
    const m = card.id.match(/debt-card-(\d+)/);
    if (!m) return;
    const id       = m[1];
    const bal      = parseFloat(qs(`d-bal-${id}`)?.value) || 0;
    if (!bal) return;
    const rateValue    = parseFloat(qs(`d-rate-${id}`)?.value) || 0;
    const rateInterval = qs(`d-interval-${id}`)?.value || 'year';
    debts.push({
      name:         qs(`d-name-${id}`)?.value.trim() || `Debt ${id}`,
      balance:      bal,
      // Store original for display; convert to annual decimal for optimizer
      rateValue,
      rateInterval,
      interestRate: toAnnualDecimal(rateValue, rateInterval),
      minPayment:   parseFloat(qs(`d-min-${id}`)?.value) || 0,
      type:         qs(`d-type-${id}`)?.value || 'other',
    });
  });

  const expenses = [];
  document.querySelectorAll('.expense-row').forEach(row => {
    const m = row.id.match(/exp-row-(\d+)/);
    if (!m) return;
    const id  = m[1];
    const amt = parseFloat(qs(`exp-amt-${id}`)?.value) || 0;
    if (!amt) return;
    expenses.push({
      name:     qs(`exp-name-${id}`)?.value.trim() || `Expense ${id}`,
      amount:   amt,
      cuttable: qs(`exp-cut-${id}`)?.checked || false,
    });
  });

  const investments = INVEST_PRESETS
    .filter(p => qs(`inv-chk-${p.id}`)?.checked)
    .map(p => {
      const existingBalance  = parseFloat(qs(`inv-bal-${p.id}`)?.value) || 0;
      const customRateVal    = parseFloat(qs(`inv-rate-val-${p.id}`)?.value);
      const customInterval   = qs(`inv-rate-int-${p.id}`)?.value || 'year';
      const annualReturn     = (customRateVal > 0)
        ? toAnnualDecimal(customRateVal, customInterval)
        : p.annualReturn;
      return { ...p, annualReturn, existingBalance,
               rateValue: customRateVal || null, rateInterval: customInterval };
    });

  const existing = loadProfile() || {};
  return {
    name:        existing.name       || 'Pilot',
    occupation:  existing.occupation || '',
    debts,
    income:      parseFloat(qs('income')?.value)       || 0,
    initialCash: parseFloat(qs('initial-cash')?.value) || 0,
    expenses,
    investments,
    mode: currentMode,
    emergencyFund: {
      monthlyContrib: parseFloat(qs('ef-contrib')?.value) || 0,
      target:         parseFloat(qs('ef-target')?.value)  || 0,
    },
  };
}

// ── Save & Recalculate ────────────────────────────────────────────
async function saveAndRecalculate() {
  const profile = collectProfile();
  if (!profile.debts.length) {
    toggleSection('debts');
    alert('Add at least one debt with a balance first.');
    return;
  }
  saveProfile(profile);
  refreshHero();
  refreshSubs();
  await runOptimizer(profile);
}

// ═══════════════════════════════════════════════════════════════════
// API CALL
// ═══════════════════════════════════════════════════════════════════
async function runOptimizer(profile) {
  switchTab('roadmap');

  const roadmapLoading = qs('roadmap-loading');
  const roadmapContent = qs('roadmap-content');
  const roadmapEmpty   = qs('roadmap-empty');

  roadmapEmpty.style.display   = 'none';
  roadmapContent.style.display = 'none';
  roadmapLoading.style.display = 'flex';

  const fab = qs('fab');
  fab.classList.add('loading');

  const payload = {
    debts:        profile.debts,
    income:       profile.income,
    expenses:     profile.expenses,
    investments:  profile.investments,
    applyCuts:    true,
    mode:         profile.mode,
    emergencyFund: profile.emergencyFund,
    initialCash:  profile.initialCash,
  };

  try {
    const res = await fetch(`${API_BASE}/api/optimize`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const result = await res.json();
    lastResult = result;
    lastRefi   = null;

    // Informal debt → second call for refi comparison
    const informalDebt = result.prioritizedDebts?.find(d => d.type === 'informal');
    if (informalDebt) {
      try {
        const refiDebts = payload.debts.map(d =>
          d.type === 'informal' ? { ...d, type: 'credit_card', interestRate: 0.25 } : d
        );
        const r2 = await fetch(`${API_BASE}/api/optimize`, {
          method: 'POST', headers: HEADERS, body: JSON.stringify({ ...payload, debts: refiDebts }),
        });
        if (r2.ok) lastRefi = await r2.json();
      } catch (_) {}
    }

    saveResult(result);
    renderRoadmap(result, lastRefi);

  } catch (err) {
    roadmapLoading.innerHTML = `
      <div style="text-align:center">
        <p style="color:var(--danger);font-weight:600;font-size:15px">⚠ API unreachable</p>
        <p style="color:var(--muted);font-size:13px;margin-top:6px">${err.message}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:4px">Is the API server running?</p>
      </div>
    `;
    fab.classList.remove('loading');
    return;
  }

  roadmapLoading.style.display = 'none';
  roadmapContent.style.display = 'block';
  fab.classList.remove('loading');
}

// ═══════════════════════════════════════════════════════════════════
// RENDER ROADMAP
// ═══════════════════════════════════════════════════════════════════
function renderRoadmap(result, refiResult) {
  renderRefinancingAlert(result, refiResult);
  renderStatGrid(result);
  createTrajectoryChart(result.months, result.prioritizedDebts, result.investments || []);
  renderPriorityTable(result.prioritizedDebts);
  renderCutsCard(result.recommendedCuts);
  renderMissionControl(result);
  renderMonthlyRoadmap(result);
  renderEscapeMessage(result);
}

function renderRefinancingAlert(result, refiResult) {
  const el = qs('refinancing-alert');
  if (!refiResult) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const saved   = result.totalInterestPaid - refiResult.totalInterestPaid;
  const moSaved = result.escapeMonth       - refiResult.escapeMonth;
  qs('refi-title').textContent   = 'Refinancing opportunity';
  qs('refi-message').textContent = 'You have หนี้นอกระบบ. A formal bank loan (~25%) could save you significantly.';
  qs('refi-comparison').innerHTML = `
    <div class="refi-col">
      <div class="refi-col-lbl">Current path</div>
      <div class="refi-col-val">${result.escapeMonth} mo</div>
      <div class="refi-col-sub">${fmt(result.totalInterestPaid)} interest</div>
    </div>
    <div class="refi-col better">
      <div class="refi-col-lbl">After refinancing</div>
      <div class="refi-col-val">${refiResult.escapeMonth} mo</div>
      <div class="refi-col-sub">Save ${fmt(saved)} · ${moSaved} months faster</div>
    </div>
  `;
}

function renderStatGrid(result) {
  const yrs = (result.escapeMonth / 12).toFixed(1);
  qs('stat-grid').innerHTML = `
    <div class="stat-card highlight">
      <div class="stat-label">Escape</div>
      <div class="stat-value">${result.escapeMonth}<span class="unit"> mo</span></div>
      <div class="stat-sub">${yrs} years</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Interest Saved</div>
      <div class="stat-value" style="font-size:20px">${fmt(result.totalInterestSaved)}</div>
      <div class="stat-sub">vs minimums</div>
    </div>
    <div class="stat-card" style="border:1px solid var(--danger-l);background:var(--danger-l)">
      <div class="stat-label" style="color:var(--danger)">Interest Cost</div>
      <div class="stat-value" style="font-size:20px;color:var(--danger)">${fmt(result.totalInterestPaid)}</div>
      <div class="stat-sub">${fmtMo(result.monthsSaved)} faster</div>
    </div>
    ${result.finalInvestValue > 0 ? `
    <div class="stat-card" style="border:1px solid #a5d6a7;background:var(--success-l)">
      <div class="stat-label" style="color:var(--success)">Investments</div>
      <div class="stat-value" style="font-size:20px;color:var(--success)">${fmt(result.finalInvestValue)}</div>
      <div class="stat-sub" style="color:var(--success)">at escape</div>
    </div>` : ''}
  `;
}

function renderPriorityTable(debts) {
  const maxScore = Math.max(...debts.map(d => d.priorityScore), 0.001);
  const rows = debts.map((d, i) => {
    const inf = d.type === 'informal';
    const pct = Math.min(100, (d.priorityScore / maxScore) * 100).toFixed(1);
    return `<tr>
      <td><span class="debt-rank ${inf?'danger-rank':''}">${i+1}</span></td>
      <td>
        <strong style="font-size:13px">${d.name}</strong><br>
        <span class="badge ${inf?'badge-danger':'badge-primary'}">${TYPE_LABELS[d.type]||d.type}</span>
      </td>
      <td style="white-space:nowrap;font-size:13px">${fmt(d.balance)}</td>
      <td style="font-size:13px">${(d.interestRate*100).toFixed(1)}%</td>
      <td>
        <span style="font-size:13px;font-weight:600">${d.priorityScore.toFixed(2)}</span>
        <span class="score-bar-wrap">
          <span class="score-bar ${inf?'danger-bar':''}" style="width:${pct}%"></span>
        </span>
      </td>
    </tr>`;
  }).join('');

  qs('priority-table').innerHTML = `
    <table class="priority-table">
      <thead><tr><th>#</th><th>Debt</th><th>Balance</th><th>Rate</th><th>Score</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderCutsCard(cuts) {
  const card = qs('cuts-card');
  if (!cuts?.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  qs('cuts-list').innerHTML = cuts.map(c =>
    `<div class="cut-item"><span class="cut-name">${c.name}</span><span class="cut-val">+${fmt(c.amount)}/mo</span></div>`
  ).join('');
}

function renderMissionControl(result) {
  const { months, initialCashEvents } = result;
  const events = [];
  (initialCashEvents||[]).forEach(e => events.push({ month: 0, ...e }));
  months.forEach(m => m.events.forEach(e => events.push({ month: m.month, ...e })));

  const el = qs('mission-control');
  if (!events.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:14px">No notable events on this trajectory.</p>`;
    return;
  }
  const dot = type =>
    type === 'cleared' || type === 'invest_start' || type === 'ef_full' ? 'success' :
    type === 'cash_applied' || type === 'ef_initial' ? 'warning' : '';

  el.innerHTML = `<div class="mc-feed">${
    events.slice(0, 25).map(e => `
      <div class="mc-event">
        <div class="mc-dot ${dot(e.type)}"></div>
        <div>
          <div class="mc-meta">${e.month === 0 ? 'Day 1' : `Month ${e.month}`}</div>
          <div class="mc-msg">${e.message}</div>
        </div>
      </div>
    `).join('')
  }</div>`;
}

function renderMonthlyRoadmap(result) {
  const { months, prioritizedDebts, investments } = result;
  const container = qs('monthly-roadmap');

  const buildMonth = m => {
    const debtRows = prioritizedDebts.map((d, i) => {
      const pay = m.payments[i] || 0;
      if (pay <= 0 && (m.balances[i]||0) <= 0) return '';
      return `<div class="alloc-row debt"><span class="lbl">${d.name}</span><span class="val">${fmt(pay)}</span></div>`;
    }).filter(Boolean).join('');

    const investRows = (investments||[]).map((inv, j) => {
      const contrib = m.investContributions?.[j] || 0;
      const bal     = m.investBalances?.[j] || 0;
      if (contrib <= 0 && bal <= 0) return '';
      return `<div class="alloc-row invest"><span class="lbl">${inv.label}</span><span class="val">+${fmt(contrib)}</span></div>`;
    }).filter(Boolean).join('');

    const efRow = m.efContrib > 0
      ? `<div class="alloc-row ef"><span class="lbl">Emergency Fund</span><span class="val">${fmt(m.efContrib)}</span></div>` : '';

    const intRow = m.interestThisMonth > 0
      ? `<div class="alloc-row interest"><span class="lbl">Interest</span><span class="val">−${fmt(m.interestThisMonth)}</span></div>` : '';

    const totalRow = `<div class="alloc-row total"><span class="lbl">Remaining debt</span><span class="val">${fmt(m.totalDebtRemaining)}</span></div>`;

    const eventsHTML = m.events.length
      ? `<div class="mc-inline">${m.events.map(e=>`<div class="mc-inline-item">${e.message}</div>`).join('')}</div>` : '';

    return `
      <div class="roadmap-month" id="rm-${m.month}">
        <div class="roadmap-hdr" onclick="toggleRoadmapMonth(${m.month})">
          <span>Month ${m.month} — ${fmt(m.totalDebtRemaining)}</span>
          <span class="roadmap-chev">▼</span>
        </div>
        <div class="roadmap-body">
          <div class="alloc-rows">${debtRows}${investRows}${efRow}${intRow}${totalRow}</div>
          ${eventsHTML}
        </div>
      </div>`;
  };

  const LIMIT = 24;
  const shown = months.slice(0, LIMIT);
  const extra = months.length - LIMIT;

  container.innerHTML = shown.map(buildMonth).join('') + (extra > 0
    ? `<button class="btn-add" onclick="showAllMonths()" style="margin-top:4px">Show ${extra} more months</button>`
    : '');
}

function toggleRoadmapMonth(n) { qs(`rm-${n}`)?.classList.toggle('open'); }

function showAllMonths() {
  if (!lastResult) return;
  const { months, prioritizedDebts, investments } = lastResult;
  const container = qs('monthly-roadmap');
  container.innerHTML = months.map(m => {
    const debtRows = prioritizedDebts.map((d, i) => {
      const pay = m.payments[i] || 0;
      if (pay <= 0 && (m.balances[i]||0) <= 0) return '';
      return `<div class="alloc-row debt"><span class="lbl">${d.name}</span><span class="val">${fmt(pay)}</span></div>`;
    }).filter(Boolean).join('');
    const totalRow = `<div class="alloc-row total"><span class="lbl">Remaining</span><span class="val">${fmt(m.totalDebtRemaining)}</span></div>`;
    return `
      <div class="roadmap-month" id="rm-${m.month}">
        <div class="roadmap-hdr" onclick="toggleRoadmapMonth(${m.month})">
          <span>Month ${m.month} — ${fmt(m.totalDebtRemaining)}</span>
          <span class="roadmap-chev">▼</span>
        </div>
        <div class="roadmap-body"><div class="alloc-rows">${debtRows}${totalRow}</div></div>
      </div>`;
  }).join('');
}

function renderEscapeMessage(result) {
  const el  = qs('escape-message');
  const txt = qs('escape-text');
  const msg = result.messages;
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  txt.innerHTML = `
    <h3>${msg.escape}</h3>
    <p>${msg.stable}</p>
    <p class="next">${msg.next}</p>
  `;
}

// ── Reset ──────────────────────────────────────────────────────────
function confirmReset() {
  if (confirm('Reset all data? This will clear your saved profile.')) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESULT_KEY);
    lastResult = null; lastRefi = null;
    goTo('screen-landing');
  }
}

// ═══════════════════════════════════════════════════════════════════
// INIT — check localStorage on load
// ═══════════════════════════════════════════════════════════════════
(function init() {
  buildInvestList();
  const profile = loadProfile();
  if (profile) {
    initHome(profile);
    goTo('screen-home');
    // Load cached result immediately, then refresh in background
    const cached = loadResult();
    if (cached) {
      lastResult = cached;
      qs('roadmap-empty').style.display   = 'none';
      qs('roadmap-content').style.display = 'block';
      renderRoadmap(cached, null);
    }
    // Re-calculate to get fresh result
    runOptimizer(profile);
  }
})();

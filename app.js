// มดหนี้ — App v10 (4-tab UI: Profile / Roadmap / Analysis / Progress)
const API_BASE = 'https://exorcism-private-exception.ngrok-free.dev';
const HEADERS  = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

const STORAGE_KEY = 'ev_profile_v1';
const RESULT_KEY  = 'ev_result_v1';
const HISTORY_KEY = 'ev_history_v1';

// Cloud sync — paste your Apps Script /exec URL here after deploying Code.gs
const CLOUD_URL   = 'https://script.google.com/macros/s/AKfycbyO7MNJWx5fKe1Cgg2Fd0kI5BbI4OcudmNRFQvVyaI30FmIgwDs1hhPpsw6YbAOYHQD/exec';
const USER_ID_KEY = 'ev_user_id';

// LINE LIFF — paste your LIFF ID after creating the app in LINE Developers Console
const LIFF_ID = '2010149680-06k9NZMA';

async function initLiff() {
  if (!LIFF_ID) return;
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isInClient() && !liff.isLoggedIn()) return;
    const lineProfile = await liff.getProfile();
    localStorage.setItem(USER_ID_KEY, lineProfile.userId);

    // Try restoring from cloud first (returning user)
    const cloud = await loadFromCloud();
    if (cloud && cloud.profile) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud.profile));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(cloud.history || []));
      return;
    }

    // New LINE user — seed profile with their display name so setup screen is skipped
    if (!loadProfile()) {
      saveProfile({
        name: lineProfile.displayName,
        occupation: '',
        debts: [], income: 0, initialCash: 0, expenses: [],
        investments: [], mode: 'pure',
        emergencyFund: { monthlyContrib: 0, target: 0 },
      });
    }
  } catch (_) { /* fall back to UUID + normal flow silently */ }
}

function getOrCreateUserId() {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = 'uid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

async function saveToCloud(profile, history) {
  if (!CLOUD_URL) return;
  try {
    await fetch(CLOUD_URL, {
      method: 'POST',
      body: JSON.stringify({ userId: getOrCreateUserId(), profile, history }),
      // No Content-Type header → text/plain → no CORS preflight needed
    });
  } catch (_) { /* silent — localStorage is the source of truth */ }
}

async function loadFromCloud() {
  if (!CLOUD_URL) return null;
  try {
    const res  = await fetch(`${CLOUD_URL}?userId=${encodeURIComponent(getOrCreateUserId())}`);
    const data = await res.json();
    return data.found ? data : null;
  } catch (_) { return null; }
}

function updateSyncBar() {
  const bar = qs('sync-bar');
  if (!bar) return;
  bar.style.display = CLOUD_URL ? 'none' : '';
}

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
let debtCount        = 0;
let expCount         = 0;
let currentMode      = 'pure';
let lastResult       = null;
let lastRefi         = null;
let currentTab       = 'profile';
let selectedEventType = null;

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
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function appendHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
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
  currentTab = tab;

  const fab = qs('fab');
  if (tab === 'progress') {
    fab.style.display = 'none';
  } else {
    fab.style.display = '';
    if (tab === 'profile') {
      qs('fab-label').textContent = 'Save & Calculate';
      qs('fab-icon').textContent  = '💾';
    } else {
      qs('fab-label').textContent = 'Recalculate';
      qs('fab-icon').textContent  = '↺';
    }
  }

  // Render progress tab on first visit
  if (tab === 'progress') renderProgress();
}

function fabAction() {
  if (currentTab === 'profile') saveAndRecalculate();
  else runOptimizer(loadProfile());
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
  const dCount = document.querySelectorAll('.debt-card').length;
  let totalBal = 0;
  document.querySelectorAll('[id^="d-bal-"]').forEach(i => totalBal += parseFloat(i.value)||0);
  if (qs('sub-debts')) qs('sub-debts').textContent = dCount ? `${dCount} debt${dCount>1?'s':''} · ${fmt(totalBal)} total` : 'No debts added';

  const inc = parseFloat(qs('income')?.value) || 0;
  if (qs('sub-income')) qs('sub-income').textContent = inc ? `${fmt(inc)}/mo` : 'Not set';

  let totalExp = 0;
  document.querySelectorAll('[id^="exp-amt-"]').forEach(i => totalExp += parseFloat(i.value)||0);
  const eCount = document.querySelectorAll('.expense-row').length;
  if (qs('sub-expenses')) qs('sub-expenses').textContent = eCount ? `${eCount} item${eCount>1?'s':''} · ${fmt(totalExp)}/mo` : 'None added';

  const active = INVEST_PRESETS.filter(p => qs(`inv-chk-${p.id}`)?.checked).map(p => p.label.split(' ')[0]);
  if (qs('sub-invest')) qs('sub-invest').textContent = active.length ? active.slice(0,2).join(', ') + (active.length>2 ? ` +${active.length-2}` : '') : 'None selected';

  if (qs('sub-mode')) qs('sub-mode').textContent = currentMode === 'pure' ? 'Pure Optimizer' : 'Risk-Adjusted';
}

// ── Toast ──────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const el = qs('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.offsetHeight; // force reflow
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2800);
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
    showToast('เพิ่มหนี้สักก้อนก่อนนะ 🐜', 'warning');
    return;
  }
  saveProfile(profile);
  refreshHero();
  refreshSubs();
  refreshProgressStrip();
  saveToCloud(profile, loadHistory()); // fire-and-forget
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
  switchTab('roadmap');

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
    appendHistory({
      savedAt: new Date().toISOString(),
      income: profile.income,
      totalDebt: profile.debts.reduce((s, d) => s + d.balance, 0),
      escapeMonth: result.escapeMonth,
      totalInterestSaved: result.totalInterestSaved,
    });
    renderAll(result, lastRefi);

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

// ── Progress strip (profile hero) ─────────────────────────────────
function refreshProgressStrip() {
  const h = loadHistory();
  const el = qs('progress-strip');
  if (!el || h.length < 2) { if (el) el.style.display = 'none'; return; }
  const first = h[h.length - 1];
  const latest = h[0];
  const diff = first.totalDebt - latest.totalDebt;
  const months = Math.round((new Date(latest.savedAt) - new Date(first.savedAt)) / (1000 * 60 * 60 * 24 * 30));
  el.style.display = 'block';
  el.textContent = `เริ่มต้น ${fmt(first.totalDebt)} · ลดไปแล้ว ${fmt(diff)} ใน ${months || 1} เดือน`;
}

// ── Companion voice ────────────────────────────────────────────────
function renderCompanion(result) {
  const el    = qs('companion-card');
  const msgEl = qs('companion-msg');
  const algoEl = qs('companion-algo');
  if (!el || !msgEl) return;

  const profile  = loadProfile() || {};
  const income   = profile.income || 0;
  const totalExp = (profile.expenses || []).reduce((s, e) => s + e.amount, 0);
  const totalMin = (profile.debts   || []).reduce((s, d) => s + (d.minPayment || 0), 0);
  const surplus  = income - totalExp - totalMin;
  const hasInformal = (profile.debts || []).some(d => d.type === 'informal');
  const esc = result.escapeMonth || 999;

  let sit;
  if (surplus < 0)              sit = 'deficit';
  else if (hasInformal && esc > 60) sit = 'informal_long';
  else if (hasInformal)         sit = 'informal';
  else if (surplus < 2000)      sit = 'tight';
  else if (esc > 60)            sit = 'long';
  else if (esc > 24)            sit = 'medium';
  else                          sit = 'good';

  const msgs = {
    deficit:       'มดเห็นว่าตอนนี้รายจ่ายมากกว่ารายรับ — ไม่เป็นไรนะ ลองดูรายจ่ายที่ตัดได้ก่อนได้เลย มดจะรอ',
    informal_long: `หนี้นอกระบบดอกแรงมาก มดเข้าใจที่มา — ขอแค่อย่าเพิ่มหนี้ก้อนนี้ แล้วมดจะจัดการให้ภายใน ${esc} เดือน`,
    informal:      'หนี้นอกระบบไม่ใช่ความอาย มันเกิดขึ้นได้กับทุกคน มดจะโยนทุกอย่างเข้าก้อนนี้ก่อนเลย',
    tight:         'เงินเหลือน้อย แต่ทุกบาทที่มดจัดการให้มันมีความหมายนะ — ทีละก้าว ไม่ต้องรีบ',
    long:          `เส้นทาง ${esc} เดือนฟังดูไกล แต่มดจะวิ่งไปกับคุณทุกก้าว — แค่อย่าหยุด`,
    medium:        `ภายใน ${esc} เดือน หนี้ทั้งหมดจะหมดแล้ว มดวางแผนไว้แน่นแล้ว`,
    good:          `${esc} เดือน และคุณจะเป็นอิสระจากหนี้ทั้งหมด — มดภูมิใจแทนเลย`,
  };
  msgEl.textContent = msgs[sit];

  if (algoEl) {
    const top = result.prioritizedDebts?.[0];
    algoEl.textContent = top
      ? `มดเจอหนี้ที่แพงที่สุด: "${top.name}" (ต้นทุน ${top.priorityScore.toFixed(2)}) — ทุกบาทส่วนเกินกองที่นี่จนหมดก้อน แล้วค่อยไล่ลงไป`
      : '';
  }

  el.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════════════
// RENDER ALL (called after every optimizer run)
// ═══════════════════════════════════════════════════════════════════
function renderAll(result, refiResult) {
  renderRoadmapTab(result, refiResult);
  renderAnalysisTab(result, refiResult);
  switchTab('roadmap');
}

// ── Roadmap tab ────────────────────────────────────────────────────
function renderRoadmapTab(result, refiResult) {
  renderCompanion(result);
  renderRoadmapStatStrip(result);
  renderRefinancingAlert(result, refiResult);
  renderTimeline(result);
  qs('roadmap-content').style.display = 'block';
  qs('roadmap-empty').style.display   = 'none';
}

function renderRoadmapStatStrip(result) {
  const yrs = (result.escapeMonth / 12).toFixed(1);
  const items = [
    { val: `${result.escapeMonth} เดือน`, lbl: 'ปลดหนี้' },
    { val: fmt(result.totalInterestSaved), lbl: 'ดอกเบี้ยที่ประหยัด' },
  ];
  if (result.finalInvestValue > 0)
    items.push({ val: fmt(result.finalInvestValue), lbl: 'มูลค่าลงทุน' });

  qs('roadmap-stat-strip').innerHTML = items.map((item, i) => `
    ${i > 0 ? '<div class="rss-sep"></div>' : ''}
    <div class="rss-item">
      <span class="rss-val">${item.val}</span>
      <span class="rss-lbl">${item.lbl}</span>
    </div>`).join('');
}

function renderTimeline(result) {
  const items = buildTimelineItems(result);
  const tl = qs('timeline');
  tl.innerHTML = items.map((item, i) =>
    renderTimelineItem(item, i === items.length - 1, result.prioritizedDebts, result.investments || [])
  ).join('');
}

function buildTimelineItems(result) {
  const { months, initialCashEvents, escapeMonth, prioritizedDebts, totalInterestSaved, finalInvestValue } = result;
  const items = [];
  const startDebt = prioritizedDebts.reduce((s, d) => s + d.balance, 0);

  items.push({ type: 'start', totalDebt: startDebt, events: initialCashEvents || [] });

  months.forEach(m => {
    const isMilestone = m.events.length > 0;
    // Show every month for first 3, then every 3rd quiet month, plus all milestones
    const showQuiet = !isMilestone && (m.month <= 3 || m.month % 3 === 0);
    if (!isMilestone && !showQuiet) return;
    items.push({
      type:               isMilestone ? 'milestone' : 'month',
      month:              m.month,
      events:             m.events,
      totalDebt:          m.totalDebtRemaining,
      payments:           m.payments,
      interestThisMonth:  m.interestThisMonth,
      investContributions: m.investContributions,
      efContrib:          m.efContrib,
      autoExpand:         isMilestone || m.month === 1,
    });
  });

  items.push({ type: 'end', month: escapeMonth, totalInterestSaved, finalInvestValue });
  return items;
}

function renderTimelineItem(item, isLast, prioritizedDebts, investments) {
  const top    = item.type !== 'start' ? '<div class="tl-connector"></div>' : '';
  const bottom = !isLast               ? '<div class="tl-connector"></div>' : '';

  // ── Start node ──────────────────────────────────────────────────
  if (item.type === 'start') {
    const pills = item.events.map(e =>
      `<div class="tl-pill pill-warning">${e.message}</div>`).join('');
    return `
      <div class="tl-item">
        <div class="tl-dot-col">
          <div class="tl-dot dot-start">0</div>
          ${bottom}
        </div>
        <div class="tl-card tl-card-start">
          <div class="tl-month-lbl">เริ่มต้น</div>
          <div class="tl-title">ยอดหนี้รวม ${fmt(item.totalDebt)}</div>
          ${pills ? `<div class="tl-pills">${pills}</div>` : ''}
        </div>
      </div>`;
  }

  // ── End node ───────────────────────────────────────────────────
  if (item.type === 'end') {
    return `
      <div class="tl-item">
        <div class="tl-dot-col">
          ${top}
          <div class="tl-dot dot-end">🐜</div>
        </div>
        <div class="tl-card tl-card-end">
          <div class="tl-month-lbl">Month ${item.month}</div>
          <div class="tl-title" style="color:var(--success)">หนี้ทั้งหมดสะสางหมดแล้ว</div>
          ${item.totalInterestSaved > 0 ? `<div class="tl-sub">ประหยัดดอกเบี้ย ${fmt(item.totalInterestSaved)}</div>` : ''}
          ${item.finalInvestValue   > 0 ? `<div class="tl-sub" style="color:var(--success)">มูลค่าลงทุน ${fmt(item.finalInvestValue)}</div>` : ''}
        </div>
      </div>`;
  }

  // ── Month / Milestone nodes (todo cards) ───────────────────────
  const isMilestone = item.type === 'milestone';
  const hasClear    = item.events?.some(e => e.type === 'cleared');
  const hasInvest   = item.events?.some(e => e.type === 'invest_start');
  const hasEf       = item.events?.some(e => e.type === 'ef_full');

  const dotClass  = isMilestone
    ? (hasInvest ? 'dot-invest' : hasClear ? 'dot-cleared' : hasEf ? 'dot-ef' : 'dot-milestone')
    : 'dot-month';
  const cardExtra = isMilestone
    ? (hasInvest ? 'tl-card-invest' : hasClear ? 'tl-card-cleared' : hasEf ? 'tl-card-ef' : '')
    : '';
  const expanded  = item.autoExpand ? 'expanded' : '';

  const pills = isMilestone ? item.events.map(e => {
    const pc = e.type === 'cleared' ? 'pill-success' : e.type === 'invest_start' ? 'pill-primary' : 'pill-warning';
    return `<div class="tl-pill ${pc}">${e.message}</div>`;
  }).join('') : '';

  const todoHtml = renderMonthTodoContent(item, prioritizedDebts, investments);

  return `
    <div class="tl-item">
      <div class="tl-dot-col">
        ${top}
        <div class="tl-dot ${dotClass}"></div>
        ${bottom}
      </div>
      <div class="tl-card ${cardExtra} tl-todo-card ${expanded}" id="tl-m-${item.month}"
           onclick="toggleTimelineItem(${item.month})">
        <div class="tl-todo-hdr">
          <div>
            <div class="tl-month-lbl">Month ${item.month}</div>
            ${pills ? `<div class="tl-pills">${pills}</div>` : ''}
          </div>
          <div class="tl-todo-meta">
            <span class="tl-bal-badge">${fmt(item.totalDebt)}</span>
            <span class="tl-chevron">›</span>
          </div>
        </div>
        <div class="tl-todo-body">${todoHtml}</div>
      </div>
    </div>`;
}

function renderMonthTodoContent(item, prioritizedDebts, investments) {
  const rows = [];

  prioritizedDebts.forEach((d, i) => {
    const pay = item.payments?.[i] || 0;
    if (pay <= 0) return;
    const min   = Math.min(d.minPayment || 0, pay);
    const extra = Math.round(pay - min);
    rows.push(`
      <div class="todo-row">
        <div class="todo-row-left">
          <span class="todo-name">${d.name}</span>
          ${extra > 100 ? `<span class="todo-extra">+${fmt(extra)} extra</span>` : ''}
        </div>
        <span class="todo-amt">${fmt(pay)}</span>
      </div>`);
  });

  (investments || []).forEach((inv, j) => {
    const c = item.investContributions?.[j] || 0;
    if (c <= 0) return;
    rows.push(`
      <div class="todo-row">
        <span class="todo-name" style="color:var(--success)">${inv.label}</span>
        <span class="todo-amt" style="color:var(--success)">+${fmt(c)}</span>
      </div>`);
  });

  if (item.efContrib > 0) {
    rows.push(`
      <div class="todo-row">
        <span class="todo-name" style="color:var(--warning)">Emergency Fund</span>
        <span class="todo-amt" style="color:var(--warning)">${fmt(item.efContrib)}</span>
      </div>`);
  }

  const comment = generateMonthComment(item, prioritizedDebts);

  return `
    <div class="todo-rows">${rows.join('')}</div>
    <div class="todo-footer">
      <span>ดอกเบี้ยเดือนนี้</span><span>${fmt(item.interestThisMonth)}</span>
    </div>
    ${comment ? `<div class="todo-comment">🐜 ${comment}</div>` : ''}`;
}

function generateMonthComment(item, prioritizedDebts) {
  if (item.month === 1) {
    const top = prioritizedDebts[0];
    return top ? `โยนเงินส่วนเกินทั้งหมดเข้า ${top.name} ก่อน — ดอกแพงสุดในขณะนี้` : '';
  }
  if (item.events?.some(e => e.type === 'invest_start')) return 'หนี้หมดแล้ว! มดเริ่มส่งเงินเข้าลงทุนจากนี้ไป';
  if (item.events?.some(e => e.type === 'ef_full'))     return 'กองทุนฉุกเฉินเต็มแล้ว — เงินส่วนนี้ไปช่วยหนี้ต่อเลย';
  const cleared = item.events?.filter(e => e.type === 'cleared') || [];
  if (cleared.length) {
    const freedTotal = cleared.reduce((s, e) => {
      const m = e.message.match(/฿([\d,]+)\/mo/);
      return s + (m ? parseInt(m[1].replace(/,/g, '')) : 0);
    }, 0);
    return freedTotal > 0
      ? `ชำระหนี้ก้อนนี้หมดแล้ว — มดโยน ฿${freedTotal.toLocaleString()}/mo ที่ว่างไปกองที่หนี้ก้อนถัดไปทันที`
      : cleared.map(e => e.message).join(' · ');
  }
  return '';
}

function toggleTimelineItem(month) {
  qs(`tl-m-${month}`)?.classList.toggle('expanded');
}

// ── Analysis tab ───────────────────────────────────────────────────
function renderAnalysisTab(result, refiResult) {
  createTrajectoryChart(result.months, result.prioritizedDebts, result.investments || []);
  renderSavingsComparison(result);
  renderPriorityTable(result.prioritizedDebts);
  renderCutsCard(result.recommendedCuts);
  renderLifestylePanel(result);
  renderRefinancingAlert(result, refiResult);
  qs('analysis-content').style.display = 'block';
  qs('analysis-empty').style.display   = 'none';
}

function renderSavingsComparison(result) {
  const baseline = result.baselineEscapeMonth || result.escapeMonth + result.monthsSaved;
  qs('savings-grid').innerHTML = `
    <div class="savings-col">
      <div class="savings-col-lbl">จ่ายขั้นต่ำเท่านั้น</div>
      <div class="savings-row"><span class="sv-label">ปลดหนี้</span><span class="sv-val">${baseline} เดือน</span></div>
      <div class="savings-row"><span class="sv-label">ดอกเบี้ยรวม</span><span class="sv-val">${fmt(result.totalInterestPaid + result.totalInterestSaved)}</span></div>
    </div>
    <div class="savings-col better">
      <div class="savings-col-lbl">แผนมดหนี้</div>
      <div class="savings-row"><span class="sv-label">ปลดหนี้</span><span class="sv-val">${result.escapeMonth} เดือน</span></div>
      <div class="savings-row"><span class="sv-label">ดอกเบี้ยรวม</span><span class="sv-val">${fmt(result.totalInterestPaid)}</span></div>
      <div><span class="savings-save-badge">ประหยัด ${fmt(result.totalInterestSaved)} · เร็วกว่า ${result.monthsSaved} เดือน</span></div>
    </div>`;
}

const LIFESTYLE_POOL = [
  { emoji: '🍜', label: 'ข้าวเที่ยง',            price: 60,   unit: 'มื้อ',   note: 'ราคาเฉลี่ยร้านข้าวแกง' },
  { emoji: '🍱', label: 'ข้าวมันไก่',             price: 50,   unit: 'จาน',   note: 'ร้านข้างทาง' },
  { emoji: '🥗', label: 'ส้มตำ',                  price: 50,   unit: 'จาน',   note: 'ส้มตำไทย' },
  { emoji: '🍦', label: 'ไอศกรีม Dairy Queen',    price: 65,   unit: 'ลูก',   note: 'single scoop' },
  { emoji: '🧋', label: 'ชานมไข่มุก',             price: 65,   unit: 'แก้ว',  note: 'ขนาดปกติ' },
  { emoji: '☕', label: 'กาแฟ Starbucks',          price: 180,  unit: 'แก้ว',  note: 'Grande size' },
  { emoji: '🍕', label: 'พิซซ่า',                 price: 350,  unit: 'ถาด',   note: 'size M' },
  { emoji: '🍣', label: 'บุฟเฟ่ต์ซูชิ',           price: 599,  unit: 'คน',    note: 'Oishi/Sushi Buffet' },
  { emoji: '🎬', label: 'Netflix',                 price: 299,  unit: 'เดือน', note: 'Standard Plan' },
  { emoji: '🎵', label: 'Spotify',                 price: 79,   unit: 'เดือน', note: 'Premium' },
  { emoji: '📱', label: 'ค่าโทรศัพท์',            price: 299,  unit: 'เดือน', note: 'แพ็กเกจ AIS/True' },
  { emoji: '🌐', label: 'อินเตอร์เน็ตบ้าน',      price: 599,  unit: 'เดือน', note: 'AIS Fibre' },
  { emoji: '💪', label: 'ค่าสมาชิกยิม',           price: 999,  unit: 'เดือน', note: 'Fitness First' },
  { emoji: '💆', label: 'นวดไทย',                  price: 400,  unit: 'ครั้ง', note: '1 ชั่วโมง' },
  { emoji: '🧴', label: 'สกินแคร์เซต',            price: 800,  unit: 'เซต',   note: 'ล้างหน้า + ครีม' },
  { emoji: '⛽', label: 'น้ำมันเต็มถัง',          price: 1500, unit: 'ครั้ง', note: 'รถเก๋ง ถัง 40L' },
  { emoji: '🛵', label: 'Grab/Bolt',               price: 80,   unit: 'เที่ยว',note: 'ระยะทางเฉลี่ย' },
  { emoji: '🚇', label: 'BTS/MRT',                 price: 44,   unit: 'ครั้ง', note: 'เฉลี่ยต่อเที่ยว' },
  { emoji: '🎮', label: 'เกม Steam',               price: 500,  unit: 'เกม',   note: 'เกมระดับกลาง' },
  { emoji: '🎥', label: 'ตั๋วโรงหนัง',            price: 250,  unit: 'ที่นั่ง',note: 'รอบปกติ' },
  { emoji: '✈️', label: 'ตั๋วบินในประเทศ',        price: 2500, unit: 'ที่นั่ง',note: 'เชียงใหม่-กรุงเทพ' },
  { emoji: '🏨', label: 'โรงแรมบัดเจต',           price: 1200, unit: 'คืน',   note: 'ในกรุงเทพ' },
  { emoji: '👟', label: 'รองเท้า Converse',        price: 2200, unit: 'คู่',   note: 'รุ่น All Star' },
  { emoji: '👕', label: 'เสื้อ Uniqlo',            price: 499,  unit: 'ตัว',   note: 'รุ่น basic' },
  { emoji: '📚', label: 'หนังสือ',                 price: 350,  unit: 'เล่ม',  note: 'นิยาย/non-fiction' },
  { emoji: '🌿', label: 'คอร์สออนไลน์',           price: 990,  unit: 'คอร์ส', note: 'Udemy / SkillLane' },
  { emoji: '🏃', label: 'สมัครมินิมาราธอน',       price: 500,  unit: 'ครั้ง', note: 'ค่าสมัคร' },
];

function renderLifestylePanel(result) {
  const card = qs('lifestyle-card');
  if (!result.totalInterestPaid) { card.style.display = 'none'; return; }
  const monthly = result.totalInterestPaid / Math.max(result.escapeMonth, 1);
  const eligible = LIFESTYLE_POOL.filter(item => monthly / item.price >= 1);
  if (!eligible.length) { card.style.display = 'none'; return; }
  // Shuffle and pick 6 so it varies each render
  const shown = [...eligible].sort(() => Math.random() - 0.5).slice(0, 6);
  card.style.display = 'block';
  qs('lifestyle-list').innerHTML = shown.map(item => {
    const units = Math.round(monthly / item.price);
    return `
      <div class="lifestyle-item">
        <div class="lifestyle-emoji">${item.emoji}</div>
        <div class="lifestyle-body">
          <div class="lifestyle-main">${units.toLocaleString()} ${item.unit} ${item.label}</div>
          <div class="lifestyle-note">${item.note} · ดอกเบี้ย ${fmt(monthly)}/mo</div>
        </div>
      </div>`;
  }).join('');
}

// ── Progress tab ───────────────────────────────────────────────────
function renderProgress() {
  const history = loadHistory();
  const empty   = qs('progress-empty');
  const content = qs('progress-content');

  if (!history.length) {
    empty.style.display   = 'flex';
    content.style.display = 'none';
    return;
  }
  empty.style.display   = 'none';
  content.style.display = 'block';

  // มดพูด comparison message
  const companion = qs('progress-companion');
  const compMsg   = qs('progress-companion-msg');
  if (history.length >= 2 && companion && compMsg) {
    const first  = history[history.length - 1];
    const latest = history[0];
    const saved  = first.totalDebt - latest.totalDebt;
    const moFaster = first.escapeMonth - latest.escapeMonth;
    let msg = '';
    if (saved > 0) {
      msg = `ตั้งแต่เริ่มต้น คุณลดหนี้ไปแล้ว ${fmt(saved)}${moFaster > 0 ? ` และเส้นทางสั้นลง ${moFaster} เดือน` : ''} — มดภูมิใจมากเลย`;
    } else if (saved < 0) {
      msg = `หนี้เพิ่มขึ้นมา ${fmt(Math.abs(saved))} จากครั้งแรก — ไม่เป็นไรนะ มดยังอยู่ตรงนี้`;
    } else {
      msg = `สถานการณ์คงที่ — มดพร้อมช่วยเสมอเมื่อคุณพร้อม`;
    }
    compMsg.textContent = msg;
    companion.style.display = 'flex';
  }

  // History list
  qs('history-list').innerHTML = history.map((entry, i) => {
    const date    = new Date(entry.savedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const isFirst = i === history.length - 1;
    let badge = '';
    if (isFirst) {
      badge = `<span class="history-badge badge-first">เริ่มต้น</span>`;
    } else {
      const prev = history[i + 1];
      const diff = prev.totalDebt - entry.totalDebt;
      if (diff > 0) badge = `<span class="history-badge badge-improve">↓ ${fmt(diff)}</span>`;
      else if (diff < 0) badge = `<span class="history-badge badge-worse">↑ ${fmt(Math.abs(diff))}</span>`;
    }
    return `
      <div class="history-item">
        <div class="history-dot ${isFirst ? 'first' : ''}"></div>
        <div class="history-body">
          <div class="history-date">${date}</div>
          <div class="history-debt">${fmt(entry.totalDebt)}</div>
          <div class="history-meta">ปลดหนี้ใน ${entry.escapeMonth} เดือน · รายได้ ${fmt(entry.income)}/mo</div>
          ${badge}
        </div>
      </div>`;
  }).join('');
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
      <div class="stat-label">ปลดหนี้</div>
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
      <thead><tr><th>#</th><th>Debt</th><th>Balance</th><th>Rate</th><th>ต้นทุน</th></tr></thead>
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

// ── Event Logger ───────────────────────────────────────────────────
const EVENT_TYPES = [
  { id: 'job_change',   emoji: '💼', label: 'เงินเดือนเปลี่ยน',     sub: 'งานใหม่ / ขึ้นเงินเดือน', inputLabel: 'รายได้ใหม่ (฿/mo)', needsInput: true  },
  { id: 'windfall',     emoji: '💰', label: 'ได้เงินก้อน',           sub: 'โบนัส / ของขวัญ / ขายของ', inputLabel: 'จำนวนเงิน (฿)',   needsInput: true  },
  { id: 'new_debt',     emoji: '➕', label: 'เกิดหนี้ใหม่',          sub: 'ต้องกู้เพิ่ม',             inputLabel: '',               needsInput: false },
  { id: 'expense_change', emoji: '🛒', label: 'รายจ่ายเปลี่ยน',    sub: 'เพิ่ม / ลด',               inputLabel: '',               needsInput: false },
  { id: 'debt_cleared', emoji: '✅', label: 'ชำระหนี้เร็วกว่าแผน', sub: 'จ่ายหมดก่อนกำหนด',         inputLabel: '',               needsInput: false },
  { id: 'refi',         emoji: '🏦', label: 'รีไฟแนนซ์',            sub: 'เปลี่ยนสถาบันการเงิน',     inputLabel: '',               needsInput: false },
];

function openEventLogger() {
  selectedEventType = null;
  qs('event-desc').value    = '';
  qs('event-input-val') && (qs('event-input-val').value = '');
  qs('event-quick-input').style.display = 'none';

  qs('event-type-grid').innerHTML = EVENT_TYPES.map(t => `
    <button class="event-type-btn" id="et-${t.id}" onclick="selectEventType('${t.id}')">
      <span class="et-emoji">${t.emoji}</span>
      <span class="et-label">${t.label}</span>
      <span class="et-sub">${t.sub}</span>
    </button>`).join('');

  qs('event-modal').style.display = 'flex';
}

function closeEventLogger(e) {
  if (e && e.target !== qs('event-modal')) return;
  qs('event-modal').style.display = 'none';
}

function selectEventType(id) {
  selectedEventType = id;
  document.querySelectorAll('.event-type-btn').forEach(b => b.classList.remove('active'));
  qs(`et-${id}`)?.classList.add('active');

  const t = EVENT_TYPES.find(x => x.id === id);
  const qi = qs('event-quick-input');
  if (t?.needsInput) {
    qs('event-input-label').textContent = t.inputLabel;
    qi.style.display = 'block';
  } else {
    qi.style.display = 'none';
  }
}

async function submitEvent() {
  if (!selectedEventType) { showToast('เลือกประเภทก่อนนะ 🐜', 'warning'); return; }
  const desc     = qs('event-desc')?.value.trim() || '';
  const inputVal = parseFloat(qs('event-input-val')?.value) || 0;
  const t = EVENT_TYPES.find(x => x.id === selectedEventType);

  qs('event-modal').style.display = 'none';

  if (selectedEventType === 'new_debt' || selectedEventType === 'expense_change') {
    switchTab('profile');
    const section = selectedEventType === 'new_debt' ? 'debts' : 'expenses';
    toggleSection(section);
    showToast(`เพิ่ม${t.label}ใน Profile แล้วกด Save 🐜`);
    return;
  }

  if (selectedEventType === 'refi') {
    switchTab('analysis');
    showToast('ดูการเปรียบเทียบรีไฟแนนซ์ใน Analysis 🐜');
    return;
  }

  // Apply quick changes and recalculate
  const profile = loadProfile();
  if (!profile) { showToast('บันทึก Profile ก่อนนะ 🐜', 'warning'); return; }

  if (selectedEventType === 'job_change' && inputVal > 0) {
    profile.income = inputVal;
  } else if (selectedEventType === 'windfall' && inputVal > 0) {
    profile.initialCash = (profile.initialCash || 0) + inputVal;
  } else if (selectedEventType === 'debt_cleared') {
    // Just log it — user should manually update profile for accuracy
    showToast('บันทึกแล้ว 🐜 อัพเดท Profile เพื่อคำนวณใหม่');
    return;
  }

  saveProfile(profile);
  showToast(`บันทึกแล้ว — กำลังคำนวณใหม่ 🐜`);
  await runOptimizer(profile);
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
(async function init() {
  await initLiff();
  buildInvestList();
  updateSyncBar();
  const profile = loadProfile();
  if (profile) {
    initHome(profile);
    goTo('screen-home');
    refreshProgressStrip();
    const cached = loadResult();
    if (cached) { lastResult = cached; renderAll(cached, null); }
    runOptimizer(profile);
    // Keep cloud in sync (upload local → cloud, fire-and-forget)
    saveToCloud(profile, loadHistory());
  } else {
    // No local data — try recovering from cloud
    loadFromCloud().then(cloud => {
      if (!cloud || !cloud.profile) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud.profile));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(cloud.history || []));
      const p = cloud.profile;
      buildInvestList();
      initHome(p);
      goTo('screen-home');
      refreshProgressStrip();
      runOptimizer(p);
      showToast('กู้คืนข้อมูลจาก Cloud แล้ว 🐜');
    });
  }
})();

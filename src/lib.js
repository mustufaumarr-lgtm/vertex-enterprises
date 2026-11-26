// =====================================================================
// lib.js — formatting, money, dates, calculations (no React here)
// All money is stored as WHOLE RUPEES (integers). Percentages may have
// up to 2 decimals. Every computed amount is rounded with Math.round.
// =====================================================================

export const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const uid = (p = 'id') => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const fmtD = (iso) => {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const mi = Number(m) - 1;
  if (!MON[mi]) return '—';
  return `${d}-${MON[mi]}-${y}`;
};

export const fmtDT = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return fmtD(iso) + ' ' + iso.slice(11, 16);
};

export const days = (fromISO, toISO) => Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 864e5);

export const rs = (n) => Math.round(Number(n) || 0);

export const fmtPKR = (n) => {
  const v = rs(n);
  const s = 'PKR ' + Math.abs(v).toLocaleString('en-US');
  return v < 0 ? '−' + s : s;
};

export const fmtShort = (n) => {
  const v = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (v >= 1e9) return sign + (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (v >= 1e6) return sign + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return sign + Math.round(v / 1e3) + 'K';
  return sign + Math.round(v);
};

// Parse a typed money value: accepts "1,250,000" or "1250000.4" → integer rupees.
export const parseMoney = (s) => {
  if (s === '' || s === null || s === undefined) return NaN;
  const n = Number(String(s).replace(/[,\s]/g, '').replace(/^PKR/i, ''));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
export const parsePct = (s) => {
  if (s === '' || s === null || s === undefined) return NaN;
  const n = Number(String(s).replace(/[%\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
export const pctOf = (amount, pct) => Math.round((rs(amount) * (Number(pct) || 0)) / 100);

// ---------- domain constants ----------
export const PROJECT_STATUS = ['Awarded', 'Ongoing', 'Completed', 'On hold'];
export const EXPENSE_CATS = ['Materials', 'Labour', 'Subcontractor', 'Equipment rental', 'Fuel', 'Transport', 'Permits & fees', 'Repairs & maintenance', 'Office', 'Salaries', 'Utilities', 'Misc'];
export const PAY_METHODS = ['Cash', 'Bank', 'Cheque'];
export const DED_KEYS = [
  { k: 'incomeTax', label: 'Income tax withholding' },
  { k: 'salesTax', label: 'Sales tax withholding' },
  { k: 'retention', label: 'Retention' },
  { k: 'penalty', label: 'Penalties / LD' },
  { k: 'other', label: 'Other deductions' },
];

export const DEFAULT_SETTINGS = {
  companyName: 'Vertex Enterprises',
  city: 'Karachi, Sindh',
  partners: [
    { id: 'p1', name: 'Murtuza', share: 50 },
    { id: 'p2', name: 'Hisham', share: 50 },
  ],
  openingCash: 0,
  openingBank: 0,
  openingDate: '',
  paymentTermsDays: 30,
  defaults: { incomeTax: 0, salesTax: 0, penalty: 0, other: 0 },
  lastBackup: null,
  pinHash: '',
  agreementNotes: '',
};

// ---------- bill calculations ----------
export const billDeductionTotal = (b) => DED_KEYS.reduce((s, d) => s + rs(b.ded?.[d.k]?.amt), 0);
export const billNet = (b) => rs(b.gross) - billDeductionTotal(b);
export const billRetention = (b) => rs(b.ded?.retention?.amt);
export const billPending = (b) => Math.max(0, billNet(b) - rs(b.received));
export const billStatus = (b) => {
  const net = billNet(b), rec = rs(b.received);
  if (net <= 0 || rec >= net) return 'Received';
  if (rec > 0) return 'Partly received';
  return 'Pending';
};

// ---------- cash movements ----------
// Builds a single list of money in/out used by Cash Book, Dashboard and charts.
// account: 'cash' | 'bank'. amount: positive integer. dir: 'in' | 'out'
export function cashMovements(data) {
  const out = [];
  const pName = (id) => data.projects.find((p) => p.id === id)?.name || 'Office / General';
  for (const b of data.bills) {
    if (rs(b.received) > 0 && b.receivedDate) {
      out.push({ id: 'bill-' + b.id, date: b.receivedDate, dir: 'in', account: b.receivedTo === 'cash' ? 'cash' : 'bank', amount: rs(b.received), desc: `Bill ${b.billNo} received`, party: pName(b.projectId), src: 'Billing', projectId: b.projectId, kind: 'receipt' });
    }
    if (b.retentionReleased && billRetention(b) > 0 && b.retentionReleaseDate) {
      out.push({ id: 'ret-' + b.id, date: b.retentionReleaseDate, dir: 'in', account: 'bank', amount: billRetention(b), desc: `Retention released — bill ${b.billNo}`, party: pName(b.projectId), src: 'Billing', projectId: b.projectId, kind: 'retention' });
    }
  }
  for (const e of data.expenses) {
    out.push({ id: 'exp-' + e.id, date: e.date, dir: 'out', account: e.method === 'Cash' ? 'cash' : 'bank', amount: rs(e.amount), desc: `${e.category}${e.notes ? ' — ' + e.notes : ''}`, party: e.payee, src: 'Expenses', projectId: e.projectId || '', kind: 'expense' });
  }
  for (const c of data.cashentries) {
    if (c.type === 'transfer') {
      const from = c.from === 'cash' ? 'cash' : 'bank';
      const to = from === 'cash' ? 'bank' : 'cash';
      out.push({ id: 'cb-o-' + c.id, date: c.date, dir: 'out', account: from, amount: rs(c.amount), desc: `Transfer to ${to}${c.desc ? ' — ' + c.desc : ''}`, party: '', src: 'Cash book', kind: 'transfer', entryId: c.id });
      out.push({ id: 'cb-i-' + c.id, date: c.date, dir: 'in', account: to, amount: rs(c.amount), desc: `Transfer from ${from}${c.desc ? ' — ' + c.desc : ''}`, party: '', src: 'Cash book', kind: 'transfer', entryId: c.id });
    } else {
      out.push({ id: 'cb-' + c.id, date: c.date, dir: c.type === 'out' ? 'out' : 'in', account: c.account === 'cash' ? 'cash' : 'bank', amount: rs(c.amount), desc: c.desc || '(manual entry)', party: c.party || '', src: 'Cash book', kind: 'manual', entryId: c.id });
    }
  }
  for (const t of data.partnertxns || []) {
    const def = PARTNER_TX[t.type]; if (!def) continue;
    const pn = (t.partnerName || '');
    out.push({ id: 'pt-' + t.id, date: t.date, dir: def.dir, account: t.account === 'cash' ? 'cash' : 'bank', amount: rs(t.amount), desc: `${def.label}${t.notes ? ' — ' + t.notes : ''}`, party: pn, src: 'Partners', kind: 'partner' });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function balances(data, settings) {
  let cash = rs(settings.openingCash), bank = rs(settings.openingBank);
  for (const m of cashMovements(data)) {
    const s = m.dir === 'in' ? m.amount : -m.amount;
    if (m.account === 'cash') cash += s; else bank += s;
  }
  return { cash, bank };
}

// Per-project figures for mini dashboards and the profit chart.
export function projectFigures(p, data) {
  const bills = data.bills.filter((b) => b.projectId === p.id);
  const exps = data.expenses.filter((e) => e.projectId === p.id);
  const billedGross = bills.reduce((s, b) => s + rs(b.gross), 0);
  const billedNet = bills.reduce((s, b) => s + billNet(b), 0);
  const received = bills.reduce((s, b) => s + rs(b.received), 0);
  const retentionHeld = bills.filter((b) => !b.retentionReleased).reduce((s, b) => s + billRetention(b), 0);
  const retentionReleased = bills.filter((b) => b.retentionReleased).reduce((s, b) => s + billRetention(b), 0);
  const pending = bills.reduce((s, b) => s + billPending(b), 0);
  const taxWithheld = bills.reduce((s, b) => s + rs(b.ded?.incomeTax?.amt) + rs(b.ded?.salesTax?.amt), 0);
  const cost = exps.reduce((s, e) => s + rs(e.amount), 0);
  const cashProfit = received + retentionReleased - cost;
  // "Earned" profit: gross billed minus penalties/other deductions minus cost.
  // Taxes withheld and retention are still the company's money, so they are not a loss.
  const penalties = bills.reduce((s, b) => s + rs(b.ded?.penalty?.amt) + rs(b.ded?.other?.amt), 0);
  const earnedProfit = billedGross - penalties - cost;
  return { bills, exps, billedGross, billedNet, received, retentionHeld, retentionReleased, pending, taxWithheld, cost, cashProfit, earnedProfit, penalties };
}

// ---------- CSV ----------
export function toCSV(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Guard against spreadsheet formula injection
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
    return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))].join('\n');
}

export async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback (non-cryptographic) if subtle crypto is unavailable
    let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'x' + h;
  }
}

export const monthKey = (iso) => (iso || '').slice(0, 7);
export const lastNMonths = (n) => {
  const d = new Date(); const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`, label: MON[x.getMonth()] + (x.getMonth() === 0 || i === n - 1 ? ' ' + String(x.getFullYear()).slice(2) : '') });
  }
  return out;
};

// ---------- Phase 2 constants ----------
export const PARTY_TYPES = ['Supplier', 'Subcontractor', 'Labour contractor', 'Labourer', 'Equipment owner', 'Other'];
export const DOC_CATS = ['Company registration', 'NTN', 'Sales tax registration', 'PEC license', 'Bank guarantee', 'Insurance', 'Tender certificate', 'Experience certificate', 'Other'];
// dir: effect on company cash. cap/loan: effect on partner's capital / loan balances (+ = company owes partner more)
export const PARTNER_TX = {
  capital: { label: 'Capital contributed', dir: 'in', cap: 1, loan: 0 },
  withdrawal: { label: 'Withdrawal / drawing', dir: 'out', cap: -1, loan: 0 },
  loanToCo: { label: 'Loan given to company', dir: 'in', cap: 0, loan: 1 },
  loanRepaid: { label: 'Company repaid partner loan', dir: 'out', cap: 0, loan: -1 },
  loanFromCo: { label: 'Partner borrowed from company', dir: 'out', cap: 0, loan: -1 },
  loanFromCoRepaid: { label: 'Partner repaid company', dir: 'in', cap: 0, loan: 1 },
};

// ---------- Vendors ----------
export function partyLedger(party, data) {
  const rows = [];
  for (const b of data.vendorbills) if (b.partyId === party.id) rows.push({ id: 'vb-' + b.id, date: b.date, kind: 'bill', ref: b.billNo, desc: b.notes || 'Bill / invoice', projectId: b.projectId, debit: rs(b.amount), credit: 0, src: b });
  for (const e of data.expenses) if (e.vendorId === party.id) rows.push({ id: 'ex-' + e.id, date: e.date, kind: e.isAdvance ? 'advance' : 'payment', ref: e.ref, desc: (e.isAdvance ? 'Advance' : 'Payment') + ` (${e.method})` + (e.notes ? ' — ' + e.notes : ''), projectId: e.projectId, debit: 0, credit: rs(e.amount), src: e });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'bill' ? -1 : 1));
  let bal = rs(party.openingBalance);
  for (const r of rows) { bal += r.debit - r.credit; r.balance = bal; }
  const billed = rows.reduce((s, r) => s + r.debit, 0), paid = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, billed, paid, balance: bal, lastDate: rows.length ? rows[rows.length - 1].date : '' };
}
export const payablesTotal = (data) => data.vendors.reduce((s, v) => s + Math.max(0, partyLedger(v, data).balance), 0);

// ---------- Inventory ----------
export function stockOf(item, data) {
  const moves = data.stockmoves.filter((m) => m.itemId === item.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  let qty = rs100(item.openingQty || 0), inQty = qty, inVal = qty * (Number(item.openingCost) || 0), issued = 0;
  for (const m of moves) {
    const q = Number(m.qty) || 0;
    if (m.type === 'in') { qty += q; inQty += q; inVal += q * (Number(m.unitCost) || 0); }
    else if (m.type === 'issue') { qty -= q; issued += q; }
    else if (m.type === 'adjust') qty += q;
  }
  const avgCost = inQty > 0 ? inVal / inQty : Number(item.openingCost) || 0;
  qty = rs100(qty);
  return { qty, avgCost: Math.round(avgCost * 100) / 100, value: Math.round(qty * avgCost), issued: rs100(issued), moves, low: Number(item.reorderLevel) > 0 && qty <= Number(item.reorderLevel) };
}
export const rs100 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const fmtQty = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ---------- Partners ----------
export function partnerLedger(partner, data) {
  const rows = (data.partnertxns || []).filter((t) => t.partnerId === partner.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  let cap = 0, loan = 0, withdrawn = 0, contributed = 0;
  const out = rows.map((t) => {
    const d = PARTNER_TX[t.type] || { cap: 0, loan: 0 };
    cap += d.cap * rs(t.amount); loan += d.loan * rs(t.amount);
    if (t.type === 'withdrawal') withdrawn += rs(t.amount);
    if (t.type === 'capital') contributed += rs(t.amount);
    return { ...t, capBal: cap, loanBal: loan };
  });
  return { rows: out, capital: cap, loan, withdrawn, contributed };
}
// Split an integer total by percentages so the parts add up exactly (largest remainder).
export function splitByShares(total, shares) {
  const sum = shares.reduce((s, x) => s + x, 0) || 1;
  const raw = shares.map((x) => (total * x) / sum);
  const base = raw.map((x) => Math.floor(x));
  let rem = total - base.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && rem > 0; k++, rem--) base[order[k][1]]++;
  return base;
}

// ---------- Documents ----------
export function docStatus(iso) {
  if (!iso) return { tone: 'mute', label: 'No expiry', d: Infinity };
  const d = days(todayISO(), iso);
  if (d < 0) return { tone: 'bad', label: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, d };
  if (d <= 30) return { tone: 'warn', label: `Expires in ${d} day${d === 1 ? '' : 's'}`, d };
  return { tone: 'ok', label: 'Valid', d };
}

// ---------- Periods ----------
// Pakistan's tax year runs 1 July – 30 June; "FY 2026-27" = Jul 2026 – Jun 2027
export const fyOf = (iso) => { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); return m >= 7 ? y : y - 1; };
export const fyLabel = (y) => `FY ${y}-${String(y + 1).slice(2)}`;
export const ageBucket = (d) => (d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');

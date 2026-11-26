// =====================================================================
// reports.jsx — Every report is a table with an Export CSV button.
// Pakistan tax year (1 Jul – 30 Jun) is used for period reports.
// =====================================================================
import React, { useMemo, useState } from 'react';
import { DED_KEYS, PARTNER_TX, MON, fmtPKR, fmtD, rs, todayISO, days, cashMovements, projectFigures, billNet, billPending, billStatus, partyLedger, partnerLedger, fyOf, fyLabel, ageBucket, toCSV, monthKey } from './lib.js';
import { Btn, Select, Card, Empty, DataTable, Stat, PageHead } from './ui.jsx';
import { saveFile, FallbackModal } from './datapage.jsx';

const REPORTS = [
  ['pl', 'Project profit & loss'], ['monthly', 'Monthly & yearly summary'], ['cashflow', 'Cash flow'], ['ageing', 'Receivables ageing'],
  ['payables', 'Payables summary'], ['partner', 'Partner statements'], ['tax', 'Tax-related summary'], ['project', 'Single-project report (printable)'],
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => ({ align: 'right', render: (r) => fmtPKR(v(r)), sort: v, get: v });

// A report table: cols have get(row) for CSV; `total: true` columns are summed in the footer.
function Report({ name, rows, cols, setFallback, note, search }) {
  const exportCSV = () => saveFile(`${name}-${todayISO()}.csv`, toCSV(rows, cols.map((c) => ({ label: c.label, get: c.get || ((r) => r[c.key]) }))), setFallback);
  const tcols = cols.map((c) => ({ ...c, render: c.render || ((r) => (c.get ? c.get(r) : r[c.key]) ?? '—') }));
  const hasTotal = cols.some((c) => c.total);
  return (
    <div>
      <DataTable rows={rows} cols={tcols} search={search} empty={<Empty title="No data for this report yet" />} toolbar={<Btn size="sm" disabled={!rows.length} onClick={exportCSV}>Export CSV</Btn>}
        footer={hasTotal ? (v) => <tr className="border-t-2 border-ink font-bold">{cols.map((c, i) => <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{i === 0 ? 'Total' : c.total ? fmtPKR(v.reduce((s, r) => s + (c.get ? c.get(r) : r[c.key]) * 1, 0)) : ''}</td>)}</tr> : undefined} />
      {note && <p className="text-[13px] text-mute mt-2">{note}</p>}
    </div>
  );
}

export function projectReportHTML(p, data, settings) {
  const f = projectFigures(p, data);
  const byCat = {}; f.exps.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + rs(e.amount); });
  const row = (k, v) => `<tr><th>${esc(k)}</th><td class="n">${esc(v)}</td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.name)} — project report</title><style>
body{font:13px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:32px;max-width:900px}h1{font-size:24px;margin:0}h2{font-size:15px;margin:24px 0 6px;border-bottom:2px solid #111;padding-bottom:3px}
table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #ccc;text-align:left;vertical-align:top}.n{text-align:right;white-space:nowrap}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.muted{color:#555}
@media print{body{margin:12mm}}@media(max-width:700px){body{margin:16px}.grid{grid-template-columns:1fr}}</style></head><body>
<p class="muted">${esc(settings.companyName)} · ${esc(settings.city || '')} · Printed ${esc(fmtD(todayISO()))}</p>
<h1>${esc(p.name)}</h1><p class="muted">${esc(p.client)} · Tender ${esc(p.tenderNo || '—')} · ${esc(p.location || '')}</p>
<div class="grid"><div><h2>Contract</h2><table>${row('Contract value', fmtPKR(p.value))}${row('Status / progress', `${p.status} · ${p.progress || 0}%`)}${row('Start → end', `${fmtD(p.start)} → ${fmtD(p.end)}`)}${row('Retention', `${p.retentionPct || 0}%`)}${row('Performance guarantee', p.pgAmount ? `${fmtPKR(p.pgAmount)} · ${p.pgBank || ''} · exp. ${fmtD(p.pgExpiry)}` : '—')}</table></div>
<div><h2>Financial position</h2><table>${row('Billed (gross)', fmtPKR(f.billedGross))}${row('Net after deductions', fmtPKR(f.billedNet))}${row('Received', fmtPKR(f.received + f.retentionReleased))}${row('Pending from client', fmtPKR(f.pending))}${row('Retention held', fmtPKR(f.retentionHeld))}${row('Tax withheld by client', fmtPKR(f.taxWithheld))}${row('Budget', p.budget ? fmtPKR(p.budget) : '—')}${row('Actual cost', fmtPKR(f.cost))}${row('Profit (cash received − cost)', fmtPKR(f.cashProfit))}${row('Profit (billed − cost)', fmtPKR(f.earnedProfit))}</table></div></div>
<h2>Bills</h2><table><tr><th>Bill</th><th>Date</th><th class="n">Gross</th>${DED_KEYS.map((d) => `<th class="n">${esc(d.label)}</th>`).join('')}<th class="n">Net</th><th class="n">Received</th><th>Status</th></tr>
${f.bills.sort((a, b) => (a.date < b.date ? -1 : 1)).map((b) => `<tr><td>${esc(b.billNo)}</td><td>${esc(fmtD(b.date))}</td><td class="n">${esc(fmtPKR(b.gross))}</td>${DED_KEYS.map((d) => `<td class="n">${esc(fmtPKR(b.ded?.[d.k]?.amt))}</td>`).join('')}<td class="n">${esc(fmtPKR(billNet(b)))}</td><td class="n">${esc(fmtPKR(b.received))}</td><td>${esc(billStatus(b))}</td></tr>`).join('') || '<tr><td colspan="10">No bills</td></tr>'}</table>
<h2>Cost by category</h2><table>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(k, fmtPKR(v))).join('') || '<tr><td>No expenses</td></tr>'}</table>
<h2>All expenses</h2><table><tr><th>Date</th><th>Category</th><th>Payee</th><th>Method / ref</th><th class="n">Amount</th></tr>
${f.exps.sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => `<tr><td>${esc(fmtD(e.date))}</td><td>${esc(e.category)}</td><td>${esc(e.payee)}${e.notes ? `<br><span class="muted">${esc(e.notes)}</span>` : ''}</td><td>${esc(e.method)} ${esc(e.ref || '')}</td><td class="n">${esc(fmtPKR(e.amount))}</td></tr>`).join('')}</table>
${p.notes ? `<h2>Notes</h2><p>${esc(p.notes)}</p>` : ''}
<p class="muted" style="margin-top:32px">Management report — figures not audited. Open this file in your browser and press Ctrl+P (or ⌘P) to print or save as PDF.</p></body></html>`;
}

export default function Reports({ data, settings, api }) {
  const [rep, setRep] = useState(() => { try { return sessionStorage.getItem('cms-report') || 'pl'; } catch { return 'pl'; } });
  const [fallback, setFallback] = useState(null);
  const moves = useMemo(() => cashMovements(data), [data]);
  const fys = useMemo(() => { const s = new Set([fyOf(todayISO())]); moves.forEach((m) => s.add(fyOf(m.date))); data.bills.forEach((b) => s.add(fyOf(b.date))); return [...s].sort((a, b) => b - a); }, [moves, data.bills]);
  const [fy, setFy] = useState(fyOf(todayISO()));
  const [partnerId, setPartnerId] = useState(settings.partners?.[0]?.id || '');
  const [projId, setProjId] = useState(data.projects[0]?.id || '');
  const choose = (k) => { setRep(k); try { sessionStorage.setItem('cms-report', k); } catch {} };
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '—' : 'Office / General');
  const fyMonths = Array.from({ length: 12 }, (_, i) => { const m = (6 + i) % 12; const y = m >= 6 ? fy : fy + 1; return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MON[m]} ${y}` }; });
  const fySel = <Select aria-label="Tax year" className="w-auto" options={fys.map((y) => ({ value: String(y), label: fyLabel(y) }))} value={String(fy)} onChange={(e) => setFy(Number(e.target.value))} />;

  let body = null;
  if (rep === 'pl') {
    const rows = data.projects.map((p) => ({ ...p, f: projectFigures(p, data) }));
    body = <Report name="project-pnl" setFallback={setFallback} search={['name', 'client']} rows={rows} note="Cash profit = money received (incl. released retention) − costs. Billed profit = gross billed − penalties/other deductions − costs; tax withheld and retention are treated as still yours."
      cols={[{ key: 'name', label: 'Project', get: (r) => r.name, render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'status', label: 'Status', get: (r) => r.status }, { key: 'value', label: 'Contract', ...money((r) => rs(r.value)), total: true }, { key: 'billed', label: 'Billed gross', ...money((r) => r.f.billedGross), total: true }, { key: 'rec', label: 'Received', ...money((r) => r.f.received + r.f.retentionReleased), total: true }, { key: 'pend', label: 'Pending', ...money((r) => r.f.pending), total: true }, { key: 'ret', label: 'Retention held', ...money((r) => r.f.retentionHeld), total: true }, { key: 'cost', label: 'Cost', ...money((r) => r.f.cost), total: true }, { key: 'cp', label: 'Cash profit', ...money((r) => r.f.cashProfit), total: true }, { key: 'ep', label: 'Billed profit', ...money((r) => r.f.earnedProfit), total: true }, { key: 'margin', label: 'Margin', align: 'right', get: (r) => (r.f.billedGross ? Math.round((r.f.earnedProfit / r.f.billedGross) * 1000) / 10 + '%' : '—') }]} />;
  } else if (rep === 'monthly') {
    const inc = (k) => moves.filter((m) => monthKey(m.date) === k && (m.kind === 'receipt' || m.kind === 'retention')).reduce((s, m) => s + m.amount, 0);
    const exp = (k) => data.expenses.filter((e) => monthKey(e.date) === k).reduce((s, e) => s + rs(e.amount), 0);
    const bil = (k) => data.bills.filter((b) => monthKey(b.date) === k).reduce((s, b) => s + rs(b.gross), 0);
    const rows = fyMonths.map((m) => ({ id: m.key, month: m.label, billed: bil(m.key), income: inc(m.key), expenses: exp(m.key) }));
    const yrs = fys.map((y) => { const ks = new Set(Array.from({ length: 12 }, (_, i) => { const m = (6 + i) % 12; const yy = m >= 6 ? y : y + 1; return `${yy}-${String(m + 1).padStart(2, '0')}`; })); const sum = (arr, get, d) => arr.filter((x) => ks.has(monthKey(d(x)))).reduce((s, x) => s + get(x), 0);
      return { id: String(y), year: fyLabel(y), billed: sum(data.bills, (b) => rs(b.gross), (b) => b.date), income: sum(moves.filter((m) => m.kind === 'receipt' || m.kind === 'retention'), (m) => m.amount, (m) => m.date), expenses: sum(data.expenses, (e) => rs(e.amount), (e) => e.date) }; });
    const cols = [{ key: 'billed', label: 'Billed (gross)', ...money((r) => r.billed), total: true }, { key: 'income', label: 'Received', ...money((r) => r.income), total: true }, { key: 'expenses', label: 'Expenses', ...money((r) => r.expenses), total: true }, { key: 'net', label: 'Net (received − expenses)', ...money((r) => r.income - r.expenses), total: true }];
    body = <div className="space-y-6"><div><div className="flex items-center gap-2 mb-2"><h3 className="font-bold">Month by month</h3>{fySel}</div><Report name={`monthly-${fy}`} setFallback={setFallback} rows={rows} cols={[{ key: 'month', label: 'Month', get: (r) => r.month }, ...cols]} /></div>
      <div><h3 className="font-bold mb-2">Year by year (tax years, July–June)</h3><Report name="yearly" setFallback={setFallback} rows={yrs} cols={[{ key: 'year', label: 'Tax year', get: (r) => r.year }, ...cols]} /></div></div>;
  } else if (rep === 'cashflow') {
    const start = fyMonths[0].key + '-01';
    let opening = rs(settings.openingCash) + rs(settings.openingBank);
    moves.filter((m) => m.date < start && m.kind !== 'transfer').forEach((m) => { opening += m.dir === 'in' ? m.amount : -m.amount; });
    let bal = opening;
    const rows = fyMonths.map((mo) => {
      const ms = moves.filter((m) => monthKey(m.date) === mo.key && m.kind !== 'transfer');
      const s = (f) => ms.filter(f).reduce((a, m) => a + m.amount, 0);
      const r = { id: mo.key, month: mo.label, open: bal, clients: s((m) => m.kind === 'receipt' || m.kind === 'retention'), partnersIn: s((m) => m.kind === 'partner' && m.dir === 'in'), otherIn: s((m) => m.kind === 'manual' && m.dir === 'in'), expenses: s((m) => m.kind === 'expense'), partnersOut: s((m) => m.kind === 'partner' && m.dir === 'out'), otherOut: s((m) => m.kind === 'manual' && m.dir === 'out') };
      r.close = r.open + r.clients + r.partnersIn + r.otherIn - r.expenses - r.partnersOut - r.otherOut; bal = r.close; return r;
    });
    body = <div><div className="flex items-center gap-2 mb-2">{fySel}<span className="text-[14px] text-mute">Cash + bank combined. Transfers between them are left out.</span></div>
      <Report name={`cashflow-${fy}`} setFallback={setFallback} rows={rows} cols={[{ key: 'month', label: 'Month', get: (r) => r.month }, { key: 'open', label: 'Opening', ...money((r) => r.open) }, { key: 'clients', label: 'From clients', ...money((r) => r.clients), total: true }, { key: 'partnersIn', label: 'From partners', ...money((r) => r.partnersIn), total: true }, { key: 'otherIn', label: 'Other in', ...money((r) => r.otherIn), total: true }, { key: 'expenses', label: 'Expenses', ...money((r) => r.expenses), total: true }, { key: 'partnersOut', label: 'To partners', ...money((r) => r.partnersOut), total: true }, { key: 'otherOut', label: 'Other out', ...money((r) => r.otherOut), total: true }, { key: 'close', label: 'Closing', ...money((r) => r.close) }]} /></div>;
  } else if (rep === 'ageing') {
    const t = todayISO();
    const rows = data.bills.filter((b) => billPending(b) > 0).map((b) => { const age = days(b.date, t); const p = data.projects.find((x) => x.id === b.projectId); return { id: b.id, client: p?.client || '—', project: pName(b.projectId), billNo: b.billNo, date: b.date, age, bucket: ageBucket(age), pending: billPending(b) }; });
    const B = ['0-30', '31-60', '61-90', '90+'];
    const byClient = {}; rows.forEach((r) => { byClient[r.client] = byClient[r.client] || { id: r.client, client: r.client, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }; byClient[r.client][r.bucket] += r.pending; });
    const totals = B.map((k) => rows.filter((r) => r.bucket === k).reduce((s, r) => s + r.pending, 0));
    body = <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{B.map((k, i) => <Stat key={k} label={`${k} days`} value={fmtPKR(totals[i])} tone={i >= 2 && totals[i] ? 'bad' : undefined} />)}</div>
      <div><h3 className="font-bold mb-2">By client</h3><Report name="receivables-ageing-clients" setFallback={setFallback} rows={Object.values(byClient)} cols={[{ key: 'client', label: 'Client', get: (r) => r.client }, ...B.map((k) => ({ key: k, label: k + ' days', ...money((r) => r[k]), total: true })), { key: 'tot', label: 'Total', ...money((r) => B.reduce((s, k) => s + r[k], 0)), total: true }]} /></div>
      <div><h3 className="font-bold mb-2">By bill</h3><Report name="receivables-ageing-bills" setFallback={setFallback} search={['client', 'project', 'billNo']} rows={rows} note="Age is counted from the bill date." cols={[{ key: 'client', label: 'Client', get: (r) => r.client }, { key: 'project', label: 'Project', get: (r) => r.project }, { key: 'billNo', label: 'Bill', get: (r) => r.billNo }, { key: 'date', label: 'Bill date', get: (r) => fmtD(r.date), sort: (r) => r.date }, { key: 'age', label: 'Days', align: 'right', get: (r) => r.age, sort: (r) => r.age }, { key: 'bucket', label: 'Bucket', get: (r) => r.bucket }, { key: 'pending', label: 'Pending', ...money((r) => r.pending), total: true }]} /></div>
    </div>;
  } else if (rep === 'payables') {
    const rows = data.vendors.map((v) => ({ ...v, L: partyLedger(v, data) })).filter((r) => r.L.billed || r.L.paid || r.openingBalance);
    body = <Report name="payables" setFallback={setFallback} search={['name', 'type']} rows={rows} note="Negative balance = advance paid that the party still has to work off."
      cols={[{ key: 'name', label: 'Party', get: (r) => r.name }, { key: 'type', label: 'Type', get: (r) => r.type }, { key: 'ob', label: 'Opening', ...money((r) => rs(r.openingBalance)), total: true }, { key: 'billed', label: 'Billed', ...money((r) => r.L.billed), total: true }, { key: 'paid', label: 'Paid', ...money((r) => r.L.paid), total: true }, { key: 'bal', label: 'Balance owed', ...money((r) => r.L.balance), total: true }, { key: 'last', label: 'Last activity', get: (r) => fmtD(r.L.lastDate), sort: (r) => r.L.lastDate }]} />;
  } else if (rep === 'partner') {
    const p = (settings.partners || []).find((x) => x.id === partnerId) || settings.partners?.[0];
    const L = p ? partnerLedger(p, data) : null;
    body = !p ? <Empty title="No partners set" /> : <div className="space-y-3">
      <Select aria-label="Partner" className="w-auto" options={settings.partners.map((x) => ({ value: x.id, label: x.name }))} value={p.id} onChange={(e) => setPartnerId(e.target.value)} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Stat label="Capital contributed" value={fmtPKR(L.contributed)} /><Stat label="Withdrawn" value={fmtPKR(L.withdrawn)} /><Stat label="Capital balance" value={fmtPKR(L.capital)} /><Stat label={L.loan >= 0 ? 'Company owes partner (loan)' : 'Partner owes company'} value={fmtPKR(Math.abs(L.loan))} /></div>
      <Report name={`partner-${p.name}`} setFallback={setFallback} rows={L.rows} cols={[{ key: 'date', label: 'Date', get: (r) => fmtD(r.date), sort: (r) => r.date }, { key: 'type', label: 'Type', get: (r) => PARTNER_TX[r.type]?.label }, { key: 'amount', label: 'Amount', ...money((r) => rs(r.amount)) }, { key: 'account', label: 'Account', get: (r) => r.account }, { key: 'capBal', label: 'Capital balance', ...money((r) => r.capBal) }, { key: 'loanBal', label: 'Loan balance', ...money((r) => r.loanBal) }, { key: 'notes', label: 'Notes', get: (r) => r.notes }]} />
      <p className="text-[13px] text-mute">Profit share isn't fixed until you distribute it — use Partners › Profit distribution.</p>
    </div>;
  } else if (rep === 'tax') {
    const inFy = (iso) => iso && fyOf(iso) === fy;
    const billsFy = data.bills.filter((b) => inFy(b.date));
    const byProj = {}; billsFy.forEach((b) => { const k = b.projectId; byProj[k] = byProj[k] || { id: k, project: pName(k), gross: 0, it: 0, st: 0 }; byProj[k].gross += rs(b.gross); byProj[k].it += rs(b.ded?.incomeTax?.amt); byProj[k].st += rs(b.ded?.salesTax?.amt); });
    const expFy = data.expenses.filter((e) => inFy(e.date));
    const cats = {}; expFy.forEach((e) => { cats[e.category] = cats[e.category] || { id: e.category, category: e.category, ded: 0, non: 0 }; cats[e.category][e.taxDeductible ? 'ded' : 'non'] += rs(e.amount); });
    const itTot = Object.values(byProj).reduce((s, r) => s + r.it, 0), stTot = Object.values(byProj).reduce((s, r) => s + r.st, 0), dedTot = Object.values(cats).reduce((s, r) => s + r.ded, 0);
    body = <div className="space-y-6">
      <div className="flex items-center gap-2">{fySel}<span className="text-[14px] text-mute">By bill date / expense date</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Stat label="Income tax withheld by clients" value={fmtPKR(itTot)} /><Stat label="Sales tax withheld by clients" value={fmtPKR(stTot)} /><Stat label="Tax-deductible expenses" value={fmtPKR(dedTot)} /></div>
      <div><h3 className="font-bold mb-2">Withholding deducted by clients</h3><Report name={`tax-withholding-${fy}`} setFallback={setFallback} rows={Object.values(byProj)} cols={[{ key: 'project', label: 'Project', get: (r) => r.project }, { key: 'gross', label: 'Gross billed', ...money((r) => r.gross), total: true }, { key: 'it', label: 'Income tax withheld', ...money((r) => r.it), total: true }, { key: 'st', label: 'Sales tax withheld', ...money((r) => r.st), total: true }]} /></div>
      <div><h3 className="font-bold mb-2">Expenses by category</h3><Report name={`tax-expenses-${fy}`} setFallback={setFallback} rows={Object.values(cats)} cols={[{ key: 'category', label: 'Category', get: (r) => r.category }, { key: 'ded', label: 'Marked tax-deductible', ...money((r) => r.ded), total: true }, { key: 'non', label: 'Not marked', ...money((r) => r.non), total: true }]} note="Keep the clients' withholding certificates — your accountant will need them to claim these amounts. Have your accountant confirm what is actually deductible." /></div>
    </div>;
  } else if (rep === 'project') {
    const p = data.projects.find((x) => x.id === projId) || data.projects[0];
    body = !p ? <Empty title="No projects yet" /> : <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Select aria-label="Project" className="w-auto max-w-[320px]" options={data.projects.map((x) => ({ value: x.id, label: x.name }))} value={p.id} onChange={(e) => setProjId(e.target.value)} />
        <Btn kind="primary" onClick={async () => { await saveFile(`project-report-${p.name.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}-${todayISO()}.html`, projectReportHTML(p, data, settings), setFallback); api.log(`Exported printable report for “${p.name}”`); }}>Download printable report</Btn>
      </div>
      <p className="text-[14px] text-mute">Downloads one page with the contract, financial position, every bill and every expense. Open it in your browser and press Ctrl+P (⌘P on Mac) to print or save as PDF. Printing straight from this app is blocked by the viewer.</p>
      <Card title="Preview"><iframe title="Project report preview" sandbox="" className="w-full h-[600px] bg-white rounded border border-line" srcDoc={projectReportHTML(p, data, settings)} /></Card>
    </div>;
  }

  return (
    <div>
      <PageHead title="Reports" text="Every report exports to CSV for Excel or your accountant." />
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5">
        <nav aria-label="Reports" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1">
          {REPORTS.map(([k, l]) => <button key={k} type="button" onClick={() => choose(k)} className={`shrink-0 text-left px-3 h-11 rounded-md text-[15px] font-semibold whitespace-nowrap ${rep === k ? 'grad-bg text-white' : 'hover:bg-soft text-ink'}`}>{l}</button>)}
        </nav>
        <div className="min-w-0">{body}</div>
      </div>
      {fallback && <FallbackModal file={fallback} onClose={() => setFallback(null)} />}
    </div>
  );
}

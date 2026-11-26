// =====================================================================
// projectspace.jsx — One project's own workspace. Everything is filtered
// to this project only: billing, expenses (with slips), cash in/out,
// materials, vendors and machines. Add buttons pre-select the project.
// =====================================================================
import React, { useMemo, useState } from 'react';
import { fmtPKR, fmtD, fmtQty, rs, todayISO, days, projectFigures, billNet, billPending, billStatus, billRetention, billDeductionTotal, stockOf, cashMovements, EXPENSE_CATS } from './lib.js';
import { Btn, Select, Confirm, Badge, Empty, DataTable, Stat, Card, BarRows, AttachmentThumbs, cx } from './ui.jsx';
import { BillForm, ReleaseRetention, billTone } from './billing.jsx';
import { ExpenseForm } from './expenses.jsx';
import { MoveForm } from './inventory.jsx';
import { VendorBillForm } from './vendors.jsx';
import { projectReportHTML } from './reports.jsx';
import { saveFile, FallbackModal } from './datapage.jsx';

export const statusTone = (s) => ({ Awarded: 'brick', Ongoing: 'ok', Completed: 'ink', 'On hold': 'warn' }[s] || 'mute');
export function expiryBadge(iso) {
  if (!iso) return <span className="text-mute">—</span>;
  const d = days(todayISO(), iso);
  if (d < 0) return <Badge tone="bad">Expired {fmtD(iso)}</Badge>;
  if (d <= 30) return <Badge tone="warn">{d} days · {fmtD(iso)}</Badge>;
  return <Badge tone="ok">{fmtD(iso)}</Badge>;
}

const TABS = [['overview', 'Overview'], ['billing', 'Billing'], ['expenses', 'Expenses'], ['cash', 'Cash in / out'], ['inventory', 'Materials'], ['vendors', 'Vendors & labour'], ['equipment', 'Machines']];

export default function ProjectSpace({ p, data, settings, api, go, onEdit, onDelete }) {
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null); // {kind, ...}
  const [fallback, setFallback] = useState(null);
  const [cat, setCat] = useState('All');
  const f = useMemo(() => projectFigures(p, data), [p, data]);
  const budget = rs(p.budget);
  const close = () => setModal(null);
  const vName = (id) => data.vendors.find((v) => v.id === id)?.name;

  // ----- per-project derived data -----
  const exps = f.exps;
  const missingSlips = exps.filter((e) => !(e.attachments || []).length).length;
  const byCat = {}; exps.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + rs(e.amount); });
  const moves = useMemo(() => cashMovements(data).filter((m) => m.projectId === p.id && m.kind !== 'transfer'), [data, p.id]);
  const cashRows = useMemo(() => { let bal = 0; return moves.map((m) => { bal += m.dir === 'in' ? m.amount : -m.amount; return { ...m, balance: bal }; }); }, [moves]);
  const cashIn = moves.filter((m) => m.dir === 'in').reduce((s, m) => s + m.amount, 0);
  const cashOut = moves.filter((m) => m.dir === 'out').reduce((s, m) => s + m.amount, 0);
  const issues = data.stockmoves.filter((m) => m.type === 'issue' && m.projectId === p.id).map((m) => { const it = data.items.find((i) => i.id === m.itemId); const S = it ? stockOf(it, data) : null; return { ...m, it, value: Math.round(Number(m.qty) * (S?.avgCost || 0)) }; });
  const issueSum = {}; issues.forEach((m) => { if (!m.it) return; issueSum[m.itemId] = issueSum[m.itemId] || { id: m.itemId, name: m.it.name, unit: m.it.unit, qty: 0, value: 0 }; issueSum[m.itemId].qty += Number(m.qty); issueSum[m.itemId].value += m.value; });
  const materialSpend = exps.filter((e) => e.category === 'Materials').reduce((s, e) => s + rs(e.amount), 0);
  const vbills = data.vendorbills.filter((b) => b.projectId === p.id);
  const vendorRows = data.vendors.map((v) => {
    const billed = vbills.filter((b) => b.partyId === v.id).reduce((s, b) => s + rs(b.amount), 0);
    const paid = exps.filter((e) => e.vendorId === v.id).reduce((s, e) => s + rs(e.amount), 0);
    return { id: v.id, name: v.name, type: v.type, billed, paid, balance: billed - paid };
  }).filter((r) => r.billed || r.paid);
  const unlinkedLabour = exps.filter((e) => !e.vendorId && (e.category === 'Labour' || e.category === 'Subcontractor')).reduce((s, e) => s + rs(e.amount), 0);
  const machines = data.equipment.map((q) => {
    const qe = exps.filter((e) => e.equipmentId === q.id);
    const hours = (q.log || []).filter((l) => l.type === 'hours' && l.projectId === p.id).reduce((s, l) => s + (Number(l.hours) || 0), 0);
    return { id: q.id, name: q.name, kind: q.kind, here: q.currentProjectId === p.id, cost: qe.reduce((s, e) => s + rs(e.amount), 0), litres: qe.reduce((s, e) => s + (Number(e.litres) || 0), 0), hours };
  }).filter((r) => r.here || r.cost || r.hours);

  const tabBadge = { billing: f.bills.length, expenses: exps.length, inventory: Object.keys(issueSum).length, vendors: vendorRows.length, equipment: machines.length };

  const expenseCols = [
    { key: 'date', label: 'Date', nowrap: true, render: (e) => fmtD(e.date) },
    { key: 'payee', label: 'Paid to', render: (e) => <div className="min-w-[160px]"><div className="font-semibold">{e.payee}</div>{e.notes && <div className="text-[13px] text-mute">{e.notes}</div>}</div> },
    { key: 'category', label: 'Category' },
    { key: 'method', label: 'Method', render: (e) => <span>{e.method}{e.ref ? <span className="block text-[13px] text-mute">{e.ref}</span> : null}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (e) => fmtPKR(e.amount) },
    { key: 'slip', label: 'Slip', sort: (e) => (e.attachments || []).length, render: (e) => ((e.attachments || []).length ? <AttachmentThumbs items={e.attachments} size={36} /> : <button type="button" className="text-[13px] text-warn underline" onClick={() => setModal({ kind: 'expense', initial: e })}>Add slip</button>) },
    { key: 'act', label: '', nosort: true, render: (e) => <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setModal({ kind: 'expense', initial: e })}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setModal({ kind: 'delExpense', e })}>Delete</Btn></div> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="text-[15px] text-mute hover:text-ink min-h-[44px]" onClick={() => go('projects')}>← All projects</button>
            {data.projects.length > 1 && <Select aria-label="Switch project" className="w-auto h-9 text-[14px] max-w-[260px]" options={data.projects.map((x) => ({ value: x.id, label: x.name }))} value={p.id} onChange={(e) => go('p-' + e.target.value)} />}
          </div>
          <h1 className="text-[clamp(26px,3.5vw,40px)] font-bold leading-tight [text-wrap:balance]">{p.name}</h1>
          <p className="text-mute mt-1">{p.client}{p.tenderNo ? ` · Tender ${p.tenderNo}` : ''}{p.location ? ` · ${p.location}` : ''}</p>
          <div className="flex flex-wrap gap-2 items-center mt-2">
            <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            <span className="text-[14px] text-mute">{fmtD(p.start)} → {fmtD(p.end)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={async () => { await saveFile(`project-report-${p.name.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}-${todayISO()}.html`, projectReportHTML(p, data, settings), setFallback); }}>Printable report</Btn>
          <Btn onClick={onEdit}>Edit</Btn><Btn kind="danger" onClick={onDelete}>Delete</Btn>
        </div>
      </div>

      {/* Headline numbers for this project */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat accent="var(--violet)" label="Contract value" value={fmtPKR(p.value)} sub={`${p.progress || 0}% complete`} />
        <Stat accent="var(--teal)" label="Received from client" value={fmtPKR(f.received + f.retentionReleased)} sub={`Billed ${fmtPKR(f.billedGross)}`} />
        <Stat accent="var(--coral)" label="Spent on this project" value={fmtPKR(f.cost)} sub={budget ? `Budget ${fmtPKR(budget)} · ${Math.round((f.cost / budget) * 100)}% used` : 'No budget set'} tone={budget && f.cost > budget ? 'bad' : undefined} />
        <Stat accent="var(--blue)" label="Project profit (cash)" value={fmtPKR(f.cashProfit)} sub={`Still to receive ${fmtPKR(f.pending)}`} tone={f.cashProfit < 0 ? 'bad' : 'ok'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line overflow-x-auto" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx('shrink-0 h-11 px-4 font-semibold border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-2', tab === k ? 'border-[#8b5cf6] text-ink' : 'border-transparent text-mute hover:text-ink')}>
            {l}{tabBadge[k] ? <span className="text-[12px] rounded-full px-1.5 bg-soft text-mute">{tabBadge[k]}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-[14px] mb-1"><span className="font-semibold">Work progress</span><span className="tabular-nums">{p.progress || 0}%</span></div>
            <div className="h-3 bg-soft rounded-sm"><div className="h-full rounded-sm bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#8b5cf6]" style={{ width: `${Math.min(100, p.progress || 0)}%` }} /></div>
          </div>
          {budget > 0 && (
            <div>
              <div className="flex justify-between text-[14px] mb-1"><span className="font-semibold">Budget used</span><span className={cx('tabular-nums', f.cost > budget && 'text-bad')}>{fmtPKR(f.cost)} of {fmtPKR(budget)}</span></div>
              <div className="h-3 bg-soft rounded-sm"><div className="h-full rounded-sm" style={{ width: `${Math.min(100, (f.cost / budget) * 100)}%`, background: f.cost > budget ? 'var(--bad)' : 'linear-gradient(90deg,#fb7a5c,#f472b6)' }} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat accent="var(--sky)" label="Net billed (after deductions)" value={fmtPKR(f.billedNet)} />
            <Stat accent="var(--pink)" label="Retention held by client" value={fmtPKR(f.retentionHeld)} />
            <Stat accent="var(--gold)" label="Tax withheld by client" value={fmtPKR(f.taxWithheld)} />
            <Stat accent="var(--violet)" label="Profit (billed − cost)" value={fmtPKR(f.earnedProfit)} tone={f.earnedProfit < 0 ? 'bad' : 'ok'} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Where the money went"><BarRows rows={Object.entries(byCat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} emptyText="No expenses for this project yet." /></Card>
            <Card title="Guarantee & terms">
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 text-[15px]">
                <dt className="text-mute">Performance guarantee</dt><dd className="text-right tabular-nums">{p.pgAmount ? fmtPKR(p.pgAmount) : '—'}</dd>
                <dt className="text-mute">Bank</dt><dd className="text-right">{p.pgBank || '—'}</dd>
                <dt className="text-mute">Guarantee expiry</dt><dd className="text-right">{expiryBadge(p.pgExpiry)}</dd>
                <dt className="text-mute">Retention</dt><dd className="text-right">{p.retentionPct || 0}%</dd>
                <dt className="text-mute">Slips missing on expenses</dt><dd className={cx('text-right', missingSlips && 'text-warn')}>{missingSlips}</dd>
              </dl>
              {p.notes && <p className="whitespace-pre-wrap text-[15px] mt-4 pt-3 border-t border-line">{p.notes}</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat accent="var(--blue)" label="Gross billed" value={fmtPKR(f.billedGross)} />
            <Stat accent="var(--teal)" label="Received" value={fmtPKR(f.received)} />
            <Stat accent="var(--coral)" label="Pending from client" value={fmtPKR(f.pending)} tone={f.pending ? 'bad' : undefined} />
            <Stat accent="var(--pink)" label="Retention held" value={fmtPKR(f.retentionHeld)} sub={f.retentionReleased ? `Released ${fmtPKR(f.retentionReleased)}` : undefined} />
          </div>
          <DataTable rows={f.bills} search={['billNo', 'notes', 'type']} initialSort={{ k: 'date', d: 'desc' }}
            toolbar={<Btn kind="accent" onClick={() => setModal({ kind: 'bill' })}>+ New bill for this project</Btn>}
            empty={<Empty title="No bills for this project yet" text="Add each running or final bill you submit to the client." action={<Btn kind="accent" onClick={() => setModal({ kind: 'bill' })}>+ New bill</Btn>} />}
            cols={[
              { key: 'billNo', label: 'Bill', render: (b) => <span className="font-semibold">{b.billNo} <span className="text-[13px] text-mute font-normal">{b.type}</span></span> },
              { key: 'date', label: 'Date', nowrap: true, render: (b) => fmtD(b.date) },
              { key: 'gross', label: 'Gross', align: 'right', render: (b) => fmtPKR(b.gross) },
              { key: 'ded', label: 'Deductions', align: 'right', sort: billDeductionTotal, render: (b) => fmtPKR(billDeductionTotal(b)) },
              { key: 'net', label: 'Net', align: 'right', sort: billNet, render: (b) => fmtPKR(billNet(b)) },
              { key: 'received', label: 'Received', align: 'right', render: (b) => <span>{fmtPKR(b.received)}<span className="block text-[13px] text-mute">{fmtD(b.receivedDate)}</span></span> },
              { key: 'pending', label: 'Pending', align: 'right', sort: billPending, render: (b) => fmtPKR(billPending(b)) },
              { key: 'status', label: 'Status', sort: billStatus, render: (b) => <Badge tone={billTone(billStatus(b))}>{billStatus(b)}</Badge> },
              { key: 'ret', label: 'Retention', sort: billRetention, render: (b) => (billRetention(b) ? (b.retentionReleased ? <Badge tone="ok">Released</Badge> : <Btn size="sm" onClick={() => setModal({ kind: 'release', bill: b })}>Release {fmtPKR(billRetention(b))}</Btn>) : '—') },
              { key: 'act', label: '', nosort: true, render: (b) => <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setModal({ kind: 'bill', initial: b })}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setModal({ kind: 'delBill', b })}>Delete</Btn></div> },
            ]} />
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat accent="var(--coral)" label="Total spent" value={fmtPKR(f.cost)} sub={`${exps.length} expenses`} />
            <Stat accent="var(--gold)" label="Without a slip" value={missingSlips} sub={missingSlips ? 'Attach slips to keep check & balance' : 'Every expense has proof'} tone={missingSlips ? 'bad' : 'ok'} />
            <Stat accent="var(--teal)" label="Paid in cash" value={fmtPKR(exps.filter((e) => e.method === 'Cash').reduce((s, e) => s + rs(e.amount), 0))} />
          </div>
          <DataTable rows={exps.filter((e) => cat === 'All' || e.category === cat)} search={['payee', 'category', 'ref', 'notes', 'method']} initialSort={{ k: 'date', d: 'desc' }}
            toolbar={<><Select aria-label="Category" className="w-auto" options={['All', ...EXPENSE_CATS]} value={cat} onChange={(e) => setCat(e.target.value)} /><Btn kind="accent" onClick={() => setModal({ kind: 'expense', preset: { projectId: p.id } })}>+ New expense</Btn></>}
            empty={<Empty title="No expenses for this project yet" text="Record materials, labour, fuel and other costs — with a photo of the slip." action={<Btn kind="accent" onClick={() => setModal({ kind: 'expense', preset: { projectId: p.id } })}>+ New expense</Btn>} />}
            cols={expenseCols}
            footer={(v) => <tr className="border-t border-line font-bold"><td className="px-3 py-2" colSpan={4}>Total</td><td className="px-3 py-2 text-right tabular-nums">{fmtPKR(v.reduce((s, e) => s + rs(e.amount), 0))}</td><td colSpan={2} /></tr>} />
        </div>
      )}

      {tab === 'cash' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat accent="var(--teal)" label="Money in" value={fmtPKR(cashIn)} sub="Bill receipts + retention" />
            <Stat accent="var(--coral)" label="Money out" value={fmtPKR(cashOut)} sub="Expenses on this project" />
            <Stat accent="var(--blue)" label="Net cash" value={fmtPKR(cashIn - cashOut)} tone={cashIn - cashOut < 0 ? 'bad' : 'ok'} />
          </div>
          <DataTable rows={cashRows} search={['desc', 'party', 'src']} initialSort={{ k: 'date', d: 'desc' }}
            empty={<Empty title="No money in or out yet" text="Bill receipts and expenses for this project show here automatically." />}
            cols={[
              { key: 'date', label: 'Date', nowrap: true, sort: (r) => r.date + r.id, render: (r) => fmtD(r.date) },
              { key: 'desc', label: 'Details', render: (r) => <div className="min-w-[200px]"><div>{r.desc}</div><div className="text-[13px] text-mute">{[r.party, r.src].filter(Boolean).join(' · ')}</div></div> },
              { key: 'account', label: 'Cash / bank', render: (r) => (r.account === 'cash' ? 'Cash' : 'Bank') },
              { key: 'in', label: 'In', align: 'right', sort: (r) => (r.dir === 'in' ? r.amount : 0), render: (r) => (r.dir === 'in' ? <span className="text-ok">{fmtPKR(r.amount)}</span> : '') },
              { key: 'out', label: 'Out', align: 'right', sort: (r) => (r.dir === 'out' ? r.amount : 0), render: (r) => (r.dir === 'out' ? fmtPKR(r.amount) : '') },
              { key: 'balance', label: 'Running net', align: 'right', render: (r) => <span className={r.balance < 0 ? 'text-bad' : ''}>{fmtPKR(r.balance)}</span> },
            ]} />
          <p className="text-[13px] text-mute">Running net starts at zero for this project: what the client paid minus what you spent on it, in date order.</p>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 max-w-2xl">
            <Stat accent="var(--sky)" label="Materials issued from store" value={fmtPKR(issues.reduce((s, m) => s + m.value, 0))} sub="At average cost" />
            <Stat accent="var(--coral)" label="Materials bought for this project" value={fmtPKR(materialSpend)} sub="Expenses in Materials" />
          </div>
          <Card title="Materials used on this project" right={<Btn size="sm" kind="accent" disabled={!data.items.length} onClick={() => setModal({ kind: 'issue' })}>Issue material to this project</Btn>}>
            <DataTable rows={Object.values(issueSum)} initialSort={{ k: 'value', d: 'desc' }}
              empty={<Empty title="Nothing issued yet" text={data.items.length ? 'Issue cement, steel, crush etc. from the store to this site.' : 'Add your stock items in Inventory first.'} />}
              cols={[{ key: 'name', label: 'Material', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'qty', label: 'Quantity', align: 'right', render: (r) => `${fmtQty(r.qty)} ${r.unit}` }, { key: 'value', label: 'Value', align: 'right', render: (r) => fmtPKR(r.value) }]} />
          </Card>
          <Card title="Issue history">
            <DataTable rows={issues} initialSort={{ k: 'date', d: 'desc' }} empty={<p className="text-mute">No issues yet.</p>}
              cols={[{ key: 'date', label: 'Date', nowrap: true, render: (m) => fmtD(m.date) }, { key: 'item', label: 'Material', sort: (m) => m.it?.name, render: (m) => m.it?.name || '(deleted)' }, { key: 'qty', label: 'Qty', align: 'right', render: (m) => `${fmtQty(m.qty)} ${m.it?.unit || ''}` }, { key: 'value', label: 'Value', align: 'right', render: (m) => fmtPKR(m.value) }, { key: 'notes', label: 'Notes', render: (m) => <span className="text-mute">{m.notes || m.ref}</span> }]} />
          </Card>
        </div>
      )}

      {tab === 'vendors' && (
        <div className="space-y-4">
          <Card title="Vendors & labour on this project" right={<div className="flex flex-wrap gap-2"><Btn size="sm" onClick={() => setModal({ kind: 'vbill' })}>+ Vendor bill</Btn><Btn size="sm" kind="accent" onClick={() => setModal({ kind: 'expense', preset: { projectId: p.id, category: 'Labour' } })}>+ Pay vendor / labour</Btn></div>}>
            <DataTable rows={vendorRows} initialSort={{ k: 'balance', d: 'desc' }}
              empty={<Empty title="No vendor activity on this project" text="Vendor bills and payments tagged to this project show here." />}
              cols={[
                { key: 'name', label: 'Party', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'type', label: 'Type' },
                { key: 'billed', label: 'Billed for this project', align: 'right', render: (r) => fmtPKR(r.billed) },
                { key: 'paid', label: 'Paid for this project', align: 'right', render: (r) => fmtPKR(r.paid) },
                { key: 'balance', label: 'Still owed', align: 'right', render: (r) => <span className={r.balance > 0 ? 'text-bad font-semibold' : r.balance < 0 ? 'text-ok' : ''}>{r.balance < 0 ? 'Advance ' + fmtPKR(-r.balance) : fmtPKR(r.balance)}</span> },
              ]} />
            {unlinkedLabour > 0 && <p className="text-[13px] text-mute mt-2">Plus {fmtPKR(unlinkedLabour)} of labour / subcontract payments not linked to a listed vendor.</p>}
          </Card>
          <Card title="Vendor bills for this project">
            <DataTable rows={vbills} search={['billNo', 'notes', (b) => vName(b.partyId)]} initialSort={{ k: 'date', d: 'desc' }} empty={<p className="text-mute">No vendor bills yet.</p>}
              cols={[
                { key: 'date', label: 'Date', nowrap: true, render: (b) => fmtD(b.date) },
                { key: 'party', label: 'Vendor', sort: (b) => vName(b.partyId), render: (b) => vName(b.partyId) || '(deleted)' },
                { key: 'notes', label: 'Details', render: (b) => <div className="min-w-[160px]"><div>{b.notes || '—'}</div>{b.billNo && <div className="text-[13px] text-mute">{b.billNo}</div>}</div> },
                { key: 'amount', label: 'Amount', align: 'right', render: (b) => fmtPKR(b.amount) },
                { key: 'slip', label: 'Slip', nosort: true, render: (b) => <AttachmentThumbs items={b.attachments} size={36} /> },
                { key: 'act', label: '', nosort: true, render: (b) => <Btn size="sm" onClick={() => setModal({ kind: 'vbill', initial: b })}>Edit</Btn> },
              ]} />
          </Card>
        </div>
      )}

      {tab === 'equipment' && (
        <div className="space-y-3">
          <DataTable rows={machines} initialSort={{ k: 'cost', d: 'desc' }}
            toolbar={<Btn kind="accent" disabled={!data.equipment.length} onClick={() => setModal({ kind: 'expense', preset: { projectId: p.id, category: 'Fuel', equipmentId: data.equipment.find((q) => q.currentProjectId === p.id)?.id || data.equipment[0]?.id || '' } })}>+ Machine cost (fuel, rent, repair)</Btn>}
            empty={<Empty title="No machines on this project" text={data.equipment.length ? 'Move a machine to this site in Equipment, or add its fuel / rent here.' : 'Add your machines in Equipment first.'} action={<Btn onClick={() => go('equipment')}>Open Equipment</Btn>} />}
            cols={[
              { key: 'name', label: 'Machine', render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'kind', label: 'Owned / rented', render: (r) => <Badge tone={r.kind === 'Owned' ? 'ink' : 'brick'}>{r.kind}</Badge> },
              { key: 'here', label: 'On site now', sort: (r) => (r.here ? 1 : 0), render: (r) => (r.here ? <Badge tone="ok">Yes</Badge> : '—') },
              { key: 'hours', label: 'Hours here', align: 'right', render: (r) => fmtQty(r.hours) },
              { key: 'litres', label: 'Fuel (L)', align: 'right', render: (r) => fmtQty(r.litres) },
              { key: 'cost', label: 'Cost on this project', align: 'right', render: (r) => fmtPKR(r.cost) },
            ]} />
        </div>
      )}

      {/* Modals */}
      {modal?.kind === 'bill' && <BillForm initial={modal.initial || null} presetProjectId={p.id} data={data} settings={settings} api={api} onClose={close} />}
      {modal?.kind === 'release' && <ReleaseRetention bill={modal.bill} api={api} pname={p.name} onClose={close} />}
      {modal?.kind === 'expense' && <ExpenseForm initial={modal.initial || null} preset={modal.preset || null} data={data} api={api} onClose={close} />}
      {modal?.kind === 'issue' && <MoveForm type="issue" presetProjectId={p.id} data={data} api={api} onClose={close} />}
      {modal?.kind === 'vbill' && <VendorBillForm initial={modal.initial || null} party={modal.initial ? data.vendors.find((v) => v.id === modal.initial.partyId) : null} presetProjectId={p.id} data={data} api={api} onClose={close} />}
      {modal?.kind === 'delBill' && <Confirm title="Delete bill?" text={`Bill ${modal.b.billNo} will be deleted. This cannot be undone.`} onConfirm={() => api.del('bills', modal.b.id, `Deleted bill ${modal.b.billNo} (${p.name})`)} onClose={close} />}
      {modal?.kind === 'delExpense' && <Confirm title="Delete expense?" text={`${fmtPKR(modal.e.amount)} paid to ${modal.e.payee} on ${fmtD(modal.e.date)} will be deleted.`} onConfirm={() => api.del('expenses', modal.e.id, `Deleted expense ${fmtPKR(modal.e.amount)} — ${modal.e.payee}`)} onClose={close} />}
      {fallback && <FallbackModal file={fallback} onClose={() => setFallback(null)} />}
    </div>
  );
}

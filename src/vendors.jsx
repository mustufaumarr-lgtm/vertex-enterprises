// =====================================================================
// vendors.jsx — Suppliers, subcontractors and labour: ledgers + payables
// Bills from a party increase what we owe; payments are Expenses linked
// to the party (expense.vendorId), so cash and project costs stay in one place.
// =====================================================================
import React, { useState } from 'react';
import { PARTY_TYPES, fmtPKR, fmtD, parseMoney, uid, todayISO, days, partyLedger } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, Card, Attachments, AttachmentThumbs, PageHead } from './ui.jsx';
import { ExpenseForm } from './expenses.jsx';

const defaultCat = (t) => ({ Supplier: 'Materials', Subcontractor: 'Subcontractor', 'Labour contractor': 'Labour', Labourer: 'Labour', 'Equipment owner': 'Equipment rental' }[t] || 'Misc');

function PartyForm({ initial, api, onClose, data }) {
  const [f, setF] = useState(() => initial ? { ...initial, openingBalance: String(initial.openingBalance ?? 0) } : { name: '', type: 'Supplier', phone: '', cnicNtn: '', address: '', openingBalance: '0', notes: '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Name is required';
    else if (data.vendors.some((v) => v.name.trim().toLowerCase() === f.name.trim().toLowerCase() && v.id !== initial?.id)) e.name = 'A party with this name already exists';
    const ob = parseMoney(f.openingBalance || 0);
    if (Number.isNaN(ob)) e.openingBalance = 'Enter a number (negative if they owe you / advance)';
    setErr(e); if (Object.keys(e).length) return;
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('ven'), name: f.name.trim(), openingBalance: ob };
    if (await api.put('vendors', rec, `${initial ? 'Edited' : 'Added'} party “${rec.name}”`, 'Saved')) onClose();
  };
  return (
    <Modal title={initial ? 'Edit party' : 'New vendor / labour party'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name" required error={err.name} className="sm:col-span-2"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Type"><Select options={PARTY_TYPES} value={f.type} onChange={set('type')} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="CNIC / NTN"><Input value={f.cnicNtn} onChange={set('cnicNtn')} /></Field>
        <Field label="Opening balance owed (PKR)" error={err.openingBalance} hint="What you owed them before using this app"><Input inputMode="numeric" value={f.openingBalance} onChange={set('openingBalance')} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export function VendorBillForm({ initial, party, data, api, onClose, presetProjectId }) {
  const [f, setF] = useState(() => initial ? { ...initial, amount: String(initial.amount) } : { partyId: party?.id || data.vendors[0]?.id || '', date: todayISO(), billNo: '', projectId: presetProjectId ?? (data.projects.find((p) => p.status === 'Ongoing')?.id || ''), amount: '', dueDate: '', notes: '', attachments: [] });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.date) e.date = 'Date is required';
    const amount = parseMoney(f.amount);
    if (!(amount > 0)) e.amount = 'Enter an amount above zero';
    if (f.dueDate && f.dueDate < f.date) e.dueDate = 'Due date cannot be before the bill date';
    if (!f.partyId) e.partyId = 'Choose the vendor';
    setErr(e); if (Object.keys(e).length) return;
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('vb'), amount };
    const pty = data.vendors.find((v) => v.id === f.partyId);
    if (await api.put('vendorbills', rec, `${initial ? 'Edited' : 'Added'} bill from ${pty?.name}: ${fmtPKR(amount)}`, 'Bill saved')) onClose();
  };
  if (!data.vendors.length) return <Modal title="Vendor bill" onClose={onClose}><Empty title="Add a vendor first" text="Create the supplier, subcontractor or labour party in Vendors & labour, then add their bill." /></Modal>;
  return (
    <Modal title={party ? `${initial ? 'Edit' : 'New'} bill from ${party.name}` : 'New vendor bill'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save bill</Btn></>}>
      <p className="text-[14px] text-mute mb-4">Record what you owe them (their invoice, a labour sheet or a subcontractor's running bill). Pay it later with “Record payment”.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!party && <Field label="Vendor / party" required error={err.partyId} className="sm:col-span-2"><Select options={data.vendors.map((v) => ({ value: v.id, label: `${v.name} (${v.type})` }))} value={f.partyId} onChange={set('partyId')} /></Field>}
        <Field label="Bill date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Their bill / invoice no."><Input value={f.billNo} onChange={set('billNo')} /></Field>
        <Field label="Amount (PKR)" required error={err.amount}><Input inputMode="numeric" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Due date" error={err.dueDate}><Input type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
        <Field label="Project" className="sm:col-span-2"><Select options={[...data.projects.map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'Office / General' }]} value={f.projectId} onChange={set('projectId')} /></Field>
        <Field label="Details" className="sm:col-span-2"><TextArea value={f.notes} onChange={set('notes')} placeholder="e.g. 500 bags cement @ 1,450" /></Field>
        <div className="sm:col-span-2 pt-2 border-t border-line"><Attachments label="Vendor's bill / slip photo" value={f.attachments || []} onChange={(v) => setF((x) => ({ ...x, attachments: v }))} /></div>
      </div>
    </Modal>
  );
}

function PartyDetail({ party, data, api, onBack, onEdit, onDelete }) {
  const [bill, setBill] = useState(null);
  const [pay, setPay] = useState(null);
  const [delBill, setDelBill] = useState(null);
  const L = partyLedger(party, data);
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '—' : 'Office / General');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" className="text-[15px] text-mute hover:text-ink min-h-[44px]" onClick={onBack}>← All parties</button>
          <h1 className="text-[clamp(26px,3.5vw,38px)] font-bold leading-tight">{party.name}</h1>
          <p className="text-mute mt-1">{party.type}{party.phone ? ` · ${party.phone}` : ''}{party.cnicNtn ? ` · ${party.cnicNtn}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn kind="accent" onClick={() => setPay({ vendorId: party.id, payee: party.name, category: defaultCat(party.type) })}>Record payment</Btn>
          <Btn onClick={() => setBill('new')}>+ Their bill</Btn>
          <Btn onClick={onEdit}>Edit</Btn><Btn kind="danger" onClick={onDelete}>Delete</Btn>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Opening balance" value={fmtPKR(party.openingBalance)} />
        <Stat label="Billed to you" value={fmtPKR(L.billed)} />
        <Stat label="Paid (incl. advances)" value={fmtPKR(L.paid)} />
        <Stat label={L.balance < 0 ? 'Advance with them' : 'You owe them'} value={fmtPKR(Math.abs(L.balance))} tone={L.balance > 0 ? 'bad' : L.balance < 0 ? 'ok' : undefined} />
      </div>
      <Card title="Ledger">
        <DataTable
          rows={L.rows}
          search={['desc', 'ref', (r) => pName(r.projectId)]}
          initialSort={{ k: 'date', d: 'desc' }}
          empty={<Empty title="No transactions yet" text="Add their bill or record a payment." />}
          cols={[
            { key: 'date', label: 'Date', nowrap: true, sort: (r) => r.date + r.kind, render: (r) => fmtD(r.date) },
            { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.kind === 'bill' ? 'bad' : r.kind === 'advance' ? 'warn' : 'ok'}>{r.kind === 'bill' ? 'Bill' : r.kind === 'advance' ? 'Advance' : 'Payment'}</Badge> },
            { key: 'desc', label: 'Details', render: (r) => <div className="min-w-[180px]"><div>{r.desc}</div><div className="text-[13px] text-mute">{[r.ref, pName(r.projectId)].filter(Boolean).join(' · ')}</div>{(r.src.attachments || []).length > 0 && <div className="mt-1"><AttachmentThumbs items={r.src.attachments} size={32} /></div>}</div> },
            { key: 'debit', label: 'Billed', align: 'right', render: (r) => (r.debit ? fmtPKR(r.debit) : '') },
            { key: 'credit', label: 'Paid', align: 'right', render: (r) => (r.credit ? fmtPKR(r.credit) : '') },
            { key: 'balance', label: 'Balance owed', align: 'right', render: (r) => fmtPKR(r.balance) },
            { key: 'act', label: '', nosort: true, render: (r) => (r.kind === 'bill'
              ? <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setBill(r.src)}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setDelBill(r.src)}>Delete</Btn></div>
              : <Btn size="sm" onClick={() => setPay({ __edit: r.src })}>Edit</Btn>) },
          ]}
        />
        <p className="text-[13px] text-mute mt-2">Payments are saved as expenses, so they also appear in Expenses, the Cash Book and project costs.</p>
      </Card>
      {party.notes && <Card title="Notes"><p className="whitespace-pre-wrap">{party.notes}</p></Card>}
      {bill && <VendorBillForm initial={bill === 'new' ? null : bill} party={party} data={data} api={api} onClose={() => setBill(null)} />}
      {pay && <ExpenseForm initial={pay.__edit || null} preset={pay.__edit ? null : pay} data={data} api={api} onClose={() => setPay(null)} />}
      {delBill && <Confirm title="Delete this bill?" text={`${fmtPKR(delBill.amount)} bill dated ${fmtD(delBill.date)} will be removed from ${party.name}'s ledger.`} onConfirm={() => api.del('vendorbills', delBill.id, `Deleted ${fmtPKR(delBill.amount)} bill from ${party.name}`)} onClose={() => setDelBill(null)} />}
    </div>
  );
}

export default function Vendors({ data, api }) {
  const [tab, setTab] = useState('parties');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [type, setType] = useState('All');
  const open = data.vendors.find((v) => v.id === openId);
  const rows = data.vendors.map((v) => ({ ...v, L: partyLedger(v, data) }));
  const payables = rows.filter((r) => r.L.balance > 0);
  const advances = rows.filter((r) => r.L.balance < 0);
  const totalOwed = payables.reduce((s, r) => s + r.L.balance, 0);
  const totalAdv = advances.reduce((s, r) => s - r.L.balance, 0);
  const oldestUnpaid = (v) => {
    // Age of the oldest bill not yet covered by payments (first-in, first-out)
    let paid = v.L.paid - Math.max(0, -Number(v.openingBalance || 0));
    const bills = data.vendorbills.filter((b) => b.partyId === v.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const b of bills) { if (paid >= b.amount) { paid -= b.amount; continue; } return days(b.date, todayISO()); }
    return null;
  };

  if (open) return (
    <>
      <PartyDetail party={open} data={data} api={api} onBack={() => setOpenId(null)} onEdit={() => setEdit(open)} onDelete={() => setDel(open)} />
      {edit && <PartyForm initial={edit === 'new' ? null : edit} data={data} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete party?" text={`“${del.name}” will be deleted. Their bills stay in storage but won't show; payments stay in Expenses.`} onConfirm={async () => { await api.del('vendors', del.id, `Deleted party “${del.name}”`); setOpenId(null); }} onClose={() => setDel(null)} />}
    </>
  );

  return (
    <div>
      <PageHead title="Vendors & labour" text="Suppliers, subcontractors and labour: what they billed, what you paid, and what you still owe." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New party</Btn>} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <Stat label="Total payables" value={fmtPKR(totalOwed)} sub={`${payables.length} parties to pay`} tone={totalOwed ? 'bad' : undefined} />
        <Stat label="Advances given" value={fmtPKR(totalAdv)} sub={`${advances.length} parties`} />
        <Stat label="Parties" value={rows.length} />
      </div>
      <div className="flex gap-1 mb-4 border-b border-line" role="tablist">
        {[['parties', 'All parties'], ['payables', 'Payables summary']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`shrink-0 h-11 px-4 font-semibold border-b-2 -mb-px ${tab === k ? 'border-[#8b5cf6] text-ink' : 'border-transparent text-mute hover:text-ink'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'parties' ? (
        <DataTable
          rows={rows.filter((r) => type === 'All' || r.type === type)}
          search={['name', 'type', 'phone', 'notes']}
          initialSort={{ k: 'name', d: 'asc' }}
          onRow={(r) => setOpenId(r.id)}
          toolbar={<Select aria-label="Filter by type" className="w-auto" options={['All', ...PARTY_TYPES]} value={type} onChange={(e) => setType(e.target.value)} />}
          empty={<Empty title="No vendors yet" text="Add suppliers, subcontractors and labour contractors you pay." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New party</Btn>} />}
          cols={[
            { key: 'name', label: 'Name', render: (r) => <div className="min-w-[180px]"><div className="font-semibold">{r.name}</div><div className="text-[13px] text-mute">{r.phone || ''}</div></div> },
            { key: 'type', label: 'Type' },
            { key: 'billed', label: 'Billed', align: 'right', sort: (r) => r.L.billed, render: (r) => fmtPKR(r.L.billed) },
            { key: 'paid', label: 'Paid', align: 'right', sort: (r) => r.L.paid, render: (r) => fmtPKR(r.L.paid) },
            { key: 'bal', label: 'Balance', align: 'right', sort: (r) => r.L.balance, render: (r) => <span className={r.L.balance > 0 ? 'text-bad font-semibold' : r.L.balance < 0 ? 'text-ok' : ''}>{r.L.balance < 0 ? 'Advance ' + fmtPKR(-r.L.balance) : fmtPKR(r.L.balance)}</span> },
            { key: 'last', label: 'Last activity', nowrap: true, sort: (r) => r.L.lastDate, render: (r) => fmtD(r.L.lastDate) },
          ]}
        />
      ) : (
        <DataTable
          rows={payables}
          search={['name', 'type']}
          initialSort={{ k: 'bal', d: 'desc' }}
          onRow={(r) => setOpenId(r.id)}
          empty={<Empty title="Nothing owed" text="All vendors are paid up." />}
          cols={[
            { key: 'name', label: 'Party', render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'type', label: 'Type' },
            { key: 'bal', label: 'You owe', align: 'right', sort: (r) => r.L.balance, render: (r) => fmtPKR(r.L.balance) },
            { key: 'age', label: 'Oldest unpaid bill', align: 'right', sort: (r) => oldestUnpaid(r) ?? -1, render: (r) => { const a = oldestUnpaid(r); return a === null ? '—' : <span className={a > 60 ? 'text-bad' : ''}>{a} days</span>; } },
          ]}
          footer={(v) => <tr className="border-t border-line font-bold"><td className="px-3 py-2">Total</td><td /><td className="px-3 py-2 text-right tabular-nums">{fmtPKR(v.reduce((s, r) => s + r.L.balance, 0))}</td><td /></tr>}
        />
      )}
      {edit && <PartyForm initial={edit === 'new' ? null : edit} data={data} api={api} onClose={() => setEdit(null)} />}
    </div>
  );
}

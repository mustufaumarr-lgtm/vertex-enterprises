// =====================================================================
// expenses.jsx — Expenses and the Cash Book (all money in and out)
// =====================================================================
import React, { useMemo, useState } from 'react';
import { EXPENSE_CATS, PAY_METHODS, fmtPKR, fmtD, parseMoney, rs, uid, todayISO, cashMovements } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, Check, Attachments, AttachmentThumbs, PageHead } from './ui.jsx';

export function ExpenseForm({ initial, preset, data, api, onClose }) {
  const [f, setF] = useState(() => initial ? { vendorId: '', equipmentId: '', isAdvance: false, ...initial, amount: String(initial.amount ?? ''), litres: String(initial.litres ?? '') } : { date: todayISO(), projectId: data.projects.find((p) => p.status === 'Ongoing')?.id || data.projects[0]?.id || '', category: 'Materials', payee: '', amount: '', method: 'Cash', ref: '', notes: '', taxDeductible: true, vendorId: '', equipmentId: '', isAdvance: false, litres: '', ...(preset || {}) });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.date) e.date = 'Date is required';
    if (f.date > todayISO()) e.date = 'Date cannot be in the future';
    if (!f.payee.trim()) e.payee = 'Who was paid?';
    const amount = parseMoney(f.amount);
    if (!(amount > 0)) e.amount = 'Enter an amount above zero';
    if ((f.method === 'Cheque' || f.method === 'Bank') && !f.ref.trim()) e.ref = 'Add the cheque or transaction number';
    const litres = f.litres === '' ? 0 : Number(f.litres);
    if (Number.isNaN(litres) || litres < 0) e.litres = 'Enter litres';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('exp'), payee: f.payee.trim(), amount, litres, isAdvance: !!(f.vendorId && f.isAdvance) };
    const pn = data.projects.find((p) => p.id === f.projectId)?.name || 'Office / General';
    const ok = await api.put('expenses', rec, `${initial ? 'Edited' : 'Added'} expense ${fmtPKR(amount)} — ${f.category}, ${rec.payee} (${pn})`, initial ? 'Expense updated' : 'Expense added');
    setBusy(false);
    if (!ok) return;
    if (again && !initial) setF((x) => ({ ...x, payee: '', amount: '', ref: '', notes: '', attachments: [] }));
    else onClose();
  };
  return (
    <Modal wide title={initial ? 'Edit expense' : 'New expense'} onClose={onClose} footer={<>{!initial && <Check label="Add another after saving" checked={again} onChange={setAgain} />}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save expense'}</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Project"><Select options={[...data.projects.map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'Office / General' }]} value={f.projectId} onChange={set('projectId')} /></Field>
        <Field label="Category"><Select options={EXPENSE_CATS} value={f.category} onChange={set('category')} /></Field>
        <Field label="Vendor / party" hint="Links this payment to the vendor's ledger"><Select options={[{ value: '', label: '— Not a listed vendor —' }, ...data.vendors.map((v) => ({ value: v.id, label: v.name }))]} value={f.vendorId} onChange={(e) => { const v = data.vendors.find((x) => x.id === e.target.value); setF((x) => ({ ...x, vendorId: e.target.value, payee: v ? v.name : x.payee })); }} /></Field>
        <Field label="Paid to (payee)" required error={err.payee}><Input value={f.payee} onChange={set('payee')} placeholder="e.g. Al-Madina Cement Traders" /></Field>
        <Field label="Machine (optional)" hint="Links fuel, rent or repairs to Equipment"><Select options={[{ value: '', label: '— None —' }, ...data.equipment.map((q) => ({ value: q.id, label: q.name }))]} value={f.equipmentId} onChange={set('equipmentId')} /></Field>
        {f.category === 'Fuel' ? <Field label="Litres (optional)" error={err.litres}><Input inputMode="decimal" value={f.litres} onChange={set('litres')} /></Field> : <div className="hidden sm:block" />}
        <Field label="Amount (PKR)" required error={err.amount}><Input inputMode="numeric" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Payment method"><Select options={PAY_METHODS} value={f.method} onChange={set('method')} /></Field>
        <Field label="Reference no." error={err.ref} hint="Cheque no., transfer ID or receipt no."><Input value={f.ref} onChange={set('ref')} /></Field>
        <div className="sm:col-span-2 rounded-lg border border-dashed border-[#3b4a85] bg-soft p-3"><Attachments value={f.attachments || []} onChange={(v) => setF((x) => ({ ...x, attachments: v }))} /></div>
        <div className="flex flex-wrap items-end gap-x-4"><Check label="Tax-deductible expense" checked={f.taxDeductible} onChange={(v) => setF((x) => ({ ...x, taxDeductible: v }))} />{f.vendorId && <Check label="Advance (before their bill)" checked={f.isAdvance} onChange={(v) => setF((x) => ({ ...x, isAdvance: v }))} />}</div>
        <Field label="Notes" className="sm:col-span-2"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function CashEntryForm({ initial, api, onClose }) {
  const [f, setF] = useState(() => initial ? { ...initial, amount: String(initial.amount) } : { date: todayISO(), type: 'in', account: 'bank', from: 'cash', amount: '', desc: '', party: '', ref: '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.date) e.date = 'Date is required';
    const amount = parseMoney(f.amount);
    if (!(amount > 0)) e.amount = 'Enter an amount above zero';
    if (!f.desc.trim()) e.desc = 'Describe this entry';
    setErr(e);
    if (Object.keys(e).length) return;
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('cb'), amount, desc: f.desc.trim() };
    const label = f.type === 'transfer' ? `Transfer ${f.from}→${f.from === 'cash' ? 'bank' : 'cash'}` : f.type === 'in' ? 'Money in' : 'Money out';
    if (await api.put('cashentries', rec, `${initial ? 'Edited' : 'Added'} cash book entry: ${label} ${fmtPKR(amount)} — ${rec.desc}`, 'Entry saved')) onClose();
  };
  return (
    <Modal title={initial ? 'Edit cash book entry' : 'New cash book entry'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save entry</Btn></>}>
      <p className="text-[14px] text-mute mb-4">Use this for money that isn't a bill or an expense: partner capital, loans, bank charges, or moving cash to the bank. Bill receipts and expenses appear in the Cash Book automatically.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Type" className="sm:col-span-2"><Select options={[{ value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }, { value: 'transfer', label: 'Transfer between cash and bank' }]} value={f.type} onChange={set('type')} /></Field>
        {f.type === 'transfer'
          ? <Field label="Direction" className="sm:col-span-2"><Select options={[{ value: 'cash', label: 'Cash → Bank (deposit)' }, { value: 'bank', label: 'Bank → Cash (withdrawal)' }]} value={f.from} onChange={set('from')} /></Field>
          : <Field label="Account"><Select options={[{ value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' }]} value={f.account} onChange={set('account')} /></Field>}
        <Field label="Date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount (PKR)" required error={err.amount}><Input inputMode="numeric" value={f.amount} onChange={set('amount')} /></Field>
        {f.type !== 'transfer' && <Field label="From / to (party)"><Input value={f.party} onChange={set('party')} /></Field>}
        <Field label="Description" required error={err.desc} className="sm:col-span-2"><Input value={f.desc} onChange={set('desc')} placeholder="e.g. Capital from Murtuza" /></Field>
        <Field label="Reference no."><Input value={f.ref} onChange={set('ref')} /></Field>
      </div>
    </Modal>
  );
}

function CashBook({ data, settings, api }) {
  const [acct, setAcct] = useState('all');
  const [month, setMonth] = useState('');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const moves = useMemo(() => cashMovements(data), [data]);
  // Running balance, computed in date order, per selected account
  const rows = useMemo(() => {
    let bal = acct === 'cash' ? rs(settings.openingCash) : acct === 'bank' ? rs(settings.openingBank) : rs(settings.openingCash) + rs(settings.openingBank);
    const out = [];
    for (const m of moves) {
      if (acct !== 'all' && m.account !== acct) continue;
      if (acct === 'all' && m.kind === 'transfer') { out.push({ ...m, balance: bal, skip: true }); continue; }
      bal += m.dir === 'in' ? m.amount : -m.amount;
      out.push({ ...m, balance: bal });
    }
    return out.filter((r) => !month || r.date.slice(0, 7) === month).filter((r) => !(acct === 'all' && r.skip && r.dir === 'out'));
  }, [moves, acct, month, settings]);
  const inn = rows.filter((r) => r.dir === 'in' && !r.skip).reduce((s, r) => s + r.amount, 0);
  const out = rows.filter((r) => r.dir === 'out' && !r.skip).reduce((s, r) => s + r.amount, 0);
  const months = [...new Set(moves.map((m) => m.date.slice(0, 7)))].sort().reverse();
  const entry = (r) => data.cashentries.find((c) => c.id === r.entryId);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Money in" value={fmtPKR(inn)} />
        <Stat label="Money out" value={fmtPKR(out)} />
        <Stat label="Net" value={fmtPKR(inn - out)} tone={inn - out < 0 ? 'bad' : 'ok'} />
      </div>
      <DataTable
        rows={rows}
        search={['desc', 'party', 'src']}
        initialSort={{ k: 'date', d: 'desc' }}
        toolbar={<>
          <Select aria-label="Account" className="w-auto" options={[{ value: 'all', label: 'Cash + bank' }, { value: 'cash', label: 'Cash only' }, { value: 'bank', label: 'Bank only' }]} value={acct} onChange={(e) => setAcct(e.target.value)} />
          <Select aria-label="Month" className="w-auto" options={[{ value: '', label: 'All months' }, ...months.map((m) => ({ value: m, label: fmtD(m + '-01').slice(3) }))]} value={month} onChange={(e) => setMonth(e.target.value)} />
          <Btn onClick={() => setEdit('new')}>+ Manual entry</Btn>
        </>}
        empty={<Empty title="No money movements yet" text="Bill receipts, expenses and manual entries will appear here." />}
        cols={[
          { key: 'date', label: 'Date', nowrap: true, sort: (r) => r.date + r.id, render: (r) => fmtD(r.date) },
          { key: 'desc', label: 'Details', render: (r) => <div className="min-w-[200px]"><div>{r.desc}</div><div className="text-[13px] text-mute">{[r.party, r.src].filter(Boolean).join(' · ')}</div></div> },
          { key: 'account', label: 'Account', render: (r) => (r.kind === 'transfer' && acct === 'all' ? <Badge>Transfer</Badge> : <Badge tone={r.account === 'cash' ? 'brick' : 'ink'}>{r.account === 'cash' ? 'Cash' : 'Bank'}</Badge>) },
          { key: 'in', label: 'In', align: 'right', sort: (r) => (r.dir === 'in' ? r.amount : 0), render: (r) => (r.skip ? <span className="text-mute text-[13px]">{fmtPKR(r.amount)} moved</span> : r.dir === 'in' ? <span className="text-ok">{fmtPKR(r.amount)}</span> : '') },
          { key: 'out', label: 'Out', align: 'right', sort: (r) => (r.dir === 'out' ? r.amount : 0), render: (r) => (r.dir === 'out' ? fmtPKR(r.amount) : '') },
          { key: 'balance', label: 'Balance', align: 'right', render: (r) => <span className={r.balance < 0 ? 'text-bad' : ''}>{fmtPKR(r.balance)}</span> },
          { key: 'act', label: '', nosort: true, render: (r) => (r.entryId && entry(r) ? <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setEdit(entry(r))}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setDel(entry(r))}>Delete</Btn></div> : null) },
        ]}
      />
      <p className="text-[13px] text-mute mt-2">Balances start from the opening cash and bank balances in Settings ({fmtPKR(settings.openingCash)} cash, {fmtPKR(settings.openingBank)} bank). Sorting by another column keeps each row's running balance as of its date.</p>
      {edit && <CashEntryForm initial={edit === 'new' ? null : edit} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete entry?" text={`“${del.desc}” (${fmtPKR(del.amount)}) will be deleted.`} onConfirm={() => api.del('cashentries', del.id, `Deleted cash book entry “${del.desc}” ${fmtPKR(del.amount)}`)} onClose={() => setDel(null)} />}
    </div>
  );
}

export default function Expenses({ data, settings, api }) {
  const [tab, setTab] = useState('expenses');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [proj, setProj] = useState('all');
  const [cat, setCat] = useState('All');
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '(deleted project)' : 'Office / General');
  const rows = data.expenses.filter((e) => (proj === 'all' || (proj === 'office' ? !e.projectId : e.projectId === proj)) && (cat === 'All' || e.category === cat));
  const total = rows.reduce((s, e) => s + rs(e.amount), 0);
  const deductible = rows.filter((e) => e.taxDeductible).reduce((s, e) => s + rs(e.amount), 0);
  return (
    <div>
      <PageHead title="Expenses & cash book" text="Every rupee spent, by project and category — and the full cash book of money in and out." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New expense</Btn>} />
      <div className="flex gap-1 mb-4 border-b border-line" role="tablist">
        {[['expenses', 'Expenses'], ['cashbook', 'Cash book']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`shrink-0 h-11 px-4 font-semibold border-b-2 -mb-px ${tab === k ? 'border-[#8b5cf6] text-ink' : 'border-transparent text-mute hover:text-ink'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'cashbook' ? <CashBook data={data} settings={settings} api={api} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-xl">
            <Stat label="Total shown" value={fmtPKR(total)} sub={`${rows.length} expenses`} />
            <Stat label="Marked tax-deductible" value={fmtPKR(deductible)} />
          </div>
          <DataTable
            rows={rows}
            search={['payee', 'category', 'ref', 'notes', (e) => pName(e.projectId), 'method']}
            initialSort={{ k: 'date', d: 'desc' }}
            toolbar={<>
              <Select aria-label="Filter by project" className="w-auto max-w-[220px]" options={[{ value: 'all', label: 'All projects' }, { value: 'office', label: 'Office / General' }, ...data.projects.map((p) => ({ value: p.id, label: p.name }))]} value={proj} onChange={(e) => setProj(e.target.value)} />
              <Select aria-label="Filter by category" className="w-auto" options={['All', ...EXPENSE_CATS]} value={cat} onChange={(e) => setCat(e.target.value)} />
            </>}
            empty={<Empty title="No expenses yet" text="Record materials, labour, fuel and office costs as you pay them." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New expense</Btn>} />}
            cols={[
              { key: 'date', label: 'Date', nowrap: true, render: (e) => fmtD(e.date) },
              { key: 'payee', label: 'Payee', render: (e) => <div><div className="font-semibold">{e.payee}</div>{e.notes && <div className="text-[13px] text-mute">{e.notes}</div>}</div> },
              { key: 'project', label: 'Project', sort: (e) => pName(e.projectId), render: (e) => pName(e.projectId) },
              { key: 'category', label: 'Category' },
              { key: 'method', label: 'Method', render: (e) => <span>{e.method}{e.ref ? <span className="block text-[13px] text-mute">{e.ref}</span> : null}</span> },
              { key: 'amount', label: 'Amount', align: 'right', render: (e) => fmtPKR(e.amount) },
              { key: 'tax', label: 'Tax-ded.', sort: (e) => (e.taxDeductible ? 1 : 0), render: (e) => (e.taxDeductible ? 'Yes' : '—') },
              { key: 'slip', label: 'Slip', sort: (e) => (e.attachments || []).length, render: (e) => ((e.attachments || []).length ? <AttachmentThumbs items={e.attachments} size={36} /> : <span className="text-[13px] text-warn">No slip</span>) },
              { key: 'act', label: '', nosort: true, render: (e) => <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setEdit(e)}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setDel(e)}>Delete</Btn></div> },
            ]}
          />
        </>
      )}
      {edit && <ExpenseForm initial={edit === 'new' ? null : edit} data={data} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete expense?" text={`${fmtPKR(del.amount)} paid to ${del.payee} on ${fmtD(del.date)} will be deleted.`} onConfirm={() => api.del('expenses', del.id, `Deleted expense ${fmtPKR(del.amount)} — ${del.payee}`)} onClose={() => setDel(null)} />}
    </div>
  );
}

// =====================================================================
// billing.jsx — Running / final bills, deductions, receipts, retention
// =====================================================================
import React, { useMemo, useState } from 'react';
import { DED_KEYS, fmtPKR, fmtD, parseMoney, parsePct, pctOf, rs, uid, todayISO, days, billNet, billPending, billStatus, billRetention, billDeductionTotal } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, PageHead } from './ui.jsx';

export const billTone = (s) => ({ Received: 'ok', 'Partly received': 'warn', Pending: 'mute' }[s]);

export function BillForm({ initial, data, settings, api, onClose, presetProjectId }) {
  const projects = data.projects;
  const def = settings.defaults || {};
  const init = () => {
    if (initial) {
      const ded = {};
      DED_KEYS.forEach(({ k }) => { const d = initial.ded?.[k] || {}; ded[k] = { pct: d.pct === null || d.pct === undefined ? '' : String(d.pct), amt: String(d.amt ?? 0), manual: !!d.manual }; });
      return { ...initial, gross: String(initial.gross ?? ''), received: String(initial.received ?? 0), ded, receivedDate: initial.receivedDate || '', receivedTo: initial.receivedTo || 'bank', notes: initial.notes || '' };
    }
    const p = projects.find((x) => x.id === presetProjectId) || projects[0];
    const ded = {};
    DED_KEYS.forEach(({ k }) => { const pct = k === 'retention' ? (p?.retentionPct ?? 5) : (def[k] ?? 0); ded[k] = { pct: String(pct), amt: '0', manual: false }; });
    const n = data.bills.filter((b) => b.projectId === p?.id).length + 1;
    return { projectId: p?.id || '', billNo: `RB-${String(n).padStart(2, '0')}`, type: 'Running', date: todayISO(), gross: '', ded, received: '0', receivedDate: '', receivedTo: 'bank', notes: '' };
  };
  const [f, setF] = useState(init);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const gross = parseMoney(f.gross);
  const g = Number.isNaN(gross) ? 0 : gross;
  const amtOf = (k) => (f.ded[k].manual ? (Number.isNaN(parseMoney(f.ded[k].amt)) ? 0 : parseMoney(f.ded[k].amt)) : pctOf(g, parsePct(f.ded[k].pct) || 0));
  const totalDed = DED_KEYS.reduce((s, { k }) => s + amtOf(k), 0);
  const net = g - totalDed;
  const rec = parseMoney(f.received);
  const setDed = (k, patch) => setF((x) => ({ ...x, ded: { ...x.ded, [k]: { ...x.ded[k], ...patch } } }));

  const changeProject = (e) => {
    const id = e.target.value;
    const p = projects.find((x) => x.id === id);
    setF((x) => ({ ...x, projectId: id, ded: x.ded.retention.manual ? x.ded : { ...x.ded, retention: { ...x.ded.retention, pct: String(p?.retentionPct ?? 5) } } }));
  };

  const save = async () => {
    const e = {};
    if (!f.projectId) e.projectId = 'Choose a project';
    if (!f.billNo.trim()) e.billNo = 'Bill number is required';
    else if (data.bills.some((b) => b.projectId === f.projectId && b.billNo.trim().toLowerCase() === f.billNo.trim().toLowerCase() && b.id !== initial?.id)) e.billNo = 'This project already has a bill with this number';
    if (!f.date) e.date = 'Bill date is required';
    if (!(gross > 0)) e.gross = 'Enter the gross bill amount';
    DED_KEYS.forEach(({ k }) => {
      const d = f.ded[k];
      if (d.manual) { const a = parseMoney(d.amt); if (Number.isNaN(a) || a < 0) e['ded_' + k] = 'Enter an amount'; }
      else { const pc = d.pct === '' ? 0 : parsePct(d.pct); if (Number.isNaN(pc) || pc < 0 || pc > 100) e['ded_' + k] = '0–100%'; }
    });
    if (net < 0) e.gross = 'Deductions are larger than the gross amount';
    if (Number.isNaN(rec) || rec < 0) e.received = 'Enter a number (0 if nothing received)';
    else if (rec > net && net >= 0) e.received = `Cannot be more than the net amount (${fmtPKR(net)})`;
    if (rec > 0 && !f.receivedDate) e.receivedDate = 'Date received is required when an amount is received';
    if (f.receivedDate && f.date && f.receivedDate < f.date) e.receivedDate = 'Cannot be before the bill date';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const ded = {};
    DED_KEYS.forEach(({ k }) => { ded[k] = { pct: f.ded[k].manual ? null : (parsePct(f.ded[k].pct) || 0), amt: amtOf(k), manual: f.ded[k].manual }; });
    const recd = { ...(initial || {}), id: initial?.id || uid('bill'), projectId: f.projectId, billNo: f.billNo.trim(), type: f.type, date: f.date, gross, ded, received: rec, receivedDate: rec > 0 ? f.receivedDate : '', receivedTo: f.receivedTo, notes: f.notes, retentionReleased: initial?.retentionReleased || false, retentionReleaseDate: initial?.retentionReleaseDate || '' };
    const pn = projects.find((p) => p.id === f.projectId)?.name || '';
    const ok = await api.put('bills', recd, `${initial ? 'Edited' : 'Added'} bill ${recd.billNo} (${pn}) — gross ${fmtPKR(gross)}`, initial ? 'Bill updated' : 'Bill added');
    setBusy(false);
    if (ok) onClose();
  };

  if (!projects.length) return <Modal title="New bill" onClose={onClose}><Empty title="Add a project first" text="Bills belong to a project. Create the project in Projects, then come back." /></Modal>;

  return (
    <Modal wide title={initial ? `Edit bill ${initial.billNo}` : 'New bill'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save bill'}</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project" required error={err.projectId} className="sm:col-span-2"><Select options={projects.map((p) => ({ value: p.id, label: p.name }))} value={f.projectId} onChange={changeProject} /></Field>
        <Field label="Bill number" required error={err.billNo}><Input value={f.billNo} onChange={set('billNo')} /></Field>
        <Field label="Bill type"><Select options={['Running', 'Final']} value={f.type} onChange={set('type')} /></Field>
        <Field label="Bill date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Gross amount (PKR)" required error={err.gross}><Input inputMode="numeric" value={f.gross} onChange={set('gross')} /></Field>
      </div>
      <div className="mt-5">
        <p className="font-bold mb-1">Deductions</p>
        <p className="text-[13px] text-mute mb-3">Type a percentage, or type an amount to override it. Default rates come from Settings — confirm them with your accountant.</p>
        <div className="space-y-2">
          {DED_KEYS.map(({ k, label }) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,140px)] gap-2 items-start">
              <span className="text-[15px] pt-2.5">{label}{err['ded_' + k] && <span className="block text-[13px] text-bad">{err['ded_' + k]}</span>}</span>
              <div className="relative"><Input aria-label={`${label} percent`} inputMode="decimal" value={f.ded[k].manual ? '' : f.ded[k].pct} placeholder={f.ded[k].manual ? 'custom' : '0'} onChange={(e) => setDed(k, { pct: e.target.value, manual: false })} className="pr-7" /><span className="absolute right-2 top-2.5 text-mute">%</span></div>
              <Input aria-label={`${label} amount`} inputMode="numeric" className="text-right" value={f.ded[k].manual ? f.ded[k].amt : String(amtOf(k))} onChange={(e) => setDed(k, { amt: e.target.value, manual: true })} />
            </div>
          ))}
        </div>
        <div className="mt-3 bg-soft rounded-md p-3 text-[15px] space-y-1">
          <div className="flex justify-between"><span>Gross</span><span className="tabular-nums">{fmtPKR(g)}</span></div>
          <div className="flex justify-between"><span>Total deductions</span><span className="tabular-nums">− {fmtPKR(totalDed)}</span></div>
          <div className="flex justify-between font-bold text-[17px] border-t border-line pt-1"><span>Net payable to you</span><span className="tabular-nums">{fmtPKR(net)}</span></div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        <Field label="Amount received (PKR)" error={err.received}><Input inputMode="numeric" value={f.received} onChange={set('received')} /></Field>
        <Field label="Date received" error={err.receivedDate}><Input type="date" value={f.receivedDate} onChange={set('receivedDate')} /></Field>
        <Field label="Received into"><Select options={[{ value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' }]} value={f.receivedTo} onChange={set('receivedTo')} /></Field>
        <div className="sm:col-span-3 flex flex-wrap gap-2">
          <Btn size="sm" onClick={() => setF((x) => ({ ...x, received: String(Math.max(0, net)), receivedDate: x.receivedDate || todayISO() }))}>Mark fully received</Btn>
          <span className="text-[14px] text-mute self-center">Pending after this: <b className="tabular-nums text-ink">{fmtPKR(Math.max(0, net - (Number.isNaN(rec) ? 0 : rec)))}</b></span>
        </div>
        <Field label="Notes" className="sm:col-span-3"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export function ReleaseRetention({ bill, api, pname, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState('');
  return (
    <Modal title="Release retention" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={async () => {
      if (!date) return setErr('Choose the release date');
      if (date < bill.date) return setErr('Cannot be before the bill date');
      const ok = await api.put('bills', { ...bill, retentionReleased: true, retentionReleaseDate: date }, `Retention ${fmtPKR(billRetention(bill))} released on bill ${bill.billNo} (${pname})`, 'Retention marked as released');
      if (ok) onClose();
    }}>Mark released</Btn></>}>
      <p className="text-[15px]">Bill <b>{bill.billNo}</b> · {pname}<br />Retention amount <b className="tabular-nums">{fmtPKR(billRetention(bill))}</b> will be recorded as money received into bank.</p>
      <Field label="Release date" required error={err} className="mt-4"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </Modal>
  );
}

export default function Billing({ data, settings, api }) {
  const [tab, setTab] = useState('bills');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [rel, setRel] = useState(null);
  const [proj, setProj] = useState('all');
  const [st, setSt] = useState('All');
  const pName = (id) => data.projects.find((p) => p.id === id)?.name || '(deleted project)';
  const terms = rs(settings.paymentTermsDays) || 30;

  const bills = useMemo(() => data.bills.filter((b) => (proj === 'all' || b.projectId === proj) && (st === 'All' || billStatus(b) === st)), [data.bills, proj, st]);
  const tot = bills.reduce((a, b) => ({ gross: a.gross + rs(b.gross), net: a.net + billNet(b), rec: a.rec + rs(b.received), pend: a.pend + billPending(b) }), { gross: 0, net: 0, rec: 0, pend: 0 });
  const retRows = data.bills.filter((b) => billRetention(b) > 0 && (proj === 'all' || b.projectId === proj));
  const retHeld = retRows.filter((b) => !b.retentionReleased).reduce((s, b) => s + billRetention(b), 0);
  const retRel = retRows.filter((b) => b.retentionReleased).reduce((s, b) => s + billRetention(b), 0);

  const projFilter = <Select aria-label="Filter by project" className="w-auto max-w-[220px]" options={[{ value: 'all', label: 'All projects' }, ...data.projects.map((p) => ({ value: p.id, label: p.name }))]} value={proj} onChange={(e) => setProj(e.target.value)} />;

  return (
    <div>
      <PageHead title="Billing" text="Running and final bills with every deduction, what was received, and retention money the client is holding." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New bill</Btn>} />
      <div className="flex gap-1 mb-4 border-b border-line" role="tablist">
        {[['bills', 'Bills'], ['retention', 'Retention money']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`shrink-0 h-11 px-4 font-semibold border-b-2 -mb-px ${tab === k ? 'border-[#8b5cf6] text-ink' : 'border-transparent text-mute hover:text-ink'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'bills' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="Gross billed" value={fmtPKR(tot.gross)} />
            <Stat label="Net after deductions" value={fmtPKR(tot.net)} />
            <Stat label="Received" value={fmtPKR(tot.rec)} />
            <Stat label="Pending" value={fmtPKR(tot.pend)} tone={tot.pend > 0 ? 'bad' : undefined} />
          </div>
          <DataTable
            rows={bills}
            search={['billNo', (b) => pName(b.projectId), 'notes', 'type']}
            initialSort={{ k: 'date', d: 'desc' }}
            toolbar={<>{projFilter}<Select aria-label="Filter by status" className="w-auto" options={['All', 'Pending', 'Partly received', 'Received']} value={st} onChange={(e) => setSt(e.target.value)} /></>}
            empty={<Empty title="No bills yet" text="Record each running or final bill you submit to the client." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New bill</Btn>} />}
            cols={[
              { key: 'billNo', label: 'Bill', render: (b) => <div className="min-w-[180px]"><div className="font-semibold">{b.billNo} <span className="text-[13px] text-mute font-normal">{b.type}</span></div><div className="text-[13px] text-mute">{pName(b.projectId)}</div></div> },
              { key: 'date', label: 'Date', nowrap: true, render: (b) => fmtD(b.date) },
              { key: 'gross', label: 'Gross', align: 'right', render: (b) => fmtPKR(b.gross) },
              { key: 'ded', label: 'Deductions', align: 'right', sort: billDeductionTotal, render: (b) => fmtPKR(billDeductionTotal(b)) },
              { key: 'net', label: 'Net', align: 'right', sort: billNet, render: (b) => fmtPKR(billNet(b)) },
              { key: 'received', label: 'Received', align: 'right', render: (b) => <span>{fmtPKR(b.received)}<br /><span className="text-[13px] text-mute">{fmtD(b.receivedDate)}</span></span> },
              { key: 'pending', label: 'Pending', align: 'right', sort: billPending, render: (b) => { const p = billPending(b); const age = days(b.date, todayISO()); return <span className={p > 0 && age > terms ? 'text-bad font-semibold' : ''}>{fmtPKR(p)}{p > 0 && age > terms ? <><br /><span className="text-[13px]">{age} days old</span></> : null}</span>; } },
              { key: 'status', label: 'Status', sort: billStatus, render: (b) => <Badge tone={billTone(billStatus(b))}>{billStatus(b)}</Badge> },
              { key: 'act', label: '', nosort: true, render: (b) => <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}><Btn size="sm" onClick={() => setEdit(b)}>Edit</Btn><Btn size="sm" kind="ghost" aria-label={`Delete bill ${b.billNo}`} onClick={() => setDel(b)}>Delete</Btn></div> },
            ]}
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-xl">
            <Stat label="Retention held by clients" value={fmtPKR(retHeld)} />
            <Stat label="Retention released" value={fmtPKR(retRel)} />
          </div>
          <DataTable
            rows={retRows}
            search={['billNo', (b) => pName(b.projectId)]}
            initialSort={{ k: 'date', d: 'asc' }}
            toolbar={projFilter}
            empty={<Empty title="No retention recorded" text="Retention appears here when a bill has a retention deduction." />}
            cols={[
              { key: 'project', label: 'Project', sort: (b) => pName(b.projectId), render: (b) => pName(b.projectId) },
              { key: 'billNo', label: 'Bill' },
              { key: 'date', label: 'Held since', nowrap: true, render: (b) => fmtD(b.date) },
              { key: 'amt', label: 'Retention', align: 'right', sort: billRetention, render: (b) => fmtPKR(billRetention(b)) },
              { key: 'st', label: 'Status', sort: (b) => (b.retentionReleased ? 1 : 0), render: (b) => (b.retentionReleased ? <Badge tone="ok">Released {fmtD(b.retentionReleaseDate)}</Badge> : <Badge tone="warn">Held · {days(b.date, todayISO())} days</Badge>) },
              { key: 'act', label: '', nosort: true, render: (b) => (b.retentionReleased
                ? <Btn size="sm" kind="ghost" onClick={() => api.put('bills', { ...b, retentionReleased: false, retentionReleaseDate: '' }, `Undid retention release on bill ${b.billNo}`, 'Release undone')}>Undo</Btn>
                : <Btn size="sm" kind="primary" onClick={() => setRel(b)}>Release retention</Btn>) },
            ]}
          />
        </>
      )}
      {edit && <BillForm initial={edit === 'new' ? null : edit} data={data} settings={settings} api={api} onClose={() => setEdit(null)} />}
      {rel && <ReleaseRetention bill={rel} api={api} pname={pName(rel.projectId)} onClose={() => setRel(null)} />}
      {del && <Confirm title="Delete bill?" text={`Bill ${del.billNo} (${pName(del.projectId)}) and its receipt record will be deleted. This cannot be undone.`} onConfirm={() => api.del('bills', del.id, `Deleted bill ${del.billNo} (${pName(del.projectId)})`)} onClose={() => setDel(null)} />}
    </div>
  );
}

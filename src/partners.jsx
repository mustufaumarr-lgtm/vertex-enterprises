// =====================================================================
// partners.jsx — Partner capital, drawings, loans, ledgers and the
// profit distribution calculator. Partner transactions flow into the
// Cash Book automatically.
// =====================================================================
import React, { useMemo, useState } from 'react';
import { PARTNER_TX, fmtPKR, fmtD, parseMoney, parsePct, rs, uid, todayISO, partnerLedger, projectFigures, splitByShares } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, Card, Check, PageHead } from './ui.jsx';

function TxForm({ initial, partners, presetPartner, api, onClose }) {
  const [f, setF] = useState(() => initial ? { ...initial, amount: String(initial.amount) } : { partnerId: presetPartner || partners[0]?.id || '', date: todayISO(), type: 'capital', amount: '', account: 'bank', notes: '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.partnerId) e.partnerId = 'Choose a partner';
    if (!f.date) e.date = 'Required';
    const amount = parseMoney(f.amount);
    if (!(amount > 0)) e.amount = 'Enter an amount above zero';
    setErr(e); if (Object.keys(e).length) return;
    const p = partners.find((x) => x.id === f.partnerId);
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('pt'), amount, partnerName: p?.name || '' };
    if (await api.put('partnertxns', rec, `${initial ? 'Edited' : 'Added'} ${PARTNER_TX[f.type].label.toLowerCase()} — ${p?.name} ${fmtPKR(amount)}`, 'Saved')) onClose();
  };
  return (
    <Modal title={initial ? 'Edit partner transaction' : 'New partner transaction'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Partner" required error={err.partnerId}><Select options={partners.map((p) => ({ value: p.id, label: p.name }))} value={f.partnerId} onChange={set('partnerId')} /></Field>
        <Field label="Date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Type" className="col-span-2"><Select options={Object.entries(PARTNER_TX).map(([value, d]) => ({ value, label: `${d.label} (money ${d.dir === 'in' ? 'into' : 'out of'} company)` }))} value={f.type} onChange={set('type')} /></Field>
        <Field label="Amount (PKR)" required error={err.amount}><Input inputMode="numeric" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Cash or bank"><Select options={[{ value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' }]} value={f.account} onChange={set('account')} /></Field>
        <Field label="Notes" className="col-span-2"><Input value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <p className="text-[13px] text-mute mt-3">This also appears in the Cash Book.</p>
    </Modal>
  );
}

function Distribution({ data, settings, api }) {
  const partners = settings.partners || [];
  const [basis, setBasis] = useState('cash');
  const [sel, setSel] = useState(() => Object.fromEntries(data.projects.map((p) => [p.id, p.status === 'Completed'])));
  const [office, setOffice] = useState(true);
  const [lessDrawn, setLessDrawn] = useState(true);
  const [shares, setShares] = useState(() => Object.fromEntries(partners.map((p) => [p.id, String(p.share)])));
  const [record, setRecord] = useState(null);
  const chosen = data.projects.filter((p) => sel[p.id]);
  const projProfit = chosen.reduce((s, p) => { const f = projectFigures(p, data); return s + (basis === 'cash' ? f.cashProfit : f.earnedProfit); }, 0);
  const officeCost = data.expenses.filter((e) => !e.projectId).reduce((s, e) => s + rs(e.amount), 0);
  const distributable = projProfit - (office ? officeCost : 0);
  const sh = partners.map((p) => parsePct(shares[p.id]) || 0);
  const shareSum = sh.reduce((s, x) => s + x, 0);
  const parts = distributable > 0 ? splitByShares(distributable, sh) : partners.map(() => 0);
  const rows = partners.map((p, i) => { const L = partnerLedger(p, data); const due = parts[i] - (lessDrawn ? L.withdrawn : 0); return { id: p.id, name: p.name, share: sh[i], amount: parts[i], drawn: L.withdrawn, due }; });
  return (
    <Card title="Profit distribution calculator">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-3">
          <Field label="Profit basis"><Select options={[{ value: 'cash', label: 'Cash received − cost (safest)' }, { value: 'earned', label: 'Billed − cost (includes money still owed)' }]} value={basis} onChange={(e) => setBasis(e.target.value)} /></Field>
          <div>
            <p className="text-sm font-semibold mb-1">Projects to include</p>
            {data.projects.length === 0 ? <p className="text-mute text-[14px]">No projects yet.</p> : data.projects.map((p) => { const f = projectFigures(p, data); const v = basis === 'cash' ? f.cashProfit : f.earnedProfit; return (
              <div key={p.id} className="flex items-center justify-between gap-2"><Check label={`${p.name} (${p.status})`} checked={!!sel[p.id]} onChange={(c) => setSel((x) => ({ ...x, [p.id]: c }))} /><span className={`tabular-nums text-[14px] whitespace-nowrap ${v < 0 ? 'text-bad' : ''}`}>{fmtPKR(v)}</span></div>
            ); })}
          </div>
          <Check label={`Deduct office / general expenses (${fmtPKR(officeCost)})`} checked={office} onChange={setOffice} />
          <Check label="Subtract withdrawals already taken" checked={lessDrawn} onChange={setLessDrawn} />
          <div>
            <p className="text-sm font-semibold mb-1">Shares for this distribution</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{partners.map((p) => <Field key={p.id} label={p.name}><div className="relative"><Input inputMode="decimal" value={shares[p.id] ?? ''} onChange={(e) => setShares((x) => ({ ...x, [p.id]: e.target.value }))} className="pr-7" /><span className="absolute right-2 top-2.5 text-mute">%</span></div></Field>)}</div>
            {Math.abs(shareSum - 100) > 0.01 && <p className="text-sm text-bad mt-1">Shares add up to {Math.round(shareSum * 100) / 100}% — set them to 100%.</p>}
          </div>
        </div>
        <div>
          <div className="bg-soft rounded-md p-4 space-y-1 text-[15px]">
            <div className="flex justify-between"><span>Profit from {chosen.length} project{chosen.length === 1 ? '' : 's'}</span><span className="tabular-nums">{fmtPKR(projProfit)}</span></div>
            {office && <div className="flex justify-between"><span>Less office / general</span><span className="tabular-nums">− {fmtPKR(officeCost)}</span></div>}
            <div className="flex justify-between font-bold text-[18px] border-t border-line pt-1"><span>To distribute</span><span className={`tabular-nums ${distributable < 0 ? 'text-bad' : ''}`}>{fmtPKR(distributable)}</span></div>
          </div>
          {distributable <= 0 ? <p className="text-bad mt-3 text-[15px]">Nothing to distribute — the selected projects are not in profit after costs.</p> : (
            <table className="w-full mt-3 text-[15px]">
              <thead><tr className="text-mute text-[13px] text-left"><th className="py-1">Partner</th><th className="text-right">Share</th><th className="text-right">Profit</th>{lessDrawn && <th className="text-right">Drawn</th>}<th className="text-right">Due</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5 font-semibold">{r.name}</td><td className="text-right tabular-nums">{r.share}%</td><td className="text-right tabular-nums">{fmtPKR(r.amount)}</td>{lessDrawn && <td className="text-right tabular-nums">{fmtPKR(r.drawn)}</td>}<td className={`text-right tabular-nums font-bold ${r.due < 0 ? 'text-bad' : ''}`}>{fmtPKR(r.due)}</td></tr>)}</tbody>
            </table>
          )}
          {distributable > 0 && rows.some((r) => r.due < 0) && <p className="text-[13px] text-bad mt-1">A negative “due” means the partner has already drawn more than this share.</p>}
          {distributable > 0 && Math.abs(shareSum - 100) <= 0.01 && <Btn className="mt-4" kind="primary" disabled={!rows.some((r) => r.due > 0)} onClick={() => setRecord({ date: todayISO(), account: 'bank' })}>Record payouts as withdrawals…</Btn>}
          <p className="text-[13px] text-mute mt-3">A planning tool — agree the final figures with your partners and accountant before paying out.</p>
        </div>
      </div>
      {record && (
        <Modal title="Record payouts" onClose={() => setRecord(null)} footer={<><Btn onClick={() => setRecord(null)}>Cancel</Btn><Btn kind="primary" onClick={async () => {
          for (const r of rows.filter((x) => x.due > 0)) await api.put('partnertxns', { id: uid('pt'), partnerId: r.id, partnerName: r.name, date: record.date, type: 'withdrawal', amount: r.due, account: record.account, notes: 'Profit distribution' }, `Profit payout to ${r.name}: ${fmtPKR(r.due)}`);
          api.toast({ type: 'ok', text: 'Payouts recorded' }); setRecord(null);
        }}>Record {rows.filter((r) => r.due > 0).length} payouts</Btn></>}>
          <p className="text-[15px] mb-3">Creates a withdrawal for each partner with a positive amount due ({fmtPKR(rows.filter((r) => r.due > 0).reduce((s, r) => s + r.due, 0))} in total). They will reduce your {record.account} balance.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date paid"><Input type="date" value={record.date} onChange={(e) => setRecord((x) => ({ ...x, date: e.target.value }))} /></Field>
            <Field label="Paid from"><Select options={[{ value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' }]} value={record.account} onChange={(e) => setRecord((x) => ({ ...x, account: e.target.value }))} /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Agreement({ settings, api }) {
  const [t, setT] = useState(settings.agreementNotes || '');
  return (
    <Card title="Partnership agreement notes">
      <p className="text-[14px] text-mute mb-2">Key terms: profit ratio, capital commitments, salaries, signing authority, what happens if a partner leaves. Default shares are set in Settings & data.</p>
      <TextArea value={t} onChange={(e) => setT(e.target.value)} className="min-h-[140px]" />
      <Btn className="mt-2" kind="primary" disabled={t === (settings.agreementNotes || '')} onClick={() => api.saveSettings({ agreementNotes: t }, 'Updated partnership agreement notes', 'Notes saved')}>Save notes</Btn>
    </Card>
  );
}

export default function Partners({ data, settings, api, go }) {
  const partners = settings.partners || [];
  const [tab, setTab] = useState('ledgers');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [who, setWho] = useState(partners[0]?.id || '');
  const L = useMemo(() => partners.map((p) => ({ p, L: partnerLedger(p, data) })), [partners, data]);
  const cur = L.find((x) => x.p.id === who) || L[0];
  return (
    <div>
      <PageHead title="Partners" text="Each partner's capital, drawings and loans, and how to split the profit." action={<><Btn onClick={() => go('setup')}>Edit partners & shares</Btn><Btn kind="accent" onClick={() => setEdit({ preset: who })}>+ Transaction</Btn></>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {L.map(({ p, L: l }) => (
          <button key={p.id} type="button" onClick={() => { setWho(p.id); setTab('ledgers'); }} className={`text-left bg-panel border rounded-lg p-4 ${who === p.id ? 'border-[#8b5cf6] ring-1 ring-[#8b5cf6]' : 'border-line'} hover:bg-soft`}>
            <div className="flex justify-between items-baseline"><span className="font-bold text-[17px]">{p.name}</span><span className="text-[13px] text-mute">{p.share}% share</span></div>
            <div className="mt-2 text-[14px] space-y-0.5">
              <div className="flex justify-between"><span className="text-mute">Capital balance</span><span className="tabular-nums font-semibold">{fmtPKR(l.capital)}</span></div>
              <div className="flex justify-between"><span className="text-mute">Withdrawn</span><span className="tabular-nums">{fmtPKR(l.withdrawn)}</span></div>
              <div className="flex justify-between"><span className="text-mute">{l.loan >= 0 ? 'Company owes (loan)' : 'Partner owes company'}</span><span className="tabular-nums">{fmtPKR(Math.abs(l.loan))}</span></div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-1 mb-4 border-b border-line overflow-x-auto" role="tablist">
        {[['ledgers', 'Partner ledger'], ['dist', 'Profit distribution'], ['agree', 'Agreement notes']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`shrink-0 h-11 px-4 font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[#8b5cf6] text-ink' : 'border-transparent text-mute hover:text-ink'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'ledgers' && cur && (
        <DataTable rows={cur.L.rows} search={['notes', (r) => PARTNER_TX[r.type]?.label]} initialSort={{ k: 'date', d: 'desc' }}
          toolbar={<Select aria-label="Partner" className="w-auto" options={partners.map((p) => ({ value: p.id, label: p.name }))} value={cur.p.id} onChange={(e) => setWho(e.target.value)} />}
          empty={<Empty title={`No transactions for ${cur.p.name}`} text="Record capital put in, withdrawals and loans." action={<Btn kind="accent" onClick={() => setEdit({ preset: cur.p.id })}>+ Transaction</Btn>} />}
          cols={[
            { key: 'date', label: 'Date', nowrap: true, render: (r) => fmtD(r.date) },
            { key: 'type', label: 'Type', sort: (r) => PARTNER_TX[r.type]?.label, render: (r) => <Badge tone={PARTNER_TX[r.type]?.dir === 'in' ? 'ok' : 'brick'}>{PARTNER_TX[r.type]?.label}</Badge> },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtPKR(r.amount) },
            { key: 'account', label: 'Account', render: (r) => (r.account === 'cash' ? 'Cash' : 'Bank') },
            { key: 'capBal', label: 'Capital balance', align: 'right', render: (r) => fmtPKR(r.capBal) },
            { key: 'loanBal', label: 'Loan balance', align: 'right', render: (r) => fmtPKR(r.loanBal) },
            { key: 'notes', label: 'Notes', render: (r) => <span className="text-mute">{r.notes}</span> },
            { key: 'act', label: '', nosort: true, render: (r) => <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setEdit({ initial: r })}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setDel(r)}>Delete</Btn></div> },
          ]} />
      )}
      {tab === 'dist' && <Distribution key={partners.map((p) => p.id + p.share).join()} data={data} settings={settings} api={api} />}
      {tab === 'agree' && <Agreement key={settings.agreementNotes} settings={settings} api={api} />}
      {edit && <TxForm initial={edit.initial ? data.partnertxns.find((t) => t.id === edit.initial.id) : null} presetPartner={edit.preset} partners={partners} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete transaction?" text={`${PARTNER_TX[del.type]?.label} of ${fmtPKR(del.amount)} on ${fmtD(del.date)} will be deleted.`} onConfirm={() => api.del('partnertxns', del.id, `Deleted partner transaction ${fmtPKR(del.amount)}`)} onClose={() => setDel(null)} />}
    </div>
  );
}

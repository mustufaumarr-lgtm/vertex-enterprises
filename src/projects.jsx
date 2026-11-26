// =====================================================================
// projects.jsx — Projects / Contracts module + per-project mini dashboard
// =====================================================================
import React, { useState } from 'react';
import { PROJECT_STATUS, fmtPKR, fmtD, parseMoney, parsePct, rs, uid, todayISO, days, projectFigures, billNet, billPending, billStatus } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, PageHead } from './ui.jsx';

export { statusTone, expiryBadge } from './projectspace.jsx';
import { statusTone, expiryBadge } from './projectspace.jsx';
import ProjectSpace from './projectspace.jsx';

const blank = () => ({ id: '', name: '', tenderNo: '', client: '', value: '', budget: '', start: todayISO(), end: '', status: 'Awarded', progress: '0', pgAmount: '', pgBank: '', pgExpiry: '', retentionPct: '5', location: '', notes: '' });

function ProjectForm({ initial, onClose, api }) {
  const [f, setF] = useState(() => (initial ? { ...blank(), ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])), value: String(initial.value ?? ''), budget: String(initial.budget ?? ''), pgAmount: String(initial.pgAmount ?? ''), progress: String(initial.progress ?? 0), retentionPct: String(initial.retentionPct ?? '') } : blank()));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Project name is required';
    if (!f.client.trim()) e.client = 'Client / department is required';
    const value = parseMoney(f.value);
    if (!(value > 0)) e.value = 'Enter the contract value in rupees';
    const budget = f.budget === '' ? 0 : parseMoney(f.budget);
    if (Number.isNaN(budget) || budget < 0) e.budget = 'Enter a number';
    if (!f.start) e.start = 'Start date is required';
    if (f.end && f.start && f.end < f.start) e.end = 'End date cannot be before start date';
    const progress = parsePct(f.progress);
    if (Number.isNaN(progress) || progress < 0 || progress > 100) e.progress = 'Between 0 and 100';
    const ret = f.retentionPct === '' ? 0 : parsePct(f.retentionPct);
    if (Number.isNaN(ret) || ret < 0 || ret > 100) e.retentionPct = 'Between 0 and 100';
    const pg = f.pgAmount === '' ? 0 : parseMoney(f.pgAmount);
    if (Number.isNaN(pg) || pg < 0) e.pgAmount = 'Enter a number';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('prj'), name: f.name.trim(), client: f.client.trim(), value, budget, progress, retentionPct: ret, pgAmount: pg };
    const ok = await api.put('projects', rec, `${initial ? 'Edited' : 'Added'} project “${rec.name}”`, initial ? 'Project updated' : 'Project added');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal wide title={initial ? 'Edit project' : 'New project'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save project'}</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project name" required error={err.name} className="sm:col-span-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. Road resurfacing, Korangi Sector 5" /></Field>
        <Field label="Tender number" hint="As printed on the tender notice"><Input value={f.tenderNo} onChange={set('tenderNo')} /></Field>
        <Field label="Client / department" required error={err.client}><Input value={f.client} onChange={set('client')} placeholder="e.g. KMC Engineering Dept." /></Field>
        <Field label="Contract value (PKR)" required error={err.value}><Input inputMode="numeric" value={f.value} onChange={set('value')} /></Field>
        <Field label="Estimated cost / budget (PKR)" error={err.budget} hint="Used for budget vs actual"><Input inputMode="numeric" value={f.budget} onChange={set('budget')} /></Field>
        <Field label="Start date" required error={err.start}><Input type="date" value={f.start} onChange={set('start')} /></Field>
        <Field label="End date" error={err.end}><Input type="date" value={f.end} onChange={set('end')} /></Field>
        <Field label="Status"><Select options={PROJECT_STATUS} value={f.status} onChange={set('status')} /></Field>
        <Field label="Progress %" error={err.progress}><Input inputMode="decimal" value={f.progress} onChange={set('progress')} /></Field>
        <Field label="Retention %" error={err.retentionPct} hint="Default for this project's bills"><Input inputMode="decimal" value={f.retentionPct} onChange={set('retentionPct')} /></Field>
        <Field label="Site location"><Input value={f.location} onChange={set('location')} /></Field>
        <div className="sm:col-span-2 pt-2 border-t border-line"><p className="font-bold">Performance guarantee</p></div>
        <Field label="Amount (PKR)" error={err.pgAmount}><Input inputMode="numeric" value={f.pgAmount} onChange={set('pgAmount')} /></Field>
        <Field label="Bank"><Input value={f.pgBank} onChange={set('pgBank')} /></Field>
        <Field label="Expiry date"><Input type="date" value={f.pgExpiry} onChange={set('pgExpiry')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function Projects({ data, settings, api, go, projectId }) {
  const [edit, setEdit] = useState(null); // null | 'new' | project
  const [del, setDel] = useState(null);
  const [status, setStatus] = useState('All');
  const open = projectId ? data.projects.find((p) => p.id === projectId) : null;

  const deleteProject = async (p) => {
    const linked = data.bills.filter((b) => b.projectId === p.id).length + data.expenses.filter((e) => e.projectId === p.id).length;
    await api.del('projects', p.id, `Deleted project “${p.name}”${linked ? ` (${linked} linked records kept)` : ''}`);
    go('projects');
  };

  const rows = data.projects.filter((p) => status === 'All' || p.status === status);
  return (
    <div>
      {open ? (
        <ProjectSpace p={open} data={data} settings={settings} api={api} go={go} onEdit={() => setEdit(open)} onDelete={() => setDel(open)} />
      ) : (
        <>
          <PageHead title="Projects & contracts" text="Every contract kept separate. Open a project to see its own billing, expenses, slips, cash, materials, vendors and machines." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New project</Btn>} />
          {/* Mobile: one card per project, tap to open */}
          <div className="sm:hidden space-y-3 mb-2">
            <Select aria-label="Filter by status" options={['All', ...PROJECT_STATUS]} value={status} onChange={(e) => setStatus(e.target.value)} />
            {rows.length === 0 ? <Empty title="No projects yet" text="Add your first awarded contract to start tracking bills and costs." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New project</Btn>} /> :
              [...rows].sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed')).map((p) => { const pf = projectFigures(p, data); return (
                <button key={p.id} type="button" onClick={() => go('p-' + p.id)} className="w-full text-left rounded-xl border border-line bg-panel p-4 active:border-[#8b5cf6]">
                  <div className="flex justify-between gap-2 items-start"><span className="font-bold leading-snug">{p.name}</span><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
                  <div className="text-[13px] text-mute">{p.client}{p.tenderNo ? ` · ${p.tenderNo}` : ''}</div>
                  <div className="h-1.5 bg-soft rounded-sm mt-3"><div className="h-full rounded-sm bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#8b5cf6]" style={{ width: `${Math.min(100, p.progress || 0)}%` }} /></div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[14px]">
                    <div><div className="text-mute text-[13px]">Contract</div><div className="font-semibold tabular-nums">{fmtPKR(p.value)}</div></div>
                    <div><div className="text-mute text-[13px]">Profit (cash)</div><div className={`font-semibold tabular-nums ${pf.cashProfit < 0 ? 'text-bad' : 'text-ok'}`}>{fmtPKR(pf.cashProfit)}</div></div>
                  </div>
                  <div className="text-[14px] text-brick2 mt-3 font-semibold">Open project →</div>
                </button>
              ); })}
          </div>
          <div className="hidden sm:block">
          <DataTable
            rows={rows}
            search={['name', 'client', 'tenderNo', 'location', 'status']}
            initialSort={{ k: 'start', d: 'desc' }}
            onRow={(p) => go('p-' + p.id)}
            toolbar={<Select aria-label="Filter by status" className="w-auto" options={['All', ...PROJECT_STATUS]} value={status} onChange={(e) => setStatus(e.target.value)} />}
            empty={<Empty title="No projects yet" text="Add your first awarded contract to start tracking bills and costs." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New project</Btn>} />}
            cols={[
              { key: 'name', label: 'Project', render: (p) => <div className="min-w-[200px]"><div className="font-semibold">{p.name}</div><div className="text-[13px] text-mute">{p.tenderNo || 'No tender no.'}</div></div> },
              { key: 'client', label: 'Client' },
              { key: 'value', label: 'Contract value', align: 'right', render: (p) => fmtPKR(p.value) },
              { key: 'status', label: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
              { key: 'progress', label: 'Progress', align: 'right', render: (p) => `${p.progress || 0}%` },
              { key: 'profit', label: 'Profit (cash)', align: 'right', sort: (p) => projectFigures(p, data).cashProfit, render: (p) => { const v = projectFigures(p, data).cashProfit; return <span className={v < 0 ? 'text-bad' : ''}>{fmtPKR(v)}</span>; } },
              { key: 'start', label: 'Start', nowrap: true, render: (p) => fmtD(p.start) },
              { key: 'pgExpiry', label: 'Guarantee expiry', render: (p) => expiryBadge(p.pgExpiry) },
              { key: 'open', label: '', nosort: true, render: (p) => <Btn size="sm" kind="primary" onClick={(e) => { e.stopPropagation(); go('p-' + p.id); }}>Open project →</Btn> },
            ]}
          />
          </div>
        </>
      )}
      {edit && <ProjectForm initial={edit === 'new' ? null : edit} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete project?" text={`“${del.name}” will be deleted. Its bills and expenses are kept but will show as unlinked. This cannot be undone.`} onConfirm={() => deleteProject(del)} onClose={() => setDel(null)} />}
    </div>
  );
}


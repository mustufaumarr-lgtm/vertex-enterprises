// =====================================================================
// equipment.jsx — Owned/rented machinery: site assignment, maintenance
// log, fuel use and cost per project. Costs are Expenses linked by
// expense.equipmentId; non-money events live in equipment.log[].
// =====================================================================
import React, { useState } from 'react';
import { fmtPKR, fmtD, fmtQty, parseMoney, rs, uid, todayISO } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, Card, PageHead } from './ui.jsx';
import { ExpenseForm } from './expenses.jsx';

const RATE_UNITS = ['per day', 'per hour', 'per month', 'per trip'];

function EquipForm({ initial, data, api, onClose }) {
  const [f, setF] = useState(() => initial ? { ...initial, rentalRate: String(initial.rentalRate ?? '') } : { name: '', kind: 'Owned', regNo: '', owner: '', rentalRate: '', rateUnit: 'per day', currentProjectId: '', status: 'Working', notes: '', log: [] });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Required';
    const rate = f.rentalRate === '' ? 0 : parseMoney(f.rentalRate);
    if (Number.isNaN(rate) || rate < 0) e.rentalRate = 'Enter a number';
    if (f.kind === 'Rented' && !f.owner.trim()) e.owner = 'Who are you renting from?';
    setErr(e); if (Object.keys(e).length) return;
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('eq'), name: f.name.trim(), rentalRate: rate, log: f.log || [] };
    if (await api.put('equipment', rec, `${initial ? 'Edited' : 'Added'} machine “${rec.name}”`, 'Saved')) onClose();
  };
  return (
    <Modal title={initial ? 'Edit machine' : 'New machine'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Machine" required error={err.name} className="col-span-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. Excavator CAT 320" /></Field>
        <Field label="Owned or rented"><Select options={['Owned', 'Rented']} value={f.kind} onChange={set('kind')} /></Field>
        <Field label="Registration / serial no."><Input value={f.regNo} onChange={set('regNo')} /></Field>
        <Field label={f.kind === 'Rented' ? 'Rented from' : 'Owner'} error={err.owner} className="col-span-2"><Input value={f.owner} onChange={set('owner')} /></Field>
        <Field label="Rental / charge rate (PKR)" error={err.rentalRate}><Input inputMode="numeric" value={f.rentalRate} onChange={set('rentalRate')} /></Field>
        <Field label="Rate unit"><Select options={RATE_UNITS} value={f.rateUnit} onChange={set('rateUnit')} /></Field>
        <Field label="Status"><Select options={['Working', 'Idle', 'Under repair', 'Returned / sold']} value={f.status} onChange={set('status')} /></Field>
        {!initial && <Field label="Current site"><Select options={[{ value: '', label: 'Yard / not assigned' }, ...data.projects.map((p) => ({ value: p.id, label: p.name }))]} value={f.currentProjectId} onChange={set('currentProjectId')} /></Field>}
        <Field label="Notes" className="col-span-2"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function LogForm({ eq, data, api, mode, onClose }) {
  const [f, setF] = useState({ date: todayISO(), projectId: mode === 'assign' ? (data.projects.find((p) => p.status === 'Ongoing')?.id || '') : eq.currentProjectId || '', text: '', hours: '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name : 'Yard');
  const save = async () => {
    const e = {};
    if (!f.date) e.date = 'Required';
    if (mode === 'maint' && !f.text.trim()) e.text = 'Describe the work done';
    const hours = f.hours === '' ? 0 : Number(f.hours);
    if (Number.isNaN(hours) || hours < 0) e.hours = 'Enter a number';
    setErr(e); if (Object.keys(e).length) return;
    const entry = { id: uid('lg'), date: f.date, type: mode === 'assign' ? 'assign' : mode === 'hours' ? 'hours' : 'maintenance', projectId: f.projectId, text: f.text.trim(), hours };
    const rec = { ...eq, log: [...(eq.log || []), entry].slice(-300), ...(mode === 'assign' ? { currentProjectId: f.projectId } : {}) };
    const label = mode === 'assign' ? `Moved ${eq.name} to ${pName(f.projectId)}` : mode === 'hours' ? `Logged ${hours} hours for ${eq.name}` : `Maintenance note for ${eq.name}: ${entry.text}`;
    if (await api.put('equipment', rec, label, 'Saved')) onClose();
  };
  const title = { assign: 'Move to site', maint: 'Maintenance note', hours: 'Log working hours' }[mode];
  return (
    <Modal title={`${title} — ${eq.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label={mode === 'assign' ? 'Move to' : 'Site'}><Select options={[{ value: '', label: 'Yard / not assigned' }, ...data.projects.map((p) => ({ value: p.id, label: p.name }))]} value={f.projectId} onChange={set('projectId')} /></Field>
        {mode === 'hours' && <Field label="Hours worked" error={err.hours}><Input inputMode="decimal" value={f.hours} onChange={set('hours')} /></Field>}
        <Field label={mode === 'maint' ? 'Work done' : 'Notes'} required={mode === 'maint'} error={err.text} className="col-span-2"><TextArea value={f.text} onChange={set('text')} /></Field>
      </div>
      {mode === 'maint' && <p className="text-[13px] text-mute mt-3">Paid for repairs or parts? Use “+ Add cost” with category Repairs & maintenance so the money is counted.</p>}
    </Modal>
  );
}

function EquipDetail({ eq, data, api, onBack, onEdit, onDelete }) {
  const [log, setLog] = useState(null);
  const [cost, setCost] = useState(null);
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '—' : 'Yard / office');
  const exps = data.expenses.filter((e) => e.equipmentId === eq.id);
  const total = exps.reduce((s, e) => s + rs(e.amount), 0);
  const litres = exps.reduce((s, e) => s + (Number(e.litres) || 0), 0);
  const hours = (eq.log || []).reduce((s, l) => s + (Number(l.hours) || 0), 0);
  const perProj = {};
  exps.forEach((e) => { const k = e.projectId || ''; perProj[k] = perProj[k] || { id: k || 'none', project: pName(k), fuel: 0, rent: 0, repair: 0, other: 0, total: 0, litres: 0 }; const r = perProj[k]; const a = rs(e.amount); if (e.category === 'Fuel') { r.fuel += a; r.litres += Number(e.litres) || 0; } else if (e.category === 'Equipment rental') r.rent += a; else if (e.category === 'Repairs & maintenance') r.repair += a; else r.other += a; r.total += a; });
  const timeline = [
    ...(eq.log || []).map((l) => ({ id: l.id, date: l.date, kind: l.type, text: l.type === 'assign' ? `Moved to ${pName(l.projectId)}${l.text ? ' — ' + l.text : ''}` : l.type === 'hours' ? `${l.hours} hours at ${pName(l.projectId)}${l.text ? ' — ' + l.text : ''}` : l.text, amount: null })),
    ...exps.map((e) => ({ id: e.id, date: e.date, kind: e.category, text: `${e.payee}${e.litres ? ` · ${fmtQty(e.litres)} L` : ''}${e.notes ? ' — ' + e.notes : ''} · ${pName(e.projectId)}`, amount: rs(e.amount), exp: e })),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" className="text-[15px] text-mute hover:text-ink min-h-[44px]" onClick={onBack}>← All equipment</button>
          <h1 className="text-[clamp(26px,3.5vw,38px)] font-bold leading-tight">{eq.name}</h1>
          <p className="text-mute mt-1">{eq.kind}{eq.owner ? ` · ${eq.owner}` : ''}{eq.regNo ? ` · ${eq.regNo}` : ''}{eq.rentalRate ? ` · ${fmtPKR(eq.rentalRate)} ${eq.rateUnit}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn kind="accent" onClick={() => setCost({ equipmentId: eq.id, projectId: eq.currentProjectId || '', category: 'Fuel', payee: '' })}>+ Add cost</Btn>
          <Btn onClick={() => setLog('assign')}>Move to site</Btn>
          <Btn onClick={() => setLog('hours')}>Log hours</Btn>
          <Btn onClick={() => setLog('maint')}>Maintenance note</Btn>
          <Btn onClick={onEdit}>Edit</Btn><Btn kind="danger" onClick={onDelete}>Delete</Btn>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Current site" value={<span className="text-[18px] block whitespace-normal">{pName(eq.currentProjectId)}</span>} sub={eq.status} />
        <Stat label="Total cost" value={fmtPKR(total)} />
        <Stat label="Fuel used" value={`${fmtQty(litres)} L`} />
        <Stat label="Hours logged" value={fmtQty(hours)} />
      </div>
      <Card title="Cost per project">
        <DataTable rows={Object.values(perProj)} initialSort={{ k: 'total', d: 'desc' }} empty={<p className="text-mute">No costs recorded yet.</p>}
          cols={[{ key: 'project', label: 'Project' }, { key: 'fuel', label: 'Fuel', align: 'right', render: (r) => fmtPKR(r.fuel) }, { key: 'litres', label: 'Litres', align: 'right', render: (r) => fmtQty(r.litres) }, { key: 'rent', label: 'Rent', align: 'right', render: (r) => fmtPKR(r.rent) }, { key: 'repair', label: 'Repairs', align: 'right', render: (r) => fmtPKR(r.repair) }, { key: 'other', label: 'Other', align: 'right', render: (r) => fmtPKR(r.other) }, { key: 'total', label: 'Total', align: 'right', render: (r) => <b>{fmtPKR(r.total)}</b> }]} />
      </Card>
      <Card title="Log: moves, hours, maintenance and costs">
        <DataTable rows={timeline} search={['text', 'kind']} initialSort={{ k: 'date', d: 'desc' }} empty={<p className="text-mute">Nothing logged yet.</p>}
          cols={[
            { key: 'date', label: 'Date', nowrap: true, render: (r) => fmtD(r.date) },
            { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.amount != null ? 'brick' : 'mute'}>{{ assign: 'Moved', hours: 'Hours', maintenance: 'Maintenance' }[r.kind] || r.kind}</Badge> },
            { key: 'text', label: 'Details', render: (r) => <div className="min-w-[200px]">{r.text}</div> },
            { key: 'amount', label: 'Cost', align: 'right', render: (r) => (r.amount != null ? fmtPKR(r.amount) : '') },
            { key: 'act', label: '', nosort: true, render: (r) => (r.exp ? <Btn size="sm" onClick={() => setCost({ __edit: r.exp })}>Edit</Btn> : <Btn size="sm" kind="ghost" onClick={() => api.put('equipment', { ...eq, log: (eq.log || []).filter((l) => l.id !== r.id) }, `Removed a log entry from ${eq.name}`)}>Remove</Btn>) },
          ]} />
      </Card>
      {log && <LogForm eq={eq} data={data} api={api} mode={log} onClose={() => setLog(null)} />}
      {cost && <ExpenseForm initial={cost.__edit || null} preset={cost.__edit ? null : cost} data={data} api={api} onClose={() => setCost(null)} />}
    </div>
  );
}

export default function Equipment({ data, api }) {
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [openId, setOpenId] = useState(null);
  const open = data.equipment.find((q) => q.id === openId);
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '—' : 'Yard');
  const costOf = (q) => data.expenses.filter((e) => e.equipmentId === q.id).reduce((s, e) => s + rs(e.amount), 0);
  const rows = data.equipment.map((q) => ({ ...q, cost: costOf(q) }));
  return (
    <div>
      {open ? <EquipDetail eq={open} data={data} api={api} onBack={() => setOpenId(null)} onEdit={() => setEdit(open)} onDelete={() => setDel(open)} /> : (
        <>
          <PageHead title="Equipment" text="Owned and rented machinery: where it is, what it costs to run, and which project pays." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New machine</Btn>} />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <Stat label="Machines" value={rows.length} sub={`${rows.filter((r) => r.kind === 'Owned').length} owned · ${rows.filter((r) => r.kind === 'Rented').length} rented`} />
            <Stat label="On sites now" value={rows.filter((r) => r.currentProjectId).length} />
            <Stat label="Total running cost" value={fmtPKR(rows.reduce((s, r) => s + r.cost, 0))} />
          </div>
          <DataTable rows={rows} search={['name', 'owner', 'regNo', (r) => pName(r.currentProjectId), 'status']} initialSort={{ k: 'name', d: 'asc' }} onRow={(r) => setOpenId(r.id)}
            empty={<Empty title="No equipment yet" text="Add your rollers, excavators, mixers and rented plant." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New machine</Btn>} />}
            cols={[
              { key: 'name', label: 'Machine', render: (r) => <div className="min-w-[160px]"><div className="font-semibold">{r.name}</div><div className="text-[13px] text-mute">{r.regNo}</div></div> },
              { key: 'kind', label: 'Owned / rented', render: (r) => <Badge tone={r.kind === 'Owned' ? 'ink' : 'brick'}>{r.kind}</Badge> },
              { key: 'rate', label: 'Rate', align: 'right', sort: (r) => rs(r.rentalRate), render: (r) => (r.rentalRate ? <span>{fmtPKR(r.rentalRate)}<span className="block text-[13px] text-mute">{r.rateUnit}</span></span> : '—') },
              { key: 'site', label: 'Current site', sort: (r) => pName(r.currentProjectId), render: (r) => pName(r.currentProjectId) },
              { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'Working' ? 'ok' : r.status === 'Under repair' ? 'warn' : 'mute'}>{r.status}</Badge> },
              { key: 'cost', label: 'Running cost', align: 'right', render: (r) => fmtPKR(r.cost) },
            ]} />
        </>
      )}
      {edit && <EquipForm initial={edit === 'new' ? null : edit} data={data} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete machine?" text={`“${del.name}” and its log will be deleted. Its expenses stay in Expenses.`} onConfirm={async () => { await api.del('equipment', del.id, `Deleted machine “${del.name}”`); setOpenId(null); }} onClose={() => setDel(null)} />}
    </div>
  );
}

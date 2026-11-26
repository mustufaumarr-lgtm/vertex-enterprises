// =====================================================================
// compliance.jsx — Company documents & certificates with expiry warnings
// (green valid / amber under 30 days / red expired). Project performance
// guarantees from Projects are shown alongside, read-only.
// =====================================================================
import React, { useState } from 'react';
import { DOC_CATS, fmtD, fmtPKR, parseMoney, uid, docStatus } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, Check, PageHead } from './ui.jsx';

function DocForm({ initial, api, onClose }) {
  const [f, setF] = useState(() => initial ? { ...initial, amount: String(initial.amount ?? '') } : { name: '', category: 'PEC license', number: '', issuer: '', pecCategory: '', issueDate: '', expiryDate: '', amount: '', location: '', notes: '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Required';
    if (f.issueDate && f.expiryDate && f.expiryDate < f.issueDate) e.expiryDate = 'Expiry cannot be before issue date';
    const amount = f.amount === '' ? 0 : parseMoney(f.amount);
    if (Number.isNaN(amount) || amount < 0) e.amount = 'Enter a number';
    setErr(e); if (Object.keys(e).length) return;
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('doc'), name: f.name.trim(), amount };
    if (await api.put('documents', rec, `${initial ? 'Edited' : 'Added'} document “${rec.name}”${rec.expiryDate ? ' (expires ' + fmtD(rec.expiryDate) + ')' : ''}`, 'Saved')) onClose();
  };
  return (
    <Modal wide title={initial ? 'Edit document' : 'New document'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Document name" required error={err.name} className="sm:col-span-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. PEC registration certificate" /></Field>
        <Field label="Type"><Select options={DOC_CATS} value={f.category} onChange={set('category')} /></Field>
        <Field label="Number"><Input value={f.number} onChange={set('number')} /></Field>
        <Field label="Issued by"><Input value={f.issuer} onChange={set('issuer')} placeholder="e.g. PEC, FBR, SRB, HBL" /></Field>
        {f.category === 'PEC license' ? <Field label="PEC category & codes" hint="e.g. C-4, CE-01 / CE-09"><Input value={f.pecCategory} onChange={set('pecCategory')} /></Field>
          : (f.category === 'Bank guarantee' || f.category === 'Insurance') ? <Field label="Amount (PKR)" error={err.amount}><Input inputMode="numeric" value={f.amount} onChange={set('amount')} /></Field> : <div className="hidden sm:block" />}
        <Field label="Issue date"><Input type="date" value={f.issueDate} onChange={set('issueDate')} /></Field>
        <Field label="Expiry date" error={err.expiryDate} hint="Leave blank if it never expires"><Input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
        <Field label="Where the file is kept" className="sm:col-span-2" hint="e.g. Office cabinet B, Google Drive › Compliance › PEC 2026.pdf"><Input value={f.location} onChange={set('location')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function Compliance({ data, api }) {
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [cat, setCat] = useState('All');
  const [showPG, setShowPG] = useState(true);
  const docs = data.documents.map((d) => ({ ...d, st: docStatus(d.expiryDate) }));
  const pgs = showPG ? data.projects.filter((p) => p.pgAmount > 0 && p.status !== 'Completed').map((p) => ({ id: 'pg-' + p.id, name: `Performance guarantee — ${p.name}`, category: 'Bank guarantee', number: p.tenderNo, issuer: p.pgBank, expiryDate: p.pgExpiry, amount: p.pgAmount, location: '', fromProject: true, st: docStatus(p.pgExpiry) })) : [];
  const all = [...docs, ...pgs].filter((d) => cat === 'All' || d.category === cat);
  const expired = [...docs, ...pgs].filter((d) => d.st.tone === 'bad').length;
  const soon = [...docs, ...pgs].filter((d) => d.st.tone === 'warn').length;
  return (
    <div>
      <PageHead title="Compliance & documents" text="Registrations, licences, guarantees and certificates — and when each one runs out." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New document</Btn>} />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Expired" value={expired} tone={expired ? 'bad' : undefined} />
        <Stat label="Expiring within 30 days" value={soon} tone={soon ? 'bad' : undefined} />
        <Stat label="Documents tracked" value={docs.length} />
      </div>
      <DataTable rows={all} search={['name', 'number', 'issuer', 'category', 'location', 'pecCategory']} initialSort={{ k: 'expiry', d: 'asc' }}
        toolbar={<><Select aria-label="Filter by type" className="w-auto" options={['All', ...DOC_CATS]} value={cat} onChange={(e) => setCat(e.target.value)} /><Check label="Show project guarantees" checked={showPG} onChange={setShowPG} /></>}
        empty={<Empty title="No documents yet" text="Start with your company registration, NTN, sales tax registration and PEC licence." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New document</Btn>} />}
        cols={[
          { key: 'name', label: 'Document', render: (d) => <div className="min-w-[200px]"><div className="font-semibold">{d.name}</div><div className="text-[13px] text-mute">{[d.category, d.pecCategory].filter(Boolean).join(' · ')}</div></div> },
          { key: 'number', label: 'Number', render: (d) => d.number || '—' },
          { key: 'issuer', label: 'Issued by', render: (d) => <span>{d.issuer || '—'}{d.amount ? <span className="block text-[13px] text-mute tabular-nums">{fmtPKR(d.amount)}</span> : null}</span> },
          { key: 'issueDate', label: 'Issued', nowrap: true, render: (d) => fmtD(d.issueDate) },
          { key: 'expiry', label: 'Expiry', nowrap: true, sort: (d) => d.st.d, render: (d) => fmtD(d.expiryDate) },
          { key: 'st', label: 'Status', sort: (d) => d.st.d, render: (d) => <Badge tone={d.st.tone}>{d.st.tone === 'bad' ? '● ' : d.st.tone === 'warn' ? '▲ ' : ''}{d.st.label}</Badge> },
          { key: 'location', label: 'File kept at', render: (d) => <span className="text-[14px]">{d.location || (d.fromProject ? 'See Projects' : '—')}</span> },
          { key: 'act', label: '', nosort: true, render: (d) => (d.fromProject ? <span className="text-[13px] text-mute">From Projects</span> : <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setEdit(data.documents.find((x) => x.id === d.id))}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setDel(d)}>Delete</Btn></div>) },
        ]} />
      <p className="text-[13px] text-mute mt-2">Keep the actual files somewhere safe (office cabinet or cloud drive); this tracker records where they are and warns you before they expire.</p>
      {edit && <DocForm initial={edit === 'new' ? null : edit} api={api} onClose={() => setEdit(null)} />}
      {del && <Confirm title="Delete document?" text={`“${del.name}” will be removed from the tracker.`} onConfirm={() => api.del('documents', del.id, `Deleted document “${del.name}”`)} onClose={() => setDel(null)} />}
    </div>
  );
}

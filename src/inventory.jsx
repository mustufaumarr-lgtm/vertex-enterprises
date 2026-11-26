// =====================================================================
// inventory.jsx — Materials in store: purchases in, issues to projects,
// adjustments, remaining stock, average cost and low-stock alerts.
// A purchase can also be recorded as a paid expense (expense.stockMoveId).
// =====================================================================
import React, { useState } from 'react';
import { fmtPKR, fmtD, fmtQty, parseMoney, uid, todayISO, stockOf, rs100, PAY_METHODS } from './lib.js';
import { Btn, Field, Input, Select, TextArea, Modal, Confirm, Badge, Empty, DataTable, Stat, Check, PageHead } from './ui.jsx';

const num = (s) => { const n = Number(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };

function ItemForm({ initial, data, api, onClose }) {
  const [f, setF] = useState(() => initial ? { ...initial, reorderLevel: String(initial.reorderLevel ?? ''), openingQty: String(initial.openingQty ?? 0), openingCost: String(initial.openingCost ?? 0) } : { name: '', unit: 'bag', reorderLevel: '', openingQty: '0', openingCost: '0', notes: '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Required';
    else if (data.items.some((i) => i.name.trim().toLowerCase() === f.name.trim().toLowerCase() && i.id !== initial?.id)) e.name = 'This item already exists';
    if (!f.unit.trim()) e.unit = 'Required';
    const rl = f.reorderLevel === '' ? 0 : num(f.reorderLevel), oq = num(f.openingQty || 0), oc = num(f.openingCost || 0);
    if (Number.isNaN(rl) || rl < 0) e.reorderLevel = 'Enter a number';
    if (Number.isNaN(oq) || oq < 0) e.openingQty = 'Enter a number';
    if (Number.isNaN(oc) || oc < 0) e.openingCost = 'Enter a number';
    setErr(e); if (Object.keys(e).length) return;
    const rec = { ...(initial || {}), ...f, id: initial?.id || uid('itm'), name: f.name.trim(), unit: f.unit.trim(), reorderLevel: rs100(rl), openingQty: rs100(oq), openingCost: rs100(oc) };
    if (await api.put('items', rec, `${initial ? 'Edited' : 'Added'} stock item “${rec.name}”`, 'Saved')) onClose();
  };
  return (
    <Modal title={initial ? 'Edit item' : 'New stock item'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Material" required error={err.name} className="col-span-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. OPC Cement" /></Field>
        <Field label="Unit" required error={err.unit}><Input value={f.unit} onChange={set('unit')} placeholder="bag, ton, cft, kg" /></Field>
        <Field label="Reorder level" error={err.reorderLevel} hint="Alert when stock falls to this"><Input inputMode="decimal" value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
        <Field label="Opening quantity" error={err.openingQty}><Input inputMode="decimal" value={f.openingQty} onChange={set('openingQty')} /></Field>
        <Field label="Opening unit cost (PKR)" error={err.openingCost}><Input inputMode="decimal" value={f.openingCost} onChange={set('openingCost')} /></Field>
        <Field label="Notes" className="col-span-2"><TextArea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export function MoveForm({ type, item, data, api, onClose, presetProjectId }) {
  const st = item ? stockOf(item, data) : null;
  const [f, setF] = useState({ itemId: item?.id || data.items[0]?.id || '', date: todayISO(), qty: '', unitCost: '', projectId: presetProjectId ?? (data.projects.find((p) => p.status === 'Ongoing')?.id || ''), vendorId: '', ref: '', notes: '', paid: true, method: 'Bank', direction: '-' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const it = data.items.find((i) => i.id === f.itemId);
  const cur = it ? stockOf(it, data) : st;
  const save = async () => {
    const e = {};
    if (!it) e.itemId = 'Choose an item';
    if (!f.date) e.date = 'Required';
    const q = num(f.qty);
    if (!(q > 0)) e.qty = 'Enter a quantity above zero';
    if (type === 'issue' && cur && q > cur.qty) e.qty = `Only ${fmtQty(cur.qty)} ${it.unit} in stock`;
    if (type === 'issue' && !f.projectId) e.projectId = 'Choose the project';
    const uc = type === 'in' ? num(f.unitCost) : 0;
    if (type === 'in' && !(uc >= 0 && f.unitCost !== '')) e.unitCost = 'Enter the unit cost';
    if (type === 'in' && f.paid && (f.method !== 'Cash') && !f.ref.trim()) e.ref = 'Add the cheque / transfer no.';
    if (type === 'adjust' && !f.notes.trim()) e.notes = 'Give a reason (breakage, count correction…)';
    if (type === 'adjust' && f.direction === '-' && cur && q > cur.qty) e.qty = `Only ${fmtQty(cur.qty)} in stock`;
    setErr(e); if (Object.keys(e).length) return;
    const id = uid('mv');
    const total = Math.round(q * uc);
    const move = { id, itemId: it.id, date: f.date, type, qty: type === 'adjust' && f.direction === '-' ? -rs100(q) : rs100(q), unitCost: type === 'in' ? rs100(uc) : null, projectId: type === 'adjust' ? '' : f.projectId, vendorId: type === 'in' ? f.vendorId : '', ref: f.ref, notes: f.notes };
    const v = data.vendors.find((x) => x.id === f.vendorId);
    if (type === 'in' && f.paid && total > 0) {
      const expId = uid('exp');
      move.expenseId = expId;
      const okE = await api.put('expenses', { id: expId, date: f.date, projectId: f.projectId, category: 'Materials', payee: v?.name || 'Supplier', vendorId: f.vendorId, amount: total, method: f.method, ref: f.ref, notes: `${fmtQty(q)} ${it.unit} ${it.name} into store`, taxDeductible: true, stockMoveId: id });
      if (!okE) return;
    }
    const label = type === 'in' ? `Stock in: ${fmtQty(q)} ${it.unit} ${it.name}${total ? ' (' + fmtPKR(total) + ')' : ''}` : type === 'issue' ? `Issued ${fmtQty(q)} ${it.unit} ${it.name} to ${data.projects.find((p) => p.id === f.projectId)?.name}` : `Stock adjusted ${f.direction}${fmtQty(q)} ${it.unit} ${it.name}: ${f.notes}`;
    if (await api.put('stockmoves', move, label, 'Saved')) onClose();
  };
  const title = { in: 'Stock in (purchase)', issue: 'Issue to project', adjust: 'Adjust stock' }[type];
  return (
    <Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Item" required error={err.itemId} className="col-span-2"><Select options={data.items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} value={f.itemId} onChange={set('itemId')} /></Field>
        {cur && <p className="col-span-2 text-[14px] text-mute -mt-2">In stock now: <b className="text-ink">{fmtQty(cur.qty)} {it?.unit}</b> · average cost {fmtPKR(cur.avgCost)}</p>}
        <Field label="Date" required error={err.date}><Input type="date" value={f.date} onChange={set('date')} /></Field>
        {type === 'adjust' && <Field label="Direction"><Select options={[{ value: '-', label: 'Reduce (−)' }, { value: '+', label: 'Increase (+)' }]} value={f.direction} onChange={set('direction')} /></Field>}
        <Field label={`Quantity${it ? ' (' + it.unit + ')' : ''}`} required error={err.qty}><Input inputMode="decimal" value={f.qty} onChange={set('qty')} /></Field>
        {type === 'in' && <Field label="Unit cost (PKR)" required error={err.unitCost}><Input inputMode="decimal" value={f.unitCost} onChange={set('unitCost')} /></Field>}
        {type === 'in' && <div className="col-span-2 text-[15px]">Total: <b className="tabular-nums">{fmtPKR(Math.round((num(f.qty) || 0) * (num(f.unitCost) || 0)))}</b></div>}
        {type !== 'adjust' && <Field label={type === 'in' ? 'Charge cost to' : 'Project'} error={err.projectId} className="col-span-2"><Select options={[...data.projects.map((p) => ({ value: p.id, label: p.name })), ...(type === 'in' ? [{ value: '', label: 'Office / General (store)' }] : [])]} value={f.projectId} onChange={set('projectId')} /></Field>}
        {type === 'in' && <Field label="Supplier" className="col-span-2"><Select options={[{ value: '', label: '— Not listed —' }, ...data.vendors.map((v) => ({ value: v.id, label: v.name }))]} value={f.vendorId} onChange={set('vendorId')} /></Field>}
        {type === 'in' && <div className="col-span-2"><Check label="Paid now — also record as an expense" checked={f.paid} onChange={(v) => setF((x) => ({ ...x, paid: v }))} />{!f.paid && <p className="text-[13px] text-mute">Bought on credit? Add the supplier's bill in Vendors & labour instead, so it shows as payable.</p>}</div>}
        {type === 'in' && f.paid && <Field label="Paid by"><Select options={PAY_METHODS} value={f.method} onChange={set('method')} /></Field>}
        <Field label="Reference no." error={err.ref}><Input value={f.ref} onChange={set('ref')} /></Field>
        <Field label={type === 'adjust' ? 'Reason' : 'Notes'} required={type === 'adjust'} error={err.notes} className="col-span-2"><Input value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function Inventory({ data, api }) {
  const [tab, setTab] = useState('stock');
  const [edit, setEdit] = useState(null);
  const [move, setMove] = useState(null);
  const [del, setDel] = useState(null);
  const [delMove, setDelMove] = useState(null);
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '—' : 'Store / office');
  const rows = data.items.map((i) => ({ ...i, S: stockOf(i, data) }));
  const low = rows.filter((r) => r.S.low);
  const value = rows.reduce((s, r) => s + r.S.value, 0);
  const iName = (id) => data.items.find((i) => i.id === id);
  // Issues per project (value at current average cost)
  const perProject = {};
  for (const m of data.stockmoves) if (m.type === 'issue') {
    const it = iName(m.itemId); if (!it) continue;
    const k = m.projectId + '|' + m.itemId;
    const S = rows.find((r) => r.id === m.itemId)?.S;
    perProject[k] = perProject[k] || { id: k, project: pName(m.projectId), item: it.name, unit: it.unit, qty: 0, value: 0 };
    perProject[k].qty = rs100(perProject[k].qty + Number(m.qty));
    perProject[k].value += Math.round(Number(m.qty) * (S?.avgCost || 0));
  }
  const noItems = !data.items.length;
  return (
    <div>
      <PageHead title="Inventory" text="Materials bought into the store, issued to each site, and what is left." action={<>
        <Btn disabled={noItems} onClick={() => setMove({ type: 'in' })}>Stock in</Btn>
        <Btn disabled={noItems} onClick={() => setMove({ type: 'issue' })}>Issue to project</Btn>
        <Btn kind="accent" onClick={() => setEdit('new')}>+ New item</Btn>
      </>} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <Stat label="Stock value (avg cost)" value={fmtPKR(value)} />
        <Stat label="Items" value={rows.length} />
        <Stat label="Low stock" value={low.length} tone={low.length ? 'bad' : undefined} sub={low.map((l) => l.name).join(', ') || 'All above reorder level'} />
      </div>
      <div className="flex gap-1 mb-4 border-b border-line overflow-x-auto" role="tablist">
        {[['stock', 'Stock'], ['moves', 'Movements'], ['projects', 'Issued per project']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`shrink-0 h-11 px-4 font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[#8b5cf6] text-ink' : 'border-transparent text-mute hover:text-ink'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'stock' && (
        <DataTable rows={rows} search={['name', 'unit', 'notes']} initialSort={{ k: 'name', d: 'asc' }}
          empty={<Empty title="No stock items" text="Add the materials you keep in the store, e.g. cement, steel, crush." action={<Btn kind="accent" onClick={() => setEdit('new')}>+ New item</Btn>} />}
          cols={[
            { key: 'name', label: 'Material', render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'qty', label: 'In stock', align: 'right', sort: (r) => r.S.qty, render: (r) => <span className={r.S.low ? 'text-bad font-semibold' : ''}>{fmtQty(r.S.qty)} {r.unit}</span> },
            { key: 'reorder', label: 'Reorder at', align: 'right', sort: (r) => Number(r.reorderLevel) || 0, render: (r) => (r.reorderLevel ? `${fmtQty(r.reorderLevel)} ${r.unit}` : '—') },
            { key: 'st', label: 'Status', sort: (r) => (r.S.low ? 0 : 1), render: (r) => (r.S.low ? <Badge tone="bad">● Low stock</Badge> : <Badge tone="ok">OK</Badge>) },
            { key: 'avg', label: 'Avg unit cost', align: 'right', sort: (r) => r.S.avgCost, render: (r) => fmtPKR(r.S.avgCost) },
            { key: 'val', label: 'Value', align: 'right', sort: (r) => r.S.value, render: (r) => fmtPKR(r.S.value) },
            { key: 'issued', label: 'Issued total', align: 'right', sort: (r) => r.S.issued, render: (r) => `${fmtQty(r.S.issued)} ${r.unit}` },
            { key: 'act', label: '', nosort: true, render: (r) => <div className="flex gap-1 justify-end"><Btn size="sm" onClick={() => setMove({ type: 'adjust', item: r })}>Adjust</Btn><Btn size="sm" onClick={() => setEdit(r)}>Edit</Btn><Btn size="sm" kind="ghost" onClick={() => setDel(r)}>Delete</Btn></div> },
          ]} />
      )}
      {tab === 'moves' && (
        <DataTable rows={data.stockmoves.map((m) => ({ ...m, it: iName(m.itemId) }))} search={[(m) => m.it?.name, 'ref', 'notes', (m) => pName(m.projectId)]} initialSort={{ k: 'date', d: 'desc' }}
          empty={<Empty title="No movements yet" />}
          cols={[
            { key: 'date', label: 'Date', nowrap: true, render: (m) => fmtD(m.date) },
            { key: 'type', label: 'Type', render: (m) => <Badge tone={m.type === 'in' ? 'ok' : m.type === 'issue' ? 'ink' : 'warn'}>{m.type === 'in' ? 'In' : m.type === 'issue' ? 'Issued' : 'Adjusted'}</Badge> },
            { key: 'item', label: 'Item', sort: (m) => m.it?.name, render: (m) => m.it?.name || '(deleted item)' },
            { key: 'qty', label: 'Qty', align: 'right', render: (m) => `${m.type === 'issue' ? '−' : Number(m.qty) > 0 ? '+' : ''}${fmtQty(m.type === 'issue' ? m.qty : m.qty)} ${m.it?.unit || ''}` },
            { key: 'cost', label: 'Unit cost', align: 'right', render: (m) => (m.unitCost != null ? fmtPKR(m.unitCost) : '') },
            { key: 'proj', label: 'Project / reason', sort: (m) => pName(m.projectId), render: (m) => <div className="min-w-[160px]">{m.type === 'adjust' ? m.notes : pName(m.projectId)}{m.ref ? <div className="text-[13px] text-mute">{m.ref}</div> : null}</div> },
            { key: 'act', label: '', nosort: true, render: (m) => <Btn size="sm" kind="ghost" onClick={() => setDelMove(m)}>Delete</Btn> },
          ]} />
      )}
      {tab === 'projects' && (
        <>
          <DataTable rows={Object.values(perProject)} search={['project', 'item']} initialSort={{ k: 'project', d: 'asc' }}
            empty={<Empty title="Nothing issued yet" />}
            cols={[{ key: 'project', label: 'Project' }, { key: 'item', label: 'Material' }, { key: 'qty', label: 'Quantity', align: 'right', render: (r) => `${fmtQty(r.qty)} ${r.unit}` }, { key: 'value', label: 'Value (avg cost)', align: 'right', render: (r) => fmtPKR(r.value) }]} />
          <p className="text-[13px] text-mute mt-2">For information: the money for materials is counted once, when the purchase is recorded as an expense (against the project or Office/General you chose).</p>
        </>
      )}
      {edit && <ItemForm initial={edit === 'new' ? null : edit} data={data} api={api} onClose={() => setEdit(null)} />}
      {move && <MoveForm type={move.type} item={move.item} data={data} api={api} onClose={() => setMove(null)} />}
      {del && <Confirm title="Delete item?" text={`“${del.name}” and its stock history will be hidden. Linked expenses are kept.`} onConfirm={async () => { for (const m of data.stockmoves.filter((x) => x.itemId === del.id)) await api.del('stockmoves', m.id); await api.del('items', del.id, `Deleted stock item “${del.name}”`); }} onClose={() => setDel(null)} />}
      {delMove && <Confirm title="Delete movement?" text={`This stock movement will be deleted.${delMove.expenseId ? ' The linked expense is kept — delete it in Expenses if needed.' : ''}`} onConfirm={() => api.del('stockmoves', delMove.id, `Deleted stock movement (${delMove.type}, ${fmtQty(delMove.qty)})`)} onClose={() => setDelMove(null)} />}
    </div>
  );
}

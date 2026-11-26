// =====================================================================
// datapage.jsx — Settings, backups (export/import), sample data, reset,
// PIN lock and the activity log.
// =====================================================================
import React, { useRef, useState } from 'react';
import { DED_KEYS, PARTNER_TX, fmtPKR, fmtD, fmtDT, parseMoney, parsePct, rs, uid, toCSV, sha256, todayISO, cashMovements, billNet, billPending, billStatus, billDeductionTotal, partyLedger, stockOf, docStatus } from './lib.js';
import { COLLS, COLL_LABEL } from './store.js';
import { Btn, Field, Input, Modal, Confirm, Card, DataTable, Empty, PageHead } from './ui.jsx';

// ---- file output: downloads capability, or a copy-to-clipboard fallback ----
export async function saveFile(filename, text, setFallback) {
  try {
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({ filename, data: text }); return true; }
  } catch (e) {
    if (e && (e.code === 'cancelled' || e.code === 'canceled' || e.code === 'declined' || e.code === 'aborted')) return false;
  }
  setFallback({ filename, text });
  return false;
}

export function FallbackModal({ file, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal wide title={`Copy ${file.filename}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" onClick={async () => { try { await navigator.clipboard.writeText(file.text); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied ✓' : 'Copy to clipboard'}</Btn></>}>
      <p className="text-[14px] text-mute mb-2">Downloads aren't available in this view. Copy the text below and paste it into a new file named <b>{file.filename}</b>.</p>
      <textarea readOnly className="w-full h-64 font-mono text-[12px] border border-line rounded-md p-2 bg-soft text-ink" value={file.text} onFocus={(e) => e.target.select()} />
    </Modal>
  );
}

const CSV_DEFS = (data) => {
  const pName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || '' : 'Office / General');
  return {
    projects: { rows: data.projects, cols: [
      { label: 'Project', get: (p) => p.name }, { label: 'Tender no.', get: (p) => p.tenderNo }, { label: 'Client', get: (p) => p.client }, { label: 'Contract value (PKR)', get: (p) => rs(p.value) }, { label: 'Budget (PKR)', get: (p) => rs(p.budget) },
      { label: 'Start', get: (p) => fmtD(p.start) }, { label: 'End', get: (p) => fmtD(p.end) }, { label: 'Status', get: (p) => p.status }, { label: 'Progress %', get: (p) => p.progress }, { label: 'Retention %', get: (p) => p.retentionPct },
      { label: 'PG amount (PKR)', get: (p) => rs(p.pgAmount) }, { label: 'PG bank', get: (p) => p.pgBank }, { label: 'PG expiry', get: (p) => fmtD(p.pgExpiry) }, { label: 'Location', get: (p) => p.location }, { label: 'Notes', get: (p) => p.notes }] },
    bills: { rows: data.bills, cols: [
      { label: 'Project', get: (b) => pName(b.projectId) }, { label: 'Bill no.', get: (b) => b.billNo }, { label: 'Type', get: (b) => b.type }, { label: 'Date', get: (b) => fmtD(b.date) }, { label: 'Gross (PKR)', get: (b) => rs(b.gross) },
      ...DED_KEYS.map(({ k, label }) => ({ label: `${label} (PKR)`, get: (b) => rs(b.ded?.[k]?.amt) })),
      { label: 'Total deductions (PKR)', get: billDeductionTotal }, { label: 'Net (PKR)', get: billNet }, { label: 'Received (PKR)', get: (b) => rs(b.received) }, { label: 'Date received', get: (b) => fmtD(b.receivedDate) }, { label: 'Pending (PKR)', get: billPending }, { label: 'Status', get: billStatus },
      { label: 'Retention released', get: (b) => (b.retentionReleased ? 'Yes' : 'No') }, { label: 'Retention release date', get: (b) => fmtD(b.retentionReleaseDate) }] },
    expenses: { rows: data.expenses, cols: [
      { label: 'Date', get: (e) => fmtD(e.date) }, { label: 'Project', get: (e) => pName(e.projectId) }, { label: 'Category', get: (e) => e.category }, { label: 'Payee', get: (e) => e.payee }, { label: 'Amount (PKR)', get: (e) => rs(e.amount) },
      { label: 'Method', get: (e) => e.method }, { label: 'Reference', get: (e) => e.ref }, { label: 'Tax-deductible', get: (e) => (e.taxDeductible ? 'Yes' : 'No') }, { label: 'Vendor', get: (e) => data.vendors.find((v) => v.id === e.vendorId)?.name || '' }, { label: 'Machine', get: (e) => data.equipment.find((q) => q.id === e.equipmentId)?.name || '' }, { label: 'Litres', get: (e) => e.litres || '' }, { label: 'Notes', get: (e) => e.notes }] },
    vendors: { rows: data.vendors, cols: [{ label: 'Name', get: (v) => v.name }, { label: 'Type', get: (v) => v.type }, { label: 'Phone', get: (v) => v.phone }, { label: 'CNIC/NTN', get: (v) => v.cnicNtn }, { label: 'Opening (PKR)', get: (v) => rs(v.openingBalance) }, { label: 'Billed (PKR)', get: (v) => partyLedger(v, data).billed }, { label: 'Paid (PKR)', get: (v) => partyLedger(v, data).paid }, { label: 'Balance owed (PKR)', get: (v) => partyLedger(v, data).balance }] },
    vendorbills: { rows: data.vendorbills, cols: [{ label: 'Party', get: (b) => data.vendors.find((v) => v.id === b.partyId)?.name || '' }, { label: 'Date', get: (b) => fmtD(b.date) }, { label: 'Bill no.', get: (b) => b.billNo }, { label: 'Project', get: (b) => pName(b.projectId) }, { label: 'Amount (PKR)', get: (b) => rs(b.amount) }, { label: 'Due', get: (b) => fmtD(b.dueDate) }, { label: 'Details', get: (b) => b.notes }] },
    inventory: { rows: data.items, cols: [{ label: 'Material', get: (i) => i.name }, { label: 'Unit', get: (i) => i.unit }, { label: 'In stock', get: (i) => stockOf(i, data).qty }, { label: 'Reorder level', get: (i) => i.reorderLevel }, { label: 'Avg unit cost (PKR)', get: (i) => stockOf(i, data).avgCost }, { label: 'Value (PKR)', get: (i) => stockOf(i, data).value }] },
    stockmoves: { rows: data.stockmoves, cols: [{ label: 'Date', get: (m) => fmtD(m.date) }, { label: 'Item', get: (m) => data.items.find((i) => i.id === m.itemId)?.name || '' }, { label: 'Type', get: (m) => m.type }, { label: 'Qty', get: (m) => m.qty }, { label: 'Unit cost (PKR)', get: (m) => m.unitCost ?? '' }, { label: 'Project', get: (m) => (m.projectId ? pName(m.projectId) : '') }, { label: 'Reference', get: (m) => m.ref }, { label: 'Notes', get: (m) => m.notes }] },
    equipment: { rows: data.equipment, cols: [{ label: 'Machine', get: (q) => q.name }, { label: 'Owned/rented', get: (q) => q.kind }, { label: 'Reg/serial', get: (q) => q.regNo }, { label: 'Owner', get: (q) => q.owner }, { label: 'Rate (PKR)', get: (q) => rs(q.rentalRate) }, { label: 'Rate unit', get: (q) => q.rateUnit }, { label: 'Current site', get: (q) => (q.currentProjectId ? pName(q.currentProjectId) : 'Yard') }, { label: 'Status', get: (q) => q.status }, { label: 'Running cost (PKR)', get: (q) => data.expenses.filter((e) => e.equipmentId === q.id).reduce((s, e) => s + rs(e.amount), 0) }] },
    partnertxns: { rows: data.partnertxns, cols: [{ label: 'Date', get: (t) => fmtD(t.date) }, { label: 'Partner', get: (t) => t.partnerName }, { label: 'Type', get: (t) => PARTNER_TX[t.type]?.label }, { label: 'Amount (PKR)', get: (t) => rs(t.amount) }, { label: 'Account', get: (t) => t.account }, { label: 'Notes', get: (t) => t.notes }] },
    documents: { rows: data.documents, cols: [{ label: 'Document', get: (d) => d.name }, { label: 'Type', get: (d) => d.category }, { label: 'Number', get: (d) => d.number }, { label: 'Issued by', get: (d) => d.issuer }, { label: 'PEC category', get: (d) => d.pecCategory }, { label: 'Issue date', get: (d) => fmtD(d.issueDate) }, { label: 'Expiry date', get: (d) => fmtD(d.expiryDate) }, { label: 'Status', get: (d) => docStatus(d.expiryDate).label }, { label: 'File location', get: (d) => d.location }] },
    cashbook: { rows: cashMovements(data), cols: [
      { label: 'Date', get: (m) => fmtD(m.date) }, { label: 'Details', get: (m) => m.desc }, { label: 'Party', get: (m) => m.party }, { label: 'Account', get: (m) => m.account }, { label: 'In (PKR)', get: (m) => (m.dir === 'in' ? m.amount : '') }, { label: 'Out (PKR)', get: (m) => (m.dir === 'out' ? m.amount : '') }, { label: 'Source', get: (m) => m.src }] },
  };
};

function SettingsCard({ settings, api }) {
  const [f, setF] = useState(() => ({
    companyName: settings.companyName || '', city: settings.city || '',
    partners: (settings.partners || []).map((p) => ({ ...p, share: String(p.share) })),
    openingCash: String(settings.openingCash ?? 0), openingBank: String(settings.openingBank ?? 0), openingDate: settings.openingDate || '',
    paymentTermsDays: String(settings.paymentTermsDays ?? 30),
    defaults: Object.fromEntries(DED_KEYS.filter((d) => d.k !== 'retention').map(({ k }) => [k, String(settings.defaults?.[k] ?? 0)])),
  }));
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const shareSum = f.partners.reduce((s, p) => s + (parsePct(p.share) || 0), 0);
  const save = async () => {
    const e = {};
    if (!f.companyName.trim()) e.companyName = 'Required';
    const oc = parseMoney(f.openingCash), ob = parseMoney(f.openingBank);
    if (Number.isNaN(oc)) e.openingCash = 'Enter a number'; if (Number.isNaN(ob)) e.openingBank = 'Enter a number';
    const terms = parseInt(f.paymentTermsDays, 10);
    if (!(terms > 0 && terms < 366)) e.paymentTermsDays = '1–365 days';
    if (f.partners.some((p) => !p.name.trim())) e.partners = 'Every partner needs a name';
    else if (Math.abs(shareSum - 100) > 0.01) e.partners = `Shares add up to ${Math.round(shareSum * 100) / 100}% — they must total 100%`;
    const defaults = {};
    for (const k of Object.keys(f.defaults)) { const v = parsePct(f.defaults[k] || 0); if (Number.isNaN(v) || v < 0 || v > 100) e['d_' + k] = '0–100'; defaults[k] = v; }
    setErr(e);
    if (Object.keys(e).length) return;
    await api.saveSettings({ companyName: f.companyName.trim(), city: f.city.trim(), partners: f.partners.map((p) => ({ id: p.id, name: p.name.trim(), share: parsePct(p.share) })), openingCash: oc, openingBank: ob, openingDate: f.openingDate, paymentTermsDays: terms, defaults }, 'Updated company settings', 'Settings saved');
  };
  return (
    <Card title="Company settings">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name" required error={err.companyName}><Input value={f.companyName} onChange={set('companyName')} /></Field>
        <Field label="City / province"><Input value={f.city} onChange={set('city')} /></Field>
        <div className="sm:col-span-2">
          <p className="font-semibold text-sm mb-1">Partners and default profit split</p>
          <div className="space-y-2">
            {f.partners.map((p, i) => (
              <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
                <Input aria-label="Partner name" value={p.name} onChange={(e) => setF((x) => ({ ...x, partners: x.partners.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)) }))} />
                <div className="relative"><Input aria-label="Share percent" inputMode="decimal" value={p.share} onChange={(e) => setF((x) => ({ ...x, partners: x.partners.map((q, j) => (j === i ? { ...q, share: e.target.value } : q)) }))} className="pr-7" /><span className="absolute right-2 top-2.5 text-mute">%</span></div>
                <Btn kind="ghost" aria-label={`Remove ${p.name}`} disabled={f.partners.length <= 1} onClick={() => setF((x) => ({ ...x, partners: x.partners.filter((_, j) => j !== i) }))}>Remove</Btn>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <Btn size="sm" onClick={() => setF((x) => ({ ...x, partners: [...x.partners, { id: uid('p'), name: '', share: '0' }] }))}>+ Add partner</Btn>
            <Btn size="sm" onClick={() => setF((x) => { const n = x.partners.length; const base = Math.floor(10000 / n) / 100; return { ...x, partners: x.partners.map((p, i) => ({ ...p, share: String(i === 0 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base) })) }; })}>Split equally</Btn>
            <span className={`text-[14px] ${Math.abs(shareSum - 100) > 0.01 ? 'text-bad' : 'text-mute'}`}>Total {Math.round(shareSum * 100) / 100}%</span>
          </div>
          {err.partners && <p className="text-sm text-bad mt-1">{err.partners}</p>}
        </div>
        <Field label="Opening cash in hand (PKR)" error={err.openingCash}><Input inputMode="numeric" value={f.openingCash} onChange={set('openingCash')} /></Field>
        <Field label="Opening bank balance (PKR)" error={err.openingBank}><Input inputMode="numeric" value={f.openingBank} onChange={set('openingBank')} /></Field>
        <Field label="Opening balances as of"><Input type="date" value={f.openingDate} onChange={set('openingDate')} /></Field>
        <Field label="Bill overdue after (days)" error={err.paymentTermsDays}><Input inputMode="numeric" value={f.paymentTermsDays} onChange={set('paymentTermsDays')} /></Field>
        <div className="sm:col-span-2">
          <p className="font-semibold text-sm">Default deduction rates for new bills</p>
          <p className="text-[13px] text-mute mb-2">Starting values for new bills. Ask your accountant for the rates that apply to your contracts. Retention comes from each project.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DED_KEYS.filter((d) => d.k !== 'retention').map(({ k, label }) => (
              <Field key={k} label={label} error={err['d_' + k]}><Input inputMode="decimal" value={f.defaults[k]} onChange={(e) => setF((x) => ({ ...x, defaults: { ...x.defaults, [k]: e.target.value } }))} /></Field>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4"><Btn kind="primary" onClick={save}>Save settings</Btn></div>
    </Card>
  );
}

function PinCard({ settings, api }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [err, setErr] = useState('');
  const on = !!settings.pinHash;
  return (
    <Card title="PIN lock">
      <p className="text-[14px] text-mute mb-3">Asks for a 4–8 digit PIN each time the app opens. This is a convenience to stop casual viewing — not strong security. Anyone you share the app with as an editor could still read the data.</p>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <Field label={on ? 'New PIN' : 'PIN'}><Input type="password" inputMode="numeric" autoComplete="off" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 8))} /></Field>
        <Field label="Repeat PIN"><Input type="password" inputMode="numeric" autoComplete="off" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 8))} /></Field>
      </div>
      {err && <p className="text-sm text-bad mt-1">{err}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn kind="primary" onClick={async () => {
          if (a.length < 4) return setErr('Use at least 4 digits');
          if (a !== b) return setErr('The two PINs do not match');
          setErr(''); await api.saveSettings({ pinHash: await sha256('cms-pin:' + a) }, on ? 'Changed PIN' : 'Turned on PIN lock', on ? 'PIN changed' : 'PIN lock on'); setA(''); setB('');
        }}>{on ? 'Change PIN' : 'Turn on PIN lock'}</Btn>
        {on && <Btn kind="danger" onClick={() => api.saveSettings({ pinHash: '' }, 'Turned off PIN lock', 'PIN lock off')}>Turn off</Btn>}
      </div>
    </Card>
  );
}

export default function DataPage({ data, settings, activity, api, mode }) {
  const [fallback, setFallback] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [progress, setProgress] = useState(null);
  const [importErr, setImportErr] = useState('');
  const fileRef = useRef(null);
  const sampleCount = COLLS.reduce((s, c) => s + data[c].filter((x) => x.sample).length, 0);
  const total = COLLS.reduce((s, c) => s + data[c].length, 0);

  const exportJSON = async () => {
    const payload = { app: 'construction-cms', version: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(COLLS.map((c) => [c, data[c]])), settings: { ...settings, lastBackup: Date.now() }, activity };
    const ok = await saveFile(`cms-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), setFallback);
    await api.saveSettings({ lastBackup: Date.now() }, 'Exported full JSON backup', ok ? 'Backup saved' : undefined);
  };
  const exportCSV = async (key) => {
    const def = CSV_DEFS(data)[key];
    await saveFile(`cms-${key}-${todayISO()}.csv`, toCSV(def.rows, def.cols), setFallback);
    api.log(`Exported ${key} CSV`);
  };

  const onFile = async (e) => {
    setImportErr('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (json.app !== 'construction-cms' || !json.data) throw new Error('This file is not a backup from this app.');
      const incoming = {};
      let n = 0;
      for (const c of COLLS) {
        const arr = Array.isArray(json.data[c]) ? json.data[c] : [];
        incoming[c] = arr.filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && /^[A-Za-z0-9_\-.~:@+]{1,150}$/.test(x.id));
        n += incoming[c].length;
      }
      setConfirm({
        title: 'Replace all data with this backup?',
        text: `The backup from ${json.exportedAt ? fmtD(json.exportedAt.slice(0, 10)) : 'an unknown date'} has ${n} records. Your current ${total} records will be deleted and replaced. Export a backup first if you are unsure.`,
        label: 'Replace data', requireText: 'REPLACE',
        run: async () => {
          const ops = [];
          for (const c of COLLS) data[c].forEach((x) => ops.push({ op: 'del', coll: c, id: x.id }));
          for (const c of COLLS) incoming[c].forEach((x) => ops.push({ op: 'set', coll: c, item: x }));
          setProgress({ done: 0, total: ops.length, label: 'Importing' });
          const ok = await api.bulk(ops, (d, t) => setProgress({ done: d, total: t, label: 'Importing' }));
          if (ok && json.settings && typeof json.settings === 'object') {
            const { pinHash, ...rest } = json.settings;
            await api.saveSettings({ ...rest, lastBackup: Date.now() });
          }
          setProgress(null);
          if (ok) { api.log(`Imported backup (${n} records)`); api.toast({ type: 'ok', text: `Imported ${n} records` }); }
        },
      });
    } catch (err) {
      setImportErr(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message || 'Could not read the file.');
    }
  };

  const deleteSample = () => setConfirm({
    title: 'Delete sample data?', text: `${sampleCount} sample records will be deleted. Records you entered yourself are kept.`, label: 'Delete sample data',
    run: async () => {
      const ops = []; COLLS.forEach((c) => data[c].filter((x) => x.sample).forEach((x) => ops.push({ op: 'del', coll: c, id: x.id })));
      setProgress({ done: 0, total: ops.length, label: 'Deleting' });
      const ok = await api.bulk(ops, (d, t) => setProgress({ done: d, total: t, label: 'Deleting' }));
      setProgress(null); if (ok) api.log(`Deleted ${ops.length} sample records`);
    },
  });
  const resetAll = () => setConfirm({
    title: 'Reset everything?', text: `All ${total} records, settings, PIN and the activity log will be permanently deleted. This cannot be undone — export a backup first.`, label: 'Reset everything', requireText: 'RESET',
    run: async () => {
      const ops = []; COLLS.forEach((c) => data[c].forEach((x) => ops.push({ op: 'del', coll: c, id: x.id })));
      setProgress({ done: 0, total: ops.length, label: 'Deleting' });
      await api.bulk(ops, (d, t) => setProgress({ done: d, total: t, label: 'Deleting' }));
      await api.resetMeta();
      setProgress(null); api.toast({ type: 'ok', text: 'All data reset' });
    },
  });

  const lb = settings.lastBackup;
  return (
    <div className="space-y-4">
      <PageHead title="Settings & data" text="Company details, backups, sample data and the change log." />
      {mode === 'memory' && <div className="border border-bad text-bad rounded-lg p-3 font-semibold">Saving is unavailable in this view — changes last only until you close the page. Check your internet connection and sign in again.</div>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <SettingsCard key={settings.companyName + (settings.partners || []).length} settings={settings} api={api} />
        <div className="space-y-4">
          <Card title="Backup & restore">
            <p className="text-[15px]">Last full backup: <b>{lb ? fmtDT(lb) : 'never'}</b></p>
            <p className="text-[13px] text-mute mt-1 mb-3">Your data is saved automatically online. A backup file is your own copy — keep one somewhere safe each week.</p>
            <div className="flex flex-wrap gap-2">
              <Btn kind="primary" onClick={exportJSON}>Export all data (JSON)</Btn>
              <Btn onClick={() => fileRef.current?.click()}>Import data…</Btn>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
            </div>
            {importErr && <p className="text-sm text-bad mt-2">{importErr}</p>}
            <p className="font-semibold text-sm mt-4 mb-2">Spreadsheet (CSV) exports</p>
            <div className="flex flex-wrap gap-2">
              {[['projects', 'Projects'], ['bills', 'Bills'], ['expenses', 'Expenses'], ['cashbook', 'Cash book'], ['vendors', 'Vendors'], ['vendorbills', 'Vendor bills'], ['inventory', 'Inventory'], ['stockmoves', 'Stock movements'], ['equipment', 'Equipment'], ['partnertxns', 'Partner transactions'], ['documents', 'Documents']].map(([k, l]) => <Btn key={k} size="sm" onClick={() => exportCSV(k)}>{l} CSV</Btn>)}
            </div>
          </Card>
          <PinCard settings={settings} api={api} />
          <Card title="Sample data & reset">
            <p className="text-[14px] text-mute mb-3">{sampleCount ? `${sampleCount} records are sample data (marked “sample”). Delete them before entering your real figures.` : 'No sample data left.'}</p>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={!sampleCount} onClick={deleteSample}>Delete sample data</Btn>
              <Btn kind="danger" disabled={!total && !settings.pinHash} onClick={resetAll}>Reset everything…</Btn>
            </div>
          </Card>
        </div>
      </div>
      <Card title="Activity log · last 100 changes">
        <DataTable
          rows={activity.map((a, i) => ({ ...a, id: String(a.t) + '-' + i }))}
          search={['text']}
          initialSort={{ k: 't', d: 'desc' }}
          empty={<Empty title="No changes recorded yet" />}
          cols={[{ key: 't', label: 'When', nowrap: true, render: (a) => fmtDT(a.t) }, { key: 'text', label: 'Change' }]}
        />
      </Card>
      {fallback && <FallbackModal file={fallback} onClose={() => setFallback(null)} />}
      {confirm && <Confirm title={confirm.title} text={confirm.text} confirmLabel={confirm.label} requireText={confirm.requireText} onConfirm={confirm.run} onClose={() => setConfirm(null)} />}
      {progress && (
        <Modal title={`${progress.label}…`} onClose={() => {}}>
          <p className="text-[15px] mb-2">{progress.done} of {progress.total}. Keep this page open.</p>
          <div className="h-3 bg-soft rounded-sm"><div className="h-full bg-brick rounded-sm" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} /></div>
        </Modal>
      )}
    </div>
  );
}

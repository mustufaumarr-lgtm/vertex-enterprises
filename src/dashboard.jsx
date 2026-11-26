// =====================================================================
// dashboard.jsx — headline figures, alerts and charts
// =====================================================================
import React, { useMemo } from 'react';
import { fmtPKR, fmtShort, fmtD, fmtQty, rs, todayISO, days, cashMovements, balances, projectFigures, billPending, billRetention, lastNMonths, monthKey, payablesTotal, stockOf, docStatus } from './lib.js';
import { Stat, Card, BarRows, CashFlowChart, Badge, Btn } from './ui.jsx';

const fmtShortPKR = (v) => 'PKR ' + fmtShort(v);

export function buildAlerts(data, settings) {
  const t = todayISO();
  const terms = rs(settings.paymentTermsDays) || 30;
  const alerts = [];
  for (const p of data.projects) {
    if (p.pgExpiry && p.status !== 'Completed') {
      const d = days(t, p.pgExpiry);
      if (d < 0) alerts.push({ tone: 'bad', kind: 'Guarantee', text: `Performance guarantee for “${p.name}” expired on ${fmtD(p.pgExpiry)}`, go: 'projects', sort: d });
      else if (d <= 30) alerts.push({ tone: 'warn', kind: 'Guarantee', text: `Performance guarantee for “${p.name}” expires in ${d} day${d === 1 ? '' : 's'} (${fmtD(p.pgExpiry)})`, go: 'projects', sort: d });
    }
  }
  for (const b of data.bills) {
    const pend = billPending(b);
    const age = days(b.date, t);
    if (pend > 0 && age > terms) {
      const pn = data.projects.find((p) => p.id === b.projectId)?.name || '';
      alerts.push({ tone: age > 90 ? 'bad' : 'warn', kind: 'Overdue', text: `Bill ${b.billNo} (${pn}) — ${fmtPKR(pend)} unpaid for ${age} days`, go: 'billing', sort: -age });
    }
  }
  for (const d of data.documents || []) {
    const st = docStatus(d.expiryDate);
    if (st.tone === 'bad') alerts.push({ tone: 'bad', kind: 'Document', text: `${d.name} expired on ${fmtD(d.expiryDate)}`, go: 'compliance', sort: st.d });
    else if (st.tone === 'warn') alerts.push({ tone: 'warn', kind: 'Document', text: `${d.name} expires in ${st.d} day${st.d === 1 ? '' : 's'} (${fmtD(d.expiryDate)})`, go: 'compliance', sort: st.d });
  }
  for (const it of data.items || []) {
    const S = stockOf(it, data);
    if (S.low) alerts.push({ tone: 'warn', kind: 'Low stock', text: `${it.name}: ${fmtQty(S.qty)} ${it.unit} left (reorder at ${fmtQty(it.reorderLevel)})`, go: 'inventory', sort: 100 });
  }
  return alerts.sort((a, b) => (a.tone === b.tone ? a.sort - b.sort : a.tone === 'bad' ? -1 : 1));
}

export default function Dashboard({ data, settings, go }) {
  const f = useMemo(() => {
    const moves = cashMovements(data);
    const income = moves.filter((m) => m.dir === 'in' && (m.kind === 'receipt' || m.kind === 'retention')).reduce((s, m) => s + m.amount, 0);
    const expenses = data.expenses.reduce((s, e) => s + rs(e.amount), 0);
    const bal = balances(data, settings);
    const receivables = data.bills.reduce((s, b) => s + billPending(b), 0);
    const retention = data.bills.filter((b) => !b.retentionReleased).reduce((s, b) => s + billRetention(b), 0);
    const active = data.projects.filter((p) => p.status === 'Ongoing' || p.status === 'Awarded');
    const months = lastNMonths(12).map((m) => {
      const ms = moves.filter((x) => monthKey(x.date) === m.key && x.kind !== 'transfer');
      return { ...m, inn: ms.filter((x) => x.dir === 'in').reduce((s, x) => s + x.amount, 0), out: ms.filter((x) => x.dir === 'out').reduce((s, x) => s + x.amount, 0) };
    });
    const profitRows = data.projects.map((p) => { const pf = projectFigures(p, data); return { label: p.name, value: pf.cashProfit, note: `billed ${fmtPKR(pf.billedGross)}` }; }).sort((a, b) => b.value - a.value);
    const cats = {};
    data.expenses.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + rs(e.amount); });
    const catRows = Object.entries(cats).map(([label, value]) => ({ label, value, note: expenses ? Math.round((value / expenses) * 100) + '%' : '' })).sort((a, b) => b.value - a.value);
    return { income, expenses, bal, receivables, retention, active, months, profitRows, catRows };
  }, [data, settings]);
  const alerts = buildAlerts(data, settings);
  const net = f.income - f.expenses;
  const hasData = data.projects.length + data.bills.length + data.expenses.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-mute text-[15px]">{settings.companyName} · {fmtD(todayISO())}</p>
          <h1 className="text-[clamp(28px,4vw,44px)] font-bold leading-[1.05] [text-wrap:balance] mt-1">
            {hasData ? <>Net profit so far {net < 0 ? <span className="text-bad">{fmtPKR(net)}</span> : <span className="grad-text">{fmtPKR(net)}</span>}</> : <>Welcome to <span className="grad-text">{settings.companyName}</span></>}
          </h1>
          {hasData && <p className="text-mute mt-2 text-[15px]">Cash basis: money received from clients minus everything spent. {f.receivables > 0 && <>Another <b className="text-ink">{fmtPKR(f.receivables)}</b> is still owed to you.</>}</p>}
        </div>
        {!hasData && <Btn kind="accent" onClick={() => go('projects')}>+ Add your first project</Btn>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Stat accent="var(--violet)" label="Active projects" value={f.active.length} sub={`${data.projects.length} in total`} />
        <Stat accent="var(--teal)" label="Total income received" value={fmtPKR(f.income)} />
        <Stat accent="var(--coral)" label="Total expenses" value={fmtPKR(f.expenses)} />
        <Stat accent="var(--gold)" label="Cash in hand" value={fmtPKR(f.bal.cash)} tone={f.bal.cash < 0 ? 'bad' : undefined} sub={f.bal.cash < 0 ? 'Below zero — check opening balance' : undefined} />
        <Stat accent="var(--blue)" label="Bank balance" value={fmtPKR(f.bal.bank)} tone={f.bal.bank < 0 ? 'bad' : undefined} />
        <Stat accent="var(--sky)" label="Receivables" value={fmtPKR(f.receivables)} sub="Net bills not yet paid" />
        <Stat accent="var(--pink)" label="Retention held by clients" value={fmtPKR(f.retention)} />
        <Stat accent="var(--coral)" label="Payables" value={fmtPKR(payablesTotal(data))} sub="Owed to vendors & labour" />
        <Stat accent="var(--teal)" label="Stock value" value={fmtPKR((data.items || []).reduce((s, it) => s + stockOf(it, data).value, 0))} sub="Materials in store" />
        <Stat accent="var(--violet)" label="Partners' capital" value={fmtPKR((data.partnertxns || []).reduce((s, t) => s + (t.type === 'capital' ? rs(t.amount) : t.type === 'withdrawal' ? -rs(t.amount) : 0), 0))} sub="Contributed − withdrawn" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Monthly cash flow · last 12 months" className="xl:col-span-2">
          <CashFlowChart data={f.months} />
          <details className="mt-3 text-[14px]">
            <summary className="cursor-pointer text-mute min-h-[32px]">Show as table</summary>
            <table className="w-full mt-2"><thead><tr className="text-mute text-left"><th className="py-1">Month</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Net</th></tr></thead>
              <tbody>{f.months.map((m) => <tr key={m.key} className="border-t border-line"><td className="py-1">{m.key}</td><td className="text-right tabular-nums">{fmtPKR(m.inn)}</td><td className="text-right tabular-nums">{fmtPKR(m.out)}</td><td className="text-right tabular-nums">{fmtPKR(m.inn - m.out)}</td></tr>)}</tbody></table>
          </details>
        </Card>
        <Card title={`Alerts${alerts.length ? ` (${alerts.length})` : ''}`}>
          {alerts.length === 0 ? <p className="text-mute text-[15px]">Nothing needs attention. Expiring guarantees and documents, overdue bills and low stock show here.</p> : (
            <ul className="space-y-2">
              {alerts.slice(0, 8).map((a, i) => (
                <li key={i}>
                  <button type="button" onClick={() => go(a.go)} className="w-full text-left flex gap-2 items-start p-2 -m-2 rounded-md hover:bg-soft min-h-[44px]">
                    <Badge tone={a.tone}>{a.tone === 'bad' ? '● ' : '▲ '}{a.kind}</Badge>
                    <span className="text-[14px] leading-snug">{a.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Your projects" right={<Btn size="sm" onClick={() => go('projects')}>All projects</Btn>}>
        {data.projects.length === 0 ? <p className="text-mute text-[15px]">No projects yet. <button type="button" className="text-brick2 underline" onClick={() => go('projects')}>Add your first project</button> — each one gets its own billing, expenses, slips and cash.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...data.projects].sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed')).map((p) => { const pf = projectFigures(p, data); return (
              <button key={p.id} type="button" onClick={() => go('p-' + p.id)} className="text-left rounded-lg border border-line bg-soft/60 bg-soft hover:border-[#8b5cf6] p-4 transition-colors">
                <div className="flex justify-between gap-2 items-start"><span className="font-bold leading-snug">{p.name}</span><span className="text-[12px] text-mute whitespace-nowrap">{p.status}</span></div>
                <div className="text-[13px] text-mute">{p.client}</div>
                <div className="h-1.5 bg-[#0b1226] rounded-sm mt-3"><div className="h-full rounded-sm bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#8b5cf6]" style={{ width: `${Math.min(100, p.progress || 0)}%` }} /></div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[13px]">
                  <div><div className="text-mute">Received</div><div className="font-semibold tabular-nums">{fmtShortPKR(pf.received + pf.retentionReleased)}</div></div>
                  <div><div className="text-mute">Spent</div><div className="font-semibold tabular-nums">{fmtShortPKR(pf.cost)}</div></div>
                  <div><div className="text-mute">Profit</div><div className={`font-semibold tabular-nums ${pf.cashProfit < 0 ? 'text-bad' : 'text-ok'}`}>{fmtShortPKR(pf.cashProfit)}</div></div>
                </div>
                <div className="text-[13px] text-brick2 mt-3 font-semibold">Open project →</div>
              </button>
            ); })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Profit per project (cash received − cost)">
          <BarRows rows={f.profitRows} emptyText="Add projects, bills and expenses to see profit." />
        </Card>
        <Card title="Expenses by category">
          <BarRows rows={f.catRows} emptyText="No expenses recorded yet." />
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// App.jsx — app shell: sidebar navigation, hash routing, PIN lock,
// backup reminder, loading and connection states.
// Phase 1 modules: Dashboard, Projects, Billing, Expenses, Settings & data
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from './store.js';
import { SAVED_WHERE } from './platform.js';
import { sha256, fmtDT } from './lib.js';
import { Btn, Input, Toast, cx } from './ui.jsx';
import Dashboard from './dashboard.jsx';
import Projects from './projects.jsx';
import Billing from './billing.jsx';
import Expenses from './expenses.jsx';
import DataPage from './datapage.jsx';
import Vendors from './vendors.jsx';
import Inventory from './inventory.jsx';
import Equipment from './equipment.jsx';
import Partners from './partners.jsx';
import Reports from './reports.jsx';
import Compliance from './compliance.jsx';

const I = {
  dash: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
  proj: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  bill: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  exp: 'M3 7h18v12H3zM3 11h18M7 15h3',
  vend: 'M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0',
  inv: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7',
  eq: 'M3 17h4l3-8h6l2 4h3v4M7 20a2 2 0 1 0 0-.01M17 20a2 2 0 1 0 0-.01',
  part: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M12 20a6 6 0 0 1 10 0',
  rep: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  doc: 'M6 2h9l5 5v15H6zM14 2v6h6',
  tend: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12l5-5M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 1.8L6 8.3 4 8 3 11l2 1v0l-2 1 1 3 2-.3 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-1.8 1.5-1.5 2 .3 1-3z',
};
const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: I.dash },
  { id: 'projects', label: 'Projects', icon: I.proj },
  { id: 'billing', label: 'Billing', icon: I.bill },
  { id: 'expenses', label: 'Expenses & cash book', icon: I.exp },
  { id: 'vendors', label: 'Vendors & labour', icon: I.vend },
  { id: 'inventory', label: 'Inventory', icon: I.inv },
  { id: 'equipment', label: 'Equipment', icon: I.eq },
  { id: 'partners', label: 'Partners', icon: I.part },
  { id: 'reports', label: 'Reports', icon: I.rep },
  { id: 'compliance', label: 'Compliance & documents', icon: I.doc },
  { id: 'setup', label: 'Settings & data', icon: I.set },
];
const ROUTES = NAV.filter((n) => !n.phase).map((n) => n.id);
const isRoute = (h) => ROUTES.includes(h) || /^p-[A-Za-z0-9_-]{1,120}$/.test(h);
const readHash = () => { const h = (location.hash || '').replace('#', ''); return isRoute(h) ? h : 'dashboard'; };

function PinLock({ settings, onUnlock }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const tryIt = async () => {
    if ((await sha256('cms-pin:' + pin)) === settings.pinHash) onUnlock();
    else { setErr('Wrong PIN'); setPin(''); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-panel border border-line rounded-xl p-6 w-full max-w-sm text-center">
        <p className="text-mute text-[15px]">{settings.companyName}</p>
        <h1 className="text-[28px] font-bold mt-1">Enter PIN</h1>
        <Input type="password" inputMode="numeric" autoFocus className="mt-4 text-center text-xl tracking-[0.4em]" value={pin} aria-label="PIN"
          onChange={(e) => { setErr(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); }}
          onKeyDown={(e) => { if (e.key === 'Enter') tryIt(); }} />
        {err && <p className="text-bad text-sm mt-2">{err}</p>}
        <Btn kind="primary" className="w-full mt-4" onClick={tryIt}>Unlock</Btn>
        <p className="text-[13px] text-mute mt-4">The PIN is a convenience lock, not strong security.</p>
      </div>
    </div>
  );
}

// Safety net: if any page throws, show a message instead of a blank screen.
class PageBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error('Page error', err, info?.componentStack); } catch {} }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="max-w-xl mx-auto mt-10 bg-panel border border-line rounded-xl p-6 text-center">
        <h1 className="text-[24px] font-bold">This page hit a problem</h1>
        <p className="text-mute mt-2">Your data is safe — nothing was lost. Try again, or go back to the Dashboard. If it keeps happening, tell Claude what you clicked.</p>
        <p className="text-[13px] text-mute mt-3 font-mono break-words">{String(this.state.err?.message || this.state.err).slice(0, 200)}</p>
        <div className="flex justify-center gap-2 mt-5">
          <Btn onClick={() => this.setState({ err: null })}>Try again</Btn>
          <Btn kind="primary" onClick={() => { location.hash = 'dashboard'; this.setState({ err: null }); }}>Go to Dashboard</Btn>
        </div>
      </div>
    );
  }
}

function Coming({ item }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-[34px] font-bold leading-tight">{item.label}</h1>
      <p className="text-mute mt-2">This module is built in Phase {item.phase}.</p>
    </div>
  );
}

function App() {
  const store = useStore();
  const { data, settings, activity, api, loaded, mode, slow, ready } = store;
  const [route, setRoute] = useState(readHash);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [hideBackup, setHideBackup] = useState(false);

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((id) => {
    if (!isRoute(id)) return;
    if (location.hash.replace('#', '') !== id) location.hash = id; else setRoute(id);
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, []);

  if (ready.settings && settings.pinHash && !unlocked) return <PinLock settings={settings} onUnlock={() => setUnlocked(true)} />;

  const lb = settings.lastBackup;
  const backupDue = loaded && !hideBackup && (data.projects.length + data.bills.length + data.expenses.length + data.vendors.length > 0) && (!lb || Date.now() - lb > 7 * 864e5);
  const page = (() => {
    const p = { data, settings, api, go };
    switch (route) {
      case 'projects': return <Projects {...p} />;
      default: if (route.startsWith('p-')) return <Projects {...p} projectId={route.slice(2)} />; return <Dashboard {...p} />;
      case 'billing': return <Billing {...p} />;
      case 'expenses': return <Expenses {...p} />;
      case 'vendors': return <Vendors {...p} />;
      case 'inventory': return <Inventory {...p} />;
      case 'equipment': return <Equipment {...p} />;
      case 'partners': return <Partners {...p} />;
      case 'reports': return <Reports {...p} />;
      case 'compliance': return <Compliance {...p} />;
      case 'setup': return <DataPage {...p} activity={activity} mode={mode} />;
    }
  })();

  const sidebar = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-2">
      {NAV.map((n) => {
        const active = route === n.id || (n.id === 'projects' && route.startsWith('p-'));
        return (
          <button key={n.id} type="button" disabled={!!n.phase} onClick={() => go(n.id)} title={collapsed ? n.label : undefined}
            className={cx('flex items-center gap-3 h-11 px-3 rounded-md text-left text-[15px] font-semibold transition-colors',
              active ? 'grad-bg text-white shadow-[0_8px_20px_-10px_rgba(139,92,246,.9)]' : n.phase ? 'text-mute opacity-60 cursor-not-allowed' : 'text-[#c9d6ee] hover:bg-soft hover:text-ink')}>
            <span className="shrink-0"><Icon d={n.icon} /></span>
            {!collapsed && <span className="truncate flex-1">{n.label}</span>}
            {!collapsed && n.phase && <span className="text-[11px] font-semibold border border-line rounded px-1.5">Ph {n.phase}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className={cx('hidden md:flex flex-col shrink-0 border-r border-line bg-side sticky top-0 h-screen transition-[width] duration-200', collapsed ? 'w-[64px]' : 'w-[248px]')}>
        <div className={cx('flex items-center h-16 px-3 border-b border-line', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && <div className="min-w-0 flex items-center gap-2"><span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-[#2dd4bf] via-[#3b82f6] to-[#8b5cf6] grid place-items-center shadow-[0_6px_16px_-6px_rgba(139,92,246,.9)] text-white font-bold text-[15px]">{(settings.companyName || "C").trim().charAt(0).toUpperCase()}</span><div className="min-w-0"><div className="font-bold leading-tight break-words">{settings.companyName}</div><div className="text-[12px] text-mute truncate">Construction management</div></div></div>}
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="w-10 h-10 rounded-md hover:bg-soft text-mute" onClick={() => setCollapsed((c) => !c)}>{collapsed ? '»' : '«'}</button>
        </div>
        <div className="overflow-y-auto flex-1">{sidebar}</div>
        {window.__vertexUser && !collapsed && (
          <div className="border-t border-line p-3 text-[13px]">
            <div className="text-mute truncate" title={window.__vertexUser}>{window.__vertexUser}</div>
            <button type="button" className="mt-1 text-brick2 font-semibold hover:underline min-h-[32px]" onClick={() => window.__signOut && window.__signOut()}>Sign out</button>
          </div>
        )}
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setMobileOpen(false)}>
          <div className="w-[264px] bg-side h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="h-16 flex items-center px-4 border-b border-line font-bold">{settings.companyName}</div>
            {sidebar}
            {window.__vertexUser && <div className="border-t border-line p-4 text-[13px]"><div className="text-mute truncate">{window.__vertexUser}</div><button type="button" className="mt-1 text-brick2 font-semibold min-h-[40px]" onClick={() => window.__signOut && window.__signOut()}>Sign out</button></div>}
          </div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 h-14 flex items-center gap-2 px-3 bg-side/95 backdrop-blur border-b border-line">
          <button type="button" aria-label="Open menu" className="w-11 h-11 rounded-md hover:bg-soft text-xl" onClick={() => setMobileOpen(true)}>☰</button>
          <span className="font-bold truncate">{settings.companyName}</span>
        </header>

        {mode === 'memory' && <div className="bg-bad text-white px-4 py-2 text-[14px] font-semibold">Saving is unavailable here — changes will be lost when you close this page.</div>}
        {mode === 'live' && slow && !loaded && <div className="bg-warn text-white px-4 py-2 text-[14px] font-semibold">Your data can't be reached yet — still trying…</div>}
        {backupDue && (
          <div className="bg-gradient-to-r from-[#1d2a5c] to-[#2a1f5c] border-b border-[#3b3f85] px-4 py-2 text-[14px] flex flex-wrap items-center gap-2">
            <span className="font-semibold">{lb ? `Last backup ${fmtDT(lb)} — more than 7 days ago.` : 'You have never exported a backup.'}</span>
            <Btn size="sm" kind="primary" onClick={() => go('setup')}>Back up now</Btn>
            <Btn size="sm" kind="ghost" onClick={() => setHideBackup(true)}>Later</Btn>
          </div>
        )}

        <main className="flex-1 w-full max-w-[1320px] mx-auto px-[max(4vw,16px)] py-6">
          {!loaded ? (
            <div className="space-y-3" aria-busy="true">
              <p className="text-mute">Loading your data…</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-panel border border-line animate-pulse" />)}</div>
              <div className="h-64 rounded-lg bg-panel border border-line animate-pulse" />
            </div>
          ) : <PageBoundary resetKey={route}>{page}</PageBoundary>}
        </main>
        <footer className="px-[max(4vw,16px)] py-4 text-[13px] text-mute border-t border-line">
          {mode === 'live' ? `Saved automatically to ${SAVED_WHERE}.` : mode === 'memory' ? 'Not saving.' : 'Connecting…'} Figures are for management use — have your accountant review tax and compliance numbers.
        </footer>
      </div>
      <Toast toast={store.toast} onClose={() => store.setToast(null)} />
    </div>
  );
}

export default App;

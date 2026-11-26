// =====================================================================
// web/main.jsx — Entry for the Vercel build: login screen, then the app.
// =====================================================================
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import { Btn, Input, Field } from '../ui.jsx';
import { supa, configured, db, assets, downloads, resolveBlob, resetCache } from './supa.js';

function Shell({ children }) {
  return (
    <div className="min-h-screen grid place-items-center p-5">
      <div className="w-full max-w-sm bg-panel border border-line rounded-2xl p-6 panel-glow">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2dd4bf] via-[#3b82f6] to-[#8b5cf6] grid place-items-center text-white font-bold text-[20px] shadow-[0_8px_20px_-8px_rgba(139,92,246,.9)]">V</span>
          <div><div className="font-bold text-[18px] leading-tight">Vertex Enterprises</div><div className="text-[13px] text-mute">Construction management</div></div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('login'); // login | reset | sent
  const go = async () => {
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter your e-mail address');
    if (mode === 'reset') {
      setBusy(true);
      const { error } = await supa.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin });
      setBusy(false);
      if (error) return setErr(error.message);
      return setMode('sent');
    }
    if (!pw) return setErr('Enter your password');
    setBusy(true);
    const { error } = await supa.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr(/invalid/i.test(error.message) ? 'Wrong e-mail or password.' : error.message);
  };
  return (
    <Shell>
      <h1 className="text-[24px] font-bold">{mode === 'login' ? 'Sign in' : 'Reset password'}</h1>
      {mode === 'sent' ? <p className="text-mute mt-2">Check your e-mail for a link to set a new password.</p> : (
        <div className="space-y-3 mt-4" onKeyDown={(e) => { if (e.key === 'Enter') go(); }}>
          <Field label="E-mail"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          {mode === 'login' && <Field label="Password"><Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
          {err && <p className="text-sm text-bad">{err}</p>}
          <Btn kind="primary" className="w-full" disabled={busy} onClick={go}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Send reset link'}</Btn>
        </div>
      )}
      <button type="button" className="mt-4 text-[14px] text-brick2 hover:underline min-h-[40px]" onClick={() => { setErr(''); setMode(mode === 'login' ? 'reset' : 'login'); }}>{mode === 'login' ? 'Forgot password?' : 'Back to sign in'}</button>
      <p className="text-[12px] text-mute mt-3">Only partners added by the owner can sign in.</p>
    </Shell>
  );
}

function SetPassword({ onDone }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Shell>
      <h1 className="text-[24px] font-bold">Set a new password</h1>
      <div className="space-y-3 mt-4">
        <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repeat password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {err && <p className="text-sm text-bad">{err}</p>}
        <Btn kind="primary" className="w-full" disabled={busy} onClick={async () => {
          if (pw.length < 8) return setErr('Use at least 8 characters');
          if (pw !== pw2) return setErr('Passwords do not match');
          setBusy(true); const { error } = await supa.auth.updateUser({ password: pw }); setBusy(false);
          if (error) setErr(error.message); else onDone();
        }}>Save password</Btn>
      </div>
    </Shell>
  );
}

function NotMember({ email }) {
  return (
    <Shell>
      <h1 className="text-[22px] font-bold">No access yet</h1>
      <p className="text-mute mt-2">You are signed in as <b className="text-ink">{email}</b>, but this e-mail is not on the members list. Ask the owner to add it in Supabase (table <code>members</code>).</p>
      <Btn className="w-full mt-4" onClick={() => supa.auth.signOut()}>Sign out</Btn>
    </Shell>
  );
}

function Gate() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  const [member, setMember] = useState(undefined);
  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supa.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { resetCache(); setMember(undefined); }
      setSession(s || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    let on = true;
    supa.from('members').select('email').limit(1).then(({ data, error }) => { if (on) setMember(!error && data && data.length > 0); });
    return () => { on = false; };
  }, [session && session.user && session.user.id]);

  if (session === undefined) return <Shell><p className="text-mute">Loading…</p></Shell>;
  if (recovery && session) return <SetPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Login />;
  if (member === undefined) return <Shell><p className="text-mute">Checking access…</p></Shell>;
  if (!member) return <NotMember email={session.user.email} />;

  window.__vertexUser = session.user.email;
  window.__signOut = () => supa.auth.signOut();
  return <App key={session.user.id} />;
}

function NotConfigured() {
  return (
    <Shell>
      <h1 className="text-[22px] font-bold">Setup needed</h1>
      <p className="text-mute mt-2">The database keys are missing. In Vercel → Project → Settings → Environment Variables add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>, then redeploy.</p>
    </Shell>
  );
}

// The app talks to storage through this small interface (same as in the Claude build).
window.claude = { use: async (name) => (name === 'db' ? db : name === 'assets' ? assets : name === 'downloads' ? downloads : null) };
window.__resolveBlob = resolveBlob;

createRoot(document.getElementById('root')).render(configured ? <Gate /> : <NotConfigured />);

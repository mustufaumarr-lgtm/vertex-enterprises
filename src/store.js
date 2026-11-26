// =====================================================================
// store.js — persistence layer
// Uses this page's private database (claude.use("db")).
//   collections: one document per record  →  projects/<id>, bills/<id> ...
//   meta/settings  — company settings, partners, opening balances, PIN hash
//   meta/activity  — last 100 changes
// If the database is unavailable the app runs in "memory" mode and warns
// that nothing will be saved.
// To add a module in a later phase: add its collection name to COLLS.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from './lib.js';

export const COLLS = ['projects', 'bills', 'expenses', 'cashentries', 'vendors', 'vendorbills', 'items', 'stockmoves', 'equipment', 'partnertxns', 'documents'];
export const COLL_LABEL = { projects: 'Projects', bills: 'Bills', expenses: 'Expenses', cashentries: 'Cash book entries', vendors: 'Vendors & labour', vendorbills: 'Vendor bills', items: 'Inventory items', stockmoves: 'Stock movements', equipment: 'Equipment', partnertxns: 'Partner transactions', documents: 'Documents' };

const clean = (o) => JSON.parse(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (e) => {
  const c = e?.code;
  if (c === 'quota_exceeded') return 'Storage is full. Export a backup and delete old records.';
  if (c === 'resource_exhausted') return 'Too many saves at once — please wait a moment and try again.';
  if (c === 'revoked' || c === 'not_granted' || c === 'capability_disabled') return 'Saving is not available in this view.';
  if (c === 'invalid_argument') return 'This change could not be saved (invalid data or no permission).';
  return 'Could not save — check your connection and try again.';
};

// Retries transient failures with backoff; other errors bubble up.
async function withRetry(fn) {
  let wait = 600;
  for (let i = 0; i < 5; i++) {
    try { return await fn(); } catch (e) {
      const c = e?.code;
      if ((c === 'unavailable' || c === 'resource_exhausted' || !c) && i < 4) { await sleep(wait + Math.random() * 300); wait *= 2; continue; }
      throw e;
    }
  }
}

// One-write-at-a-time queue per document key.
function makeQueue() {
  const tails = {};
  return (key, fn) => {
    const prev = tails[key] || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    tails[key] = next;
    return next;
  };
}

const empty = () => Object.fromEntries(COLLS.map((c) => [c, []]));

export function useStore() {
  const [data, setData] = useState(empty);
  const [settings, setSettingsState] = useState(null);
  const [activity, setActivity] = useState([]);
  const [ready, setReady] = useState({});
  const [mode, setMode] = useState('connecting'); // connecting | live | memory
  const [slow, setSlow] = useState(false);
  const [toast, setToast] = useState(null);
  const dbRef = useRef(null);
  const settingsRef = useRef(null);
  const activityRef = useRef([]);
  const dataRef = useRef(data);
  const queue = useRef(makeQueue()).current;

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { activityRef.current = activity; }, [activity]);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    let dead = false;
    const unsubs = [];
    const slowTimer = setTimeout(() => setSlow(true), 10000);
    (async () => {
      let db = null;
      try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch { db = null; }
      if (dead) return;
      if (!db) {
        clearTimeout(slowTimer);
        setMode('memory');
        setSettingsState({ ...DEFAULT_SETTINGS });
        setReady(Object.fromEntries([...COLLS, 'settings', 'activity'].map((k) => [k, true])));
        return;
      }
      dbRef.current = db;
      setMode('live');
      const onErr = (e) => { setToast({ type: 'error', text: errText(e) }); };
      const markReady = (k, snap) => {
        if (!snap.metadata?.fromCache) clearTimeout(slowTimer), setSlow(false);
        setReady((r) => (r[k] ? r : { ...r, [k]: true }));
      };
      for (const c of COLLS) {
        unsubs.push(db.collection(c).onSnapshot((snap) => {
          setData((d) => ({ ...d, [c]: snap.docs.map((x) => ({ ...x.data(), id: x.id })) }));
          markReady(c, snap);
        }, onErr));
      }
      unsubs.push(db.doc('meta/settings').onSnapshot((snap) => {
        setSettingsState(snap.exists ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS });
        markReady('settings', snap);
      }, onErr));
      unsubs.push(db.doc('meta/activity').onSnapshot((snap) => {
        setActivity(snap.exists ? (snap.data().items || []) : []);
        markReady('activity', snap);
      }, onErr));
    })();
    return () => { dead = true; clearTimeout(slowTimer); unsubs.forEach((u) => { try { u(); } catch {} }); };
  }, []);

  const api = useMemo(() => {
    const fail = (e) => { setToast({ type: 'error', text: errText(e) }); return false; };
    const ok = (text) => { if (text) setToast({ type: 'ok', text }); return true; };

    const log = (text) => {
      const entry = { t: Date.now(), text };
      const items = [entry, ...(activityRef.current || [])].slice(0, 100);
      activityRef.current = items;
      const db = dbRef.current;
      if (!db) { setActivity(items); return Promise.resolve(); }
      return queue('meta/activity', () => withRetry(() => db.doc('meta/activity').set({ items: activityRef.current }))).catch(() => {});
    };

    const put = async (coll, item, logText, okText) => {
      const db = dbRef.current;
      const rec = clean({ ...item, updatedAt: Date.now() });
      try {
        if (db) await queue(coll + '/' + rec.id, () => withRetry(() => db.collection(coll).doc(rec.id).set(rec)));
        else setData((d) => ({ ...d, [coll]: [...d[coll].filter((x) => x.id !== rec.id), rec] }));
        if (logText) log(logText);
        return ok(okText);
      } catch (e) { return fail(e); }
    };

    const del = async (coll, id, logText) => {
      const db = dbRef.current;
      try {
        if (db) await queue(coll + '/' + id, () => withRetry(() => db.collection(coll).doc(id).delete()));
        else setData((d) => ({ ...d, [coll]: d[coll].filter((x) => x.id !== id) }));
        if (logText) log(logText);
        return ok('Deleted');
      } catch (e) { return fail(e); }
    };

    const saveSettings = async (patch, logText, okText) => {
      const merged = clean({ ...(settingsRef.current || DEFAULT_SETTINGS), ...patch });
      settingsRef.current = merged;
      const db = dbRef.current;
      try {
        if (db) await queue('meta/settings', () => withRetry(() => db.doc('meta/settings').set(settingsRef.current)));
        else setSettingsState(merged);
        if (logText) log(logText);
        return ok(okText);
      } catch (e) { return fail(e); }
    };

    // Bulk operations (import / reset / delete sample) — sequential and throttled.
    const bulk = async (ops, onProgress) => {
      const db = dbRef.current;
      let done = 0;
      if (!db) {
        setData((d) => {
          const nd = { ...d };
          for (const op of ops) {
            if (op.op === 'del') nd[op.coll] = nd[op.coll].filter((x) => x.id !== op.id);
            else nd[op.coll] = [...nd[op.coll].filter((x) => x.id !== op.item.id), op.item];
          }
          return nd;
        });
        onProgress?.(ops.length, ops.length);
        return true;
      }
      try {
        for (const op of ops) {
          const ref = db.collection(op.coll).doc(op.op === 'del' ? op.id : op.item.id);
          await withRetry(() => (op.op === 'del' ? ref.delete() : ref.set(clean(op.item))));
          done++;
          onProgress?.(done, ops.length);
          if (done % 20 === 0) await sleep(250);
        }
        return true;
      } catch (e) { return fail(e); }
    };

    const resetMeta = async () => {
      const db = dbRef.current;
      activityRef.current = [];
      settingsRef.current = { ...DEFAULT_SETTINGS };
      if (!db) { setActivity([]); setSettingsState({ ...DEFAULT_SETTINGS }); return true; }
      try {
        await queue('meta/settings', () => withRetry(() => db.doc('meta/settings').delete()));
        await queue('meta/activity', () => withRetry(() => db.doc('meta/activity').delete()));
        return true;
      } catch (e) { return fail(e); }
    };

    return { put, del, saveSettings, log, bulk, resetMeta, toast: setToast, getData: () => dataRef.current };
  }, [queue]);

  const loaded = settings !== null && COLLS.every((c) => ready[c]);
  return { data, settings: settings || DEFAULT_SETTINGS, activity, ready, loaded, mode, slow, toast, setToast, api };
}

// =====================================================================
// web/supa.js — Supabase backend for the Vercel build.
// Provides the same small API the app already uses (claude.use('db'),
// claude.use('assets'), claude.use('downloads')) so the app code is
// identical in both builds.
//
//   Table public.docs(path text primary key, coll text, data jsonb, ...)
//   Bucket "slips" (private) for receipt photos / PDFs
//   Only e-mails listed in public.members can read or write (RLS).
// =====================================================================
import { createClient } from '@supabase/supabase-js';

/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */
const URL_ = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '';
const KEY_ = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '';
export const configured = !!(URL_ && KEY_ && /^https:\/\//.test(URL_));
export const supa = configured ? createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const BUCKET = 'slips';
const PAGE = 1000;

// ---------- error mapping to the codes the app understands ----------
const mapErr = (error) => {
  const m = (error && (error.message || error.error_description)) || 'Request failed';
  const code = error && error.code;
  if (code === '42501' || /row-level security|permission denied|not authorized/i.test(m)) return { code: 'invalid_argument', message: 'No permission — is your e-mail added to the members list?' };
  if (/JWT|token/i.test(m)) return { code: 'revoked', message: 'Session expired — please sign in again.' };
  if (/Failed to fetch|NetworkError|network/i.test(m)) return { code: 'unavailable', message: 'No internet connection.' };
  if (/too large|payload/i.test(m)) return { code: 'too_large', message: m };
  return { code: 'unavailable', message: m };
};

// ---------- in-memory mirror of the docs table ----------
const cache = new Map(); // path -> data
const listeners = new Set();
let ready = false;
let loadPromise = null;
let channel = null;
const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

async function loadAll() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa.from('docs').select('path,data').order('path').range(from, from + PAGE - 1);
    if (error) throw mapErr(error);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  cache.clear();
  for (const r of rows) cache.set(r.path, r.data);
  ready = true;
  notify();
}

function startRealtime() {
  if (channel) return;
  channel = supa.channel('docs-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (payload) => {
      if (payload.eventType === 'DELETE') { if (payload.old && payload.old.path) cache.delete(payload.old.path); }
      else if (payload.new && payload.new.path) cache.set(payload.new.path, payload.new.data);
      notify();
    })
    .subscribe();
}

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = loadAll().then(startRealtime).catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}

// Re-sync when the tab comes back into view (covers missed realtime events)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ready) loadAll().catch(() => {}); });
}

const segs = (p) => p.split('/');
const collOf = (path) => segs(path).slice(0, -1).join('/');
const snapDoc = (path) => {
  const has = cache.has(path);
  const d = cache.get(path);
  return { id: segs(path).pop(), exists: has, data: () => (has ? d : undefined), metadata: { fromCache: !ready, hasPendingWrites: false } };
};

async function writeDoc(path, data) {
  const prev = cache.has(path) ? cache.get(path) : undefined;
  cache.set(path, data); notify(); // optimistic
  const { error } = await supa.from('docs').upsert({ path, coll: collOf(path), data, updated_at: new Date().toISOString() }, { onConflict: 'path' });
  if (error) { if (prev === undefined) cache.delete(path); else cache.set(path, prev); notify(); throw mapErr(error); }
}
async function deleteDoc(path) {
  const prev = cache.get(path);
  const had = cache.has(path);
  cache.delete(path); notify();
  const { error } = await supa.from('docs').delete().eq('path', path);
  if (error) { if (had) cache.set(path, prev); notify(); throw mapErr(error); }
}

function docRef(path) {
  return {
    id: segs(path).pop(), path,
    get: async () => { await ensureLoaded(); return snapDoc(path); },
    set: (data) => writeDoc(path, JSON.parse(JSON.stringify(data))),
    update: async (data) => { await ensureLoaded(); if (!cache.has(path)) throw { code: 'invalid_argument', message: 'Document does not exist' }; return writeDoc(path, { ...cache.get(path), ...JSON.parse(JSON.stringify(data)) }); },
    delete: () => deleteDoc(path),
    onSnapshot(next, error) {
      const f = () => { if (ready) next(snapDoc(path)); };
      listeners.add(f);
      ensureLoaded().then(f).catch((e) => error && error(e));
      return () => listeners.delete(f);
    },
  };
}

function collRef(coll) {
  const depth = segs(coll).length + 1;
  const docsNow = () => [...cache.keys()].filter((k) => k.startsWith(coll + '/') && segs(k).length === depth).sort().map(snapDoc);
  return {
    path: coll,
    doc: (id) => docRef(coll + '/' + (id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)))),
    onSnapshot(next, error) {
      const f = () => { if (!ready) return; const docs = docsNow(); next({ docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] }); };
      listeners.add(f);
      ensureLoaded().then(f).catch((e) => error && error(e));
      return () => listeners.delete(f);
    },
    get: async () => { await ensureLoaded(); const docs = docsNow(); return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } }; },
  };
}

export const db = { doc: docRef, collection: collRef };

// ---------- slips storage ----------
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
export const assets = {
  async upload(blob, options) {
    const type = (options && options.type) || blob.type;
    if (!EXT[type]) throw { code: 'unsupported_type', message: 'Only photos or PDF' };
    if (blob.size > 20 * 1024 * 1024) throw { code: 'too_large', message: 'Over 20 MB' };
    const id = `${new Date().toISOString().slice(0, 7)}/${(crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))}.${EXT[type]}`;
    const { error } = await supa.storage.from(BUCKET).upload(id, blob, { contentType: type, upsert: false });
    if (error) throw mapErr(error);
    return { id, url: '', sizeBytes: blob.size, contentType: type };
  },
  async list() { return { assets: [], usage: {} }; },
  async delete(id) { const { error } = await supa.storage.from(BUCKET).remove([id]); if (error) throw mapErr(error); return { deleted: true }; },
};
export async function resolveBlob(id) {
  const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(id, 60 * 60);
  if (error) return '';
  return data.signedUrl;
}

// ---------- real file downloads (allowed outside the Claude sandbox) ----------
export const downloads = {
  async save({ filename, data }) {
    const type = /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : /\.json$/i.test(filename) ? 'application/json' : /\.html?$/i.test(filename) ? 'text/html;charset=utf-8' : 'application/octet-stream';
    const blob = data instanceof Blob ? data : new Blob([/\.csv$/i.test(filename) ? '﻿' + data : data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { saved: true };
  },
};

export function resetCache() {
  cache.clear(); ready = false; loadPromise = null;
  if (channel) { try { supa.removeChannel(channel); } catch {} channel = null; }
}

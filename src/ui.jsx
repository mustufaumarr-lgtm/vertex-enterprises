// =====================================================================
// ui.jsx — shared UI building blocks (buttons, inputs, modal, table, charts)
// =====================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fmtPKR, fmtShort } from './lib.js';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Btn({ kind = 'default', size = 'md', className, ...p }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brick disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]' };
  const kinds = {
    default: 'bg-panel text-ink border border-line hover:bg-soft',
    primary: 'grad-bg text-white hover:brightness-110 shadow-[0_8px_20px_-8px_rgba(124,92,246,.8)]',
    accent: 'bg-gradient-to-r from-[#14b8a6] via-[#3b82f6] to-[#8b5cf6] text-white hover:brightness-110 shadow-[0_8px_22px_-8px_rgba(59,130,246,.9)]',
    danger: 'bg-panel text-bad border border-bad hover:bg-soft',
    ghost: 'text-ink hover:bg-soft',
  };
  return <button type="button" className={cx(base, sizes[size], kinds[kind], className)} {...p} />;
}

export function Field({ label, error, hint, children, required, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-sm font-semibold text-ink mb-1">{label}{required && <span className="text-brick">&nbsp;*</span>}</span>
      {children}
      {error ? <span className="block text-sm text-bad mt-1">{error}</span> : hint ? <span className="block text-[13px] text-mute mt-1">{hint}</span> : null}
    </label>
  );
}

const inputCls = (err) => cx('w-full h-11 rounded-md border bg-panel text-ink px-3 text-base focus:outline-none focus:ring-2 focus:ring-brick', err ? 'border-bad' : 'border-line');

export function Input({ error, className, ...p }) {
  return <input className={cx(inputCls(error), className)} {...p} />;
}
export function TextArea({ error, className, ...p }) {
  return <textarea className={cx(inputCls(error), 'h-auto min-h-[80px] py-2', className)} {...p} />;
}
export function Select({ error, options, className, ...p }) {
  return (
    <select className={cx(/\bw-/.test(className || '') ? inputCls(error).replace('w-full ', '') : inputCls(error), 'pr-8', className)} {...p}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Check({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer select-none">
      <input type="checkbox" className="w-5 h-5 accent-[var(--brick)]" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-[15px]">{label}</span>
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('bg-panel text-ink w-full rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col max-h-[92vh]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" aria-label="Close" className="w-11 h-11 -mr-2 rounded-md hover:bg-soft text-2xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, text, confirmLabel = 'Delete', danger = true, onConfirm, onClose, requireText }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = requireText && typed.trim().toUpperCase() !== requireText;
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <Btn onClick={onClose}>Cancel</Btn>
      <Btn kind={danger ? 'accent' : 'primary'} disabled={blocked || busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); onClose(); }}>{busy ? 'Working…' : confirmLabel}</Btn>
    </>}>
      <p className="text-[15px] leading-relaxed">{text}</p>
      {requireText && (
        <Field label={`Type ${requireText} to confirm`} className="mt-4">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </Field>
      )}
    </Modal>
  );
}

export function Badge({ tone = 'mute', children }) {
  const tones = {
    ok: 'text-ok border-ok', warn: 'text-warn border-warn', bad: 'text-bad border-bad', mute: 'text-mute border-line', ink: 'text-ink border-ink', brick: 'text-brick border-brick',
  };
  return <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap', tones[tone])}>{children}</span>;
}

export function Empty({ title, text, action }) {
  return (
    <div className="border border-dashed border-line rounded-lg p-8 text-center">
      <p className="font-bold text-ink">{title}</p>
      {text && <p className="text-mute mt-1 text-[15px]">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ title, right, children, className }) {
  return (
    <section className={cx('bg-panel/90 bg-panel border border-line rounded-xl panel-glow', className)}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          {title && <h3 className="font-bold text-[17px]">{title}</h3>}
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const ACCENTS = ['var(--blue)', 'var(--teal)', 'var(--coral)', 'var(--violet)', 'var(--sky)', 'var(--gold)', 'var(--pink)'];
const hashIdx = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % ACCENTS.length; };
export function Stat({ label, value, sub, tone, muted, accent }) {
  const a = accent || ACCENTS[hashIdx(label)];
  return (
    <div style={{ '--a': a }} className={cx('relative overflow-hidden bg-gradient-to-br from-[#16214180] to-[#101830] bg-panel border border-line rounded-xl p-4 panel-glow',
      'before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[linear-gradient(90deg,var(--a),transparent_85%)]',
      'after:absolute after:-right-10 after:-top-10 after:w-28 after:h-28 after:rounded-full after:bg-[var(--a)] after:opacity-[0.10] after:blur-2xl', muted && 'opacity-55')}>
      <div className="relative flex items-center gap-2 text-[13px] font-semibold text-mute"><i aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: a, boxShadow: `0 0 10px ${a}` }} />{label}</div>
      <div className={cx('relative mt-1 font-bold tabular-nums whitespace-nowrap text-[clamp(17px,1.45vw,22px)]', tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</div>
      {sub && <div className="relative text-[13px] text-mute mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------- Data table with search + sort ----------
// cols: [{ key, label, render?(row), sort?(row), align?: 'right', nowrap? }]
export function DataTable({ rows, cols, search, empty, onRow, initialSort, toolbar, footer, rowKey = 'id' }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || { k: null, d: 'asc' });
  const view = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      r = r.filter((row) => (search || []).some((f) => String((typeof f === 'function' ? f(row) : row[f]) ?? '').toLowerCase().includes(t)));
    }
    if (sort.k) {
      const col = cols.find((c) => c.key === sort.k);
      const val = col?.sort || ((x) => x[sort.k]);
      r = [...r].sort((a, b) => {
        const va = val(a), vb = val(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true });
        return sort.d === 'asc' ? c : -c;
      });
    }
    return r;
  }, [rows, q, sort, cols, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {search && <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search table" />}
        <div className="flex flex-wrap gap-2 ml-auto">{toolbar}</div>
      </div>
      {rows.length === 0 ? empty : view.length === 0 ? <Empty title="No matches" text="Try a different search." /> : (
        <div className="overflow-x-auto border border-line rounded-lg bg-panel">
          <table className="w-full text-[15px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-soft">
                {cols.map((c) => (
                  <th key={c.key} className={cx('px-3 py-2 font-semibold text-[13px] text-mute whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>
                    {c.nosort ? c.label : (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-ink min-h-[32px]" onClick={() => setSort((s) => ({ k: c.key, d: s.k === c.key && s.d === 'asc' ? 'desc' : 'asc' }))}>
                        {c.label}<span aria-hidden="true" className="text-[11px]">{sort.k === c.key ? (sort.d === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r[rowKey]} className={cx('border-b border-line last:border-0', onRow && 'cursor-pointer hover:bg-soft')} onClick={onRow ? () => onRow(r) : undefined}>
                  {cols.map((c) => (
                    <td key={c.key} className={cx('px-3 py-2 align-top', c.align === 'right' && 'text-right tabular-nums whitespace-nowrap', c.nowrap && 'whitespace-nowrap')}>
                      {c.render ? c.render(r) : r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot>{footer(view)}</tfoot>}
          </table>
        </div>
      )}
      {rows.length > 0 && <p className="text-[13px] text-mute mt-2">{view.length} of {rows.length} shown</p>}
    </div>
  );
}

// ---------- Charts ----------
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el); setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
const barPath = (x, y, w, h) => {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

// Grouped bars: money in vs money out per month.
export function CashFlowChart({ data }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 250, narrow = w < 520;
  const pl = narrow ? 8 : 52, pr = 8, pt = 10, pb = 26;
  const iw = Math.max(10, w - pl - pr), ih = H - pt - pb;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => [d.inn, d.out])));
  const g = iw / data.length;
  const bw = Math.max(3, Math.min(16, (g - 8) / 2));
  const y = (v) => pt + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const hd = hover !== null ? data[hover] : null;
  const isEmpty = data.every((d) => !d.inn && !d.out);
  return (
    <div>
      <div className="flex gap-4 text-[13px] text-mute mb-2" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm" style={{ background: 'var(--s1)' }} />Money in</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm" style={{ background: 'var(--s2)' }} />Money out</span>
      </div>
      <div ref={ref} className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label="Monthly money in and money out">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              {!narrow && !isEmpty && <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{fmtShort(t)}</text>}
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = pl + g * i + g / 2;
            return (
              <g key={d.key}>
                {hover === i && <rect x={pl + g * i} y={pt} width={g} height={ih} fill="var(--soft)" />}
                <path d={barPath(cx0 - bw - 1, y(d.inn), bw, pt + ih - y(d.inn))} fill="var(--s1)" />
                <path d={barPath(cx0 + 1, y(d.out), bw, pt + ih - y(d.out))} fill="var(--s2)" />
                {(!narrow || i % 2 === 0) && <text x={cx0} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--mute)">{d.label}</text>}
                <rect x={pl + g * i} y={pt} width={g} height={ih + pb} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {isEmpty && <div className="absolute inset-0 grid place-items-center text-mute text-[15px] pointer-events-none">No money in or out yet — add bills and expenses to see the chart.</div>}
        {hd && !isEmpty && (
          <div className="absolute pointer-events-none bg-[#020817] text-ink border border-line rounded-md px-3 py-2 text-[13px] shadow-lg" style={{ left: Math.min(Math.max(0, pl + g * hover + g / 2 - 90), w - 180), top: 0, width: 180 }}>
            <div className="font-bold">{hd.label}</div>
            <div className="flex justify-between"><span>In</span><span className="tabular-nums">{fmtPKR(hd.inn)}</span></div>
            <div className="flex justify-between"><span>Out</span><span className="tabular-nums">{fmtPKR(hd.out)}</span></div>
            <div className="flex justify-between border-t border-white/30 mt-1 pt-1"><span>Net</span><span className="tabular-nums">{fmtPKR(hd.inn - hd.out)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

// Horizontal bar rows (HTML). Handles negative values (losses) with a label.
export function BarRows({ rows, emptyText = 'Nothing to show yet.' }) {
  if (!rows.length) return <p className="text-mute text-[15px]">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${fmtPKR(r.value)}`}>
          <div className="flex justify-between gap-3 text-[14px]">
            <span className="truncate">{r.label}</span>
            <span className={cx('tabular-nums whitespace-nowrap font-semibold', r.value < 0 && 'text-bad')}>{r.value < 0 ? 'Loss ' : ''}{fmtPKR(r.value)}{r.note && r.note.length < 6 ? <span className="text-mute font-normal"> · {r.note}</span> : null}</span>
          </div>
          <div className="h-2.5 mt-1 rounded-sm bg-soft">
            <div className="h-full rounded-sm" style={{ width: `${Math.max(1, (Math.abs(r.value) / max) * 100)}%`, background: r.value < 0 ? 'var(--bad)' : 'linear-gradient(90deg,#2dd4bf,#3b82f6 60%,#8b5cf6)' }} />
          </div>
          {r.note && r.note.length >= 6 && <div className="text-[13px] text-mute mt-0.5">{r.note}</div>}
        </li>
      ))}
    </ul>
  );
}

export function Toast({ toast, onClose }) {
  useEffect(() => { if (!toast) return; const t = setTimeout(onClose, toast.type === 'error' ? 7000 : 2500); return () => clearTimeout(t); }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div role="status" className={cx('fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 max-w-[92vw] rounded-lg px-4 py-3 shadow-xl text-[15px] font-semibold flex items-center gap-3', toast.type === 'error' ? 'bg-bad text-white' : 'grad-bg text-white')}>
      <span>{toast.text}</span>
      <button type="button" className="opacity-80 hover:opacity-100 text-lg" aria-label="Dismiss" onClick={onClose}>×</button>
    </div>
  );
}

// ---------- Receipt / slip attachments (photos & PDFs) ----------
// Files are stored with the artifact's `assets` capability; records keep
// only [{ id, name, type }]. Display URL is "/_blob/" + id.
let assetsPromise = null;
const getAssets = () => {
  if (!assetsPromise) assetsPromise = (async () => { try { return window.claude && window.claude.use ? await window.claude.use('assets') : null; } catch { return null; } })();
  return assetsPromise;
};
export const blobUrl = (id) => '/_blob/' + id;
// Web build stores slips privately; window.__resolveBlob(id) returns a short-lived signed URL.
const blobCache = new Map();
export function useBlobUrl(id) {
  const direct = !window.__resolveBlob;
  const [url, setUrl] = useState(direct ? blobUrl(id) : blobCache.get(id) || '');
  useEffect(() => {
    if (direct || !id) return;
    let on = true;
    const hit = blobCache.get(id);
    if (hit) { setUrl(hit); return; }
    window.__resolveBlob(id).then((u) => { if (u) { blobCache.set(id, u); setTimeout(() => blobCache.delete(id), 50 * 60 * 1000); } if (on) setUrl(u || ''); }).catch(() => on && setUrl(''));
    return () => { on = false; };
  }, [id, direct]);
  return url;
}
function BlobImg({ id, ...p }) { const u = useBlobUrl(id); return u ? <img src={u} {...p} /> : <span className={p.className} />; }
function BlobLink({ id, children, ...p }) { const u = useBlobUrl(id); return <a href={u || undefined} target="_blank" rel="noopener" {...p}>{children}</a>; }

// Shrink big phone photos to max 1600px JPEG so storage lasts longer.
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return out && out.size < file.size ? out : file;
  } catch { return file; }
}

export function AttachmentViewer({ items, start = 0, onClose }) {
  const [i, setI] = useState(start);
  const a = items[i];
  if (!a) return null;
  const isImg = (a.type || '').startsWith('image/');
  return (
    <Modal wide title={`${a.name || 'Attachment'} (${i + 1} of ${items.length})`} onClose={onClose} footer={<>
      {items.length > 1 && <Btn onClick={() => setI((i - 1 + items.length) % items.length)}>‹ Previous</Btn>}
      {items.length > 1 && <Btn onClick={() => setI((i + 1) % items.length)}>Next ›</Btn>}
      <BlobLink id={a.id} className="inline-flex items-center h-11 px-4 rounded-md font-semibold border border-line hover:bg-soft">Open full size</BlobLink>
    </>}>
      {isImg ? <BlobImg id={a.id} alt={a.name || 'Receipt'} className="max-h-[65vh] w-full object-contain rounded-md bg-black/30 block min-h-[200px]" />
        : <div className="text-center py-10"><p className="mb-3">PDF file</p><BlobLink id={a.id} className="text-brick2 underline">Open {a.name || 'PDF'}</BlobLink></div>}
    </Modal>
  );
}

export function AttachmentThumbs({ items, size = 40 }) {
  const [view, setView] = useState(null);
  if (!items || !items.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5 align-middle" onClick={(e) => e.stopPropagation()}>
      {items.map((a, k) => (
        <button key={a.id} type="button" title={a.name || 'Receipt'} onClick={() => setView(k)} className="rounded-md overflow-hidden border border-line hover:border-[#8b5cf6] shrink-0 bg-soft grid place-items-center" style={{ width: size, height: size }}>
          {(a.type || '').startsWith('image/') ? <BlobImg id={a.id} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="text-[10px] font-bold text-mute">PDF</span>}
        </button>
      ))}
      {view !== null && <AttachmentViewer items={items} start={view} onClose={() => setView(null)} />}
    </span>
  );
}

// Upload control used inside forms. value: [{id,name,type}]
export function Attachments({ value = [], onChange, label = 'Receipt / slip photos' }) {
  const [assets, setAssets] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const camRef = useRef(null), fileRef = useRef(null);
  useEffect(() => { let on = true; getAssets().then((a) => on && setAssets(a)); return () => { on = false; }; }, []);
  const add = async (files) => {
    if (!files || !files.length || !assets) return;
    setBusy(true); setErr('');
    const added = [];
    for (const f of Array.from(files).slice(0, 6)) {
      if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(f.type)) { setErr('Only photos (JPG, PNG, WebP) or PDF files.'); continue; }
      try {
        const blob = await shrinkImage(f);
        const r = await assets.upload(blob, { type: blob.type || f.type });
        added.push({ id: r.id, name: f.name || 'receipt', type: r.contentType });
      } catch (e) {
        const c = e && e.code;
        setErr(c === 'too_large' ? 'File is larger than 20 MB.' : c === 'quota_or_state' ? 'Photo storage is full — remove old photos.' : c === 'rate_limited' ? 'Too many uploads — wait a moment.' : 'Upload failed — check your connection and try again.');
      }
    }
    if (added.length) onChange([...(value || []), ...added]);
    setBusy(false);
  };
  return (
    <div>
      <span className="block text-sm font-semibold text-ink mb-1">{label}</span>
      {assets === null ? <p className="text-[13px] text-mute">Photo upload is not available right now — check your connection and sign in again.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(value || []).map((a) => (
              <span key={a.id} className="relative">
                <AttachmentThumbs items={[a]} size={64} />
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onChange(value.filter((x) => x.id !== a.id))} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-bad text-white text-sm leading-none grid place-items-center shadow">×</button>
              </span>
            ))}
            <Btn size="sm" disabled={busy || assets === undefined} onClick={() => camRef.current?.click()}>📷 Take photo</Btn>
            <Btn size="sm" disabled={busy || assets === undefined} onClick={() => fileRef.current?.click()}>Upload file</Btn>
            {busy && <span className="text-[13px] text-mute">Uploading…</span>}
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          {err ? <p className="text-sm text-bad mt-1">{err}</p> : <p className="text-[13px] text-mute mt-1">Attach the vendor's slip, bill or payment proof so every rupee can be checked later.</p>}
        </>
      )}
    </div>
  );
}

export function PageHead({ title, text, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[clamp(26px,3.5vw,38px)] font-bold leading-[1.05] [text-wrap:balance]">{title}</h1>
        {text && <p className="text-mute mt-2 max-w-[65ch] text-[15px]">{text}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

// Build script.
//   node build.mjs          → Claude artifact build   → dist/index.html
//   node build.mjs web      → Vercel/Supabase build   → public/index.html
// The web build reads SUPABASE_URL and SUPABASE_ANON_KEY from the environment
// (set them in Vercel → Settings → Environment Variables).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const WEB = process.argv[2] === 'web';
const alias = process.env.SUPABASE_FAKE ? { '@supabase/supabase-js': process.env.SUPABASE_FAKE } : undefined;
const r = await build({
  entryPoints: [WEB ? 'src/web/main.jsx' : 'src/main-claude.jsx'],
  bundle: true, minify: true, format: 'iife', write: false, jsx: 'automatic', target: 'es2020',
  alias,
  define: {
    'process.env.NODE_ENV': '"production"',
    __WEB__: WEB ? 'true' : 'false',
    __SUPABASE_URL__: JSON.stringify(WEB ? (process.env.SUPABASE_URL || '').trim() : ''),
    __SUPABASE_ANON_KEY__: JSON.stringify(WEB ? (process.env.SUPABASE_ANON_KEY || '').trim() : ''),
  },
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
fs.mkdirSync('dist', { recursive: true });
execSync('npx tailwindcss -i src/base.css -o dist/app.css --minify', { stdio: 'inherit' });
const css = fs.readFileSync('dist/app.css', 'utf8');
const title = WEB ? 'Vertex Enterprises' : 'Construction Management';
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset=".5" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="44" font-family="Arial" font-weight="700" font-size="34" text-anchor="middle" fill="#fff">V</text></svg>')}`;
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="theme-color" content="#0b1226">${WEB ? `<link rel="icon" href="${icon}"><meta name="robots" content="noindex,nofollow">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
const out = WEB ? 'public/index.html' : 'dist/index.html';
fs.mkdirSync(WEB ? 'public' : 'dist', { recursive: true });
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + 'KB', WEB ? (process.env.SUPABASE_URL ? '(Supabase configured)' : '(no SUPABASE_URL — will show setup screen)') : '');

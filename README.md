# Vertex Enterprises — Construction Management

A private web app for running a government-contracting construction company in Pakistan.

**Modules:** Dashboard · Projects (each project has its own billing, expenses, cash, materials, vendors and machines) · Billing (deductions, retention) · Expenses & cash book (with slip / receipt photos) · Vendors & labour · Inventory · Equipment · Partners (capital, drawings, profit split) · Reports (CSV export) · Compliance & documents · Settings & data (backup, import, PIN lock, activity log).

- Currency in PKR (whole rupees), dates as DD-MMM-YYYY, Pakistan tax year (Jul–Jun) in reports.
- Data lives in **your own Supabase project**. Only e-mails on the `members` list can sign in and see anything (row-level security). Slip photos are in a **private** storage bucket and shown through short-lived signed links.

---

## 1. Supabase (database, logins, slip photos)

1. Create a project at [supabase.com](https://supabase.com) (region Singapore or Mumbai).
2. **SQL Editor → New query** → paste everything from [`supabase/setup.sql`](supabase/setup.sql).
   **First change the two e-mails at the bottom** to yours and Hisham's, then **Run**.
3. **Authentication → Users → Add user → Create new user** for each partner (same e-mails as above, tick *Auto Confirm User*, set a password).
4. **Authentication → Sign In / Providers** → turn **off** *Allow new users to sign up* (only people you add can get in).
5. **Authentication → URL Configuration** → set **Site URL** to your Vercel link (needed for "Forgot password" e-mails).
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key. Never share or commit the `service_role` key.

To add a partner later: add their e-mail to the `members` table (Table Editor) **and** create their user (step 3).

## 2. Vercel (the live website)

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this GitHub repo.
2. Framework preset: **Other** (the included `vercel.json` sets build command `npm run build` and output folder `public`).
3. **Environment Variables** — add both, for Production and Preview:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your anon public key
4. **Deploy.** After changing variables later, use **Deployments → Redeploy**.

## 3. Local development

```bash
npm install
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... npm run build   # → public/index.html
npx serve public        # open http://localhost:3000
npm run lint            # must show 0 errors
```

`npm run build:claude` builds the Claude-artifact version (uses Claude's storage instead of Supabase).

## How it is organised

| Path | What it is |
|---|---|
| `src/lib.js` | Money, dates, all calculations (bills, cash book, ledgers, stock, partners) |
| `src/store.js` | Loads and saves data; one record per document (`projects/<id>`, `expenses/<id>` …) |
| `src/web/supa.js` | Supabase adapter (database, realtime, private slip storage, downloads) |
| `src/web/main.jsx` | Login, password reset, members check, then the app |
| `src/App.jsx` | Sidebar, routing (`#projects`, `#p-<projectId>` …), safety net for errors |
| `src/projectspace.jsx` | One project's workspace with its 7 tabs |
| `src/*.jsx` | One file per module |
| `supabase/setup.sql` | Tables, security rules, storage bucket, starting settings |

## Backups

Settings & data → **Export all data (JSON)** every week and keep the file safe. Supabase free projects pause after a week with no use; just open the dashboard to wake it. Figures are for management use — have your accountant review tax and compliance numbers.

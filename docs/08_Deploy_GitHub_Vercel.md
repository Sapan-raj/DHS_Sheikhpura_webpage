# Deploy — GitHub → Vercel → Google Sheets

Your setup: **sheet stays private**, **edit in Google Sheets → click Sync → website updates**, hosted on Vercel from GitHub.

There are two independent halves. Do them in either order; the site works (from the bundled snapshot) even before Part B exists.

```
   PART A                              PART B
GitHub → Vercel                  Google Sheet → Apps Script
   the website                      the live data + admin
        └──────────── API_URL ────────────┘
```

---

# ⚠️ Before anything: the home-directory git repo

`C:\Users\sapan` is itself a git repository with the remote
`https://github.com/Sapan-raj/Sheikhpura-Health-Contact-`.

Nothing has been committed from it (0 tracked files), so nothing has leaked. But its `.gitignore` has two lines, so a single `git add -A && git push` run from your home folder would try to publish `.claude.json`, `.ssh`, `.aws`, `Downloads`, browser profiles — everything.

If you did not create it deliberately, delete it:

```bash
rm -rf "C:/Users/sapan/.git"
```

The portal has its **own** repo and is unaffected either way.

---

# PART A — GitHub → Vercel

## A1. Push the portal as its own repository

From the portal folder:

```bash
cd "C:/Users/sapan/OneDrive/Desktop/District Work/Sheikhpura_PIP_Portal"
```

```bash
git init -b main && git add -A && git commit -m "Sheikhpura District Health PIP Portal"
```

Create an **empty** repo on GitHub (no README, no .gitignore — the project has both), then:

```bash
git remote add origin https://github.com/Sapan-raj/<YOUR-NEW-REPO>.git && git push -u origin main
```

> Use a **new** repo, not `Sheikhpura-Health-Contact-`, unless that one is empty and you want to reuse it.

## A2. Import into Vercel

1. <https://vercel.com/new> → **Import Git Repository** → pick the repo
2. Framework Preset: **Other**
3. Build Command: **leave empty**
4. Output Directory: **leave empty** (the repo root *is* the site)
5. Install Command: **leave empty**
6. **Deploy**

There is no build step — it is static HTML, CSS and JS with no dependencies.

`vercel.json` is already in the repo and sets:
- `/events/<slug>` → the post detail page (pretty URLs, no redirect)
- `/pip/<fy>` → a financial year
- security headers, including a CSP that allows exactly Apps Script and Drive images
- `noindex` on `admin.html`

## A3. Check it

Open the Vercel URL. The site loads from the bundled snapshot (`assets/data/portal-data.json`). Admin sign-in is disabled until Part B — that is expected.

---

# PART B — Google Sheet → Apps Script

Your sheet: `1V2FbGpfVuX1Z7OhL0yEWQMs43t4QgvwQ4DSfmHEm0vs`
Structure already verified: **16 tabs, every header correct, 392 rows.** Nothing to fix.

## B1. Make the sheet private again

Open the sheet → **Share** → under *General access* change
**"Anyone with the link"** → **"Restricted"** → Done.

This is safe *because* of Apps Script: the script runs as you and reads the sheet on the public's behalf. The public never touches the sheet.

## B2. Install the script

1. In the sheet: **Extensions → Apps Script**
2. Delete the placeholder `myFunction`
3. Open `apps-script/Code.gs` from this project, copy **all** of it, paste it in
4. 💾 Save. Name the project `PIP Portal API`

## B3. Set your admin password

1. Find `setupCredentials()` near the bottom of the file
2. Set the username and a strong password:
   ```javascript
   var USERNAME = 'admin';
   var PASSWORD = 'your-strong-password-here';
   ```
3. Function dropdown → `setupCredentials` → **Run**
4. Authorise. On *"Google hasn't verified this app"* → **Advanced → Go to PIP Portal API (unsafe)**. It is your own script; this warning appears for every personal unpublished script.
5. **Delete the password from the code and save again.** It now exists only as a salted SHA-256 hash in Script Properties.

## B4. Deploy as a Web App

**Deploy → New deployment → ⚙ → Web app**

| Field | Value |
|---|---|
| Description | `PIP Portal API v1` |
| Execute as | **Me** |
| Who has access | **Anyone** |

**Deploy** → copy the `/exec` URL.

> "Anyone" lets anyone call the *script*, not read the *sheet*. The script decides what to return, and it returns only published content — drafts and unreleased scheduled posts are filtered out server-side.

## B5. Connect it

Edit `assets/js/config.js`, line 12:

```javascript
API_URL: 'https://script.google.com/macros/s/AKfycb...../exec',
```

```bash
git add assets/js/config.js && git commit -m "Connect live Google Sheets data source" && git push
```

Vercel redeploys automatically in ~20 seconds.

> The `/exec` URL is **not** a secret — it is a public read endpoint, and writes require the login. It is fine in a public repo. The same is true of `SHEET_ID`: useless to anyone without permission on the sheet.

## B6. Verify

1. Open `<your-vercel-url>/admin.html` → sign in
2. Dashboard → *Data source* must read **Google Sheets via Apps Script**
3. Check `<your-exec-url>?action=status` in a browser — expect `"ok": true` with live row counts

---

# Your sync workflow

```
Edit a row in Google Sheets
        ↓
Admin → ↻ Clear cache & sync now        ← the button you asked for
        ↓
Website shows the change
```

Or, without leaving the spreadsheet: the sheet gains a **PIP Portal** menu with
**Clear cache (publish changes now)** and **Check data for errors**.

Without a manual sync, changes appear on their own within the cache window — 6 h server-side, 30 min in the browser. Lower `Settings.cache_minutes` if you want that faster.

**No Vercel redeploy is needed for content changes.** Vercel only rebuilds when you push code. Sheet edits flow through the Apps Script API at runtime — that is the whole point of the architecture.

| What changed | What to do |
|---|---|
| A row in the sheet | Sync (or wait for the cache) |
| A post, via the Admin composer | Nothing — it syncs itself |
| HTML / CSS / JS | `git push` → Vercel redeploys |

---

# Keeping the offline snapshot fresh (optional)

`assets/data/portal-data.json` is the fallback used if Apps Script is ever unreachable. It ages once you start editing the live sheet. To refresh it every few months:

1. Google Sheets → **File → Download → Microsoft Excel (.xlsx)**
2. Replace `Sheikhpura_Health_PIP_Website_Database.xlsx` in the project
3. ```bash
   python export_json.py
   ```
4. ```bash
   git add assets/data/portal-data.json && git commit -m "Refresh offline snapshot" && git push
   ```

`export_json.py` withholds drafts and unreleased scheduled posts and prints which ones it held back, so the committed snapshot never carries unpublished content.

---

# Custom domain (optional)

Vercel → Project → **Settings → Domains** → add e.g. `health.sheikhpura.gov.in`, then give the CNAME record Vercel shows you to whoever runs district DNS (usually NIC). HTTPS is automatic.

---

# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Showing the last published snapshot" | `API_URL` wrong, or the deployment was deleted | check `?action=status` loads in a browser |
| Sign-in: "credentials not configured" | `setupCredentials()` never ran | run it once from the Apps Script editor |
| Sign-in fails after a code edit | new code not deployed | **Manage deployments → ✏️ → New version → Deploy** — *not* New deployment, that changes the URL |
| Changes to `Code.gs` have no effect | same as above | as above |
| Photos do not appear after upload | Drive sharing | the script sets per-file link sharing automatically; confirm the file opens in an incognito window |
| Site loads but images are blocked | CSP | `vercel.json` already allows `drive.google.com` and `googleusercontent.com`; if you move media elsewhere, add that host to `img-src` |
| Vercel build fails | a build command was set | Build/Output/Install must all be **empty** — this is a static site |
| Locked out after failed logins | 5-attempt lockout | wait 15 minutes, or run `changePassword('new')` in the Apps Script editor |

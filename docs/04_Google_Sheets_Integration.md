# Deliverable 5 — Google Sheets Integration Plan

## 1. Choosing the integration method

Four options were evaluated against the constraints that actually apply: a district office with **no developer**, **no server budget**, and an administrator whose existing tool is a spreadsheet.

| | 1. Sheets API v4 from the browser | 2. Apps Script Web App | 3. "Publish to web" CSV/JSON | 4. Custom backend (Node/PHP) |
|---|---|---|---|---|
| Sheet can stay private | ✗ must be link-readable | ✅ | ✗ becomes fully public | ✅ |
| Secrets kept out of frontend | ✗ API key ships in JS | ✅ in Script Properties | n/a — nothing is secret | ✅ |
| Supports admin login | ✗ | ✅ | ✗ | ✅ |
| Server-side validation | ✗ | ✅ | ✗ | ✅ |
| Server-side caching | ✗ | ✅ 6 h | Google's own, uncontrollable | ✅ |
| Hosting cost | free | **free** | free | ₹ recurring |
| Ongoing maintenance | patching, key rotation | **none** | none | OS, runtime, TLS, backups |
| Handles commas/newlines in cells | ✅ | ✅ | ✗ CSV breaks | ✅ |
| Quota headroom | 300 req/min/project | 20,000 URL-fetch/day; caching makes this irrelevant | high | own infra |
| Someone must be on call | yes | **no** | no | yes |

### Decision — **Option 2, Google Apps Script Web App**

The deciding factor is a single deployment setting:

> **Execute as: Me** · **Who has access: Anyone**

The script runs with the *owner's* authority while being callable by *anyone*. The public reaches the script; the script reaches the Sheet; the public never reaches the Sheet. That is what lets a private spreadsheet serve a public website with no credential anywhere in the browser.

Option 1 was rejected because it forces the Sheet public **and** puts a key in JavaScript — two independent disqualifiers. Option 3 was rejected because publishing to the web exposes every sheet including any working notes, offers no authentication, and CSV cannot survive commas or line breaks in guideline text (`Budget_Guidelines` contains both). Option 4 is technically the strongest but hands a district office a server to keep alive, which is exactly the dependency this project removes.

**Trade-offs accepted:** Apps Script is slower on a cold start (~1–3 s) — mitigated by three-tier caching and the local fallback. It also cannot answer CORS preflight — mitigated by posting `Content-Type: text/plain`, keeping every request a "simple request". Both are handled in code and documented at the call sites.

---

## 2. Excel workbook → Google Sheets

### Step 1 — Upload
1. Google Drive → **New → File upload** → `Sheikhpura_Health_PIP_Website_Database.xlsx`
2. Right-click the uploaded file → **Open with → Google Sheets**
3. **File → Save as Google Sheets** (creates a native copy — this is the live one)
4. Rename it: `Sheikhpura PIP Portal — Master Database`
5. Delete the original `.xlsx` from Drive so nobody edits the dead copy

### Step 2 — Lock down sharing
**Share → General access → Restricted.** Add district staff individually as **Editor**.
Never set "Anyone with the link". Never use **File → Share → Publish to web**.

### Step 3 — Force text formatting on the fragile columns
Google Sheets will happily turn `RCH.1` into a number and re-order `2026-05-25` by locale. Prevent it once:

| Sheet | Columns | Action |
|---|---|---|
| `Programs_FMR` | `FMR_Code` | select column → **Format → Number → Plain text** |
| `Financial_Years` | `Financial_Year` | Plain text |
| `PIP_Documents` | `Issue_Date`, `Upload_Date` | Plain text |
| `Documents` | `Upload_Date` | Plain text |
| `Notices` | `Notice_Date`, `Expiry_Date` | Plain text |
| all | ID columns | Plain text |

Then **File → Settings → Locale = India**, **Time zone = (GMT+05:30) Kolkata**.

### Step 4 — Re-apply the dropdowns
Excel data-validation ranges do not survive the import. For each column below: select it → **Data → Data validation → Add rule → Dropdown (from a range)** → point at the matching `_Lists!B:B` block.

| Sheet | Column | `_Lists` list |
|---|---|---|
| `Programs_FMR` | `Status` | Status |
| `Documents` | `Status`, `Document_Type`, `File_Type` | Status / Document_Type / File_Type |
| `PIP_Documents` | `Status`, `Document_Type`, `File_Type` | ″ |
| `Notices` | `Status`, `Priority`, `Category` | Status / Priority / Notice_Category |
| `Important_Links` | `Status`, `Category` | Status / Link_Category |
| `Navigation` | `Link_Type` | Link_Type |
| `Financial_Years`, `Program_Categories`, `Contact_Information`, `Footer`, `Home_Content` | `Status` | Status |

*Optional but recommended:* **View → Freeze → 1 row** on every sheet, and protect row 1 (**Data → Protect sheets and ranges**) so headers cannot be renamed by accident. Renaming a header silently removes that field from the website.

### Step 5 — Attach the script
1. In the Sheet: **Extensions → Apps Script**
2. Delete the placeholder `myFunction`, paste all of `apps-script/Code.gs`
3. Save (💾), name the project `PIP Portal API`

### Step 6 — Set the admin credentials
1. In `setupCredentials()`, set `USERNAME` and a strong `PASSWORD`
2. Select `setupCredentials` in the function dropdown → **Run** → authorise when prompted
   *("Google hasn't verified this app" → **Advanced → Go to PIP Portal API (unsafe)**. This is your own script; the warning appears for every unpublished personal script.)*
3. **Delete the password from the code and save again.** It now lives only as a salted SHA-256 hash in Script Properties.

### Step 7 — Deploy
**Deploy → New deployment → ⚙ → Web app**

| Field | Value |
|---|---|
| Description | `PIP Portal API v1` |
| Execute as | **Me** |
| Who has access | **Anyone** |

Copy the `/exec` URL.

> "Anyone" means anyone may call the *script*. It does not share the Sheet. The script decides what to return, and returns content that is meant to be public.

### Step 8 — Connect the website
In `assets/js/config.js`:

```javascript
API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
```

Open the site. The Admin dashboard's *Data source* row should read **Google Sheets via Apps Script**.

### Step 9 — Verify
Paste `<YOUR_EXEC_URL>?action=status` into a browser. Expect JSON with `"ok": true`, live row counts, and the Sheet's last-modified time.

---

## 3. Redeploying after code changes

**Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**

Use *Manage deployments*, **not** *New deployment* — a new deployment issues a **new URL** and the website keeps calling the old one.

---

## 4. What happens when data changes

```
Admin edits a row
   │
   ├─ within 6 h ─────────► server cache still warm → old value served
   │
   └─ clicks "Clear cache & sync now"  (or Sheet menu → PIP Portal → Clear cache)
            │
            ▼
      server cache dropped and rebuilt from the Sheet
            │
            ▼
      each visitor picks it up as their 30-minute browser window expires
            │
            ▼
      new value live
```

To make edits appear faster for everyone, lower `Settings.cache_minutes`. To cut traffic further, raise it. `0` disables browser caching entirely.

---

## 5. Storing the actual PDFs

The Sheet holds **metadata**; files live in Drive.

1. Drive → folder `Sheikhpura PIP Documents` → subfolder per financial year (`PIP 2026-27`)
2. Upload the file
3. Right-click → **Share → Anyone with the link → Viewer**
4. **Copy link** → paste into `File_URL`

A normal Drive share link works directly. For a link that downloads rather than opens a preview:

```
https://drive.google.com/uc?export=download&id=FILE_ID
```

**Naming discipline** — the reference site's document paths carry a permanent typo (`prgogramme`), inconsistent casing (`NDCP Guidline.pdf`, `HSS guideline.pdf`), and unencoded spaces and `&`. Adopt a convention and hold it:

```
{FY}_{CATEGORY}_{TYPE}.pdf      →  2026-27_RCH_Allocation.pdf
                                    2026-27_NDCP_Guidelines.pdf
                                    2026-27_District_RoP.pdf
```

Underscores, no spaces, no `&`, no stray capitals.

---

## 6. Quotas

| Limit | Consumer-account cap | This portal's usage |
|---|---|---|
| Script runtime | 6 min/execution | < 3 s |
| URL Fetch calls/day | 20,000 | 0 (Apps Script reads the Sheet directly) |
| Simultaneous executions | 30 | caching means most visitors trigger none |
| `CacheService` value size | 100 KB | dataset ~150 KB → gracefully falls back to uncached with `meta.cacheable = false` |
| Properties storage | 500 KB | ~200 bytes |

**Known headroom item:** the sample dataset already exceeds the 100 KB cache-value limit, so tier-2 caching is skipped and every request reads the Sheet. That is correct and safe at district traffic levels, and the code reports it rather than failing. If the dataset grows or traffic rises, split the payload across cache keys or gzip it before `cache.put()` — a ~15-line change in `getData()`.

---

## 7. Backup

Sheets keeps unlimited version history (**File → Version history**), so accidental edits are recoverable.

Recommended in addition:
- **Monthly:** File → Download → `.xlsx`, keep in a dated folder
- **Before opening a new financial year:** File → Make a copy → `…Backup FY2026-27`
- **Anytime:** run `python export_json.py` against a downloaded copy to regenerate `portal-data.json`, giving the site a fresh offline fallback that also serves as a machine-readable backup

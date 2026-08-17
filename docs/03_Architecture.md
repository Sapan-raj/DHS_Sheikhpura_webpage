# Deliverable 4 — Website Architecture

## The chain

```
┌────────────────┐   editor    ┌──────────────────┐   HTTPS/JSON   ┌───────────────┐        ┌────────┐
│  Google Sheet  │ ──────────► │  Apps Script     │ ─────────────► │  Static site  │ ─────► │  User  │
│  (13 sheets)   │             │  Web App         │                │  HTML/CSS/JS  │        │        │
│  PRIVATE       │ ◄────────── │  runs as owner   │ ◄───────────── │  no server    │        │        │
└────────────────┘  read only  └──────────────────┘  POST + token  └───────────────┘        └────────┘
        ▲                              ▲                                   ▲
        │                              │                                   │
   District admin              CacheService 6 h                    sessionStorage 30 min
   edits rows                  ScriptProperties (secrets)          + local JSON fallback
```

**One sentence:** the Sheet is the only place content exists; Apps Script is the only thing that can read the Sheet; the website is a static shell that renders whatever JSON it is handed.

---

## Layers

### 1 — Data (Google Sheets)
13 sheets, 356 sample rows. Sharing stays **Restricted**: only the district account and named editors. The Sheet is never "Published to web" and never made link-viewable.

### 2 — API (Apps Script Web App)
Bound to the Sheet, deployed **Execute as: Me / Access: Anyone**. That combination is the key: visitors reach the *script*, never the *spreadsheet*, and the script only ever exposes what it chooses to.

| Method | Endpoint | Auth | Returns |
|---|---|---|---|
| GET | `?action=data` | none | full validated dataset |
| GET | `?action=status` | none | counts, sheet name, last-modified, cache state |
| GET | `?action=validate` | none | validation report only |
| POST | `{action:'login'}` | credentials | HMAC session token |
| POST | `{action:'session'}` | token | validity check |
| POST | `{action:'refresh'}` | token | clears cache, rebuilds |
| POST | `{action:'logout'}` | token | revokes token |

The API **validates before it serves**: missing required fields, duplicate IDs, broken foreign keys and duplicate FMR codes are dropped and reported, so a bad row can never reach the browser.

### 3 — Frontend (static HTML/CSS/JS)
7 pages, no framework, no build step, no dependencies. Hosts on GitHub Pages, NIC static hosting, Netlify, or any folder behind a web server.

| File | Role |
|---|---|
| `assets/js/config.js` | the only file edited to connect a data source |
| `assets/js/data.js` | fetch, cache, validate, query — no DOM |
| `assets/js/ui.js` | shell, theme, language, shared components — no content |
| `assets/css/site.css` | one stylesheet, CSS-variable tokens |
| `index / pip / program / documents / notices / contact / admin` | page-specific rendering only |

### 4 — Admin
`admin.html` holds no credential, key or Sheet ID. See `05_Admin_Architecture.md`.

---

## Three-tier caching

| Tier | Where | Lifetime | Purpose |
|---|---|---|---|
| 1 | `sessionStorage` in the browser | `Settings.cache_minutes` (default 30) | zero network calls while browsing between pages |
| 2 | `CacheService` in Apps Script | 6 h | one Sheet read serves every visitor |
| 3 | `assets/data/portal-data.json` | until regenerated | fallback when the API is slow or down |

A visitor browsing five pages triggers **one** network request. The Sheet itself is read at most once every six hours regardless of traffic, which keeps the portal comfortably inside Apps Script quotas.

**Publishing a change:** the admin clicks *Clear cache & sync now* (or uses the **PIP Portal** menu inside the Sheet). Tier 2 is dropped and rebuilt; visitors pick it up as their tier-1 window expires.

---

## Graceful degradation

```
API_URL set?  ──no──►  local JSON snapshot
      │yes
      ▼
fetch API ──ok──►  render
      │fail / >12 s timeout
      ▼
local JSON snapshot + visible "showing last published snapshot" banner
      │fail
      ▼
retry-able error state
```

The site never renders a blank page or a JavaScript stack trace. Individual bad rows disappear rather than breaking their page — the site degrades to *showing less*, never to *showing broken*.

---

## Routing

Readable query strings, no encoded database keys:

| URL | Page |
|---|---|
| `/index.html` | Home |
| `/pip.html` | current financial year |
| `/pip.html?fy=2025-26` | a specific year |
| `/pip.html?fy=2026-27#CAT03` | jump to a flexi pool |
| `/program.html?fy=2026-27&fmr=RCH.1` | one FMR budget head |
| `/documents.html?q=RoP` | pre-filtered repository |
| `/notices.html`, `/contact.html`, `/admin.html` | — |

Contrast with the reference site's `project-implementation-plan.php?id=MTU=` — base64 for the database row `15`.

---

## Performance

| | SHS Bihar reference | Sheikhpura portal |
|---|---|---|
| CSS | ~913 KB across 9 files | **~17 KB**, 1 file |
| JS libraries | jQuery + UI + Migrate + Bootstrap 3 **and** 4 + Flot + 5 more | **none** |
| Page weight (uncached) | ~5 MB | **~180 KB** including the whole dataset |
| Requests to browse 5 pages | 5 full page loads, all assets each time | 1 data fetch, then cached |
| Render blocking | 9 stylesheets + 14 scripts | 1 stylesheet |

Other measures: pagination (25/page, configurable), `overflow-x` confined to table wrappers, inline SVG emblem (no image request), skeleton placeholders during load, `prefers-reduced-motion` respected.

---

## Security posture

| Concern | Handling |
|---|---|
| Sheet exposure | never shared publicly; only Apps Script reads it |
| Credentials in frontend | none — no API key, no service account, no Sheet ID |
| Admin auth | server-side hash check, HMAC-signed 8-hour token |
| Brute force | 5 attempts per username → 15-minute lockout, plus a 600 ms delay on failure |
| XSS | every value HTML-escaped on render — verified by injecting `<img onerror>` through the data layer and confirming zero elements created |
| URL injection | `javascript:` and `data:` URLs rejected by `validUrl()` |
| External links | `rel="noopener noreferrer"` + a visible new-window marker |
| Admin discovery | `noindex, nofollow` on `admin.html` |
| Transport | HTTPS end to end (Apps Script is HTTPS-only) |

---

## Accessibility

Built to the gaps found in the reference site (§7 of the analysis report):

- pinch-zoom **enabled** (no `maximum-scale`)
- semantic `<header> <nav> <main> <footer>`, one `<h1>` per page, ordered headings
- skip-to-content link
- visible `:focus-visible` ring on every control
- `aria-current="page"`, `aria-expanded` on the mobile menu, `aria-pressed` on toggles
- all 67 interactive controls ≥ 24×24 px (WCAG 2.5.8) — measured, not assumed
- discrete, reversible font-size steps persisted in `localStorage`
- token-based dark theme (not a blanket inline colour override)
- `lang` attribute switches to `hi` with the language toggle
- tables collapse to labelled cards on mobile instead of scrolling sideways
- no blinking or auto-animating content; `prefers-reduced-motion` honoured
- print stylesheet that expands link URLs

---

## Why not the alternatives

| Option | Why not |
|---|---|
| **PHP + MySQL** like the original | needs a server, a DBA and a developer for every content change — the exact problem being solved |
| **Sheets API v4 from the browser** | requires an API key in frontend JS **and** a publicly-readable Sheet. Both disqualifying. |
| **"Publish to web" CSV** | makes the whole Sheet public, gives no auth, no validation, no write path, and breaks on commas |
| **Node/Express backend** | correct engineering, wrong context — hosting, uptime and patching for a district office with no developer |
| **Headless CMS (Strapi, Sanity)** | licence cost, a second login to teach, and a UI unfamiliar to district staff |
| **Apps Script Web App** ✅ | free, Google-hosted, no server to maintain, secrets stay server-side, Sheet stays private, and the admin edits content in a spreadsheet they already know |

Detailed justification: `04_Google_Sheets_Integration.md` §1.

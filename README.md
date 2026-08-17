# Sheikhpura District Health PIP Portal

A data-driven Project Implementation Plan portal for the **District Health Society, Sheikhpura, Bihar**, modelled on the information architecture of the [SHS Bihar PIP portal](https://shs.bihar.gov.in/project-implementation-plan) but rebuilt so that **all content lives in Google Sheets** and a non-developer maintains the site by editing rows.

> **One Google Sheet → One Source of Truth → Dynamic Website**

---

## Run it now

```bash
python -m http.server 8791
```

Open <http://localhost:8791>. It works immediately from the bundled data snapshot — no Google account required.

> Double-clicking `index.html` will not work: browsers block `fetch()` on `file://`.

---

## Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | Website Analysis Report | [`docs/01_Website_Analysis_Report.md`](docs/01_Website_Analysis_Report.md) |
| 2 | Data Dictionary | [`docs/02_Data_Dictionary.md`](docs/02_Data_Dictionary.md) |
| 3 | Excel Database | [`Sheikhpura_Health_PIP_Website_Database.xlsx`](Sheikhpura_Health_PIP_Website_Database.xlsx) |
| 4 | Website Architecture | [`docs/03_Architecture.md`](docs/03_Architecture.md) |
| 5 | Google Sheets Integration Plan | [`docs/04_Google_Sheets_Integration.md`](docs/04_Google_Sheets_Integration.md) |
| 6 | Admin Architecture & Security | [`docs/05_Admin_Architecture.md`](docs/05_Admin_Architecture.md) |
| 7 | Website Implementation | this folder |
| 8 | Setup & Operations Guide | [`docs/06_Setup_Guide.md`](docs/06_Setup_Guide.md) |
| 9 | Media Storage Architecture (Events module) | [`docs/07_Media_Architecture.md`](docs/07_Media_Architecture.md) |

---

## Layout

```
Sheikhpura_PIP_Portal/
├── index.html              Home
├── pip.html                PIP — year selector, documents, FMR tables
├── program.html            One FMR budget head
├── documents.html          Searchable repository, filtered + paginated
├── notices.html            Notices and announcements
├── events.html             Events & What's New listing
├── event.html              Post detail page with photo gallery + lightbox
├── contact.html            District office contacts
├── admin.html              Admin login, dashboard, post composer, Manage Posts
│
├── assets/
│   ├── css/site.css        One stylesheet (~22 KB), CSS-variable tokens
│   ├── js/config.js        ← the ONLY file edited to connect Google Sheets
│   ├── js/data.js          Fetch, cache, validate, query
│   ├── js/ui.js            Shell, theme, language, shared components
│   ├── js/composer.js      Post composer + browser-side image compression
│   ├── data/portal-data.json   Generated fallback snapshot (never hand-edited)
│   └── img/                Inline SVG emblem + favicon
│
├── apps-script/Code.gs     Google Apps Script Web App — API + admin auth
├── build_database.py       Generates the .xlsx + runs integrity checks
├── export_json.py          .xlsx → portal-data.json (the API's data contract)
├── docs/                   All eight deliverables
└── Sheikhpura_Health_PIP_Website_Database.xlsx
```

---

## Data model

16 sheets, 392 sample records.

```
Financial_Years ──┬─→ Programs_FMR (Year_ID + Category_ID) ──→ Documents
                  ├─→ PIP_Documents
                  └─→ Documents
Program_Categories ─┴─→ Programs_FMR / Documents

Post_Categories ──→ Posts ──→ Post_Media          What's New / Events

Settings · Navigation · Home_Content · Important_Links · Notices · Contact_Information · Footer
```

**The decisive design rule:** `Programs_FMR` is keyed by **(Year_ID, Category_ID)**, never by category alone. FMR codes are re-issued annually by MoHFW — the live SHS Bihar site has **49** budget heads in FY 2025-26 and **59** in FY 2026-27, with `NDCP.8` removed and `NDCP.7`, `NDCP.9`, `NCD.9`, `NCD.12` and `HSS.15`–`HSS.21` added. The sample data reproduces this drift exactly.

**The same principle in the Events module:** `Status` records only *intent* (Draft / Published / Scheduled / Archived). Whether a post is **live**, and whether an event is **Upcoming / Ongoing / Past**, are computed from the dates at render time — so nobody has to remember to change a status when a date passes, and a scheduled post appears on its own.

---

## What's New / Events

A post is created entirely from the Admin Panel — never by editing the sheet.

```
Login → Posts & Events → ＋ Create New Post → add photos from this device
      → News / Event / Update → date + venue → Preview → Publish or Schedule
      → appears under What's New on the home page
```

**Local image upload with no storage credential in the browser.** Photos are downscaled to ≤1600px and re-encoded *in the browser*, then posted to the authenticated Apps Script endpoint, which writes them to Drive as the sheet owner. Measured: a 4000×3000 JPEG becomes 162 KB (84% smaller); an opaque 1904 KB PNG becomes a 219 KB JPEG (88%); a PNG that genuinely uses transparency stays PNG. That is what makes both Drive storage and phone uploading over a district connection practical.

Rationale and the full comparison against Cloudinary / Firebase / Supabase: [`docs/07_Media_Architecture.md`](docs/07_Media_Architecture.md).

---

## Architecture

```
Google Sheet (private)  →  Apps Script Web App (runs as owner)  →  Static site  →  User
                              CacheService 6 h                      sessionStorage 30 min
                              ScriptProperties (secrets)            + JSON fallback
```

Deployed **Execute as: Me / Access: Anyone** — the public reaches the *script*, never the *spreadsheet*. No API key, service account or Sheet ID appears anywhere in the browser.

---

## Verified behaviour

Tested in-browser against the running site, not asserted:

| | Result |
|---|---|
| Validation rules (duplicate PK, unknown FK, duplicate FMR-in-year, missing required field, orphan reference, multiple current years) | all 8 caught; the 59 good rows survive |
| XSS — `<img onerror>` injected through the data layer | 0 elements created, rendered as escaped text |
| `javascript:` URL in a document row | rejected by `validUrl()` |
| Expired notices | dropped automatically |
| Year with no data | hidden from the selector; documents-only years shown and labelled |
| Documents page — search, 3 filters, pagination, reset, empty state | correct across 47 records |
| Mobile 375 px | no horizontal scroll; tables collapse to labelled cards |
| Tap targets | all 67 controls ≥ 24×24 px |
| Theme / font size | token-based, reversible, persisted |
| Console errors | none on any page |
| **Events** — post validation (duplicate ID, duplicate slug, blank slug, unknown category, scheduled-without-date, orphan media) | all 6 caught; good posts survive |
| **Events** — draft & unreleased scheduled posts | withheld server-side; absent from the public payload |
| **Events** — scheduling | past-due scheduled post visible, future one hidden, no cron job |
| **Events** — upcoming/past derivation | correct against the real calendar, no stored flag |
| **Composer** — image compression | 4000×3000 → 162 KB · opaque PNG → JPEG (88% saved) · transparency preserved |
| **Composer** — malicious upload | `.exe` rejected on MIME; renamed `evil.jpg` rejected on magic bytes |
| **Composer** — form validation | all 5 rules fire (no title, scheduled-no-date, past schedule, bad URL, end-before-start) |
| **Composer** — preview | renders the real card with the un-uploaded photo, while `validUrl()` still rejects `data:` publicly |

---

## Compared with the reference site

| | SHS Bihar | Sheikhpura |
|---|---|---|
| Adding a financial year | copy and hand-edit a 64 KB PHP file | one row in `Financial_Years` |
| Year dropdown | **7 of 8 options dead** (JS `else`-chain bug + 4 missing pages) | every listed year reaches real content, by construction |
| FMR data | typed inline per year, duplicated across 5 files | year-scoped rows in one sheet |
| CSS | ~913 KB across 9 files, mostly from an inherited e-Vidhan legislature theme | ~17 KB, 1 file |
| JS libraries | jQuery + UI + Migrate + Bootstrap 3 **and** 4 + Flot + 5 more | none |
| Search | bound to `#myDIV`, which does not exist — dead code | works across programmes and documents |
| Dark mode | inline-sets every element black-on-black, irreversible | CSS tokens, reversible, persisted |
| Font resize | multiplies computed px, compounding and lossy | 4 discrete steps, reversible |
| Pinch zoom | disabled (`maximum-scale=1`) — WCAG 1.4.4 failure | enabled |
| URLs | `?id=MTU=` (base64 for row `15`) | `?fy=2026-27&fmr=RCH.1` |
| Bad data | breaks the page | row dropped and reported on the admin dashboard |

---

## Before go-live

The workbook ships with realistic **sample** data. Cells reading `NEEDS MANUAL INPUT` are placeholders — the site hides or disables anything still marked that way.

Officer names, phone numbers, email addresses and document URLs were **not invented**; they must come from the district office. Budget allocation figures are illustrative and must be replaced from the district RoP. Full register: `docs/02_Data_Dictionary.md` § *NEEDS MANUAL INPUT*. Checklist: `docs/06_Setup_Guide.md` Part F.

---

## Regenerating data

```bash
python build_database.py    # rebuild the .xlsx + run integrity checks (overwrites)
```

```bash
python export_json.py       # .xlsx → assets/data/portal-data.json
```

Requires `openpyxl`.

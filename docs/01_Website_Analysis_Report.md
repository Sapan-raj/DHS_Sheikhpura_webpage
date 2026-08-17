# Deliverable 1 — Website Analysis Report
## Reverse-engineering of the State Health Society Bihar PIP portal

**Sources cross-checked**
| Source | What it is | Captured |
|---|---|---|
| `C:\Users\sapan\Downloads\shs.bihar.gov.in-project-implementation-plan-1786963806638` | Offline snapshot of `/project-implementation-plan` (103 files, 5.0 MB) | Landing page only — the year selector |
| `https://shs.bihar.gov.in/project-implementation-plan` | Live landing page | Same structure, live visitor counter |
| `https://shs.bihar.gov.in/2025-2026`, `/2026-2027`, `/2024-2025`, `/2023-2024`, `/2022-2023` | Live year pages — **the real PIP data** | Full FMR tables + document links |

The downloaded snapshot contains **only the year-selector page**. It does **not** contain any PIP programme data, because that data lives on separate per-year pages that the crawler did not follow. All FMR/document analysis below comes from the live site, fetched and parsed directly.

---

## 1. Technology stack

| Layer | What is actually used |
|---|---|
| Server | PHP on Apache. `mod_rewrite` strips `.php` — `/2025-2026.php` → **301** → `/2025-2026` |
| CSS framework | Bootstrap 3.x (`navbar-default`, `pull-left`, `col-xs-*`, `.caret`) |
| JS | jQuery 1.10.1 + jquery-migrate 1.2.1 + jQuery UI, Bootstrap 3 JS **and** Bootstrap 4 bundle (both loaded) |
| Icons | Font Awesome 4 (`fa fa-envelope-o`) + Glyphicons |
| Loaded but unused | Flot charts (4 files), jCarousel, easy-ticker, nicescroll, bootbox, DataTables-Material, **material-components-web (274 KB)**, `evidhan.min.css` (**321 KB**) |

**Total CSS shipped: ~913 KB — to render one `<select>` dropdown.**

### 1.1 The template is inherited from a Legislative Assembly portal
The largest stylesheet is `evidhan.min.css`, and `/images/` contains:

`icon_starred_questions.png`, `icon_unstarred_questions.png`, `icon_verbatim_debates.png`, `icon_council_of_ministers.png`, `icon_papers_laid.png`, `icon_list_of_business.png`, `icon_committee_reports.png`, `icon_rotation_of_ministries.png`

These are **e-Vidhan (Vidhan Sabha) assets**. The health portal was built by re-skinning a legislature portal template. Roughly 60 of the 76 images are never referenced by the PIP page, and many are 1192-byte placeholder stubs. This explains the CSS bloat and the class name `logo-evidhan` on the SHS logo.

---

## 2. Routing — two competing schemes, one of them broken

### Scheme A — hand-authored static pages
`/2022-2023`, `/2023-2024`, `/2024-2025`, `/2025-2026`, `/2026-2027`

Each is a **separate physical PHP file with the entire FMR table hand-typed in inline-styled HTML**. Adding a year = copying a ~64 KB file and editing it by hand.

### Scheme B — legacy database route
`/project-implementation-plan.php?id=<base64>`

The dropdown `value` attributes are base64-encoded integer primary keys:

| value | decodes to | Financial Year |
|---|---|---|
| `MTU=` | 15 | 2025-2026 |
| `MTQ=` | 14 | 2024-2025 |
| `MTM=` | 13 | 2023-2024 |
| `MTI=` | 12 | 2022-2023 |
| `MTE=` | 11 | 2021-2022 |
| `MTA=` | 10 | 2020-2021 |
| `OQ==` | 9 | 2019-2020 |
| `OA==` | 8 | 2018-2019 |

Base64 here is **obfuscation, not security** — trivially reversible, and it exposes the database row IDs.

### 2.1 The Financial Year dropdown is broken in production

```javascript
function goTo(a) {
  var selectedText = Financial_year.options[Financial_year.selectedIndex].innerHTML;
  if (selectedText == "2022-2023") { window.location.href = '2022-2023.php'; }   // ← no "else"
  if (selectedText == "2023-2024") { window.location.href = '2023-2024.php'; }
  else { window.location.href = 'project-implementation-plan.php?id=' + a; }
}
```

The first `if` has no `else`, so it is always overwritten by the `if/else` that follows. Verified live behaviour:

| Selected year | Actual result | Status |
|---|---|---|
| 2026-2027 | not in dropdown at all (only in top nav) | **missing** |
| 2025-2026 | falls to `?id=MTU=` → reloads the selector page | **dead** |
| 2024-2025 | falls to `?id=MTQ=` → reloads the selector page | **dead** |
| 2023-2024 | `/2023-2024` → HTTP 200 | works |
| 2022-2023 | first `if` overwritten → `?id=MTI=` → reloads selector | **dead** |
| 2021-2022 | `?id=MTE=` → reloads selector (`/2021-2022` = **HTTP 404**) | **dead** |
| 2020-2021 | same → `/2020-2021` = **HTTP 404** | **dead** |
| 2019-2020 | same → `/2019-2020` = **HTTP 404** | **dead** |
| 2018-2019 | same → `/2018-2019` = **HTTP 404** | **dead** |

**7 of 8 dropdown options do not reach their data.** `?id=` is accepted and silently ignored — the server re-renders the selector regardless. The only working paths into real PIP content are the top-nav "PIP" link (hard-wired to `2026-2027.php`) and the Previous/Next Year buttons on each year page.

This single failure is the strongest argument for the data-driven rebuild: in the new portal, the year list and the year's content come from the **same** rows, so a year cannot exist in the dropdown without having content.

---

## 3. Page layout & component inventory

```
┌─ .topHeader          #123f60 · 30px · email, phone, 104, 102 | EN/हिंदी | A-/A+ | Light/Dark | 4 social
├─ #header             white · logo left (70%) · "Go to Old Website" btn right (25%)
├─ nav.navbar-default  #123f60 · right-aligned · Home | PIP | NHM Programmes (mega, 18) |
│                      Human Resource (5) | Services (4) | Tender | Training |
│                      Gallery (2) | Covid-19 (blinking) | Directory | Contact Us
├─ .breadcrumb         12px bold · Home » Project Implementation Plan ( PIP )
├─ main
│   ├─ [selector page] label + <select> + "To see pip before 2018-2019 click here"
│   └─ [year page]     [Previous Year] H2 title [Next Year]
│                      ├─ documents strip — single <tr>, 6-7 <td>, one link each
│                      └─ FMR table (see §4)
├─ footer.footer-bottom  #123f60 + foot-back.jpg · "Important links" · 3 × 12 links
│                        + Home|Site Map|Feedback|Disclaimer|Privacy|Contact
└─ navbar-fixed-bottom   Copyright © SHSB 2022 · Visitor Counter: 965,271 · IT-PMU
```

### Design tokens extracted from CSS

| Token | Value | Used for |
|---|---|---|
| Primary | `#123f60` | top bar, navbar, footer |
| Hover | `#FC7202` | nav/top-nav hover |
| Accent | `#f89829` | buttons, glow |
| Table header | `#337ab7` | FMR table `thead`, alt rows |
| Row alt | `darkblue` | zebra striping |
| Separator | `#ffd400` | 4-col divider row between categories |
| Section rule | `#bd3636` | `.sec-title` bottom border |
| Green | `#008000` / `#00A53C` | logo tagline |
| Body | `#111` | text |
| Font | `"Calibri", Arial, Helvetica, sans-serif` | body; Montserrat in places |
| Sizes | 11–13px top nav · 12px breadcrumb · 20px section h2 · 14px table | |

Spacing is Bootstrap 3 defaults with ad-hoc inline overrides (`style="margin: 10px;"`, `padding-top: 5px`). There is **no spacing scale**.

---

## 4. The PIP data structure — the critical finding

The year page FMR table is a 4-column table where columns 1 and 4 are **`rowspan`-merged per category**:

| Budget Allocation (rowspan=N) | FMR code | FMR Details | Budget Guidelines (rowspan=N) |
|---|---|---|---|
| RCH Flexible Pool → `RCH Allocation.pdf` | RCH.1 | Maternal Health | RCH Flexible Pool → `RCH.zip` |
| ″ | RCH.2 | PC –PNDT | ″ |
| … | … | … | … |

Categories are separated by a full-width yellow spacer row (`background:#ffd400`).

**This yields the entity model:**

- **Category** *(per financial year)* → name, allocation document, guidelines document
- **FMR line item** *(per category)* → code, description
- **Financial Year** → owns categories, plus a strip of year-level documents

### 4.1 FMR codes are year-variant — this is decisive

| FY | Codes | Composition |
|---|---|---|
| 2024-25 | **49** | RCH 8 · NDCP 7 · NCD 11 · HSS(U) 9 · HSS 14 |
| 2025-26 | **49** | identical to 2024-25 |
| 2026-27 | **59** | RCH 8 · NDCP 8 · NCD 13 · HSS(U) 9 · HSS 21 |

Changes in FY 2026-27: `NDCP.7` and `NDCP.9` appear, `NDCP.8` disappears; `NCD.9` and `NCD.12` appear; `HSS.15`–`HSS.21` are added.

**Consequence for the database design:** the FMR list can never be a global static lookup. Every FMR row must be keyed by `(Financial_Year_ID, Category_ID)`. This is the single most important schema requirement and it is exactly what the original site gets wrong — it solves the problem by duplicating the whole page per year.

### 4.2 Complete FY 2025-26 taxonomy (49 codes, extracted verbatim)

**RCH Flexible Pool (including RI, IPPI, NIDDCP)** — 8
`RCH.1` Maternal Health · `RCH.2` PC –PNDT · `RCH.3` Child Health · `RCH.4` Immunization · `RCH.5` Adolescent Health · `RCH.6` Family Planning · `RCH.7` Nutrition · `RCH.8` National Iodine Deficiency Disorders Control Programme (NIDDCP)

**NDCP Flexi Pool** — 7
`NDCP.1` IDSP · `NDCP.2` NVBDCP · `NDCP.3` NLEP · `NDCP.4` NTEP · `NDCP.5` NVHCP · `NDCP.6` NRCP · `NDCP.8` State specific Initiatives and Innovations

**NCD Flexi Pool** — 11
`NCD.1` NPCB+VI · `NCD.2` NMHP · `NCD.3` NPHCE · `NCD.4` NTCP · `NCD.5` NPCDCS · `NCD.6` PMNDP · `NCD.7` NPCCHH · `NCD.8` NOHP · `NCD.10` NPPCF · `NCD.11` NPPCD · `NCD.13` State specific Programme Interventions

**Health System Strengthening (HSS) – Urban** — 9
`HSS(U).1` CPHC · `HSS(U).2` Community Engagement · `HSS(U).3` Public Health Institutions as per IPHS norms · `HSS(U).4` Quality Assurance · `HSS(U).5` HRH · `HSS(U).6` Technical Assistance · `HSS(U).7` Access · `HSS(U).8` Innovation · `HSS(U).9` Untied Grants

**Health System Strengthening (HSS) – Rural** — 14
`HSS.1` CPHC · `HSS.2` Blood Services & Disorders · `HSS.3` Community Engagement · `HSS.4` Public Health Institutions as per IPHS norms · `HSS.5` Referral Transport · `HSS.6` Quality Assurance · `HSS.7` Other Initiatives to improve access · `HSS.8` Inventory management · `HSS.9` HRH · `HSS.10` Enhancing HR · `HSS.11` Technical Assistance · `HSS.12` IT interventions and systems · `HSS.13` Innovation · `HSS.14` Untied Grants

### 4.3 Year-level document strip (FY 2025-26)

| Label | File |
|---|---|
| Letter regarding budget allocation & financial guideline | `PIP2025-26/Letter No-7510 Dated-29-03-2025.pdf` |
| Bihar - PIP 2024-25 & 2025-26 | `PIP2024-25/Final Post NPCC SPIP FY 24-25&25-26.xlsx` |
| Bihar - RoP 2024-25 & 2025-26 | `PIP2024-25/Bihar- RoP FY 2024-26 Ev.pdf` |
| SUPPLEMENTARY PIP F.Y 2025-26 | `PIP2025-26/supp.SPIP 2025-26.zip` |
| SUPPLEMENTARY APPROVAL F.Y 2025-26 | `PIP2025-26/bihar.pdf` |
| REVISED BUDGET ALLOCATION F.Y 2025-26 | `PIP2025-26/Revised Allocation F.Y-2025-26.pdf` |

→ Document types observed: **Letter, PIP, RoP, Supplementary PIP, Supplementary Approval, Revised Budget Allocation, Category Allocation, Category Guidelines**. File types: **PDF, XLSX, ZIP**.

### 4.4 Document storage convention & its defects

```
SHS/project_implementation_prgogramme/PIP{YY-YY}/{filename}
SHS/project_implementation_prgogramme/PIP2026-27/Guideline/{filename}   ← new in FY26-27
```

| Defect | Evidence |
|---|---|
| Typo baked into the production path | `prgogramme` (should be `programme`) |
| Inconsistent naming | `NDCP Guidline.pdf` / `RCH Guideline FY 2026-27.pdf` / `HSS guideline.pdf` |
| Format drift | `RCH.zip` and `NCD.zip` vs `NDCP Allocation.pdf` |
| Unencoded spaces & `&` in URLs | `Final Post NPCC SPIP FY 24-25&25-26.xlsx` — the `&` truncates in some parsers |
| Cross-year references | FY 2025-26 page links to FY 2024-25 and FY 2023-24 files |
| No metadata | no size, no upload date, no version anywhere |
| Dead placeholder | non-existent `title-icon.png` referenced on every year page |

---

## 5. JavaScript behaviour

| Feature | Implementation | Assessment |
|---|---|---|
| Year navigation | `goTo()` | **broken** (§2.1) |
| Hindi toggle | duplicate `<span class="en-Lang">`/`.hn-Lang` in DOM, jQuery show/hide, `localStorage.isHide` | Doubles DOM. Most `hn-Lang` values are English copies — the toggle mostly does nothing. |
| Font A+ / A− | multiplies computed px of **every** `div`/`h4`/`h5`/`p` by 1.05 / 0.95 | Compounding and lossy — not restorable without reload |
| Dark mode | inline-sets `background-color:black; color:white` on every `div, span, li, a, p` | Destroys contrast, blacks out images, cannot be undone |
| Light mode | `location.reload()` | Not a theme — a page refresh |
| Search | `#myInput` keyup → `$("#myDIV *").toggle(text.indexOf(value) > -1)` | Bound to `#myDIV`, **which does not exist on this page** — dead code |
| Preloader | full-screen GIF, `fadeOut` on `window.load` | 73 KB GIF |
| Ticker/carousel/charts | `scrollSession()`, jCarousel, Flot | orphaned from the source template |

**There are no API calls, no `fetch`, no JSON, and no client-side data layer anywhere.** The two AJAX functions present (`ChangeLangaugeEnglish`, `ChangeLangaugeLocal`) point at `/Home/ChangeInEngCulture` — an **ASP.NET MVC** route on a PHP site, with hard-coded GUIDs. Dead code carried over from yet another parent template.

---

## 6. Responsive behaviour

Bootstrap 3 grid with `col-sm-3` mega-menu, `col-sm-12 col-md-4 col-lg-4` footer, `navbar-toggle` hamburger below 768px. But:

- `<meta viewport ... maximum-scale=1>` — **blocks pinch-zoom, a WCAG 1.4.4 failure**
- The 4-column FMR table has **no responsive treatment** — `rowspan`-merged cells force horizontal overflow on phones
- `.main-center { margin-left:-200px; padding-left:200px; }` — a negative-margin hack that is not reset at any breakpoint
- Year selector uses `col-xs-4` — stays a cramped 3-across on a 360px screen
- `navbar-fixed-bottom` permanently occupies mobile viewport height

---

## 7. Accessibility & compliance gaps

| Issue | Detail |
|---|---|
| Zoom disabled | `maximum-scale=1` |
| Contrast | Dark mode forces black-on-black in places; `#ffd400` separator row |
| `alt` attributes | logos and icons ship `alt=""` |
| Landmarks | no `<main>`, no `<h1>`, heading order jumps |
| Keyboard | `href="javascript:void(0)"` links; mega-menu is hover-driven |
| Dead links | `./pages/javascript:void(0).html` — the crawler serialised JS pseudo-URLs into real filenames |
| Language | `lang="en"` never switches to `hi` when Hindi is toggled |
| Blinking | Covid-19 nav item uses infinite CSS `blinker` animation (WCAG 2.2.2) |
| GIGW | No visible "Last Updated", no accessibility statement, no CAPTCHA-free feedback path |

---

## 8. Differences: downloaded snapshot vs live site

| # | Difference | Cause | Resolution |
|---|---|---|---|
| 1 | Snapshot has **no PIP data at all** | crawler captured only the selector page | Used live site for all data extraction |
| 2 | Snapshot dropdown tops out at **2025-2026**; live top-nav "PIP" points to **`2026-2027.php`** | New FY published after the snapshot; **dropdown was never updated** | Newer structure preferred; FY 2026-27 included |
| 3 | Visitor counter 965,271 → 965,286 | live counter | ignored |
| 4 | Snapshot links `./documents/HR POLICY.pdf`; file on disk is `HR-20POLICY.pdf` | crawler mangled `%20` | Confirms space-in-filename fragility |
| 5 | Snapshot has `./pages/*.php.html` paths | crawler rewriting | Live `.php`-less routes are authoritative |
| 6 | FY 2026-27 introduces `Guideline/` subfolder + 10 new FMR codes | genuine evolution | **Confirms year-scoped schema requirement** |
| 7 | Snapshot injects `give-freely-root` / `merlin-floating-cta` | Merlin AI browser extension on the capture machine | not part of the site |

No difference was discarded; all seven are accounted for.

---

## 9. What must be carried over vs. what must be fixed

**Carry over (this is what makes it read as an official government portal):**
utility top bar · bilingual toggle · accessibility controls · breadcrumb · deep-blue institutional palette · year-scoped PIP model · category → FMR hierarchy · allocation + guidelines document pair per category · year-level document strip · dense link-rich footer · "Designed & Developed by" credit line

**Fix:**

| Original | Sheikhpura portal |
|---|---|
| 5 hand-written 64 KB PHP files, one per year | one dataset, one renderer |
| 7 of 8 year options dead | year list generated from the rows that have data |
| FMR codes typed inline per year | year-scoped rows in Google Sheets |
| base64-obfuscated DB primary keys in URLs | readable slugs (`?fy=2026-27&fmr=RCH.1`) |
| 913 KB CSS from a legislature template | one purpose-built stylesheet |
| dead search bound to a missing element | real search across programmes + documents |
| destructive dark mode / compounding font resize | CSS-variable theming, discrete font steps, persisted |
| zoom disabled | zoom enabled |
| no document metadata | type, size, date, status per document |
| no validation | every row validated; bad rows skipped and surfaced in admin |

---

## 10. Verdict

The SHS Bihar PIP portal is a **static, hand-maintained document index wearing a legislature portal's CSS**. Its information architecture is sound and worth reproducing: *financial year → flexi-pool category → FMR line item → documents*. Its implementation is not: there is no data layer, the routing is half-migrated between two schemes, and the primary navigation control is broken for 7 of its 8 options.

The Sheikhpura portal keeps the information architecture and replaces the implementation with **Google Sheets → Apps Script API → static frontend**.

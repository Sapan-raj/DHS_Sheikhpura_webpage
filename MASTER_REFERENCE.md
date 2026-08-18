# Sheikhpura District Health PIP Portal — Master Reference

**Single source of truth for the whole system.** Everything about the website: what it is, why it was built this way, how every part works, how to run it, and what is still outstanding.

*Last updated: 18 August 2026 · 38 files · Citizen Benefits module added*

---

## Table of contents

1. [At a glance](#1-at-a-glance)
2. [Origin — what the reference site taught us](#2-origin--what-the-reference-site-taught-us)
3. [Architecture](#3-architecture)
4. [Data model — all 17 sheets](#4-data-model--all-17-sheets)
5. [Pages and routes](#5-pages-and-routes)
6. [Code reference](#6-code-reference)
7. [Apps Script API reference](#7-apps-script-api-reference)
8. [Security](#8-security)
9. [What's New / Events module](#9-whats-new--events-module)
10. [Image pipeline](#10-image-pipeline)
11. [Design system](#11-design-system)
12. [Accessibility](#12-accessibility)
13. [Deployment](#13-deployment)
14. [Operations runbook](#14-operations-runbook)
15. [Verification record](#15-verification-record)
16. [Known limits and residual risks](#16-known-limits-and-residual-risks)
17. [NEEDS MANUAL INPUT register](#17-needs-manual-input-register)
18. [File inventory](#18-file-inventory)
19. [Troubleshooting](#19-troubleshooting)
20. [Glossary](#20-glossary)
21. [What to do next](#21-what-to-do-next)

---

## 1. At a glance

| | |
|---|---|
| **What** | Public information portal for the District Health Society, Sheikhpura, Bihar |
| **Purpose** | Publish the district's Project Implementation Plan (PIP), Record of Proceedings (RoP), FMR-wise budget allocations, programme guidelines, documents, notices and events |
| **Modelled on** | [shs.bihar.gov.in/project-implementation-plan](https://shs.bihar.gov.in/project-implementation-plan) — information architecture only, not the code |
| **Core principle** | **One Google Sheet → one source of truth → dynamic website** |
| **Stack** | Static HTML/CSS/JS · Google Apps Script API · Google Sheets database · Google Drive media |
| **Frameworks** | None. No React, no jQuery, no Bootstrap, no build step, no npm |
| **Hosting** | Vercel (static), from GitHub |
| **Master sheet** | `1V2FbGpfVuX1Z7OhL0yEWQMs43t4QgvwQ4DSfmHEm0vs` |
| **Pages** | 10 |
| **Sheets** | 17 data + 1 README |
| **Sample records** | 453 |
| **Public payload** | 151.2 KB |
| **CSS** | 34 KB, one file |
| **JS** | 74 KB across 4 files |

### The one rule that shapes everything

> **Code defines structure, logic and styling. Google Sheets defines content.**

A non-technical district administrator can change every programme, document, notice, event, contact detail, menu item and homepage line without touching HTML, CSS, JavaScript or the Apps Script. No content is hard-coded anywhere — this is enforced by an automated check that greps every source file for known content strings.

---

## 2. Origin — what the reference site taught us

The SHS Bihar PIP portal was reverse-engineered before a line was written. Both the downloaded snapshot (`shs.bihar.gov.in-project-implementation-plan-1786963806638`, 103 files, 5.0 MB) and the live site were analysed and cross-checked.

Full report: [`docs/01_Website_Analysis_Report.md`](docs/01_Website_Analysis_Report.md)

### The three findings that shaped the build

**1. The reference site's year dropdown is broken in production.**

```javascript
function goTo(a) {
  var selectedText = Financial_year.options[Financial_year.selectedIndex].innerHTML;
  if (selectedText == "2022-2023") { window.location.href = '2022-2023.php'; }   // ← no "else"
  if (selectedText == "2023-2024") { window.location.href = '2023-2024.php'; }
  else { window.location.href = 'project-implementation-plan.php?id=' + a; }
}
```

The first `if` has no `else`, so it is always overwritten. Verified live: **7 of 8 dropdown options never reach their data.** Four target pages return HTTP 404; the `?id=` route accepts the parameter and silently re-renders the same selector.

→ *Our response:* the year list is generated from the rows that actually have data. A year cannot appear in the dropdown without content. The failure is structurally impossible.

**2. FMR codes change every financial year.**

| FY | Codes | Composition |
|---|---|---|
| 2024-25 | 49 | RCH 8 · NDCP 7 · NCD 11 · HSS(U) 9 · HSS 14 |
| 2025-26 | 49 | identical |
| 2026-27 | **59** | RCH 8 · NDCP 8 · NCD 13 · HSS(U) 9 · HSS 21 |

FY 2026-27 adds `NDCP.7`, `NDCP.9`, `NCD.9`, `NCD.12`, `HSS.15`–`HSS.21`; removes `NDCP.8`.

→ *Our response:* `Programs_FMR` is keyed by **(Year_ID, Category_ID)**, never by category alone. The sample data reproduces the real drift exactly: 59 / 49 / 49.

**3. The site is a legislature portal in disguise.**

`evidhan.min.css` is 321 KB, and `/images/` contains `icon_starred_questions.png`, `icon_verbatim_debates.png`, `icon_council_of_ministers.png` — e-Vidhan (Vidhan Sabha) assets. About 913 KB of CSS ships to render one `<select>` dropdown.

→ *Our response:* one purpose-built 34 KB stylesheet, zero libraries.

### Other defects catalogued

- Base64-obfuscated database primary keys in URLs (`?id=MTU=` decodes to `15`)
- Search bound to `#myDIV`, an element that does not exist — dead code
- Dark mode inline-sets every element to black-on-black; irreversible
- Font A+/A− multiplies computed pixels, compounding and lossy
- `maximum-scale=1` disables pinch-zoom — a WCAG 1.4.4 failure
- Document paths carry a permanent typo: `project_implementation_prgogramme`
- Inconsistent filenames: `NDCP Guidline.pdf`, `HSS guideline.pdf`, `RCH.zip`
- Dead AJAX pointing at ASP.NET MVC routes on a PHP site

### Side-by-side

| | SHS Bihar | Sheikhpura |
|---|---|---|
| Add a financial year | copy and hand-edit a 64 KB PHP file | one row in `Financial_Years` |
| Year dropdown | 7 of 8 options dead | every listed year reaches content, by construction |
| FMR data | typed inline, duplicated across 5 files | year-scoped rows in one sheet |
| CSS | ~913 KB, 9 files | 34 KB, 1 file |
| JS libraries | jQuery + UI + Migrate + Bootstrap 3 **and** 4 + Flot + 5 more | none |
| Search | dead code | works across programmes, documents, events |
| Dark mode | destructive inline override | CSS tokens, reversible, persisted |
| Pinch zoom | disabled | enabled |
| URLs | `?id=MTU=` | `?fy=2026-27&fmr=RCH.1` · `/events/<slug>` |
| Bad data | breaks the page | row dropped and reported on the admin dashboard |

---

## 3. Architecture

```
┌────────────────┐   editor    ┌──────────────────┐   HTTPS/JSON   ┌───────────────┐        ┌────────┐
│  Google Sheet  │ ──────────► │  Apps Script     │ ─────────────► │  Static site  │ ─────► │  User  │
│  17 sheets     │             │  Web App         │                │  on Vercel    │        │        │
│  PRIVATE       │ ◄────────── │  runs as owner   │ ◄───────────── │  no server    │        │        │
└────────────────┘  read/write └──────────────────┘  POST + token  └───────────────┘        └────────┘
        ▲                              ▲                                   ▲
   District admin              CacheService 6 h                    sessionStorage 30 min
   edits rows                  ScriptProperties (secrets)          + bundled JSON fallback
                               DriveApp (media)
```

**In one sentence:** the sheet is the only place content exists; Apps Script is the only thing that can read or write it; the website is a static shell that renders whatever JSON it is handed.

### Why this stack

Four options were evaluated against the real constraints — a district office with no developer, no server budget, and an administrator whose existing tool is a spreadsheet.

| | Sheets API v4 in browser | **Apps Script Web App** | "Publish to web" CSV | Custom backend |
|---|---|---|---|---|
| Sheet stays private | ✗ | **✅** | ✗ | ✅ |
| No credential in frontend | ✗ API key ships in JS | **✅** | n/a | ✅ |
| Admin login possible | ✗ | **✅** | ✗ | ✅ |
| Server-side validation | ✗ | **✅** | ✗ | ✅ |
| Handles commas/newlines in cells | ✅ | **✅** | ✗ | ✅ |
| Hosting cost | free | **free** | free | ₹ recurring |
| Someone must be on call | yes | **no** | no | yes |

**The deciding factor is one deployment setting:**

> **Execute as: Me** · **Who has access: Anyone**

The script runs with the *owner's* authority while being callable by *anyone*. The public reaches the script; the script reaches the sheet; the public never reaches the sheet. That is what lets a private spreadsheet serve a public website with no credential anywhere in the browser.

### Three-tier caching

| Tier | Where | Lifetime | Purpose |
|---|---|---|---|
| 1 | `sessionStorage` | `Settings.cache_minutes` (default 30) | zero network calls while browsing between pages |
| 2 | `CacheService` in Apps Script | 6 h | one sheet read serves every visitor |
| 3 | `assets/data/portal-data.json` | until regenerated | fallback when the API is slow or down |

A visitor browsing five pages triggers **one** network request.

### Graceful degradation

```
API_URL set?  ──no──►  bundled JSON snapshot
      │yes
      ▼
fetch API ──ok──►  render
      │fail / >12 s timeout
      ▼
bundled JSON + visible "showing last published snapshot" banner
      │fail
      ▼
retry-able error state
```

The site never renders a blank page or a stack trace. Individual bad rows disappear rather than breaking their page — it degrades to *showing less*, never to *showing broken*.

---

## 4. Data model — all 17 sheets

453 sample rows. Every website section maps to exactly one sheet.

### Relationships

```
Financial_Years (Year_ID) ──┬─→ Programs_FMR (Year_ID, Category_ID) ──→ Documents (Program_ID)
                            ├─→ PIP_Documents (Year_ID)
                            └─→ Documents (Year_ID)

Program_Categories (Category_ID) ──┬─→ Programs_FMR (Category_ID)
                                   └─→ Documents (Category_ID)

Post_Categories (Category_ID) ──→ Posts (Category_ID) ──→ Post_Media (Post_ID)

Programs_FMR (FMR_Code) ──→ Program_Benefits (FMR_Code)   what citizens actually get

Navigation (Parent_Menu_ID → Menu_ID)  self-referencing, one level

Settings · Home_Content · Important_Links · Notices · Contact_Information · Footer   standalone
```

### Conventions

- `Required` = the website skips the row if blank
- IDs are **text**, never numbers — Sheets will not strip leading zeros
- Dates are `YYYY-MM-DD` **plain text** so locale cannot reinterpret them
- `Status` on every content sheet: `Active` · `Inactive` · `Archived`
- **Never delete a row** — set `Status = Inactive`. Deleting breaks ID references.

### Row counts

| Sheet | Rows | Cols | Purpose |
|---|---|---|---|
| `README` | 10 | 3 | In-workbook instructions for the admin |
| `Settings` | 32 | 5 | Key–value site configuration |
| `Navigation` | 9 | 10 | Menu structure |
| `Financial_Years` | 4 | 8 | FY list |
| `PIP_Documents` | 12 | 12 | Headline document strip per year |
| `Program_Categories` | 5 | 7 | The five flexi pools |
| `Programs_FMR` | **157** | 12 | ★ FMR budget heads, year-scoped |
| `Documents` | 35 | 14 | Central document repository |
| `Home_Content` | 14 | 11 | Every editable homepage string |
| `Important_Links` | 14 | 11 | External portal links |
| `Notices` | 6 | 13 | Circulars and announcements |
| `Contact_Information` | 5 | 15 | Office contacts |
| `Footer` | 15 | 10 | Footer blocks and links |
| `Post_Categories` | 18 | 7 | Event/news taxonomy |
| `Posts` | 10 | 23 | ★ What's New / Events / News |
| `Post_Media` | 8 | 9 | Gallery images, one row per image |
| `Program_Benefits` | **40** | 15 | ★ What a citizen gets — free services, eligibility, where to go |
| `_Lists` | 66 | 3 | Controlled vocabularies for dropdowns |

---

### 4.1 `Settings` — 32 rows

Key–value, so new settings never require a new column.

`Setting_Key` (PK, never change) · `Setting_Label` · `Setting_Value` (what the admin edits) · `Group` · `Notes`

**Keys that change behaviour:**

| Key | Effect |
|---|---|
| `current_financial_year` | Must match a `Financial_Year` value |
| `site_status` | `Live` / `Maintenance` (shows a banner) |
| `enable_hindi` | Shows or hides the language toggle |
| `cache_minutes` | Browser cache window (default 30) |
| `records_per_page` | Documents page pagination (default 25) |
| `primary_color` / `accent_color` | Hex branding |
| `contact_email` / `contact_phone` | Header and footer |
| `social_facebook` / `_twitter` / `_youtube` | Blank hides the icon |

Groups: Identity · Branding · Content · Contact · Footer · Social · Behaviour

---

### 4.2 `Navigation` — 9 rows

| Field | Type | Req | Notes |
|---|---|---|---|
| `Menu_ID` | Text | ✓ | PK |
| `Menu_Label_EN` / `Menu_Label_HI` | Text | EN only | |
| `URL` | Text | ✓ | Page or full external URL |
| `Parent_Menu_ID` | Text | | FK → self. Filling it creates a dropdown |
| `Display_Order` | Number | ✓ | Left-to-right |
| `Is_Active` | List | ✓ | `Yes` shows the item |
| `Link_Type` | List | ✓ | `Internal` / `External` |
| `Icon` | Text | | From the built-in set |
| `Target` | List | ✓ | `_self` / `_blank` |

Current menu: Home · PIP · Programmes · **Events** · Documents · Notices · Contact Us · SHS Bihar (external) · NHM India (inactive)

---

### 4.3 `Financial_Years` — 4 rows

`Year_ID` (PK) · `Financial_Year` (used in URLs) · `Display_Name` · `Start_Year` · `End_Year` · `Is_Current` (**exactly one = Yes**) · `Status` · `Display_Order`

Sample: FY2627 (current) · FY2526 · FY2425 · FY2324 (archived, documents-only)

> The year dropdown is generated from this sheet **filtered to years that have programme rows or documents**. FY2324 has documents but no FMR rows, so it appears labelled *"— archived (documents only)"*.

---

### 4.4 `PIP_Documents` — 12 rows

The headline strip at the top of a financial year.

`Doc_ID` (PK) · `Year_ID` (FK) · `Document_Name` · `Document_Type` · `Description` · `File_URL` · `File_Type` · `File_Size_MB` · `Issue_Date` · `Upload_Date` · `Display_Order` · `Status`

Types: PIP · RoP · Supplementary PIP · Supplementary Approval · Budget Allocation Letter · Revised Budget · Letter · Other

---

### 4.5 `Program_Categories` — 5 rows

Global master. Year-specific allocation/guideline **files** live in `Documents`, so this never needs duplicating per year.

| ID | Category | Short |
|---|---|---|
| CAT01 | RCH Flexible Pool (including RI, IPPI, NIDDCP) | RCH |
| CAT02 | NDCP Flexi Pool | NDCP |
| CAT03 | NCD Flexi Pool | NCD |
| CAT04 | Health System Strengthening (HSS) - Urban | HSS(U) |
| CAT05 | Health System Strengthening (HSS) - Rural | HSS |

---

### 4.6 `Programs_FMR` — 157 rows ★ core table

One row = one FMR budget head **in one financial year**.

| Field | Type | Req | Notes |
|---|---|---|---|
| `Program_ID` | Text | ✓ | PK |
| `Year_ID` | Text | ✓ | FK → Financial_Years |
| `Category_ID` | Text | ✓ | FK → Program_Categories |
| `FMR_Code` | Text | ✓ | Unique **within a year** |
| `Program_Name` / `_HI` | Text | EN only | |
| `Program_Description` | Text | | Detail page |
| `Budget_Allocation_Lakh` | Number | | ₹ lakh |
| `Budget_Guidelines` | Text | | What the head funds |
| `Nodal_Officer` | Text | | |
| `Display_Order` | Number | ✓ | Within the category |
| `Status` | List | ✓ | |

Distribution: **FY2627 = 59 · FY2526 = 49 · FY2425 = 49**

> ⚠️ Sample `Budget_Allocation_Lakh` figures are **illustrative placeholders**, not published Sheikhpura allocations. Replace from the district RoP.

---

### 4.7 `Documents` — 35 rows

Everything that is not the year headline strip. Same column names as `PIP_Documents` so the Documents page can union both.

`Document_ID` (PK) · `Year_ID` · `Category_ID` · `Program_ID` · `Document_Title` · `Document_Type` · `Description` · `File_URL` · `File_Type` · `File_Size_MB` · `Upload_Date` · `Display_Order` · `Status` · `Is_Featured`

Types: Category Allocation · Category Guidelines · Programme Guideline · Format · Report · Circular · Letter · Other

**How the PIP table finds its files:** the *Budget Allocation* button looks up `Documents` where `Year_ID` + `Category_ID` match and `Document_Type = Category Allocation`; *Budget Guidelines* does the same with `Category Guidelines`. This reproduces the reference site's `rowspan`-merged columns with **no merged cells**.

---

### 4.8 `Home_Content` — 14 rows

`Section_Key` (PK, never change) · `Section_Type` · `Title_EN` / `_HI` · `Subtitle` · `Body_Text` · `Icon` · `Link_URL` · `Link_Label` · `Display_Order` · `Status`

Types: `hero` · `banner` · `stat` · `section` · `richtext`

Keys: `hero_title` · `hero_subtitle` · `hero_cta2` · `notice_banner` · `stat_blocks` · `stat_programs` · `stat_categories` · `stat_documents` · `sec_whatsnew` · `sec_programs` · `sec_documents` · `sec_notices` · `sec_quicklinks` · `about_text`

> **Stat tiles with a blank `Body_Text` are computed live** from the data. Type a number to override. `stat_blocks` is typed because block count has no data source.

---

### 4.9 `Important_Links` — 14 rows

`Link_ID` (PK) · `Link_Name` · `URL` · `Description` · `Icon` · `Category` · `Display_Order` · `Status` · `Is_External` · `Show_In_Footer` · `Show_On_Home`

Categories: National · State · District · Portal

---

### 4.10 `Notices` — 6 rows

`Notice_ID` (PK) · `Title` · `Description` · `Notice_Date` · `Category` · `Priority` · `Attachment_URL` · `External_URL` · `Is_Featured` · `Is_New` · `Status` · `Display_Order` · `Expiry_Date`

`Expiry_Date` auto-hides the notice. Blank = never expires.

---

### 4.11 `Contact_Information` — 5 rows

`Contact_ID` (PK) · `Office_Name` · `Designation` · `Person_Name` · `Address` · `District` · `State` · `PIN` · `Phone` · `Alt_Phone` · `Email` · `Office_Hours` · `Google_Maps_URL` · `Display_Order` · `Status`

Social URLs live in `Settings`, not here.

---

### 4.12 `Footer` — 15 rows

`Footer_ID` (PK) · `Block_Type` (`about`/`link`/`contact`/`legal`) · `Block_Title` · `Label` · `URL` · `Content_Text` · `Column_Number` (1–4 = columns, 5 = bottom bar) · `Display_Order` · `Status` · `Is_External`

---

### 4.13 `Post_Categories` — 18 rows

`Category_ID` (PK) · `Category_Name` · `Slug` · `Colour` (hex chip colour) · `Icon` · `Display_Order` · `Status`

Health Campaign · Awareness Program · Training · Workshop · Meeting · Health Camp · Vaccination Drive · Maternal Health · Child Health · NCD · Public Health · Digital Health · BHAVYA · ABDM/ABHA · District Achievement · Government Initiative · Important Announcement · Other

Add a row → it appears in the composer dropdown and the public filter immediately.

---

### 4.14 `Posts` — 10 rows ★ What's New / Events

Written by the **admin composer**, not by hand.

| Field | Type | Req | Notes |
|---|---|---|---|
| `Post_ID` | Text | ✓ | PK, auto-assigned |
| `Slug` | Text | ✓ | **Unique.** The public URL |
| `Title` | Text | ✓ | |
| `Short_Description` | Text | | Card text, ~300 chars |
| `Full_Description` | Text | | Blank line = new paragraph |
| `Content_Type` | List | ✓ | `News` / `Event` / `Update` |
| `Category_ID` | Text | | FK → Post_Categories |
| `Featured_Image_URL` | URL | | Blank renders generated placeholder art |
| `Event_Start_Date` | Date | | **Drives Upcoming/Past** |
| `Event_End_Date` | Date | | Must not precede start |
| `Event_Time` | Text | | |
| `Venue` / `Location` | Text | | |
| `External_URL` | URL | | |
| `Attachment_URL` / `Attachment_Name` | | | |
| `Published_Date` | Date | | Set automatically on first publish |
| `Scheduled_Date` | Text | | Required when Scheduled. `YYYY-MM-DD HH:MM` |
| `Author` | Text | | |
| `Is_Featured` | List | | `Yes` pins above others |
| `Status` | List | ✓ | `Draft` / `Published` / `Scheduled` / `Archived` |
| `Created_Date` / `Updated_Date` | Date | | Automatic |

**Status records intent only:**

| Status | Public? |
|---|---|
| `Draft` | never — withheld server-side, not even sent to the browser |
| `Published` | yes |
| `Scheduled` | only once `Scheduled_Date` has passed |
| `Archived` | hidden from home; visible in the events archive |

Sample: 7 Published · 1 Scheduled · 1 Draft · 1 Archived — 7 Events, 2 News, 1 Update.
Public payload carries **8** (Draft and unreleased Scheduled withheld).

---

### 4.15 `Post_Media` — 8 rows

**One row per image**, not a delimited list in one cell.

`Media_ID` (PK) · `Post_ID` (FK) · `Media_URL` · `Media_Type` (`image`/`document`) · `Caption` · `File_Name` · `File_Size_KB` · `Display_Order` · `Status`

---

### 4.16 `Program_Benefits` — 40 rows ★ citizen entitlements

The portal is for the **people of Sheikhpura**, not only for officials. `Programs_FMR`
answers *"what does this budget head fund"*; this answers *"what do I get, am I
eligible, and where do I go"*.

| Field | Type | Req | Notes |
|---|---|---|---|
| `Benefit_ID` | Text | ✓ | PK |
| `FMR_Code` | Text | ✓ | **FK by code**, not Program_ID — see below |
| `Year_ID` | Text | | Blank = applies to every year |
| `Benefit_Title` / `_HI` | Text | EN ✓ | Plain language, not scheme jargon |
| `Benefit_Description` / `_HI` | Text | | Two or three sentences |
| `Benefit_Type` | List | ✓ | Cash Benefit · Free Service · Free Medicine · Free Test · Free Transport · Free Equipment · Awareness |
| `Amount` | Text | | `Free`, or the rupee figure |
| `Who_Is_Eligible` | Text | | Written as the citizen would ask |
| `Where_To_Avail` | Text | | Named real places |
| `Documents_Required` | Text | | Or `None` |
| `Helpline` | Text | | Rendered as a tappable `tel:` link |
| `Display_Order` / `Status` | | ✓ | |

**Why keyed on `FMR_Code` and not `Program_ID`:** entitlements such as JSY, JSSK and
free dialysis are stable across years, while `Program_ID` is year-scoped. Keying on the
code means a benefit is written once and shows for every year that has that code. Set
`Year_ID` only to override for one year.

**The `(VERIFY …)` convention.** Cash amounts carry the standard national /
Low-Performing-State figures Bihar follows, with `(VERIFY current state rate)` appended
where the rate is revised periodically. That marker is **stripped before display** —
citizens never see it — and instead raises a warning on the Admin dashboard, so it works
as a pre-launch checklist. Five rows carry it: BEN001, BEN006, BEN014, BEN016, BEN020.

Coverage: 40 benefits across 24 FMR codes. Codes with no citizen-facing benefit
(Technical Assistance, Programme Management, Untied Grants) correctly have none.

---

### 4.18 `_Lists` — 66 rows

Controlled vocabularies backing every dropdown: `List_Name` · `Value` · `Meaning`.

Lists: Status · Yes_No · Document_Type · File_Type · Priority · Notice_Category · Link_Type · Link_Category · Section_Type · Footer_Block · **Content_Type** · **Post_Status** · **Media_Type**

---

### 4.19 Derived, never stored

| Concept | Computed from | Why not a column |
|---|---|---|
| **Upcoming / Ongoing / Past** | event dates vs today | nobody should have to flip a status when a date passes |
| **Live or hidden** | `Status` + `Scheduled_Date` vs now | a "visible?" column drifts out of step with the clock |
| **Sort order** | event date for events, publish date for news | a manual order column goes stale immediately |
| **Year has data** | presence of programme/document rows | prevents the reference site's dead-dropdown failure |
| **Stat tile numbers** | live counts | stale numbers are worse than none |
| **"N free services" chip** | count of matching benefit rows | keeps the PIP table honest as benefits are added |

---

## 5. Pages and routes

| Page | Route | What it does |
|---|---|---|
| **Home** | `/index.html` | Hero · announcement strip · **Free Services for You** · **What's New** (tabbed) · stat tiles · programme categories · latest documents · notices · quick links · about |
| **PIP** | `/pip.html`, `?fy=2025-26`, `/pip/2025-26` | Year selector · key documents · in-page search + category filter · one block per flexi pool with allocation/guideline buttons and the FMR table |
| **Programme detail** | `/program.html?fy=2026-27&fmr=RCH.1` | **"What you get from this programme"** first · full head detail · category docs · at-a-glance · **same code in other years** · sibling heads |
| **Free Services** | `/benefits.html` | ★ Citizen-facing. 40 entitlements grouped by health area, searchable, with a "Know your rights" panel |
| **Documents** | `/documents.html` | Searchable repository, 4 filters, pagination |
| **Notices** | `/notices.html` | Search, category, priority, include-archived |
| **Events** | `/events.html` | Search · type · when (upcoming/past) · category · pagination |
| **Event detail** | `/event.html?slug=…`, `/events/<slug>` | Hero · body · photo gallery with lightbox · attachments · sidebar · related |
| **Contact** | `/contact.html` | Helpline tiles · office cards · maps links |
| **Admin** | `/admin.html` | Login · dashboard · **post composer** · Manage Posts · validation report · sync |

### Pretty URLs

`vercel.json` rewrites `/events/:slug` → `/event.html?slug=:slug` and `/pip/:fy` → `/pip.html?fy=:fy`.

Two things were required to make these work, and both are easy to miss:

1. **`<base href="/">` on every page.** Served at `/events/<slug>`, relative asset paths resolve to `/events/assets/js/…` and 404 — the page renders completely blank. *Consequence: the site must be deployed at a domain root.*
2. **Client-side path parsing.** A rewrite decides which *file* is served; it does not change the browser URL, so `location.search` is empty and `?slug=` is not there to read. `UI.route('slug','events')` checks query → path → hash.

Internal links deliberately keep the canonical `?slug=` form so the site behaves identically under `python -m http.server`, which has no rewrite support.

---

## 6. Code reference

### `assets/js/config.js` — 32 lines

The **only** file edited to connect a data source.

```javascript
window.PORTAL_CONFIG = {
  API_URL: '',                              // Apps Script /exec URL — NOT the Sheets URL
  SHEET_ID: '1V2FbGpf…',                    // for the admin "Open Google Sheet" button
  FALLBACK_JSON: 'assets/data/portal-data.json',
  CACHE_MINUTES: 30,
  TIMEOUT_SECONDS: 12,
  SHOW_VALIDATION_TO_PUBLIC: false
};
```

### `assets/js/data.js` — 583 lines

Fetch, cache, validate, query. **No DOM access.**

**Exports:** `load` `query` `clear` `esc` `yes` `num` `validUrl` `fmtDate` `fmtRange` `parseDate` `parseWhen` `active` `byOrder`

**`PortalData.query` (25 methods):**

| Group | Methods |
|---|---|
| Benefits | `benefitsFor` `allBenefits` `benefitTypes` |
| Years | `years` `currentYear` `yearBySlug` |
| Programmes | `categories` `programs` `programById` `programByCode` |
| Documents | `categoryDoc` `pipDocs` `docsForProgram` `allDocuments` |
| Posts | `postCategories` `posts` `postBySlug` `postGallery` `postStats` |
| Site | `notices` `links` `contacts` `nav` `home` `homeByType` `footer` |
| Other | `search` `stats` |

**Key helpers:**

- `esc()` — HTML-escapes everything rendered. The single XSS chokepoint.
- `validUrl()` — accepts only `http(s)` and internal `.html`; rejects `javascript:`, `data:`, and the `NEEDS MANUAL INPUT` placeholder.
- `fmtRange()` — collapses `01 Aug – 07 Aug 2026` to `01–07 Aug 2026`.

### `assets/js/ui.js` — 452 lines

Shell, theme, language, shared components. **No content.**

**Exports:** `boot` `renderShell` `renderFooter` `crumbs` `docRow` `docIcon` `postCard` `postCover` `postArt` `postTiming` `postWhen` `emptyState` `errorState` `skeleton` `icon` `t` `lang` `param` `pathSeg` `route` `money` `setTheme` `Prefs`

`UI.boot(activePage, render)` is the standard page entry point: load data → paint shell → hand data to the page → paint footer → catch any failure into a retry-able error state.

### `assets/js/composer.js` — 587 lines

Admin post composer + browser-side image compression.

**Exports:** `open(opts)` `compress(file)`

Constants: `MAX_EDGE = 1600` · `QUALITY = 0.82` · `MAX_UPLOAD_BYTES = 5 MB` · `MAX_GALLERY = 12`

**Contains no storage credential.** Uploads post to the authenticated Apps Script endpoint.

### `assets/css/site.css` — 627 lines, 34 KB

One stylesheet, CSS-variable tokens, no framework.

### `apps-script/Code.gs` — 897 lines

34 functions across routing, data, posts/media, and auth. Full reference in §7.

### Python tooling

| File | Purpose |
|---|---|
| `build_database.py` (948 lines) | Generates the `.xlsx` from scratch, runs integrity checks. **Overwrites** — never run against live content. |
| `export_json.py` (132 lines) | `.xlsx` → `assets/data/portal-data.json`. Applies the same publish filter as the API and reports what it withheld. |

---

## 7. Apps Script API reference

Deployed **Execute as: Me / Access: Anyone**.

### Public (GET, no auth)

| Endpoint | Returns |
|---|---|
| `?action=data` | Full validated dataset, **filtered by `publicView()`** |
| `?action=status` | Counts, sheet name, last-modified, cache state |
| `?action=validate` | Validation report only |
| `?action=data&fresh=1` | Bypasses the server cache |

### Authenticated (POST, `Content-Type: text/plain`)

| Action | Payload | Does |
|---|---|---|
| `login` | `username`, `password` | Returns HMAC token + expiry |
| `session` | `token` | Validity check |
| `logout` | `token` | Adds token hash to a deny-list |
| `refresh` | `token` | Clears cache, rebuilds, returns validation |
| `mediaUpload` | `data` (base64), `mimeType`, `fileName` | Validates, writes to Drive, returns public URL |
| `postSave` | `post{}`, `gallery[]` | Creates or updates a post + its gallery rows |
| `postDelete` | `postId` | Removes post and gallery rows |
| `postStatus` | `postId`, `status` | Publish / unpublish / archive without opening the composer |
| `postList` | `token` | **All** posts including drafts |

> **`Content-Type: text/plain` is deliberate.** Apps Script cannot answer a CORS preflight (`OPTIONS`). `text/plain` keeps every request a "simple request", so preflight never happens. Do not change it on the client.

### `publicView()` — the security boundary

```javascript
out.posts = d.posts.filter(p => {
  const s = String(p.Status).toLowerCase();
  if (s === 'published' || s === 'archived') return true;
  if (s === 'scheduled') { const w = parseWhen(p.Scheduled_Date); return !!w && w <= now; }
  return false;                                   // Draft, or anything unrecognised
});
```

Applied on **every** public GET. Drafts and unreleased scheduled posts are never sent to the browser, so they cannot be read from the network tab. `export_json.py` applies the identical rule.

### Validation performed server-side

Missing required fields · duplicate PKs · unknown foreign keys · duplicate FMR code within a year · duplicate or blank post slug · scheduled-without-date · orphan gallery rows · invalid file URLs · ≠1 current year · years with no data.

Bad rows are **dropped and reported**, never rendered.

### Concurrency

`postSave`, `postDelete` and `postStatus` take a `LockService` script lock (20 s) so two admins on two devices cannot interleave writes.

---

## 8. Security

### Credentials

Stored in Script Properties — server-side, not in code, not in version control:

| Property | Contents |
|---|---|
| `ADMIN_USER` | username |
| `ADMIN_SALT` | random UUID, regenerated on every password change |
| `ADMIN_HASH` | `SHA-256(salt + password)` — the password is never stored |
| `TOKEN_SECRET` | two concatenated UUIDs, signs session tokens |

`setupCredentials()` writes these once, then the plaintext password is deleted from the code.

### Session tokens

```
token = base64Url("admin|1789000000000") + "." + HMAC_SHA256(payload, TOKEN_SECRET)
```

Stateless · tamper-evident · 8-hour expiry · revocable via deny-list · stored in `sessionStorage` (dies with the tab, never auto-sent, so CSRF does not apply).

### Brute-force resistance

5 failures per username → 15-minute lockout · 600 ms delay on every failure · identical error for wrong username and wrong password (no account enumeration) · no signup, no password reset, no user list.

### Threat table

| Threat | Mitigation |
|---|---|
| Attacker reads the sheet | Sheet is Restricted; only Apps Script reads it |
| Credentials in page source | none exist there |
| Password brute-forced | lockout + delay + salted hash |
| Token forged or extended | HMAC-SHA256 over the payload |
| Stolen token replayed | 8-hour expiry + logout deny-list |
| XSS | every value escaped through `esc()` — verified by injection |
| `javascript:` URL in a data row | rejected by `validUrl()` |
| Malicious file upload | MIME allow-list **+ magic-byte check** |
| Path traversal in filename | `safeName()` strips separators, `..`, control chars, double extensions |
| Concurrent writes | `LockService` |
| Draft content leaking | `publicView()` filters server-side |
| Admin page indexed | `noindex, nofollow` + `X-Robots-Tag` |
| Clickjacking | `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |

### Content Security Policy (`vercel.json`)

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com;
connect-src 'self' https://script.google.com https://script.googleusercontent.com;
font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
```

`'unsafe-inline'` for scripts is required because page logic lives in inline `<script>` blocks. Verified against the running site: **0 violations on every page**, `data:` previews allowed, non-allowlisted host correctly blocked.

---

## 9. What's New / Events module

### Public experience

- **Home** — "What's New" band directly under the hero, with tabs: All · Upcoming · Events · News. Shows up to 6 cards.
- **Sort order** — upcoming events first (soonest first), then featured, then newest.
- **Card** — cover photo or generated category-coloured art · type badge · category chip · timing chip (Upcoming/Ongoing/Past) · title · description · date · venue · Read More.
- **Events page** — search, type, when, category, pagination (9/page), archived included.
- **Detail page** — hero image · chips · full body (paragraph-aware) · photo gallery with keyboard-navigable lightbox · attachments · external links · sidebar (date, time, venue, location, category, author) · copy-link · print · related posts.

### Admin experience

```
Login → Dashboard → Posts & Events → ＋ Create New Post
   → title + short + full description
   → Add cover photo         (file picker; on a phone this offers the camera)
   → Add more photos         (multi-select, up to 12, each captionable)
   → News / Event / Update   (event fields appear only for Event)
   → category, featured flag
   → Preview                 (renders the real card with the real photo)
   → Save as draft | Publish | Schedule
```

**Manage Posts** — filterable table (type, status, category, free text) with View · Edit · Publish/Unpublish · Archive · Delete.

**Dashboard tiles** — Total · Published · Drafts · Scheduled · Archived · Upcoming events.

### Scheduled publishing — no cron job

The admin sets `Status = Scheduled` and a date-time. `publicView()` filters it out until the moment passes, then the same filter starts letting it through. Nothing runs on a timer.

*Cost:* a scheduled post goes live when the cache next expires (≤6 h server, ≤30 min browser), not to the minute. Click **Clear cache & sync now** if it matters.

### Composer validation

| Rule | Message |
|---|---|
| No title | "Please enter a post title." |
| Scheduled without a date | "Choose the date and time to publish at." |
| Scheduled in the past | "The scheduled time is in the past…" |
| Bad external URL | "The external link must start with http:// or https://" |
| End before start | "The event end date is before the start date." |

---

## 10. Image pipeline

### Decision: Google Drive, written by Apps Script

| | **Drive + Apps Script** | Cloudinary | Firebase | Supabase |
|---|---|---|---|---|
| Credential in frontend | **none** | upload preset | firebaseConfig | anon key |
| New vendor | **no** | yes | yes | yes |
| Free storage | 15 GB | 25 GB | needs Blaze | 1 GB |
| Reuses existing auth | **yes** | no | no | no |
| Same place as PIP documents | **yes** | no | no | no |

**Deciding factor:** *"Do not expose storage credentials or API keys in frontend JavaScript."* Drive-via-Apps-Script is the only option where **zero** storage credential exists in the browser. Cloudinary needs an unsigned preset (anyone reading the JS could upload to your account) or a signing endpoint — which is Apps Script again.

Full rationale: [`docs/07_Media_Architecture.md`](docs/07_Media_Architecture.md)

### Flow

```
phone/PC → browser compresses → POST base64 + token → Apps Script validates
   → writes to Drive folder "Sheikhpura PIP Portal — Media" (per-file link sharing)
   → returns https://drive.google.com/thumbnail?id=…&sz=w1600
   → sheet stores the URL, never the bytes → website <img>
```

### Compression (measured)

Longest edge → 1600 px · quality 0.82 · **PNG kept only if the image actually uses transparency** (alpha sampled on a grid).

| Input | Output | Saved |
|---|---|---|
| 4000×3000 JPEG, 1004 KB | 1600×1200 JPEG, **162 KB** | 84% |
| 2400×1200 opaque PNG, 1904 KB | 1600×800 JPEG, **219 KB** | 88% |
| 1200×600 PNG *with* transparency | stays PNG, 44 KB | preserved |
| 3200×2400 JPEG | **101 KB** | ~90% |

This is what makes Drive storage *and* phone uploading over a district connection practical. At ~250 KB/image, 15 GB holds roughly **60,000 photos**.

### Upload security

Session required · MIME allow-list (JPG/PNG/WebP, PDF/XLSX/DOCX/PPTX) · **magic-byte signature check** · extension taken from our allow-list not the filename · `safeName()` sanitisation + UUID suffix · 5 MB cap on decoded bytes · sub-64-byte rejection · per-file sharing (the folder itself is never shared).

Verified: a `.exe` rejected on MIME; the same bytes renamed `evil.jpg` with a forged `image/jpeg` type rejected on signature.

---

## 11. Design system

### Tokens

| Token | Light | Purpose |
|---|---|---|
| `--navy` | `#1B3A5C` | header, nav, footer |
| `--accent` | `#F2994A` | hover, CTAs, rules |
| `--green` | `#0F7B3E` | success, published |
| `--red` | `#B42318` | errors, PDF |
| `--amber` | `#B54708` | warnings, upcoming |
| `--bg` / `--bg-alt` / `--bg-sunken` | `#fff` / `#F4F6F9` / `#EAEEF3` | surfaces |
| `--text` / `--text-muted` | `#16202C` / `#5A6B7D` | type |
| `--border` / `--border-str` | `#D6DEE7` / `#B9C6D4` | rules |

Dark theme redefines the same tokens under `[data-theme="dark"]`.

**Spacing scale:** `--s1` 4px → `--s8` 64px
**Font:** `"Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif`
**Font size:** 4 discrete steps via `html[data-fs]` — s 14 / m 15 / l 17 / xl 19 px
**Radius:** 6px / 10px · **Max width:** 1240px

### Breakpoints

| Width | Behaviour |
|---|---|
| ≤1024px | 4-col → 2-col, footer 2-col, filters 2-col |
| ≤860px | hamburger nav, **tables collapse to labelled cards**, composer to 1 column |
| ≤560px | everything single column, full-width buttons |

Filter column counts are **classes** (`.filters--2/3/4/5`), never inline styles — an inline `grid-template-columns` would beat the media queries.

---

## 12. Accessibility

Built against the gaps found in the reference site:

- Pinch-zoom **enabled** (no `maximum-scale`)
- Semantic `<header> <nav> <main> <footer>`, one `<h1>` per page
- Skip-to-content link
- Visible `:focus-visible` ring on every control
- `aria-current="page"` · `aria-expanded` on the mobile menu · `aria-pressed` on toggles · `role="tablist"` on the What's New tabs
- **All 67 interactive controls ≥ 24×24 px** (WCAG 2.5.8) — measured, not assumed
- Discrete reversible font steps persisted in `localStorage`
- Token-based dark theme, not a blanket inline override
- `lang` switches to `hi` with the language toggle
- Tables collapse to labelled cards on mobile instead of scrolling sideways
- No blinking content; `prefers-reduced-motion` honoured
- Print stylesheet that expands link URLs
- Lightbox is keyboard-navigable (Esc, ←, →) with focus management

---

## 13. Deployment

Full guide: [`docs/08_Deploy_GitHub_Vercel.md`](docs/08_Deploy_GitHub_Vercel.md)

### ⚠️ Before anything

`C:\Users\sapan` is itself a git repo with remote `github.com/Sapan-raj/Sheikhpura-Health-Contact-`. Its `.gitignore` has two lines. **0 files are tracked**, so nothing has leaked — but a single `git add -A && git push` from your home folder would try to publish `.claude.json`, `.ssh`, `.aws`, Downloads. Delete it if it was accidental:

```bash
rm -rf "C:/Users/sapan/.git"
```

The portal has its **own** repo and is unaffected.

### Part A — GitHub → Vercel

```bash
cd "C:/Users/sapan/OneDrive/Desktop/District Work/Sheikhpura_PIP_Portal"
```

```bash
git remote add origin https://github.com/Sapan-raj/<NEW-REPO>.git && git push -u origin main
```

Then <https://vercel.com/new> → Import → Framework **Other** → **leave Build, Output and Install commands empty** → Deploy.

There is no build step. `vercel.json` supplies rewrites, CSP and headers.

> The site must live at a **domain root**, not a subpath — every page carries `<base href="/">`.

### Part B — Sheet → Apps Script

1. **Share → Restricted** (make the sheet private)
2. **Extensions → Apps Script**, paste all of `apps-script/Code.gs`
3. Set username + password in `setupCredentials()`, **Run** once, authorise, then **delete the password from the code**
4. **Deploy → New deployment → Web app** · Execute as **Me** · Access **Anyone**
5. Paste the `/exec` URL into `assets/js/config.js` → commit → push

> The `/exec` URL and `SHEET_ID` are **not secrets** — safe in a public repo. Writes require the login; the sheet ID is useless without permission on the sheet.

### Redeploying the script

**Deploy → Manage deployments → ✏️ → New version → Deploy.**
Use *Manage deployments*, **not** *New deployment* — the latter issues a new URL.

---

## 14. Operations runbook

### The sync workflow

```
Edit a row in Google Sheets
        ↓
Admin → ↻ Clear cache & sync now     (or Sheet menu → PIP Portal → Clear cache)
        ↓
Website shows the change
```

Without a manual sync, changes appear on their own within the cache window.

**No Vercel redeploy is needed for content.** Vercel rebuilds only when you push code.

| What changed | What to do |
|---|---|
| A row in the sheet | Sync, or wait for the cache |
| A post via the composer | Nothing — it syncs itself |
| HTML / CSS / JS | `git push` → Vercel redeploys |

### Common tasks

| Task | Where |
|---|---|
| Publish an event or news post | **Admin Panel** → Posts & Events → ＋ Create New Post |
| Add a notice | `Notices` → new row |
| Publish a document | Upload to Drive → share → add row in `Documents` (or `PIP_Documents` for headline PIP/RoP) |
| Add an FMR budget head | `Programs_FMR` → new row with the right `Year_ID` **and** `Category_ID` |
| Open a new financial year | `Financial_Years` row (`Is_Current=Yes`), copy last year's `Programs_FMR` block, change `Year_ID`, update `Settings.current_financial_year` |
| Add an event category | `Post_Categories` → new row |
| Change homepage text | `Home_Content` |
| Change contact details | `Contact_Information` + `Settings.contact_*` |
| Change the menu | `Navigation` |
| Hide something | Set `Status = Inactive`. **Never delete a row.** |

### Regenerating data

```bash
python build_database.py    # rebuild the .xlsx from scratch + integrity checks (OVERWRITES)
```

```bash
python export_json.py       # .xlsx → assets/data/portal-data.json
```

To refresh the offline snapshot from live content: Sheets → **File → Download → .xlsx** → replace the workbook → run `export_json.py` → commit.

### Backup

Sheets keeps unlimited version history. In addition: monthly `.xlsx` download; a **Make a copy** before each annual rollover.

---

## 15. Verification record

Everything below was tested in a real browser against the running site — not asserted.

### Data integrity

| Check | Result |
|---|---|
| Workbook integrity (unique IDs, FKs, no duplicate FMR-in-year, exactly one current year, URL-safe slugs) | **PASS, 0 errors** |
| FMR counts vs the live SHS Bihar site | **59 / 49 / 49 — exact match** |
| Duplicate post IDs / slugs / orphan media in the public payload | **none** |
| Sheet structure vs schema (17 tabs uploaded to Google) | **all headers match exactly** |

### Validation (deliberately broken data fed through the real normaliser)

| Rule | Caught |
|---|---|
| Duplicate primary key | ✅ |
| Unknown `Year_ID` / `Category_ID` | ✅ |
| Duplicate FMR code within a year | ✅ |
| Missing required field | ✅ |
| Orphan foreign key reference | ✅ |
| Multiple `Is_Current = Yes` | ✅ |
| Duplicate post slug / blank slug | ✅ |
| Scheduled without a readable date | ✅ |
| Orphan gallery row | ✅ |
| **Good rows survive** | 59 of 59 |

### Security

| Test | Result |
|---|---|
| `<img src=x onerror=alert(1)>` injected through the data layer | **0 elements created**, rendered as escaped text |
| `javascript:` URL in a document or gallery row | rejected by `validUrl()` |
| Draft + unreleased Scheduled in the public payload | **withheld** (`_withheld: 2`) |
| `.exe` upload | rejected on MIME |
| `.exe` renamed `evil.jpg` with forged `image/jpeg` | **rejected on magic bytes** |
| CSP across all pages | **0 violations** |
| Non-allowlisted host (`example.com`) | **blocked**, violation reported |
| `data:` image preview in composer | allowed (needed for preview) |

### Behaviour

| Test | Result |
|---|---|
| Documents page: search, 3 filters, pagination, reset, empty state | correct across 47 records |
| Events page: search, type, when, category, pagination | correct across 8 posts |
| Upcoming/past derivation against the real calendar | correct |
| Scheduling: past-due visible, future hidden | correct |
| Composer form validation (5 rules) | all fire |
| Composer preview shows the un-uploaded photo | works, while `validUrl()` still rejects `data:` publicly |
| Year with no data | hidden; documents-only year shown and labelled |
| `program.html?fy=2026-27&fmr=NDCP.8` (exists in 25-26, not 26-27) | correct "not found" with an explanation |
| Pretty URLs `/events/<slug>`, `/pip/<fy>` | resolve correctly after the `<base>` + path-parsing fix |
| Mobile 375px | no horizontal scroll; tables → labelled cards |
| Tap targets | all 67 controls ≥ 24×24 px |
| Theme / font size | token-based, reversible, persisted |
| Console errors | **none on any page** |
| Hard-coded content in source files | **none** (automated grep) |

### Bugs found and fixed during the build

| Bug | Fix |
|---|---|
| Opaque PNGs stayed ~1 MB — fallback only triggered if the re-encode was *larger* | detect real transparency; opaque → JPEG (88% saving) |
| Composer preview showed placeholder art, not the uploaded photo | composer-only `_previewSrc` path; public `validUrl()` unchanged |
| Filter bars squeezed instead of stacking on phones | inline `grid-template-columns` replaced with classes |
| Brand text lines ran together | `.brand-text > span { display: block }` |
| Archived years excluded from the selector | `Q.years()` now excludes only `Inactive` |
| Documents-only year stranded its document | year visible if it has programmes **or** documents |
| Contact addresses repeated the district name | de-duplicating join |
| Utility-bar buttons under 24px | `min-height/min-width: 26px` |
| `/events/<slug>` rendered blank | `<base href="/">` on all pages |
| Pretty URLs loaded the default view | `UI.route()` parses the path, not just the query |
| Public JSON snapshot carried drafts | `export_json.py` applies the publish filter |

---

## 16. Known limits and residual risks

1. **Single shared administrator account.** Adequate for one district office; no per-user audit trail. To add users: a `Users` sheet with per-user salted hashes and a role column — the token payload already carries a username field.
2. **Scheduled posts go live on cache expiry**, not to the minute (≤6 h). Click sync if precision matters.
3. **`CacheService` 100 KB limit.** The dataset is ~151 KB, so tier-2 caching is skipped and each request reads the sheet. Correct and safe at district traffic; the code reports it (`meta.cacheable = false`) rather than failing. If traffic grows: split across cache keys or gzip before `cache.put()` — a ~15-line change in `getData()`.
4. **Drive links are unguessable but not access-controlled.** Appropriate for photos on a public website. Never route confidential material through it.
5. **Files stay in Drive after a post is deleted.** Deliberate — deleting a row should not silently destroy a photo. Clean up manually.
6. **Site must be at a domain root** because of `<base href="/">`.
7. **`sessionStorage` is readable by same-origin JS.** Mitigated by centralising escaping in one function.
8. **Local-preview mode does not enforce sign-in.** With no `API_URL` there is no service to authenticate against and the data is a public JSON file. The dashboard says so explicitly. Not a production configuration.
9. **Apps Script has no IP-level rate limiting.** Read endpoints are public by design; the exposure is load, not disclosure.

---

## 17. NEEDS MANUAL INPUT register

Cells with this red text are placeholders. The site hides or disables anything still marked this way. **None of it was invented** — these are verifiable facts that must come from the district office.

| Sheet | Field | Rows | Needed |
|---|---|---|---|
| `Settings` | `Setting_Value` | `contact_email`, `contact_phone` | Official district health email + phone |
| `PIP_Documents` | `File_URL` | all 12 | Real links to district PIP, RoP, letters |
| `Documents` | `File_URL` | all 35 | Real links to allocation and guideline files |
| `Contact_Information` | `Person_Name`, `Phone`, `Email` | CON01–CON04 | Serving officers' names and numbers |
| `Notices` | `Attachment_URL` | NOT03 | Meeting circular |
| `Posts` | `Attachment_URL` | POST007 | AAM reporting format |

**Also verify before go-live:**

- PIN code `811105` and LGD district code `225` — plausible but unconfirmed
- Every `Budget_Allocation_Lakh` figure — **illustrative placeholders**, replace from the district RoP
- The eight sample posts are realistic district content but are **sample data**; they have no cover images because none have been uploaded yet (cards render generated placeholder art)

---

## 18. File inventory

32 tracked files · 1.2 MB.

| File | Lines | Purpose |
|---|---|---|
| **Pages** | | |
| `index.html` | 203 | Home |
| `pip.html` | 192 | PIP by financial year |
| `program.html` | 148 | FMR head detail |
| `documents.html` | 131 | Document repository |
| `notices.html` | 101 | Notices |
| `events.html` | 114 | Events listing |
| `event.html` | 176 | Post detail + gallery |
| `contact.html` | 95 | Contacts |
| `admin.html` | 455 | Login, dashboard, posts management |
| **Code** | | |
| `assets/js/config.js` | 32 | ← the only file edited to connect data |
| `assets/js/data.js` | 583 | Fetch, cache, validate, query |
| `assets/js/ui.js` | 452 | Shell, theme, shared components |
| `assets/js/composer.js` | 587 | Post composer + image compression |
| `assets/css/site.css` | 627 | One stylesheet |
| `apps-script/Code.gs` | 897 | API + auth + media + post CRUD |
| **Data** | | |
| `Sheikhpura_Health_PIP_Website_Database.xlsx` | — | Master workbook, 17 sheets |
| `assets/data/portal-data.json` | 4357 | Generated public snapshot |
| `build_database.py` | 948 | Generates the workbook |
| `export_json.py` | 132 | Workbook → JSON |
| **Config** | | |
| `vercel.json` | 51 | Rewrites, CSP, headers |
| `.gitignore` | 29 | |
| `assets/img/favicon.svg`, `emblem.svg` | 5 each | Inline SVG identity |
| **Docs** | | |
| `MASTER_REFERENCE.md` | — | **this file** |
| `README.md` | 181 | Orientation |
| `docs/01_Website_Analysis_Report.md` | 297 | Reverse-engineering findings |
| `docs/02_Data_Dictionary.md` | 375 | Every field defined |
| `docs/03_Architecture.md` | 168 | Technical architecture |
| `docs/04_Google_Sheets_Integration.md` | 193 | Excel → Sheets → API |
| `docs/05_Admin_Architecture.md` | 133 | Auth and security |
| `docs/06_Setup_Guide.md` | 215 | Operations for non-developers |
| `docs/07_Media_Architecture.md` | 214 | Image storage and pipeline |
| `benefits.html` | — | Citizen free-services page |
| `benefits_data.py` | — | The 40 citizen entitlements |
| `sheet-import/` | — | CSVs + instructions for updating the live Google Sheet |
| `docs/08_Deploy_GitHub_Vercel.md` | 210 | Deployment |

---

## 19. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Showing the last published snapshot" | API unreachable | check `<exec-url>?action=status` loads |
| Edits not appearing | cache warm | **Clear cache & sync now** |
| A row is missing from the site | validation dropped it | Admin → Validation → red ERROR shows sheet, row, reason |
| "Not yet published" on a download | `File_URL` blank / placeholder / not https | paste a real share link |
| A financial year missing from the dropdown | no programme rows **and** no documents | add rows with that `Year_ID` |
| `FMR_Code` shows as a date | column not text | **Format → Number → Plain text**, re-enter |
| Login: "credentials not configured" | `setupCredentials()` never ran | run it once |
| Locked out | 5-attempt lockout | wait 15 min, or `changePassword('new')` |
| `Code.gs` changes have no effect | not deployed | **Manage deployments → ✏️ → New version** |
| Composer says "Local preview mode" | `API_URL` not set | connect the Apps Script |
| Photo upload rejected | wrong type or >5 MB after compression | use a normal photo |
| Scheduled post hasn't appeared | cache | sync |
| Event still "Upcoming" after the date | cached data | sync; the label is computed at render |
| Post page: "Post not found" | slug changed / unpublished / archived | check in Manage Posts |
| Images blocked on the live site | CSP | `vercel.json` allows Drive; add any new host to `img-src` |
| Vercel build fails | a build command was set | Build/Output/Install must be **empty** |
| Site works locally, not hosted | `file://` or mixed content | serve over HTTPS |
| Pretty URL renders blank | missing `<base href="/">`, or deployed to a subpath | site must be at a domain root |
| Everything broke after an edit | header row renamed | **Ctrl+Z** or File → Version history |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **PIP** | Project Implementation Plan — the annual NHM work plan and budget |
| **RoP** | Record of Proceedings — MoHFW's approval of the PIP |
| **FMR** | Financial Management Report code — a budget head, e.g. `RCH.1` |
| **Flexi Pool** | Top-level NHM budget grouping (RCH, NDCP, NCD, HSS Urban/Rural) |
| **NHM** | National Health Mission |
| **SHS** | State Health Society (Bihar) — the parent body |
| **DHS** | District Health Society |
| **DPMU** | District Programme Management Unit |
| **AAM / HWC** | Ayushman Arogya Mandir / Health & Wellness Centre |
| **ABHA / ABDM** | Ayushman Bharat Health Account / Digital Mission |
| **BHAVYA** | Bihar's citizen health platform |
| **Slug** | URL-safe post identifier, e.g. `world-breastfeeding-week-2026` |
| **Apps Script** | Google's server-side JavaScript, bound to the sheet |
| **`/exec` URL** | The deployed Web App endpoint — the site's API |
| **`publicView()`** | The server-side filter that withholds drafts |
| **Magic bytes** | A file's signature, used to detect a renamed file |

---

## 21. What to do next

### Immediate

- [ ] Delete `C:\Users\sapan\.git` if it was accidental
- [ ] Set the Google Sheet back to **Restricted**
- [ ] Create a GitHub repo, `git push` (repo is committed and ready)
- [ ] Import to Vercel — Build/Output/Install all empty
- [ ] Install `Code.gs`, run `setupCredentials()`, deploy as Web App
- [ ] Paste the `/exec` URL into `config.js`, push
- [ ] Confirm Admin → *Data source* reads **Google Sheets via Apps Script**

### Before go-live

- [ ] Replace every `NEEDS MANUAL INPUT` (§17)
- [ ] Replace budget figures from the district RoP
- [ ] Verify PIN and LGD codes
- [ ] Confirm every `File_URL` opens for a signed-out user
- [ ] Admin dashboard shows **0 rows skipped**
- [ ] Create one real post end to end, including a photo from a phone
- [ ] Test on a real phone
- [ ] Walk the district admin through the runbook (§14) unaided
- [ ] Store the password in the office register

### Later, if useful

- Custom domain (Vercel → Settings → Domains; CNAME via NIC)
- Multi-user admin (`Users` sheet with per-user hashes)
- Cloudinary migration if image traffic grows (only `mediaUpload()` changes)
- Gzip or split the cache payload if the dataset outgrows 100 KB meaningfully
- Real Hindi translations (the toggle and `_HI` columns already exist)

# Deliverable 2 — Data Dictionary
## `Sheikhpura_Health_PIP_Website_Database.xlsx` → Google Sheets

13 data sheets + 1 README sheet. 356 sample records. Every website section maps to exactly one sheet.

**Conventions**
- `Required` = the website skips the row if this is blank
- `PK` = primary key (unique, never reused, never renumbered)
- `FK` = foreign key into another sheet
- IDs are text, not numbers — Google Sheets will not strip leading zeros or reformat them
- Dates are `YYYY-MM-DD` text. **Format the column as Plain text in Google Sheets** so locale settings cannot reinterpret them
- `Status` on every content sheet: `Active` (live) · `Inactive` (hidden) · `Archived` (older FY views only)
- Never delete a row — set `Status = Inactive`

---

## Entity relationships

```
Financial_Years (Year_ID) ──┬─→ Programs_FMR (Year_ID, Category_ID) ──→ Documents (Program_ID)
                            ├─→ PIP_Documents (Year_ID)
                            └─→ Documents (Year_ID)

Program_Categories (Category_ID) ──┬─→ Programs_FMR (Category_ID)
                                   └─→ Documents (Category_ID)

Navigation (Parent_Menu_ID → Menu_ID)   self-referencing, one level

Settings · Home_Content · Important_Links · Notices · Contact_Information · Footer   standalone
```

**The one rule that matters:** `Programs_FMR` is keyed by **`(Year_ID, Category_ID)`**, not by `Category_ID` alone. FMR codes are re-issued every year by MoHFW — FY 2025-26 has 49 heads, FY 2026-27 has 59. A global FMR list would show the wrong codes for past years. This is the single design decision that separates this database from the reference site's copy-a-file-per-year approach.

---

## Sheet 1 — `Settings` (32 rows)
Key–value, so new settings never require a new column.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Setting_Key` | **PK.** Machine name read by the code. **Never change** | Text | Yes | `district_name` |
| `Setting_Label` | Human label shown in the Admin dashboard | Text | Yes | `District Name` |
| `Setting_Value` | **The value the admin edits** | Text | Yes | `Sheikhpura` |
| `Group` | Identity · Branding · Content · Contact · Footer · Social · Behaviour | List | Yes | `Branding` |
| `Notes` | Guidance for the admin | Text | No | `Hex. Header, nav, footer` |

Keys that change site behaviour: `current_financial_year` (must match a `Financial_Year` value), `site_status` (`Live`/`Maintenance`), `enable_hindi`, `cache_minutes`, `records_per_page`, `primary_color`, `accent_color`.

---

## Sheet 2 — `Navigation` (8 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Menu_ID` | **PK** | Text | Yes | `NAV02` |
| `Menu_Label_EN` | Label shown in English | Text | Yes | `PIP` |
| `Menu_Label_HI` | Label shown in Hindi | Text | No | `पीआईपी` |
| `URL` | Page or full external URL | Text | Yes | `pip.html` |
| `Parent_Menu_ID` | **FK → Navigation.Menu_ID.** Blank = top level | Text | No | `NAV02` |
| `Display_Order` | Left-to-right order | Number | Yes | `2` |
| `Is_Active` | `Yes` shows the item | List | Yes | `Yes` |
| `Link_Type` | `Internal` / `External` | List | Yes | `Internal` |
| `Icon` | Icon name from the built-in set | Text | No | `file` |
| `Target` | `_self` / `_blank` | List | Yes | `_self` |

Filling `Parent_Menu_ID` turns an item into a dropdown child automatically.

---

## Sheet 3 — `Financial_Years` (4 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Year_ID` | **PK.** Referenced by 3 sheets | Text | Yes | `FY2627` |
| `Financial_Year` | Canonical short form used in URLs | Text | Yes | `2026-27` |
| `Display_Name` | Shown in the dropdown | Text | Yes | `F.Y. 2026-2027` |
| `Start_Year` / `End_Year` | Calendar years | Number | Yes | `2026` / `2027` |
| `Is_Current` | **Exactly one row = `Yes`** | List | Yes | `Yes` |
| `Status` | Active · Archived | List | Yes | `Active` |
| `Display_Order` | 1 = newest first | Number | Yes | `1` |

The year dropdown is generated from this sheet **filtered to years that actually have programme rows** — which is why the Sheikhpura portal cannot reproduce the reference site's 7-dead-options-out-of-8 failure.

---

## Sheet 4 — `PIP_Documents` (12 rows)
The headline document strip at the top of a financial year — mirrors the reference site's top row of links.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Doc_ID` | **PK** | Text | Yes | `PD001` |
| `Year_ID` | **FK → Financial_Years** | Text | Yes | `FY2627` |
| `Document_Name` | Link text | Text | Yes | `District PIP 2026-27` |
| `Document_Type` | PIP · RoP · Supplementary PIP · Supplementary Approval · Budget Allocation Letter · Revised Budget · Letter · Other | List | Yes | `RoP` |
| `Description` | Shown as tooltip / on Documents page | Text | No | |
| `File_URL` | **Public https:// link.** `NEEDS MANUAL INPUT` disables the link | URL | Yes | `https://drive.google.com/...` |
| `File_Type` | PDF · XLSX · DOCX · ZIP · PPTX · LINK | List | Yes | `PDF` |
| `File_Size_MB` | Displayed next to the link | Number | No | `2.4` |
| `Issue_Date` | Date on the document itself | Date | No | `2026-05-25` |
| `Upload_Date` | Date published here | Date | No | `2026-06-02` |
| `Display_Order` | Order within the year | Number | Yes | `2` |
| `Status` | Active · Inactive · Archived | List | Yes | `Active` |

---

## Sheet 5 — `Program_Categories` (5 rows)
Global master — the five flexi pools are stable across years. Year-specific allocation/guideline **files** live in `Documents`, so this sheet never needs duplicating.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Category_ID` | **PK** | Text | Yes | `CAT01` |
| `Category_Name` | Full name as printed in the RoP | Text | Yes | `RCH Flexible Pool (including RI, IPPI, NIDDCP)` |
| `Short_Name` | Used in chips, filters, file labels | Text | Yes | `RCH` |
| `Description` | Shown on the category card | Text | No | |
| `Icon` | `heart` · `shield` · `pulse` · `city` · `hospital` | Text | No | `heart` |
| `Display_Order` | Section order on the PIP page | Number | Yes | `1` |
| `Status` | Active · Inactive | List | Yes | `Active` |

---

## Sheet 6 — `Programs_FMR` (157 rows) ★ core table
One row = one FMR budget head **in one financial year**.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Program_ID` | **PK** | Text | Yes | `PRG0001` |
| `Year_ID` | **FK → Financial_Years** | Text | Yes | `FY2627` |
| `Category_ID` | **FK → Program_Categories** | Text | Yes | `CAT01` |
| `FMR_Code` | Budget head. Unique **within a year** | Text | Yes | `RCH.1` |
| `Program_Name` | FMR Details column | Text | Yes | `Maternal Health` |
| `Program_Name_HI` | Hindi name | Text | No | `मातृ स्वास्थ्य` |
| `Program_Description` | Shown on the programme detail page | Text | No | |
| `Budget_Allocation_Lakh` | District allocation in ₹ lakh | Number | No | `186.40` |
| `Budget_Guidelines` | What the head funds — free text | Text | No | |
| `Nodal_Officer` | Responsible officer / designation | Text | No | `District Programme Manager` |
| `Display_Order` | Order inside the category | Number | Yes | `1` |
| `Status` | Active · Inactive | List | Yes | `Active` |

Sample distribution: **FY2627 = 59** · **FY2526 = 49** · **FY2425 = 49** — reproducing the real year-on-year drift.

> `Budget_Allocation_Lakh` figures in the sample are **illustrative district-scale placeholders**, not published Sheikhpura allocations. Replace them from the district RoP before go-live.

---

## Sheet 7 — `Documents` (35 rows)
Central repository for everything that is *not* the year headline strip. Same column names as `PIP_Documents` so the Documents page can union both.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Document_ID` | **PK** | Text | Yes | `DOC0001` |
| `Year_ID` | **FK.** Blank = applies to all years | Text | No | `FY2627` |
| `Category_ID` | **FK.** Set for allocation/guideline files | Text | No | `CAT01` |
| `Program_ID` | **FK → Programs_FMR.** Set to attach to one FMR head | Text | No | `PRG0001` |
| `Document_Title` | Link text | Text | Yes | `RCH Budget Allocation F.Y. 2026-27` |
| `Document_Type` | Category Allocation · Category Guidelines · Programme Guideline · Format · Report · Circular · Letter · Other | List | Yes | `Category Allocation` |
| `Description` | Search-indexed | Text | No | |
| `File_URL` | Public link | URL | Yes | |
| `File_Type` | PDF · XLSX · DOCX · ZIP · PPTX · LINK | List | Yes | `PDF` |
| `File_Size_MB` | | Number | No | `1.2` |
| `Upload_Date` | | Date | No | `2026-06-02` |
| `Display_Order` | | Number | Yes | `1` |
| `Status` | | List | Yes | `Active` |
| `Is_Featured` | `Yes` surfaces it on the home page | List | No | `Yes` |

**How the PIP table finds its files:** the *Budget Allocation* column looks up `Documents` where `Year_ID` + `Category_ID` match and `Document_Type = Category Allocation`; the *Budget Guidelines* column does the same with `Category Guidelines`. This reproduces the reference site's rowspan-merged columns without any merged cells.

---

## Sheet 8 — `Home_Content` (13 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Section_Key` | **PK.** Slot the code looks for. **Never change** | Text | Yes | `hero_title` |
| `Section_Type` | hero · banner · stat · section · richtext | List | Yes | `stat` |
| `Title_EN` / `Title_HI` | Heading | Text | No | `Blocks` |
| `Subtitle` | Sub-heading | Text | No | |
| `Body_Text` | Paragraph — **for `stat` rows this holds the number** | Text | No | `6` |
| `Icon` | Icon name | Text | No | `grid` |
| `Link_URL` / `Link_Label` | Optional CTA | Text | No | `pip.html` / `View Current PIP` |
| `Display_Order` | | Number | Yes | `5` |
| `Status` | Setting `Inactive` removes the whole block | List | Yes | `Active` |

Stat tiles whose `Body_Text` is left blank are **computed live** from the data instead of read from the sheet.

---

## Sheet 9 — `Important_Links` (14 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Link_ID` | **PK** | Text | Yes | `LNK01` |
| `Link_Name` | Display text | Text | Yes | `State Health Society, Bihar` |
| `URL` | Full URL | URL | Yes | `https://shs.bihar.gov.in/` |
| `Description` | Tooltip | Text | No | |
| `Icon` | | Text | No | `external` |
| `Category` | National · State · District · Portal | List | Yes | `State` |
| `Display_Order` | | Number | Yes | `1` |
| `Status` | | List | Yes | `Active` |
| `Is_External` | Adds the new-window marker + `rel="noopener"` | List | Yes | `Yes` |
| `Show_In_Footer` | Include in the footer link wall | List | Yes | `Yes` |
| `Show_On_Home` | Include in home Quick Links | List | Yes | `Yes` |

---

## Sheet 10 — `Notices` (6 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Notice_ID` | **PK** | Text | Yes | `NOT01` |
| `Title` | | Text | Yes | |
| `Description` | | Text | No | |
| `Notice_Date` | Sort key, newest first | Date | Yes | `2026-06-05` |
| `Category` | PIP · RoP · Budget · Circular · Meeting · Recruitment · General | List | Yes | `PIP` |
| `Priority` | High · Normal · Low | List | Yes | `High` |
| `Attachment_URL` | File link | URL | No | |
| `External_URL` | Page link (used when there is no attachment) | URL | No | |
| `Is_Featured` | Shows in the home announcement strip | List | No | `Yes` |
| `Is_New` | Shows the **NEW** badge | List | No | `Yes` |
| `Status` | | List | Yes | `Active` |
| `Display_Order` | Tie-breaker within a date | Number | Yes | `1` |
| `Expiry_Date` | Auto-hides after this date. Blank = never | Date | No | `2026-08-31` |

---

## Sheet 11 — `Contact_Information` (5 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Contact_ID` | **PK** | Text | Yes | `CON01` |
| `Office_Name` | | Text | Yes | `Office of the Civil Surgeon, Sheikhpura` |
| `Designation` | | Text | No | `Civil Surgeon` |
| `Person_Name` | Leave blank if the post is vacant | Text | No | |
| `Address` | | Text | Yes | |
| `District` / `State` / `PIN` | | Text | Yes | `Sheikhpura` / `Bihar` / `811105` |
| `Phone` / `Alt_Phone` | | Text | No | |
| `Email` | | Email | No | |
| `Office_Hours` | | Text | No | |
| `Google_Maps_URL` | Renders a "Get directions" button | URL | No | |
| `Display_Order` / `Status` | | | Yes | |

Social media URLs live in `Settings` (`social_*`), not here — blank hides the icon.

---

## Sheet 12 — `Footer` (15 rows)
| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Footer_ID` | **PK** | Text | Yes | `FT02` |
| `Block_Type` | about · link · contact · legal | List | Yes | `link` |
| `Block_Title` | Column heading | Text | No | `Quick Links` |
| `Label` | Link text (`link`/`legal` rows) | Text | No | `Documents` |
| `URL` | | Text | No | `documents.html` |
| `Content_Text` | Paragraph (`about`/`contact` rows) | Text | No | |
| `Column_Number` | 1–4 = footer columns, 5 = bottom legal bar | Number | Yes | `2` |
| `Display_Order` | Order within the column | Number | Yes | `3` |
| `Status` | | List | Yes | `Active` |
| `Is_External` | | List | No | `No` |

Copyright, credit line and about text come from `Settings` so they are edited in one place.

---

## Sheet 13 — `Post_Categories` (18 rows)
Taxonomy for What's New / Events. Add a row and it appears in the composer dropdown and the public filter — no code change.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Category_ID` | **PK** | Text | Yes | `PCAT06` |
| `Category_Name` | Shown on the chip and in filters | Text | Yes | `Health Camp` |
| `Slug` | URL-safe form, reserved for future category pages | Text | Yes | `health-camp` |
| `Colour` | Hex — the chip colour on the public site | Text | Yes | `#0F7B3E` |
| `Icon` | Icon name | Text | No | `camp` |
| `Display_Order` | Order in dropdowns | Number | Yes | `6` |
| `Status` | Active · Inactive | List | Yes | `Active` |

Seeded: Health Campaign · Awareness Program · Training · Workshop · Meeting · Health Camp · Vaccination Drive · Maternal Health · Child Health · NCD · Public Health · Digital Health · BHAVYA · ABDM/ABHA · District Achievement · Government Initiative · Important Announcement · Other.

---

## Sheet 14 — `Posts` (10 rows) ★ What's New / Events / News
One row per post. Written by the admin composer — the sheet is the record, not the entry form.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Post_ID` | **PK**, auto-assigned | Text | Yes | `POST001` |
| `Slug` | **Unique.** The public URL. Auto-generated from the title | Text | Yes | `world-breastfeeding-week-2026` |
| `Title` | | Text | Yes | `World Breastfeeding Week 2026` |
| `Short_Description` | Shown on the card, max ~300 chars | Text | No | |
| `Full_Description` | Post page body. Blank line = new paragraph | Text | No | |
| `Content_Type` | `News` · `Event` · `Update` | List | Yes | `Event` |
| `Category_ID` | **FK → Post_Categories** | Text | No | `PCAT08` |
| `Featured_Image_URL` | Cover image. Set by upload; blank renders generated placeholder art | URL | No | |
| `Event_Start_Date` | Events only. **Drives Upcoming/Past** | Date | No | `2026-08-01` |
| `Event_End_Date` | Events only. Must not precede the start | Date | No | `2026-08-07` |
| `Event_Time` | Free text | Text | No | `10:00 AM` |
| `Venue` | | Text | No | `PHC Chewara` |
| `Location` | Block or district | Text | No | `Sheikhpura District` |
| `External_URL` | Related page | URL | No | |
| `Attachment_URL` | Document link | URL | No | |
| `Attachment_Name` | Display name for the attachment | Text | No | |
| `Published_Date` | Set automatically when first published | Date | No | `2026-07-25` |
| `Scheduled_Date` | **Required when Status = Scheduled.** `YYYY-MM-DD HH:MM` | Text | No | `2026-08-28 09:00` |
| `Author` | | Text | No | `District Programme Manager` |
| `Is_Featured` | `Yes` pins it above other posts | List | No | `Yes` |
| `Status` | `Draft` · `Published` · `Scheduled` · `Archived` | List | Yes | `Published` |
| `Created_Date` / `Updated_Date` | Maintained automatically | Date | No | |

**Status is the only stored visibility field, and it records intent only:**

| Status | Public? |
|---|---|
| `Draft` | never — withheld server-side, not even sent to the browser |
| `Published` | yes |
| `Scheduled` | only once `Scheduled_Date` has passed |
| `Archived` | hidden from the home page; visible in the events archive |

**Never stored, always derived:** Upcoming · Ongoing · Past (from the event dates vs today), and sort order. Nobody has to change a status when a date passes.

---

## Sheet 15 — `Post_Media` (8 rows)
Gallery images — **one row per image**, not a delimited list in one cell.

| Field | Description | Type | Required | Example |
|---|---|---|---|---|
| `Media_ID` | **PK** | Text | Yes | `PM001` |
| `Post_ID` | **FK → Posts** | Text | Yes | `POST001` |
| `Media_URL` | Drive link written by the upload | URL | Yes | |
| `Media_Type` | `image` · `document` | List | Yes | `image` |
| `Caption` | Shown under the thumbnail and in the lightbox | Text | No | `Health camp inauguration` |
| `File_Name` | Original filename, for reference | Text | No | |
| `File_Size_KB` | Size after compression | Number | No | `184` |
| `Display_Order` | Gallery order | Number | Yes | `1` |
| `Status` | Active · Inactive | List | Yes | `Active` |

Sample rows carry captions but blank `Media_URL` — real URLs appear once images are uploaded through the composer. Rows with no usable URL are skipped, so an empty gallery never renders a broken image.

---

## Sheet 16 — `_Lists` (59 rows)
Controlled vocabularies backing every dropdown. `List_Name` · `Value` · `Meaning`.
The workbook wires Excel data-validation to these ranges; after import, re-apply via **Data → Data validation** in Google Sheets (one click per column — see the setup guide).

---

## Field-level validation applied by the website

| Rule | Behaviour when violated |
|---|---|
| Missing required field | Row skipped, logged to Admin dashboard |
| Duplicate PK | First row kept, later ones skipped and flagged |
| FK points at a missing/inactive parent | Row skipped and flagged |
| Duplicate `FMR_Code` within one `Year_ID` | Second occurrence skipped and flagged |
| `File_URL` not `https://` or still `NEEDS MANUAL INPUT` | Link rendered disabled with an "unavailable" note |
| Unparseable date | Treated as blank; sorting falls back to `Display_Order` |
| Non-numeric `Display_Order` / `Budget_Allocation_Lakh` | Treated as `0` / blank |
| `Financial_Year` with no programme rows | Hidden from the year dropdown |
| ≠1 row with `Is_Current = Yes` | Falls back to the highest `Start_Year`, warns in Admin |
| Duplicate or blank `Posts.Slug` | Row skipped — slugs are public URLs and must be unique |
| `Posts.Status = Scheduled` with unreadable `Scheduled_Date` | Post stays hidden, warning raised |
| `Post_Media.Post_ID` pointing at a missing post | Image dropped, warning raised |
| `Event_End_Date` before `Event_Start_Date` | Warning raised; the start date still drives Upcoming/Past |
| Any text field | HTML-escaped on render (XSS protection) |

The site never shows a broken page because of bad sheet data — it degrades to showing less.

---

## `NEEDS MANUAL INPUT` register

| Sheet | Field | Rows | What is needed |
|---|---|---|---|
| `Settings` | `Setting_Value` | `contact_email`, `contact_phone` | Official district health email + phone |
| `PIP_Documents` | `File_URL` | all 12 | Real Drive/portal links to district PIP, RoP, letters |
| `Documents` | `File_URL` | all 35 | Real links to allocation and guideline files |
| `Contact_Information` | `Person_Name`, `Phone`, `Email` | CON01–CON04 | Names and numbers of serving officers |
| `Notices` | `Attachment_URL` | NOT03 | Meeting circular file |

These were **not invented**. Officer names, phone numbers and document URLs are verifiable facts that must come from the district office.

**Also verify before go-live:** the PIN code `811105` and the LGD district code `225` — both are plausible but should be confirmed against official records. `Budget_Allocation_Lakh` values are illustrative and must be replaced from the district RoP.

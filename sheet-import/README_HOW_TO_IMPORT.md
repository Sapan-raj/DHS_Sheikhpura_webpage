# What to change in your Google Sheet

Sheet: `1V2FbGpfVuX1Z7OhL0yEWQMs43t4QgvwQ4DSfmHEm0vs`

I cannot write to your sheet, so here is exactly what to do. **About 10 minutes.**

Four tabs are affected — one is new, three changed:

| Tab | Change | Rows |
|---|---|---|
| **`Program_Benefits`** | 🆕 **NEW TAB** — what citizens actually get | 40 |
| `Navigation` | Added a "Free Services" menu item, renumbered the rest | 10 |
| `Home_Content` | Added the `sec_benefits` home-page section | 15 |
| `_Lists` | Added the 7 `Benefit_Type` dropdown values | 66 |

---

## Option A — Replace the whole workbook (fastest, ~2 min)

Use this **if you have not made any manual edits** in Google Sheets since uploading.

1. Open your Google Sheet
2. **File → Import → Upload**
3. Drop in `Sheikhpura_Health_PIP_Website_Database.xlsx` from the project folder
4. Import location: **Replace spreadsheet**
5. Import

Everything is updated at once. **This wipes any edits you made in Sheets** — if you have made any, use Option B.

---

## Option B — Import the four tabs individually (safe, ~10 min)

### B1. Add the new `Program_Benefits` tab

1. **File → Import → Upload** → `sheet-import/Program_Benefits.csv`
2. Import location: **Insert new sheet(s)**
3. Separator type: **Comma**
4. Convert text to numbers/dates: **turn this OFF** — it would mangle `RCH.1` into a number
5. Import
6. Rename the new tab from `Program_Benefits.csv` to exactly **`Program_Benefits`**

> The tab name must match exactly, including the underscore. The code looks it up by name.

### B2. Replace `Navigation`, `Home_Content` and `_Lists`

For each of the three:

1. Open the existing tab, select all (**Ctrl+A**), **Delete**
2. Click cell **A1**
3. **File → Import → Upload** → the matching CSV
4. Import location: **Replace current sheet**
5. Convert text to numbers/dates: **OFF**
6. Import

### B3. Format the fragile columns as text

On `Program_Benefits`, select column **B (`FMR_Code`)** → **Format → Number → Plain text**.

Otherwise Sheets may read `RCH.1` as the number 1 and `NCD.10` as 10, and every benefit will silently stop matching its programme.

### B4. Re-apply the dropdowns (optional but recommended)

On `Program_Benefits`:

| Column | Rule |
|---|---|
| **H** — `Benefit_Type` | Data → Data validation → Dropdown (from a range) → `_Lists!B:B` |
| **O** — `Status` | same |

---

## Then publish

Admin dashboard → **↻ Clear cache & sync now**
or in the sheet: **PIP Portal → Clear cache**

The new "Free Services" menu item and the citizen benefits appear immediately.

---

## Verify it worked

1. Open `/benefits.html` — you should see **40 services** grouped by health area
2. Open `/pip.html` — the FMR table should show green "N free services" chips
3. Open `/program.html?fy=2026-27&fmr=RCH.1` — "What you get from this programme" with 4 cards
4. Admin dashboard → Validation — should show **0 errors**

If the benefits do not appear, the usual cause is B3: `FMR_Code` was converted to a number on import. Check that column B reads `RCH.1`, not `1`.

---

## ⚠ Before this goes live to the public

**Verify every cash amount.** Five rows carry a `(VERIFY …)` marker in the `Amount` column:

| Row | Benefit | What to confirm |
|---|---|---|
| BEN001 | Janani Suraksha Yojana | Current Bihar JSY rate, rural and urban |
| BEN006 | Nutrition Rehabilitation Centre | Mother's wage compensation rate |
| BEN014 | Sterilisation compensation | Current male and female rates |
| BEN016 | Kala-azar | Current wage compensation rate |
| BEN020 | Ni-kshay Poshan Yojana | Current monthly amount |

The figures used are the standard national / Low-Performing-State entitlements that Bihar follows, but state rates are revised periodically and **you know the current Sheikhpura position better than any external source**.

The `(VERIFY …)` text is **hidden from the public page** — citizens never see it. It appears only as a warning on your Admin dashboard, so it works as a checklist. Delete the `(VERIFY …)` part from the cell once you have confirmed each figure and the warning disappears.

Everything else — service names, eligibility, where to go, what to carry, helplines — is standard NHM entitlement information and does not carry a marker. Still worth a read-through by the DPMU before launch.

---

## Adding your own benefits later

One row in `Program_Benefits`:

| Column | What to put |
|---|---|
| `Benefit_ID` | Next free ID, e.g. `BEN041` |
| `FMR_Code` | The programme it belongs to, e.g. `NCD.5` — must exist in `Programs_FMR` |
| `Year_ID` | **Leave blank** so it shows in every year. Fill it only for a one-year scheme |
| `Benefit_Title` | Plain language. "Free cataract surgery", not "NPCB+VI service delivery" |
| `Benefit_Title_HI` | Hindi — most citizens read this first |
| `Benefit_Description` | Two or three sentences. What it is, why it matters |
| `Benefit_Type` | Pick from the dropdown |
| `Amount` | `Free` or the rupee figure. Start with `Free` and it renders with a green tick |
| `Who_Is_Eligible` | Write it as the citizen would ask: "Pregnant women", "Anyone above 30" |
| `Where_To_Avail` | Name real places — "PHC Chewara", not "designated facility" |
| `Documents_Required` | Or `None` |
| `Helpline` | `104`, or `102 / 108` for multiple |
| `Display_Order` | Order within that programme |
| `Status` | `Active` |

It appears on the Free Services page, the programme page and the PIP table chip after the next sync. No code change.

# Updating your Google Sheet — remove the financial plan

**Why:** the District Magistrate has directed that the district's financial plan must not
be public. The portal is now built entirely around what residents can use.

**Sheet:** `1V2FbGpfVuX1Z7OhL0yEWQMs43t4QgvwQ4DSfmHEm0vs`

---

## ⚠️ FIRST — back up, before you change anything

**File → Make a copy** → name it `PIP Data Archive — pre-Aug-2026`.

You are about to permanently delete the budget figures, the PIP/RoP document records
and the 30 allocation/guideline file records. **Your district may still need those
internally** even though the public should not see them. Once they are gone from the
live sheet they are gone.

---

## What changes

| Tab | Change |
|---|---|
| **`PIP_Documents`** | 🔴 **DELETE THE WHOLE TAB** — PIP, RoP, budget letters, supplementary approvals |
| `Programs_FMR` | 🔴 Two columns removed: `Budget_Allocation_Lakh`, `Budget_Guidelines`. 157 rows stay |
| `Documents` | 🔴 35 rows → **5**. The 30 Category Allocation / Category Guidelines rows are gone |
| `Navigation` | PIP and Programmes replaced by Free Services, Health Programmes, Events & News |
| `Home_Content` | PIP stat tiles and sections replaced with citizen ones |
| `Notices` | The 4 PIP/budget notices replaced with 5 citizen service notices |
| `Settings` | Subtitle is now "Health Services for the People of Sheikhpura" |
| `_Lists` | Financial document types and notice categories removed |
| `Program_Benefits` | **Unchanged** — all 40 citizen entitlements intact |

---

## Easiest: replace the whole workbook (2 minutes)

1. **File → Make a copy** (the backup above) — do not skip this
2. **File → Import → Upload** → `Sheikhpura_Health_PIP_Website_Database.xlsx`
3. Import location: **Replace spreadsheet**
4. Import
5. Delete the leftover `PIP_Documents` tab if the import leaves it behind — right-click the tab → Delete

Then re-do the two formatting steps that never survive an import:

- `Programs_FMR` column **D (`FMR_Code`)** → **Format → Number → Plain text**
- `Program_Benefits` column **B (`FMR_Code`)** → **Format → Number → Plain text**

> If `FMR_Code` is read as a number, `RCH.1` becomes `1` and every benefit silently
> stops matching its programme.

---

## Or tab by tab

CSVs for every tab are in this folder. For each changed tab: select all (**Ctrl+A**),
Delete, click **A1**, then **File → Import → Upload** → the CSV → **Replace current
sheet** → **Convert text to numbers: OFF**.

Then **right-click the `PIP_Documents` tab → Delete**.

---

## Then publish

Admin → **↻ Clear cache & sync now**, or in the sheet: **PIP Portal → Clear cache**.

---

## Belt and braces: the code strips it too

Even if an old sheet is restored by accident, `publicView()` in `Code.gs` removes
`Budget_Allocation_Lakh`, `Budget_Guidelines`, every `PIP_Documents` row and every
Category Allocation / Guidelines document before anything reaches a browser.

So the financial data is removed in **two independent places** — the sheet and the API.
You would have to undo both for it to become public again.

**To activate that server-side guard you must update the Apps Script:**

1. Apps Script editor → select all in `Code.gs` → paste the new version from
   [`apps-script/Code.gs`](../apps-script/Code.gs)
2. **Ctrl+S**
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**

> **Manage deployments**, not *New deployment* — the latter mints a different URL.

---

## What the public sees now

```
Home → Free Services → Health Programmes → Events & News → Notices → Documents → Contact
```

- **40 free services** — what you get, who qualifies, where to go, what to carry, who to call
- **24 health programmes** — only those that actually give a resident something.
  The 35 purely administrative heads (programme management, technical assistance,
  untied grants) no longer appear anywhere public
- **No budget figures, no FMR codes, no PIP or RoP documents, anywhere**

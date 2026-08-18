# Deliverable 8 — Setup & Operations Guide

Written for a non-developer. Follow it top to bottom once; after that only Part C is needed.

---

# PART A — Get it running (one time, ~30 minutes)

## A1. Look at it locally first

```bash
cd "C:\Users\sapan\OneDrive\Desktop\District Work\Sheikhpura_PIP_Portal"
```

```bash
python -m http.server 8791
```

Open <http://localhost:8791>. The portal runs immediately from the bundled snapshot — no Google account needed. Use this to review the design before connecting anything.

> Opening `index.html` by double-clicking will **not** work: browsers block `fetch()` on `file://`. The site must be served over HTTP.

## A2. Create the Google Sheet
Follow `04_Google_Sheets_Integration.md` §2, steps 1–4. In short: upload the `.xlsx`, save as Google Sheets, set sharing to **Restricted**, format the ID/date/FMR columns as **Plain text**, set locale to India, re-apply the dropdowns from `_Lists`.

## A3. Install the script
Sheet → **Extensions → Apps Script** → paste all of `apps-script/Code.gs` → Save.

## A4. Set the admin password
1. Edit `setupCredentials()`: set `USERNAME` and a strong `PASSWORD` (min 12 chars — the line ships blank because this is a public repo)
2. Run `setupCredentials` once → authorise
3. **Delete the password from the code** and save

## A5. Deploy
**Deploy → New deployment → ⚙ → Web app** · Execute as **Me** · Access **Anyone** → Deploy → copy the `/exec` URL.

## A6. Connect
`assets/js/config.js`:
```javascript
API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
```
Reload. Admin dashboard → *Data source* should read **Google Sheets via Apps Script**.

## A7. Publish the website

| Host | How | Cost |
|---|---|---|
| **GitHub Pages** | push the folder → Settings → Pages → branch `main` | free |
| **Netlify Drop** | drag the folder onto <https://app.netlify.com/drop> | free |
| **NIC / district server** | copy the folder into the web root | — |
| **Google Sites** | not suitable — cannot run this JavaScript | — |

Any static host works: there is no backend, no build step and no dependencies.

---

# PART B — Fill in the real content

The workbook ships with realistic **sample** data. Cells reading `NEEDS MANUAL INPUT` (red) are placeholders — the website hides or disables anything still marked that way.

| Sheet | Field | What is needed |
|---|---|---|
| `Settings` | `contact_email`, `contact_phone` | official district health email and phone |
| `PIP_Documents` | `File_URL` (12 rows) | Drive links to the district PIP, RoP and letters |
| `Documents` | `File_URL` (35 rows) | Drive links to allocation and guideline files |
| `Contact_Information` | `Person_Name`, `Phone`, `Email` | names and numbers of serving officers |
| `Notices` | `Attachment_URL` (NOT03) | meeting circular |

**Also verify before go-live:** PIN code `811105`, LGD district code `225`, and every `Budget_Allocation_Lakh` figure — the sample allocations are illustrative placeholders and must be replaced from the district RoP.

---

# PART C — Day-to-day operations

Everything below is done in the Google Sheet. **No code is ever edited.**

### Add a notice
`Notices` → new row → `Notice_ID` (next free, e.g. `NOT07`), `Title`, `Description`, `Notice_Date` (`YYYY-MM-DD`), `Category`, `Priority`, `Status = Active`, `Display_Order`.
Set `Is_Featured = Yes` to put it in the home-page announcement strip. `Expiry_Date` auto-hides it.

### Publish a document
1. Upload the file to the district Drive folder
2. **Share → Anyone with the link → Viewer** → Copy link
3. `Documents` → new row → `Document_ID`, `Document_Title`, `Document_Type`, paste the link into `File_URL`, `File_Type`, `Status = Active`
4. Set `Year_ID` / `Category_ID` / `Program_ID` to attach it to a year, a flexi pool or one FMR head

For a headline PIP/RoP/letter that belongs in the strip at the top of a financial year, use **`PIP_Documents`** instead.

### Add a programme (FMR budget head)
`Programs_FMR` → new row → `Program_ID`, the right `Year_ID` **and** `Category_ID`, `FMR_Code`, `Program_Name`, `Budget_Allocation_Lakh`, `Budget_Guidelines`, `Display_Order`, `Status = Active`.
It appears in the correct pool on the PIP page immediately after a sync.

### Open a new financial year
1. `Financial_Years` → new row (`FY2728`, `2027-28`, `F.Y. 2027-2028`, `2027`, `2028`, `Is_Current = Yes`, `Active`, `Display_Order = 1`)
2. Set the previous year's `Is_Current` to **No** (exactly one row may be `Yes`)
3. `Programs_FMR` → copy last year's block → paste below → change `Year_ID` to `FY2728` → add/remove FMR codes per the new RoP → give each a new `Program_ID`
4. `Settings` → `current_financial_year` → `2027-28`
5. Add the year's documents

That is the entire annual rollover. The reference site requires copying and hand-editing a 64 KB PHP file.

### Change home page text
`Home_Content` → edit `Title_EN`, `Subtitle` or `Body_Text` against the matching `Section_Key`.
Leave a `stat` row's `Body_Text` **blank** and the website counts it live; type a number to override.

### Change contact details
`Contact_Information` for the office cards; `Settings` (`contact_*`, `office_address`) for the header and footer.

### Publish an event or news post — **use the Admin Panel, not the Sheet**
**Admin → Posts & Events → ＋ Create New Post.** Type a title and description, add photos straight from the computer or phone, choose News/Event/Update, add the date and venue, Preview, then Publish.

- **Save as draft** — keeps it private until you come back to it
- **Publish** — live immediately
- **Schedule** — set `Status = Scheduled` and pick a date and time; the post appears on its own
- **Manage Posts** — filter by type, status or category; View, Edit, Publish/Unpublish, Archive, Delete

You never need to touch the `Posts` sheet by hand. Upcoming vs past is worked out from the event date, so no status needs changing when a date goes by.

### Add or edit a citizen benefit
`Program_Benefits` → new row. Link it to a programme with `FMR_Code` (e.g. `NCD.5`), leave `Year_ID` blank so it applies to every year, and write it for a resident — what they get, who qualifies, where to go, what to carry, which helpline. It appears on the Free Services page, the programme page and as a chip in the PIP table after the next sync.

### Add an event category
`Post_Categories` → new row → `Category_ID`, `Category_Name`, `Slug`, `Colour` (hex), `Display_Order`, `Status = Active`. It appears in the composer dropdown and the public filter straight away.

### Change the menu
`Navigation` → add a row → `Menu_ID`, `Menu_Label_EN`, `URL`, `Display_Order`, `Is_Active = Yes`, `Link_Type`.
Fill `Parent_Menu_ID` with another row's `Menu_ID` to make it a dropdown item.

### Hide something
Set `Status` to `Inactive`. **Never delete a row** — deleting breaks the ID links other sheets depend on.

### Publish changes immediately
Admin dashboard → **↻ Clear cache & sync now**, or in the Sheet: **PIP Portal → Clear cache**.
Otherwise changes appear within `Settings.cache_minutes` (default 30).

---

# PART D — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Showing the last published snapshot" banner | API unreachable or slow | check the `/exec` URL; open `?action=status` directly |
| Edits not appearing | cache still warm | **Clear cache & sync now** |
| A row is missing from the site | validation dropped it | Admin dashboard → Validation → red **ERROR** shows sheet, row and reason |
| Download button says "Not yet published" | `File_URL` blank, still `NEEDS MANUAL INPUT`, or not `https://` | paste a real share link |
| A financial year is missing from the dropdown | that year has no programme rows **and** no documents | add rows with the matching `Year_ID` |
| `FMR_Code` shows as a date or number | column not formatted as text | select column → **Format → Number → Plain text**, re-enter the value |
| Dates sort oddly | locale mismatch | **File → Settings → Locale = India**; keep dates as `YYYY-MM-DD` plain text |
| Login says "credentials not configured" | `setupCredentials()` never ran | run it once from the Apps Script editor |
| Locked out after failed logins | 5-attempt lockout | wait 15 minutes, or run `changePassword('...')` |
| Site works locally, not when hosted | `file://` or mixed content | serve over HTTP/HTTPS; the API is HTTPS-only |
| Changes to `Code.gs` have no effect | new code not deployed | **Manage deployments → ✏️ → New version → Deploy** (not *New deployment* — that changes the URL) |
| Everything broke after an edit | header row renamed | undo (**Ctrl+Z**) or **File → Version history** |
| Composer says "Local preview mode" | `API_URL` not set | posts can only be saved once the Apps Script service is connected |
| Photo upload rejected | not JPG/PNG/WebP, or over 5 MB after compression | use a normal photo; renamed files are rejected on their signature |
| A scheduled post has not appeared | cache still warm | **Clear cache & sync now**; it goes live within the cache window otherwise |
| Draft visible to the public | it is not — drafts are filtered server-side and never sent to the browser | verify with `?action=data` — drafts are absent |
| Event still shows "Upcoming" after the date | cached data | sync; the label is computed from the date at render time |
| Post page says "Post not found" | slug changed, or the post was unpublished/archived | check the slug in **Manage Posts** |

---

# PART E — Regenerating the offline snapshot

`assets/data/portal-data.json` is the fallback the site uses when the API is unavailable. It is **generated, never hand-edited**.

```bash
python export_json.py
```

Reads `Sheikhpura_Health_PIP_Website_Database.xlsx` and rewrites the JSON in the exact shape the Apps Script API returns. To refresh it from live content: **File → Download → Microsoft Excel (.xlsx)** from Google Sheets, replace the local workbook, re-run the command.

To regenerate the workbook itself from scratch:

```bash
python build_database.py
```

This rebuilds all 13 sheets with sample data and runs the integrity checks (unique IDs, valid foreign keys, no duplicate FMR code within a year, exactly one current year). It **overwrites** the workbook — do not run it against a file holding real district content.

---

# PART F — Pre-launch checklist

**Data**
- [ ] Every `NEEDS MANUAL INPUT` replaced
- [ ] `Budget_Allocation_Lakh` figures replaced from the district RoP
- [ ] PIN code and LGD district code verified
- [ ] Every `File_URL` opens, and opens for a signed-out user
- [ ] `current_financial_year` matches a real `Financial_Year`
- [ ] Exactly one `Financial_Years` row has `Is_Current = Yes`
- [ ] Admin dashboard shows **0 rows skipped**

**Security**
- [ ] Sheet sharing is **Restricted**
- [ ] Password literal deleted from `Code.gs`
- [ ] Password is strong and not shared over chat or email
- [ ] Deployment is Execute as **Me** / Access **Anyone**

**Events module**
- [ ] Created a test post through the Admin Panel and confirmed it appears under What's New
- [ ] Uploaded a photo from a phone and checked it renders on the card and detail page
- [ ] Scheduled a post a few minutes ahead and confirmed it appeared on its own
- [ ] Confirmed drafts are absent from `<EXEC_URL>?action=data`
- [ ] Drive folder **Sheikhpura PIP Portal — Media** exists and the folder itself is *not* shared

**Site**
- [ ] Every page loads with no console errors
- [ ] Year dropdown reaches real content for **every** listed year
- [ ] Search returns results on the PIP and Documents pages
- [ ] Tested on a real phone
- [ ] Dark mode and A+/A− work and persist
- [ ] Hosted over **HTTPS**

**Handover**
- [ ] District admin has walked through Part C once, unaided
- [ ] Password stored in the office password register
- [ ] Backup routine agreed (`04_Google_Sheets_Integration.md` §7)

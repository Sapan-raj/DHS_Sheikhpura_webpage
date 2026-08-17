# Deliverable 9 — Media Storage Architecture
## What's New / Events module

## 1. The decision

**Google Drive, written by the Apps Script Web App.**

```
Admin's phone or PC
   │  ① pick a photo
   ▼
Browser  ── downscale to ≤1600px, re-encode, ~250 KB ──┐
   │                                                    │  nothing uploaded yet
   │  ② POST base64 + session token                     │
   ▼                                                    │
Apps Script  ── validate MIME · check magic bytes ──────┘
   │            enforce 5 MB · sanitise filename
   │  ③ write to Drive as the sheet owner
   ▼
Google Drive folder  "Sheikhpura PIP Portal — Media"   (link-viewable, per file)
   │
   │  ④ returns https://drive.google.com/thumbnail?id=…&sz=w1600
   ▼
Google Sheet  ← stores the URL and metadata only, never the image bytes
   │
   ▼
Public website  <img src="…">   served by Google's CDN
```

## 2. Why, against the alternatives

| | **Drive + Apps Script** | Cloudinary | Firebase Storage | Supabase Storage |
|---|---|---|---|---|
| Credential in frontend JS | **none** | upload preset or signed-request endpoint | `firebaseConfig` incl. API key | project URL + anon key |
| New vendor account | **no** | yes | yes | yes |
| New billing relationship | **no** | free tier, then card | **Blaze plan required** | free tier, then card |
| Free storage | 15 GB (shared with Gmail/Drive) | 25 GB | 5 GB on Blaze | 1 GB |
| Reuses the existing auth | **yes — same session token** | no | no | no |
| Same place as the PIP documents | **yes** | no | no | no |
| One backup routine | **yes** | no | no | no |
| Automatic format optimisation | no | **yes (WebP/AVIF)** | no | no |
| True image CDN with transforms | no | **yes** | partial | partial |
| Admin can see the files without a developer | **yes, in Drive** | needs a Cloudinary login | needs console access | needs console access |

### Why Drive wins here

**§15 of the brief is decisive:** *"Do not expose storage credentials or API keys in frontend JavaScript."* Drive-via-Apps-Script is the **only** option on that table where the browser holds no storage credential at all. The script already runs as the spreadsheet owner; uploading is just another authenticated action on the session token that already exists. Cloudinary needs an unsigned preset (which lets anyone who reads your JS upload to your account) or a signing endpoint (which is Apps Script again, so you have added a vendor for nothing). Firebase and Supabase both put a project key in the client by design.

**Operational fit.** The PIP documents already live in Drive per `04_Google_Sheets_Integration.md` §5. Putting event photos anywhere else would give the district office two media systems, two sharing models and two backup routines to remember. A District Programme Manager can open Drive and see the photos; they cannot be expected to log into a Cloudinary console.

**Capacity is not the constraint.** At ~250 KB per processed image, 15 GB holds roughly **60,000 photos**. A district portal publishing 5 events a month with 6 photos each uses about 90 MB a year.

### The real objection, and how it is answered

Drive is not an image CDN, and un-processed phone photos (4–8 MB) would make this slow and wasteful. **So the images are processed before they are ever uploaded**, in the browser:

- longest edge capped at **1600 px**
- re-encoded at **quality 0.82**
- PNG kept **only if the image actually uses transparency** — an opaque PNG screenshot re-encodes to JPEG instead

Measured on the real pipeline:

| Input | Output | Saving |
|---|---|---|
| 4000×3000 JPEG, 1004 KB | 1600×1200 JPEG, **162 KB** | 84% |
| 2400×1200 opaque PNG, 1904 KB | 1600×800 JPEG, **219 KB** | 88% |
| 1200×600 PNG **with transparency** | stays PNG, 44 KB | preserved |
| 3200×2400 JPEG | **101 KB** | ~90% |

This is what makes both Drive storage *and* mobile uploading over a district connection practical. It is also why the 5 MB server-side cap is generous rather than restrictive — real uploads land two orders of magnitude below it.

Delivery uses `https://drive.google.com/thumbnail?id=<id>&sz=w1600`, which is served from Google's CDN and embeds directly in `<img>`.

### When to move to Cloudinary

Switch if the portal ever needs automatic WebP/AVIF negotiation, per-device responsive variants, or serves image traffic heavy enough that Drive latency shows. The migration is contained: `mediaUpload()` in `Code.gs` is the only function that writes files, and the Sheet stores plain URLs, so existing posts keep working while new uploads go elsewhere.

---

## 3. Security controls

Every upload is authenticated **and** validated. The checks are server-side; the client-side ones are convenience, not protection.

| Control | Where | What it does |
|---|---|---|
| Session required | `doPost` → `requireAuth(token)` | `mediaUpload` throws before touching Drive without a valid HMAC token |
| MIME allow-list | `ALLOWED_IMAGE_MIME` / `ALLOWED_DOC_MIME` | only JPG, PNG, WebP, PDF, XLSX, DOCX, PPTX |
| **Magic-byte check** | `magicBytesMatch()` | reads the file signature — `evil.exe` renamed to `photo.jpg` is rejected |
| Extension from allow-list | `safeName()` | the extension comes from **our** table, never from the supplied filename |
| Filename sanitisation | `safeName()` | strips path separators, `..`, control characters, leading dots and double extensions; appends a UUID |
| Size cap | `MAX_UPLOAD_BYTES` = 5 MB | checked after base64 decode, on real byte length |
| Empty/truncated guard | `mediaUpload()` | rejects payloads under 64 bytes |
| Per-file sharing | `setSharing(ANYONE_WITH_LINK, VIEW)` | only files the admin uploaded become viewable — the folder itself is not shared |
| Write lock | `LockService` | two admins saving at once cannot interleave rows |
| No credential in the client | by construction | `composer.js` contains no key, no bucket name, no folder ID |

Verified by test: a `.exe` was rejected on MIME, and the same bytes renamed `evil.jpg` with a forged `image/jpeg` type were rejected on signature.

### Residual risks

1. **An authenticated admin can upload anything the allow-list permits.** That is the intended trust boundary — the admin is trusted; the internet is not.
2. **Files stay in Drive after a post is deleted.** Deliberate: deleting a row should not silently destroy a photo that may be referenced elsewhere. Clean up in Drive manually.
3. **Drive links are unguessable but not access-controlled.** Anyone with the URL can view the image — appropriate for photos published on a public website, and the same model the PIP documents already use. Never put anything confidential through this path.

---

## 4. Data model

Three sheets, fully relational. Gallery images are **one row per image** — not a delimited list crammed into a cell.

```
Post_Categories (Category_ID) ──→ Posts (Category_ID)
                                    │ Post_ID
                                    ▼
                                  Post_Media (Post_ID)   one row per photo
```

**`Posts`** — 23 columns. `Featured_Image_URL` holds the single cover; everything else about scheduling and events lives here.

**`Post_Media`** — `Media_ID`, `Post_ID`, `Media_URL`, `Media_Type`, `Caption`, `File_Name`, `File_Size_KB`, `Display_Order`, `Status`.

**`Post_Categories`** — 18 seeded categories, each with a `Colour` used for the chip on the public site. The admin can add rows freely; new categories appear in the composer dropdown and the events filter without any code change.

### Derived, never stored

| Concept | How it is computed | Why not a column |
|---|---|---|
| **Upcoming / Ongoing / Past** | `Event_Start_Date` and `Event_End_Date` vs today | §9 of the brief: nobody should have to remember to flip a status when a date passes |
| **Live or hidden** | `Status`, plus `Scheduled_Date` vs now | a "visible?" column would drift out of step with the clock |
| **Sort position** | event date for events, publish date for news; upcoming first, then featured | a manual order column goes stale immediately |

`Status` therefore only ever records *intent* — Draft, Published, Scheduled, Archived. Everything time-dependent is calculated at render.

---

## 5. Scheduled publishing

No cron job, no trigger, nothing to keep running.

- The admin sets `Status = Scheduled` and a `Scheduled_Date` such as `2026-08-28 09:00`
- `publicView()` in `Code.gs` filters scheduled posts whose moment has not arrived **out of the public API response**
- `export_json.py` applies the identical rule when generating the offline snapshot
- Once the time passes, the same filter starts letting it through — it appears on its own

**This matters:** the filter is applied on the *server*, not in the browser. A draft or an unreleased scheduled post is never sent to the client at all, so it cannot be read out of the network tab. Verified: the public payload contains 8 posts; the draft and the not-yet-due scheduled post are withheld, and `export_json.py` reports which ones it held back.

The one cost of having no scheduler is that a scheduled post goes live when the **cache next expires** (up to 6 hours server-side, 30 minutes browser-side) rather than to the minute. For district announcements that is acceptable; if it ever matters, click **Clear cache & sync now**.

---

## 6. URL structure

Canonical route: `event.html?slug=world-breastfeeding-week-2026`

Slugs are generated from the title, forced URL-safe, and made unique by the server (`-2`, `-3`, …) so two posts can never collide. Slug uniqueness is enforced in three places — the workbook integrity check, `crossValidate()` in Apps Script, and `normalise()` in the browser.

Static hosting cannot rewrite `/events/<slug>` without a server rule. To get the prettier form:

**Netlify** — add a `_redirects` file:
```
/events/:slug  /event.html?slug=:slug  200
```

**Apache** — add to `.htaccess`:
```
RewriteEngine On
RewriteRule ^events/([a-z0-9-]+)/?$ event.html?slug=$1 [L,QSA]
```

Both are optional; nothing depends on them.

---

## 7. Admin workflow

```
Login → Dashboard → Posts & Events → ＋ Create New Post
   → type a title and description
   → Add cover photo        (file picker; on a phone this offers the camera)
   → Add more photos        (multi-select, up to 12, each captionable)
   → News / Event / Update  (event date, time and venue appear only for Event)
   → pick a category
   → Preview                (renders the real card with the real photo)
   → Save as draft  |  Publish  |  Schedule
   → appears under What's New on the home page
```

The composer works identically on a phone: the form stacks to one column, the file picker offers Camera or Photo Library, and every control meets the 24×24 px minimum. Compression happens on the device, so a 4 MB camera photo uploads as ~250 KB.

**Manage Posts** gives a filterable table (type, status, category, free text) with View, Edit, Publish/Unpublish, Archive and Delete on each row.

---

## 8. What the district administrator never has to do

- host an image anywhere and paste a URL
- know what a slug, a MIME type or base64 is
- resize or compress a photo before uploading
- edit the Google Sheet by hand to publish a post
- change a status when an event date passes
- touch HTML, CSS, JavaScript or the Apps Script code

Adding a category is the one task that still means opening the Sheet: add a row to `Post_Categories`, and it appears in the composer dropdown and the public filter immediately.

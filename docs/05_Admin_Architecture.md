# Deliverable 6 — Admin Architecture & Security

## The requirement

> Admin login, but the Google Sheet must **not** be publicly editable, and no API key or service-account credential may appear in frontend JavaScript.

## The flow

```
Browser (admin.html)                Apps Script Web App              Google Sheet
        │                            (runs as owner)                  (PRIVATE)
        │                                   │                              │
   1 ── POST {action:'login',               │                              │
        username, password} ───────────────►│                              │
        │                                   │ SHA-256(salt+password)       │
        │                                   │ vs ADMIN_HASH in             │
        │                                   │ Script Properties            │
        │                                   │                              │
   2 ◄── {token, expires} ──────────────────│  token = base64(user|exp)    │
        │                                   │        + "." + HMAC-SHA256   │
        │  sessionStorage                   │                              │
        │                                   │                              │
   3 ── POST {action:'refresh', token} ────►│                              │
        │                                   │ verify HMAC + expiry ───────►│ read
        │                                   │ clear cache, rebuild ◄───────│
   4 ◄── {ok, counts, validation} ──────────│                              │
```

**Nothing secret ever leaves the server.** `admin.html` contains no password, no hash, no API key, no service-account JSON, and not even the Sheet ID. Open its source and the most sensitive string is the public `/exec` URL.

---

## Where secrets live

Script Properties (Apps Script → ⚙ Project Settings → Script Properties) — server-side, not in the code file, not in version control:

| Property | Contents |
|---|---|
| `ADMIN_USER` | username |
| `ADMIN_SALT` | random UUID, regenerated on every password change |
| `ADMIN_HASH` | `SHA-256(salt + password)` — the password itself is never stored |
| `TOKEN_SECRET` | two concatenated UUIDs, used to sign session tokens |

`setupCredentials()` writes these once, then the plaintext password is deleted from the code.

---

## Session tokens

```
token = base64UrlEncode("admin|1789000000000") + "." + HMAC_SHA256(payload, TOKEN_SECRET)
```

- **Stateless** — no session table to maintain
- **Tamper-evident** — editing the username or the expiry invalidates the signature
- **Time-limited** — 8 hours, checked server-side on every privileged call
- **Revocable** — logout writes the token's hash to a deny-list in `CacheService` for the remainder of its life
- **Stored in `sessionStorage`**, not `localStorage` or a cookie — it dies with the tab and is never sent automatically, so CSRF does not apply

Every privileged endpoint calls `requireAuth(token)` and throws before touching the Sheet.

---

## Brute-force resistance

| Control | Implementation |
|---|---|
| Attempt limit | 5 failures per username → locked 15 minutes (`CacheService`) |
| Timing friction | `Utilities.sleep(600)` on every failed attempt |
| Uniform errors | wrong username and wrong password return the identical message — no account enumeration |
| No enumeration surface | there is no signup, no password-reset and no user list |

Apps Script does not expose the client IP, so throttling is per-username. For a single-administrator district portal that is the right granularity.

---

## What the admin area does

| Feature | Status |
|---|---|
| Login / logout / session expiry | ✅ |
| Record counts per sheet | ✅ |
| Data source + whether the response came from cache | ✅ |
| Sheet name and last-edited timestamp (live from Drive) | ✅ |
| **Clear cache & sync now** — publish edits immediately | ✅ |
| Deep link to the Google Sheet (only after authentication) | ✅ |
| Validation report — every skipped row and every warning, with sheet name, row/ID and reason | ✅ |
| Inline how-to for the common content tasks | ✅ |
| **Manage Grievances** — filterable table of every complaint/suggestion, with status/priority/resolution-note editing | ✅ |

## What it deliberately does not do

Editing happens **in Google Sheets**, not in a custom form.

Reasons: Sheets already provides multi-user editing, unlimited version history, comments, offline mode, mobile apps, dropdown validation and undo — every one of which a hand-built CRUD form would have to reimplement worse. It is also the tool district staff already use daily. Building an editing UI would add a large attack surface and a training burden to replace something that already works.

The admin area is therefore a **control panel**: authenticate, inspect health, publish changes, jump to the Sheet.

---

## Threat model

| Threat | Mitigation |
|---|---|
| Attacker reads the Google Sheet directly | Sheet is Restricted; only Apps Script (as owner) can read it |
| Credentials harvested from page source | none exist there |
| Password brute-forced | lockout + delay + hashing with a per-password salt |
| Token forged or extended | HMAC-SHA256 signature over the payload |
| Stolen token replayed forever | 8-hour expiry + logout deny-list |
| XSS stealing the token | every rendered value is HTML-escaped; verified by injecting `<img onerror=…>` through the data layer and confirming zero elements were created |
| Malicious link in a document row | `validUrl()` accepts only `http(s)` and internal `.html` — `javascript:` and `data:` are rejected |
| CSRF | token is read from `sessionStorage` and sent explicitly; never auto-attached |
| Tab-jacking on external links | `rel="noopener noreferrer"` on every external link |
| Admin page indexed by search engines | `<meta name="robots" content="noindex, nofollow">` |
| Man-in-the-middle | Apps Script is HTTPS-only; host the frontend over HTTPS too |
| A bad sheet row breaks the site | validated server-side **and** client-side; bad rows are dropped and reported, never rendered |
| Grievance data (names, phones, complaints) reaching a browser | `Grievances` is never a `SHEET_MAP` key — absent from `getData()`, the cache and `?action=data` by construction, not by filtering. See below |
| Bot-spammed complaint form | silent honeypot field + minimum-fill-time check; a bot receives an indistinguishable fake success, never an error |
| Enumerating other citizens' complaints | status lookup requires reference ID **and** phone to match; identical generic response for either being wrong |

### Residual risks — stated plainly

1. **Single shared administrator account.** Adequate for one district office; there is no per-user audit trail. If several people need access, add a `Users` sheet with per-user salted hashes and a role column — the token payload already carries a username field for exactly this.
2. **Apps Script has no IP-level rate limiting.** Read endpoints are public by design (the content is public), so the exposure is load, not disclosure. Google's own quotas provide the backstop. The one write endpoint that is also public, `grievanceSubmit`, inherits the same limitation — it relies on the honeypot/timing checks below rather than a rate limit, since Apps Script exposes no caller IP to rate-limit against.
3. **`sessionStorage` is readable by same-origin JavaScript.** Mitigated by escaping every rendered value; a stored-XSS bug would still be serious, which is why escaping is centralised in one function rather than scattered.
4. **Local-preview mode does not enforce sign-in.** When `API_URL` is empty there is no service to authenticate against and the data is a public JSON file, so there is nothing to protect. The dashboard says so explicitly. It is not a production configuration.
5. **`grievanceStatusLookup` has no attempt limit.** Unlike `login`, repeated lookup attempts aren't locked out — accepted because the ID space is sequential (an attacker still needs the correct phone number for a given ID, and the data returned per lookup is limited to status and a resolution note, never the complaint itself). Proportionate to the risk today; revisit if abuse is observed.

---

## Grievances — a public write endpoint, held to the same standard

Everything above secures the *admin* side. `grievanceSubmit` and `grievanceStatusLookup` are
different in kind — the site's only actions an unauthenticated visitor can call to change or read
something that isn't already fully public — so they get their own model rather than reusing
`requireAuth`.

**Writing without a login, safely.** `grievanceSubmit` never calls `requireAuth()` — a citizen
filing a complaint has no account. In its place: a hidden honeypot field (real visitors never see
or fill it) and a minimum-fill-time check (a submission faster than 4 seconds after the form
rendered is almost certainly scripted, not typed). Either one silently returns a normal-looking
success — a reference ID in a reserved numeric band that can never collide with a real one — but
writes nothing. The distinction from the admin lockout above is deliberate: locking out a
*bot* and telling it so just teaches it to slow down; a fake success gives it nothing to learn
from.

**Reading without a login, narrowly.** `grievanceStatusLookup` requires both the reference ID and
the submitting phone number to match one row — the same "identical error either way" principle as
`login`'s uniform failure message, applied to prevent someone from fishing for the status of a
complaint that isn't theirs. The response is a narrow, fixed shape: status, resolution note, two
dates. Never the name, phone, description, priority, or the admin's internal notes — those exist
only in the response `grievanceListAll()` returns to an authenticated caller.

**Why this can be looser than a login endpoint.** The asymmetry is intentional: a compromised
admin session can rewrite anything on the site, so login gets a lockout, a delay and a signed
token. A worst-case abuse of `grievanceSubmit` writes junk rows an admin discards during weekly
review; a worst-case abuse of `grievanceStatusLookup` (with a guessed phone number) reveals a
status and a sentence of resolution text, nothing more. The controls are proportionate to what's
actually at stake on each side.

---

## Operating rules for the district office

1. Use a **strong, unique** password — this account is the write path to the portal's content.
2. Change it with `changePassword('newPassword')` from the Apps Script editor (it re-salts and re-hashes), then clear the argument from the file.
3. Add editors to the **Sheet** individually; never set link-sharing.
4. Never paste the `/exec` URL into a public page or document that suggests it is an admin endpoint.
5. Review the Admin dashboard's validation report after any bulk edit — a red **ERROR** means that row is not on the website.
6. When staff change, change the password and remove their Sheet access the same day.

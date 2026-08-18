/**
 * Sheikhpura District Health PIP Portal — Data & Admin API
 * Google Apps Script Web App bound to the master Google Sheet.
 *
 * The Sheet is NEVER shared publicly. This script runs as the owner
 * ("Execute as: Me") and is the only thing that can read it. The public
 * gets read-only JSON; writes require an authenticated admin session.
 *
 * SETUP — run setupCredentials() ONCE from the editor, then deploy:
 *   Deploy > New deployment > Web app
 *     Execute as:      Me
 *     Who has access:  Anyone
 *
 * Endpoints
 *   GET  ?action=data                 full dataset (cached)
 *   GET  ?action=status               row counts, last update, cache age
 *   GET  ?action=validate             validation report only
 *   POST {action:'login', username, password}      -> {token, expires}
 *   POST {action:'session', token}                 -> {valid}
 *   POST {action:'refresh', token}                 -> clears cache
 *   POST {action:'logout', token}                  -> revokes token
 */

/* ───────────────────────── CONFIG ───────────────────────── */

var SHEET_MAP = {
  'Settings':            'settings',
  'Navigation':          'navigation',
  'Financial_Years':     'financialYears',
  'Program_Categories':  'categories',
  'Programs_FMR':        'programs',
  'Documents':           'documents',
  'Home_Content':        'home',
  'Important_Links':     'links',
  'Notices':             'notices',
  'Contact_Information': 'contacts',
  'Footer':              'footer',
  'Post_Categories':     'postCategories',
  'Posts':               'posts',
  'Post_Media':          'postMedia',
  'Program_Benefits':    'benefits'
};

/* ── Media storage (Google Drive) ──
   Chosen over Cloudinary/Firebase/Supabase because it is the only option where
   NO credential exists in the browser: this script already runs as the sheet
   owner. See docs/07_Media_Architecture.md. */
var MEDIA_FOLDER_NAME = 'Sheikhpura PIP Portal — Media';
var MAX_UPLOAD_BYTES  = 5 * 1024 * 1024;    // 5 MB per file after browser-side compression
var ALLOWED_IMAGE_MIME = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'
};
var ALLOWED_DOC_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
};

var CACHE_KEY      = 'PORTAL_DATA_V1';
var CACHE_SECONDS  = 21600;   // 6 h server-side cache (max allowed)
var TOKEN_TTL_MS   = 8 * 60 * 60 * 1000;   // 8 h admin session
var MAX_LOGIN_FAILS = 5;
var LOCKOUT_SECONDS = 900;    // 15 min

/* Required fields per collection — rows missing these are dropped. */
var REQUIRED = {
  navigation:     ['Menu_ID', 'Menu_Label_EN', 'URL'],
  financialYears: ['Year_ID', 'Financial_Year', 'Display_Name'],
  categories:     ['Category_ID', 'Category_Name', 'Short_Name'],
  programs:       ['Program_ID', 'Year_ID', 'Category_ID', 'FMR_Code', 'Program_Name'],
  documents:      ['Document_ID', 'Document_Title', 'Document_Type'],
  home:           ['Section_Key', 'Section_Type'],
  links:          ['Link_ID', 'Link_Name', 'URL'],
  notices:        ['Notice_ID', 'Title', 'Notice_Date'],
  contacts:       ['Contact_ID', 'Office_Name'],
  footer:         ['Footer_ID', 'Block_Type'],
  postCategories: ['Category_ID', 'Category_Name'],
  posts:          ['Post_ID', 'Slug', 'Title', 'Content_Type', 'Status'],
  /* Media_URL is deliberately NOT required: a gallery row can be created
     before its image is uploaded. Such rows are dropped at render time by
     postGallery(), and reported below as a warning rather than an error. */
  postMedia:      ['Media_ID', 'Post_ID'],
  benefits:       ['Benefit_ID', 'FMR_Code', 'Benefit_Title']
};

var PK = {
  navigation: 'Menu_ID', financialYears: 'Year_ID',
  categories: 'Category_ID', programs: 'Program_ID', documents: 'Document_ID',
  home: 'Section_Key', links: 'Link_ID', notices: 'Notice_ID',
  contacts: 'Contact_ID', footer: 'Footer_ID',
  postCategories: 'Category_ID', posts: 'Post_ID', postMedia: 'Media_ID',
  benefits: 'Benefit_ID'
};

/* Column order written back to the Posts sheet. Must match the header row. */
var POST_COLUMNS = [
  'Post_ID', 'Slug', 'Title', 'Short_Description', 'Full_Description',
  'Content_Type', 'Category_ID', 'Featured_Image_URL', 'Event_Start_Date',
  'Event_End_Date', 'Event_Time', 'Venue', 'Location', 'External_URL',
  'Attachment_URL', 'Attachment_Name', 'Published_Date', 'Scheduled_Date',
  'Author', 'Is_Featured', 'Status', 'Created_Date', 'Updated_Date'
];
var MEDIA_COLUMNS = [
  'Media_ID', 'Post_ID', 'Media_URL', 'Media_Type', 'Caption',
  'File_Name', 'File_Size_KB', 'Display_Order', 'Status'
];

/* ───────────────────────── ROUTING ───────────────────────── */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'data';
  try {
    if (action === 'status')   return json(buildStatus());
    if (action === 'validate') return json({ ok: true, validation: getData(false).validation });
    /* publicView() is mandatory here — getData() holds Drafts and unreleased
       Scheduled posts, and this endpoint is reachable by anyone. */
    return json(publicView(getData(e && e.parameter.fresh === '1' ? false : true)));
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return json({ ok: false, error: 'Malformed request body' });
  }

  try {
    switch (body.action) {
      case 'login':   return json(login(body.username, body.password));
      case 'session': return json({ ok: true, valid: verifyToken(body.token).valid });
      case 'logout':  return json(logout(body.token));
      case 'refresh':
        requireAuth(body.token);
        CacheService.getScriptCache().remove(CACHE_KEY);
        var d = getData(false);
        return json({
          ok: true, message: 'Cache cleared and data reloaded.',
          counts: d.meta.counts, version: d.meta.version,
          validation: d.validation
        });

      /* ── Posts & Events ── every one of these requires a valid session ── */
      case 'mediaUpload': requireAuth(body.token); return json(mediaUpload(body));
      case 'postSave':    requireAuth(body.token); return json(postSave(body));
      case 'postDelete':  requireAuth(body.token); return json(postDelete(body));
      case 'postStatus':  requireAuth(body.token); return json(postSetStatus(body));
      case 'postList':    requireAuth(body.token); return json(postListAll());

      default:
        return json({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * Apps Script cannot answer CORS preflight (OPTIONS). The frontend therefore
 * posts with Content-Type: text/plain, which is a "simple request" and skips
 * preflight entirely. Do not change that on the client.
 */
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── DATA ───────────────────────── */

function getData(useCache) {
  var cache = CacheService.getScriptCache();
  if (useCache !== false) {
    var hit = cache.get(CACHE_KEY);
    if (hit) {
      try {
        var p = JSON.parse(hit);
        p.meta.cached = true;
        return p;
      } catch (_) { /* fall through and rebuild */ }
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: true, meta: { source: 'google-sheets', cached: false, counts: {} },
              validation: { errors: [], warnings: [] } };

  for (var name in SHEET_MAP) {
    var key = SHEET_MAP[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      out.validation.errors.push({ sheet: name, message: 'Sheet missing from workbook' });
      out[key] = (key === 'settings') ? {} : [];
      continue;
    }
    out[key] = readSheet(sh, key, out.validation);
  }

  // Settings collapse to a flat key->value map
  var flat = {};
  (out.settings || []).forEach(function (r) {
    if (r.Setting_Key) flat[String(r.Setting_Key).trim()] = r.Setting_Value;
  });
  out.settings = flat;

  crossValidate(out);

  for (var k in SHEET_MAP) {
    var kk = SHEET_MAP[k];
    out.meta.counts[kk] = (kk === 'settings')
      ? Object.keys(out.settings).length : out[kk].length;
  }
  out.meta.generated = new Date().toISOString();
  out.meta.version = String(new Date().getTime());

  try {
    cache.put(CACHE_KEY, JSON.stringify(out), CACHE_SECONDS);
  } catch (_) {
    // >100 KB payloads cannot be cached; serving uncached is still correct.
    out.meta.cacheable = false;
  }
  return out;
}

function readSheet(sh, key, validation) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var required = REQUIRED[key] || [];
  var pk = PK[key];
  var seen = {};
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (raw.every(function (c) { return c === '' || c === null; })) continue;

    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = normalise(raw[c]);
    }

    var missing = required.filter(function (f) {
      return obj[f] === undefined || String(obj[f]).trim() === '';
    });
    if (missing.length) {
      validation.errors.push({
        sheet: sh.getName(), row: r + 1,
        message: 'Missing required field(s): ' + missing.join(', ') + ' — row skipped'
      });
      continue;
    }

    if (pk) {
      var id = String(obj[pk]).trim();
      if (seen[id]) {
        validation.errors.push({
          sheet: sh.getName(), row: r + 1,
          message: 'Duplicate ' + pk + ' "' + id + '" — row skipped'
        });
        continue;
      }
      seen[id] = true;
    }

    rows.push(obj);
  }
  return rows;
}

function normalise(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof v === 'string') return v.trim();
  return v;
}

function crossValidate(d) {
  var V = d.validation;
  var years = {}, cats = {}, progs = {};
  d.financialYears.forEach(function (y) { years[y.Year_ID] = y; });
  d.categories.forEach(function (c) { cats[c.Category_ID] = c; });

  var keep = [];
  var codeSeen = {};
  d.programs.forEach(function (p) {
    if (!years[p.Year_ID]) {
      V.errors.push({ sheet: 'Programs_FMR', id: p.Program_ID,
        message: 'Year_ID "' + p.Year_ID + '" not found in Financial_Years — row skipped' });
      return;
    }
    if (!cats[p.Category_ID]) {
      V.errors.push({ sheet: 'Programs_FMR', id: p.Program_ID,
        message: 'Category_ID "' + p.Category_ID + '" not found in Program_Categories — row skipped' });
      return;
    }
    var ck = p.Year_ID + '|' + String(p.FMR_Code).trim().toUpperCase();
    if (codeSeen[ck]) {
      V.errors.push({ sheet: 'Programs_FMR', id: p.Program_ID,
        message: 'Duplicate FMR code "' + p.FMR_Code + '" within ' + p.Year_ID + ' — row skipped' });
      return;
    }
    codeSeen[ck] = true;
    progs[p.Program_ID] = true;
    keep.push(p);
  });
  d.programs = keep;

  d.documents = (d.documents || []).filter(function (doc) {
    if (doc.Year_ID && !years[doc.Year_ID]) {
      V.errors.push({ sheet: 'Documents', id: doc.Document_ID,
        message: 'Year_ID "' + doc.Year_ID + '" not found — row skipped' });
      return false;
    }
    if (doc.Category_ID && !cats[doc.Category_ID]) {
      V.errors.push({ sheet: 'Documents', id: doc.Document_ID,
        message: 'Category_ID "' + doc.Category_ID + '" not found — row skipped' });
      return false;
    }
    if (doc.Program_ID && !progs[doc.Program_ID]) {
      V.warnings.push({ sheet: 'Documents', id: doc.Document_ID,
        message: 'Program_ID "' + doc.Program_ID + '" not found — document kept but not linked' });
      doc.Program_ID = '';
    }
    var url = String(doc.File_URL || '');
    if (!url || url === 'NEEDS MANUAL INPUT') {
      V.warnings.push({ sheet: 'Documents', id: doc.Document_ID,
        message: 'File_URL not set — link shown as unavailable' });
    } else if (!/^https?:\/\//i.test(url)) {
      V.warnings.push({ sheet: 'Documents', id: doc.Document_ID,
        message: 'File_URL is not a valid http(s) link — link disabled' });
    }
    return true;
  });

  /* Posts: category FK, unique slug, status/date coherence */
  var pcats = {};
  (d.postCategories || []).forEach(function (c) { pcats[c.Category_ID] = true; });
  var slugSeen = {}, postIds = {};
  d.posts = (d.posts || []).filter(function (p) {
    var slug = String(p.Slug || '').trim().toLowerCase();
    if (!slug) {
      V.errors.push({ sheet: 'Posts', id: p.Post_ID, message: 'Blank Slug — row skipped' });
      return false;
    }
    if (slugSeen[slug]) {
      V.errors.push({ sheet: 'Posts', id: p.Post_ID,
        message: 'Duplicate Slug "' + slug + '" — slugs are public URLs and must be unique — row skipped' });
      return false;
    }
    slugSeen[slug] = true;
    if (p.Category_ID && !pcats[p.Category_ID]) {
      V.warnings.push({ sheet: 'Posts', id: p.Post_ID,
        message: 'Category_ID "' + p.Category_ID + '" not found — post shown without a category' });
      p.Category_ID = '';
    }
    if (String(p.Status).toLowerCase() === 'scheduled' && !parseWhen(p.Scheduled_Date)) {
      V.warnings.push({ sheet: 'Posts', id: p.Post_ID,
        message: 'Status is Scheduled but Scheduled_Date is missing or unreadable — post stays hidden' });
    }
    if (p.Event_Start_Date && p.Event_End_Date &&
        String(p.Event_End_Date) < String(p.Event_Start_Date)) {
      V.warnings.push({ sheet: 'Posts', id: p.Post_ID,
        message: 'Event_End_Date is before Event_Start_Date' });
    }
    postIds[p.Post_ID] = true;
    return true;
  });

  d.postMedia = (d.postMedia || []).filter(function (m) {
    if (!postIds[m.Post_ID]) {
      V.warnings.push({ sheet: 'Post_Media', id: m.Media_ID,
        message: 'Post_ID "' + m.Post_ID + '" not found — gallery image dropped' });
      return false;
    }
    var u = String(m.Media_URL || '').trim();
    if (!u || u === 'NEEDS MANUAL INPUT') {
      V.warnings.push({ sheet: 'Post_Media', id: m.Media_ID,
        message: 'No image uploaded yet for "' + (m.Caption || m.Media_ID) +
                 '" — the row is kept but nothing is shown' });
    }
    return true;
  });

  /* Benefits attach to an FMR code, not a Program_ID, because entitlements are
     stable across years while Program_IDs are year-scoped. */
  var codes = {};
  d.programs.forEach(function (p) { codes[String(p.FMR_Code).toUpperCase().trim()] = true; });
  d.benefits = (d.benefits || []).filter(function (b) {
    var c = String(b.FMR_Code || '').toUpperCase().trim();
    if (!codes[c]) {
      V.warnings.push({ sheet: 'Program_Benefits', id: b.Benefit_ID,
        message: 'FMR_Code "' + b.FMR_Code + '" not found in Programs_FMR — benefit hidden' });
      return false;
    }
    return true;
  });

  var current = d.financialYears.filter(function (y) {
    return String(y.Is_Current).toLowerCase() === 'yes';
  });
  if (current.length !== 1) {
    V.warnings.push({ sheet: 'Financial_Years',
      message: current.length + ' rows marked Is_Current=Yes (expected exactly 1) — falling back to newest year' });
  }

  // A year reaches the selector only if it has programme rows or documents.
  var hasProg = {}, hasDoc = {};
  (d.programs || []).forEach(function (p) { hasProg[p.Year_ID] = true; });
  (d.documents || []).forEach(function (x) { if (x.Year_ID) hasDoc[x.Year_ID] = true; });
  d.financialYears.forEach(function (y) {
    y._hasPrograms = !!hasProg[y.Year_ID];
    y._hasData = y._hasPrograms || !!hasDoc[y.Year_ID];
    if (!y._hasData) {
      V.warnings.push({ sheet: 'Financial_Years', id: y.Year_ID,
        message: 'No programme rows and no documents — hidden from the year selector' });
    } else if (!y._hasPrograms) {
      V.warnings.push({ sheet: 'Financial_Years', id: y.Year_ID,
        message: 'Documents only, no programme rows — shown as a documents-only year' });
    }
  });
}

/**
 * Shallow copy with unpublished posts removed. Drafts and Scheduled posts whose
 * time has not arrived must never leave the server — an admin's unfinished text
 * is not public just because the read endpoint is.
 */
function publicView(d) {
  var out = {}, k;
  for (k in d) if (d.hasOwnProperty(k)) out[k] = d[k];

  /* ── Financial data is never sent to a browser. ──
     Removed from the public portal at the District Magistrate's direction: this
     site publishes what residents can use, not the district's financial plan.
     Stripped here as well as in the sheet, so an old or restored sheet cannot
     leak budget figures. */
  out.pipDocuments = [];
  out.programs = (d.programs || []).map(function (p) {
    var c = {}, f;
    for (f in p) {
      if (!p.hasOwnProperty(f)) continue;
      if (f === 'Budget_Allocation_Lakh' || f === 'Budget_Guidelines') continue;
      c[f] = p[f];
    }
    return c;
  });
  var MONEY_DOCS = { 'Category Allocation': 1, 'Category Guidelines': 1, 'PIP': 1,
                     'RoP': 1, 'Supplementary PIP': 1, 'Supplementary Approval': 1,
                     'Budget Allocation Letter': 1, 'Revised Budget': 1 };
  out.documents = (d.documents || []).filter(function (x) {
    return !MONEY_DOCS[String(x.Document_Type || '').trim()];
  });

  var now = new Date();
  out.posts = (d.posts || []).filter(function (p) {
    var s = String(p.Status || '').trim().toLowerCase();
    if (s === 'published' || s === 'archived') return true;
    if (s === 'scheduled') {
      var when = parseWhen(p.Scheduled_Date);
      return !!when && when <= now;
    }
    return false;                                   // Draft, or anything unrecognised
  });

  var live = {};
  out.posts.forEach(function (p) { live[p.Post_ID] = true; });
  out.postMedia = (d.postMedia || []).filter(function (m) { return live[m.Post_ID]; });
  return out;
}

/** Accepts "2026-08-28", "2026-08-28 09:00" and ISO strings. */
function parseWhen(v) {
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function buildStatus() {
  var d = getData(true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    sheetName: ss.getName(),
    sheetUrl: ss.getUrl(),
    lastModified: Utilities.formatDate(
      DriveApp.getFileById(ss.getId()).getLastUpdated(),
      Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    counts: d.meta.counts,
    cached: d.meta.cached,
    version: d.meta.version,
    errors: d.validation.errors.length,
    warnings: d.validation.warnings.length,
    validation: d.validation
  };
}

/* ═══════════════════ POSTS, EVENTS & MEDIA ═══════════════════ */

/** Media folder, created on first use. Kept out of the public Drive root. */
function mediaFolder() {
  var it = DriveApp.getFoldersByName(MEDIA_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  var f = DriveApp.createFolder(MEDIA_FOLDER_NAME);
  f.setDescription('Images and attachments for the Sheikhpura District Health PIP Portal. ' +
                   'Files here are shared read-only by link so the public website can display them.');
  return f;
}

/**
 * Strip everything that could make a filename dangerous or ambiguous:
 * path separators, traversal, control chars, leading dots, double extensions.
 */
function safeName(name, ext) {
  var base = String(name || 'upload')
    .replace(/\\/g, '/').split('/').pop()          // drop any path
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')            // drop the original extension
    .replace(/[^\w \-]+/g, '')                     // keep word chars, space, hyphen
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  if (!base) base = 'upload';
  return base.toLowerCase() + '-' + Utilities.getUuid().slice(0, 8) + '.' + ext;
}

/**
 * Accepts a base64 payload from the authenticated admin, validates it, writes it
 * to Drive and returns a public image URL.
 *
 * Security: the MIME type is taken from OUR allow-list keyed by the declared type
 * AND cross-checked against the file's magic bytes, so renaming evil.exe to
 * photo.jpg does not get it stored as an image. The extension is derived from the
 * allow-list, never from the supplied filename.
 */
function mediaUpload(body) {
  var declared = String(body.mimeType || '').toLowerCase();
  var kind = ALLOWED_IMAGE_MIME[declared] ? 'image'
           : (ALLOWED_DOC_MIME[declared] ? 'document' : '');
  if (!kind) {
    return { ok: false, error: 'File type not allowed. Images: JPG, PNG, WebP. Documents: PDF, XLSX, DOCX, PPTX.' };
  }
  var ext = (kind === 'image' ? ALLOWED_IMAGE_MIME : ALLOWED_DOC_MIME)[declared];

  var b64 = String(body.data || '');
  var comma = b64.indexOf(',');
  if (b64.slice(0, 5) === 'data:' && comma > -1) b64 = b64.slice(comma + 1);
  if (!b64) return { ok: false, error: 'No file data received.' };

  var bytes;
  try { bytes = Utilities.base64Decode(b64); }
  catch (e) { return { ok: false, error: 'File data is corrupt.' }; }

  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'File is ' + Math.round(bytes.length / 1048576 * 10) / 10 +
             ' MB. Maximum is ' + (MAX_UPLOAD_BYTES / 1048576) + ' MB.' };
  }
  if (bytes.length < 64) return { ok: false, error: 'File is empty or truncated.' };

  if (kind === 'image' && !magicBytesMatch(bytes, declared)) {
    return { ok: false, error: 'This file is not a valid ' + ext.toUpperCase() +
             ' image. Renaming a file does not change its type.' };
  }

  var name = safeName(body.fileName, ext);
  var file = mediaFolder().createFile(Utilities.newBlob(bytes, declared, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var id = file.getId();
  return {
    ok: true, kind: kind, fileId: id, fileName: name,
    sizeKB: Math.round(bytes.length / 1024),
    /* Drive's thumbnail endpoint is CDN-served and embeds directly in <img>. */
    url: kind === 'image'
      ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600'
      : 'https://drive.google.com/file/d/' + id + '/view'
  };
}

/** Signature check — cheap defence against a mislabelled or disguised file. */
function magicBytesMatch(b, mime) {
  var u = function (i) { return b[i] & 0xFF; };
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF;
  }
  if (mime === 'image/png') {
    return u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47;
  }
  if (mime === 'image/webp') {
    return u(0) === 0x52 && u(1) === 0x49 && u(2) === 0x46 && u(3) === 0x46 &&
           u(8) === 0x57 && u(9) === 0x45 && u(10) === 0x42 && u(11) === 0x50;
  }
  return true;
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'post';
}

function sheetRows(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found.');
  return { sh: sh, values: sh.getDataRange().getValues() };
}

function nextId(values, colIdx, prefix, width) {
  var max = 0;
  for (var i = 1; i < values.length; i++) {
    var m = String(values[i][colIdx] || '').match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(width, '0');
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Create or update one post, plus its gallery rows. */
function postSave(body) {
  var p = body.post || {};
  if (!String(p.Title || '').trim())  return { ok: false, error: 'Title is required.' };
  if (!String(p.Content_Type || '').trim()) p.Content_Type = 'News';
  if (['News', 'Event', 'Update'].indexOf(p.Content_Type) === -1) {
    return { ok: false, error: 'Content Type must be News, Event or Update.' };
  }
  var status = String(p.Status || 'Draft');
  if (['Draft', 'Published', 'Scheduled', 'Archived'].indexOf(status) === -1) {
    return { ok: false, error: 'Invalid status.' };
  }
  if (status === 'Scheduled' && !String(p.Scheduled_Date || '').trim()) {
    return { ok: false, error: 'A scheduled post needs a publish date and time.' };
  }
  if (p.Event_Start_Date && p.Event_End_Date &&
      String(p.Event_End_Date) < String(p.Event_Start_Date)) {
    return { ok: false, error: 'Event end date cannot be before the start date.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // two admins on two devices must not interleave
  try {
    var t = sheetRows('Posts');
    var headers = t.values[0].map(function (h) { return String(h).trim(); });
    var idCol = headers.indexOf('Post_ID'), slugCol = headers.indexOf('Slug');

    var rowIndex = -1;
    if (p.Post_ID) {
      for (var i = 1; i < t.values.length; i++) {
        if (String(t.values[i][idCol]).trim() === String(p.Post_ID).trim()) { rowIndex = i; break; }
      }
      if (rowIndex === -1) return { ok: false, error: 'Post not found: ' + p.Post_ID };
    } else {
      p.Post_ID = nextId(t.values, idCol, 'POST', 3);
      p.Created_Date = today();
    }

    /* slug: derive from the title if absent, then force uniqueness */
    var base = slugify(p.Slug || p.Title);
    var slug = base, n = 2;
    var taken = function (s) {
      for (var i = 1; i < t.values.length; i++) {
        if (i === rowIndex) continue;
        if (String(t.values[i][slugCol]).trim().toLowerCase() === s) return true;
      }
      return false;
    };
    while (taken(slug)) { slug = base + '-' + n; n++; }
    p.Slug = slug;

    if (status === 'Published' && !String(p.Published_Date || '').trim()) p.Published_Date = today();
    p.Updated_Date = today();
    if (!p.Created_Date) p.Created_Date = today();
    if (!p.Author) p.Author = 'District Administrator';
    p.Is_Featured = (String(p.Is_Featured).toLowerCase() === 'yes' || p.Is_Featured === true) ? 'Yes' : 'No';
    p.Status = status;

    var row = POST_COLUMNS.map(function (c) {
      var v = p[c];
      return (v === undefined || v === null) ? '' : String(v);
    });

    if (rowIndex === -1) t.sh.appendRow(row);
    else t.sh.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);

    if (body.gallery) saveGallery(p.Post_ID, body.gallery);

    CacheService.getScriptCache().remove(CACHE_KEY);
    return { ok: true, post: p, message: 'Saved.' };
  } finally {
    lock.releaseLock();
  }
}

/** Replace a post's gallery rows with the supplied list. */
function saveGallery(postId, gallery) {
  var t = sheetRows('Post_Media');
  var headers = t.values[0].map(function (h) { return String(h).trim(); });
  var pidCol = headers.indexOf('Post_ID');

  for (var i = t.values.length - 1; i >= 1; i--) {
    if (String(t.values[i][pidCol]).trim() === String(postId)) t.sh.deleteRow(i + 1);
  }
  if (!gallery.length) return;

  var fresh = sheetRows('Post_Media');
  var idCol = fresh.values[0].map(function (h) { return String(h).trim(); }).indexOf('Media_ID');
  var seq = parseInt(String(nextId(fresh.values, idCol, 'PM', 3)).replace('PM', ''), 10);

  var rows = gallery.map(function (g, i) {
    var rec = {
      Media_ID: 'PM' + String(seq + i).padStart(3, '0'),
      Post_ID: postId,
      Media_URL: String(g.url || ''),
      Media_Type: g.type === 'document' ? 'document' : 'image',
      Caption: String(g.caption || ''),
      File_Name: String(g.fileName || ''),
      File_Size_KB: g.sizeKB || '',
      Display_Order: i + 1,
      Status: 'Active'
    };
    return MEDIA_COLUMNS.map(function (c) { return rec[c] === undefined ? '' : String(rec[c]); });
  });
  fresh.sh.getRange(fresh.values.length + 1, 1, rows.length, MEDIA_COLUMNS.length).setValues(rows);
}

function postDelete(body) {
  var id = String(body.postId || '').trim();
  if (!id) return { ok: false, error: 'No post id supplied.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = sheetRows('Posts');
    var idCol = t.values[0].map(function (h) { return String(h).trim(); }).indexOf('Post_ID');
    for (var i = t.values.length - 1; i >= 1; i--) {
      if (String(t.values[i][idCol]).trim() === id) { t.sh.deleteRow(i + 1); break; }
    }
    saveGallery(id, []);
    CacheService.getScriptCache().remove(CACHE_KEY);
    return { ok: true, message: 'Post deleted.' };
  } finally {
    lock.releaseLock();
  }
}

/** Publish / unpublish / archive without opening the composer. */
function postSetStatus(body) {
  var id = String(body.postId || '').trim();
  var status = String(body.status || '').trim();
  if (['Draft', 'Published', 'Scheduled', 'Archived'].indexOf(status) === -1) {
    return { ok: false, error: 'Invalid status.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = sheetRows('Posts');
    var headers = t.values[0].map(function (h) { return String(h).trim(); });
    var idCol = headers.indexOf('Post_ID');
    var stCol = headers.indexOf('Status');
    var pubCol = headers.indexOf('Published_Date');
    var updCol = headers.indexOf('Updated_Date');

    for (var i = 1; i < t.values.length; i++) {
      if (String(t.values[i][idCol]).trim() !== id) continue;
      t.sh.getRange(i + 1, stCol + 1).setValue(status);
      if (status === 'Published' && !String(t.values[i][pubCol]).trim()) {
        t.sh.getRange(i + 1, pubCol + 1).setValue(today());
      }
      t.sh.getRange(i + 1, updCol + 1).setValue(today());
      CacheService.getScriptCache().remove(CACHE_KEY);
      return { ok: true, message: 'Status set to ' + status + '.' };
    }
    return { ok: false, error: 'Post not found: ' + id };
  } finally {
    lock.releaseLock();
  }
}

/** Admin view — every post regardless of status, plus gallery counts. */
function postListAll() {
  var d = getData(false);
  var counts = {};
  d.postMedia.forEach(function (m) { counts[m.Post_ID] = (counts[m.Post_ID] || 0) + 1; });
  return {
    ok: true,
    posts: d.posts.map(function (p) { p._galleryCount = counts[p.Post_ID] || 0; return p; }),
    categories: d.postCategories
  };
}

/* ───────────────────────── AUTH ───────────────────────── */

/**
 * Run ONCE from the Apps Script editor, then delete the literal password
 * from this function body. Nothing secret ever reaches the browser.
 */
function setupCredentials() {
  var USERNAME = 'admin';
  var PASSWORD = '';   // ← type your password here, Run once, then clear it again

  /* Deliberately blank. This file lives in a public repository, so shipping a
     default password would publish it to everyone. The guards below refuse to
     run rather than let a weak or well-known password reach production. */
  if (!PASSWORD) {
    throw new Error('Set a PASSWORD in setupCredentials() before running it, ' +
                    'then clear the line again once it has run.');
  }
  if (PASSWORD.length < 12) {
    throw new Error('Password must be at least 12 characters.');
  }
  if (/^(admin|password|changethis|123456|sheikhpura)/i.test(PASSWORD)) {
    throw new Error('That password is too predictable. Choose something else.');
  }

  var props = PropertiesService.getScriptProperties();
  var salt = Utilities.getUuid();
  props.setProperties({
    ADMIN_USER: USERNAME,
    ADMIN_SALT: salt,
    ADMIN_HASH: sha256(salt + PASSWORD),
    TOKEN_SECRET: Utilities.getUuid() + Utilities.getUuid()
  }, false);
  Logger.log('Credentials stored for user "' + USERNAME + '". Now clear the PASSWORD line above and save.');
}

function changePassword(newPassword) {
  var props = PropertiesService.getScriptProperties();
  var salt = Utilities.getUuid();
  props.setProperty('ADMIN_SALT', salt);
  props.setProperty('ADMIN_HASH', sha256(salt + newPassword));
  Logger.log('Password updated.');
}

function sha256(s) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function hmac(s, secret) {
  return Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(s, secret)).replace(/=+$/, '');
}

function login(username, password) {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty('ADMIN_USER');
  if (!user) return { ok: false, error: 'Admin credentials not configured. Run setupCredentials() once.' };

  var cache = CacheService.getScriptCache();
  var lockKey = 'LOCK_' + sha256(String(username || ''));
  var fails = Number(cache.get(lockKey) || 0);
  if (fails >= MAX_LOGIN_FAILS) {
    return { ok: false, error: 'Too many failed attempts. Try again in 15 minutes.' };
  }

  var salt = props.getProperty('ADMIN_SALT');
  var hash = props.getProperty('ADMIN_HASH');
  var okUser = String(username || '') === user;
  var okPass = sha256(salt + String(password || '')) === hash;

  if (!okUser || !okPass) {
    cache.put(lockKey, String(fails + 1), LOCKOUT_SECONDS);
    Utilities.sleep(600);                       // blunt timing/brute-force friction
    return { ok: false, error: 'Invalid username or password.' };
  }

  cache.remove(lockKey);
  var expires = new Date().getTime() + TOKEN_TTL_MS;
  var payload = user + '|' + expires;
  var token = Utilities.base64EncodeWebSafe(payload) + '.' +
              hmac(payload, props.getProperty('TOKEN_SECRET'));

  return { ok: true, token: token, expires: expires, username: user };
}

function verifyToken(token) {
  if (!token) return { valid: false, reason: 'No token' };
  var parts = String(token).split('.');
  if (parts.length !== 2) return { valid: false, reason: 'Malformed token' };

  var props = PropertiesService.getScriptProperties();
  if (CacheService.getScriptCache().get('REVOKED_' + sha256(token))) {
    return { valid: false, reason: 'Session ended' };
  }

  var payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (_) {
    return { valid: false, reason: 'Malformed token' };
  }

  if (hmac(payload, props.getProperty('TOKEN_SECRET')) !== parts[1]) {
    return { valid: false, reason: 'Bad signature' };
  }
  var bits = payload.split('|');
  if (Number(bits[1]) < new Date().getTime()) return { valid: false, reason: 'Session expired' };
  return { valid: true, username: bits[0] };
}

function requireAuth(token) {
  var v = verifyToken(token);
  if (!v.valid) throw new Error('Not authorised: ' + v.reason);
  return v;
}

function logout(token) {
  if (token) {
    CacheService.getScriptCache().put('REVOKED_' + sha256(token), '1', TOKEN_TTL_MS / 1000);
  }
  return { ok: true };
}

/* ───────────────────────── UTIL ───────────────────────── */

/** Sheet menu: Extensions > Apps Script, or use the custom menu after reload. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PIP Portal')
    .addItem('Clear cache (publish changes now)', 'menuClearCache')
    .addItem('Check data for errors', 'menuValidate')
    .addToUi();
}

function menuClearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  getData(false);
  SpreadsheetApp.getUi().alert('Cache cleared. The website will show your changes on next load.');
}

function menuValidate() {
  var v = getData(false).validation;
  var msg = 'Errors (rows skipped): ' + v.errors.length +
            '\nWarnings: ' + v.warnings.length + '\n\n';
  msg += v.errors.slice(0, 15).map(function (e) {
    return '• ' + e.sheet + (e.row ? ' row ' + e.row : ' ' + (e.id || '')) + ': ' + e.message;
  }).join('\n');
  if (!v.errors.length && !v.warnings.length) msg = 'All data valid. Nothing to fix.';
  SpreadsheetApp.getUi().alert('Data check', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

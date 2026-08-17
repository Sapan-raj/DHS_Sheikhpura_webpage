/* ============================================================
   Data layer — Google Sheets (via Apps Script) or local JSON.
   Both sources return an identical payload shape, so nothing
   downstream knows or cares which one is active.
   ============================================================ */
(function (w) {
  'use strict';

  var CFG = w.PORTAL_CONFIG || {};
  var STORE_KEY = 'shk_pip_data_v1';
  var cache = null;

  /* ---------- helpers ---------- */

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function yes(v) { return String(v || '').trim().toLowerCase() === 'yes'; }

  function num(v) {
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  /** A URL is usable only if it is a real http(s) link and not a placeholder. */
  function validUrl(u) {
    var s = String(u || '').trim();
    if (!s || s === 'NEEDS MANUAL INPUT') return '';
    if (/^(https?:)?\/\//i.test(s)) return s;
    if (/^[\w.\-]+\.html(\?|#|$)/i.test(s) || s.charAt(0) === '#') return s;  // internal page
    return '';
  }

  function byOrder(a, b) { return num(a.Display_Order) - num(b.Display_Order); }

  function active(rows) {
    return (rows || []).filter(function (r) {
      var s = String(r.Status || 'Active').trim().toLowerCase();
      return s === 'active' || s === '';
    });
  }

  function parseDate(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Like parseDate but keeps the time — "2026-08-28 09:00" for scheduling. */
  function parseWhen(s) {
    if (!s) return null;
    var m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /** "01–07 Aug 2026" · "25 Aug 2026" · "" — collapses same-month ranges. */
  function fmtRange(a, b) {
    var s = parseDate(a), e = parseDate(b);
    if (!s) return '';
    var M = function (d) { return d.toLocaleString('en-IN', { month: 'short' }); };
    var D = function (d) { return String(d.getDate()).padStart(2, '0'); };
    if (!e || e.getTime() === s.getTime()) return D(s) + ' ' + M(s) + ' ' + s.getFullYear();
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
      return D(s) + '–' + D(e) + ' ' + M(s) + ' ' + s.getFullYear();
    }
    if (s.getFullYear() === e.getFullYear()) {
      return D(s) + ' ' + M(s) + ' – ' + D(e) + ' ' + M(e) + ' ' + s.getFullYear();
    }
    return D(s) + ' ' + M(s) + ' ' + s.getFullYear() + ' – ' + D(e) + ' ' + M(e) + ' ' + e.getFullYear();
  }

  function fmtDate(s) {
    var d = parseDate(s);
    if (!d) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ---------- fetching ---------- */

  function fetchJSON(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error('Timed out')); }
      }, timeoutMs);

      fetch(url, { method: 'GET', cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (j) {
          if (done) return;
          done = true; clearTimeout(timer); resolve(j);
        })
        .catch(function (e) {
          if (done) return;
          done = true; clearTimeout(timer); reject(e);
        });
    });
  }

  function readStore() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      var mins = num((p.data.settings || {}).cache_minutes) || CFG.CACHE_MINUTES || 30;
      if (Date.now() - p.at > mins * 60000) return null;
      return p.data;
    } catch (_) { return null; }
  }

  function writeStore(data) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), data: data })); }
    catch (_) { /* quota — run uncached */ }
  }

  /**
   * Loads the dataset. Order: sessionStorage → Apps Script API → local JSON.
   * Always resolves with usable data unless every source fails.
   */
  function load(force) {
    if (cache && !force) return Promise.resolve(cache);

    if (!force) {
      var stored = readStore();
      if (stored) { cache = normalise(stored); return Promise.resolve(cache); }
    }

    var timeout = (CFG.TIMEOUT_SECONDS || 12) * 1000;
    var api = String(CFG.API_URL || '').trim();

    var chain = api
      ? fetchJSON(api + (api.indexOf('?') > -1 ? '&' : '?') + 'action=data' + (force ? '&fresh=1' : ''), timeout)
          .catch(function (e) {
            console.warn('[PIP] Sheets API unavailable (' + e.message + ') — using local snapshot.');
            return fetchJSON(CFG.FALLBACK_JSON, timeout).then(function (d) {
              d._degraded = 'Live data source unreachable. Showing the last published snapshot.';
              return d;
            });
          })
      : fetchJSON(CFG.FALLBACK_JSON, timeout);

    return chain.then(function (raw) {
      if (!raw || typeof raw !== 'object') throw new Error('Empty response');
      cache = normalise(raw);
      writeStore(raw);
      return cache;
    });
  }

  /* ---------- normalising + client-side validation ---------- */

  function normalise(raw) {
    var d = {
      meta: raw.meta || {},
      settings: raw.settings || {},
      navigation: raw.navigation || [],
      financialYears: raw.financialYears || [],
      pipDocuments: raw.pipDocuments || [],
      categories: raw.categories || [],
      programs: raw.programs || [],
      documents: raw.documents || [],
      home: raw.home || [],
      links: raw.links || [],
      notices: raw.notices || [],
      contacts: raw.contacts || [],
      footer: raw.footer || [],
      postCategories: raw.postCategories || [],
      posts: raw.posts || [],
      postMedia: raw.postMedia || [],
      validation: raw.validation || { errors: [], warnings: [] },
      degraded: raw._degraded || ''
    };

    var V = d.validation;
    function err(sheet, id, message) { V.errors.push({ sheet: sheet, id: id, message: message }); }
    function warn(sheet, id, message) { V.warnings.push({ sheet: sheet, id: id, message: message }); }

    /* duplicate primary keys */
    [['financialYears', 'Year_ID', 'Financial_Years'],
     ['categories', 'Category_ID', 'Program_Categories'],
     ['programs', 'Program_ID', 'Programs_FMR'],
     ['documents', 'Document_ID', 'Documents'],
     ['pipDocuments', 'Doc_ID', 'PIP_Documents'],
     ['notices', 'Notice_ID', 'Notices'],
     ['links', 'Link_ID', 'Important_Links'],
     ['postCategories', 'Category_ID', 'Post_Categories'],
     ['posts', 'Post_ID', 'Posts'],
     ['postMedia', 'Media_ID', 'Post_Media']
    ].forEach(function (t) {
      var seen = {};
      d[t[0]] = d[t[0]].filter(function (r) {
        var id = String(r[t[1]] || '').trim();
        if (!id) { err(t[2], '', 'Blank ' + t[1] + ' — row skipped'); return false; }
        if (seen[id]) { err(t[2], id, 'Duplicate ' + t[1] + ' — row skipped'); return false; }
        seen[id] = true; return true;
      });
    });

    /* referential integrity */
    var years = {}, cats = {}, progIds = {};
    d.financialYears.forEach(function (y) { years[y.Year_ID] = y; });
    d.categories.forEach(function (c) { cats[c.Category_ID] = c; });

    var codeSeen = {};
    d.programs = d.programs.filter(function (p) {
      if (!p.Program_Name || !String(p.FMR_Code || '').trim()) {
        err('Programs_FMR', p.Program_ID, 'Missing FMR_Code or Program_Name — row skipped'); return false;
      }
      if (!years[p.Year_ID]) { err('Programs_FMR', p.Program_ID, 'Unknown Year_ID "' + p.Year_ID + '" — row skipped'); return false; }
      if (!cats[p.Category_ID]) { err('Programs_FMR', p.Program_ID, 'Unknown Category_ID "' + p.Category_ID + '" — row skipped'); return false; }
      var k = p.Year_ID + '|' + String(p.FMR_Code).toUpperCase().trim();
      if (codeSeen[k]) { err('Programs_FMR', p.Program_ID, 'Duplicate FMR code "' + p.FMR_Code + '" in ' + p.Year_ID + ' — row skipped'); return false; }
      codeSeen[k] = true; progIds[p.Program_ID] = true;
      return true;
    });

    d.documents.forEach(function (doc) {
      if (doc.Program_ID && !progIds[doc.Program_ID]) {
        warn('Documents', doc.Document_ID, 'Program_ID "' + doc.Program_ID + '" not found — shown unlinked');
        doc.Program_ID = '';
      }
    });

    /* usable URL resolved once, up front */
    d.documents.concat(d.pipDocuments).forEach(function (doc) {
      doc._url = validUrl(doc.File_URL);
      if (!doc._url) {
        warn(doc.Doc_ID ? 'PIP_Documents' : 'Documents',
             doc.Doc_ID || doc.Document_ID, 'File_URL missing or invalid — download disabled');
      }
    });

    /* A year reaches the selector only if it has something to show — programme
       rows or at least one document. This is what makes the reference site's
       "7 of 8 dropdown options lead nowhere" failure structurally impossible. */
    var hasProg = {}, hasDoc = {};
    d.programs.forEach(function (p) { hasProg[p.Year_ID] = true; });
    d.pipDocuments.concat(d.documents).forEach(function (x) { if (x.Year_ID) hasDoc[x.Year_ID] = true; });
    d.financialYears.forEach(function (y) {
      y._hasPrograms = !!hasProg[y.Year_ID];
      y._hasData = y._hasPrograms || !!hasDoc[y.Year_ID];
      if (!y._hasData) {
        warn('Financial_Years', y.Year_ID, 'No programme rows and no documents — hidden from the year selector');
      } else if (!y._hasPrograms) {
        warn('Financial_Years', y.Year_ID, 'Documents only, no programme rows — shown as a documents-only year');
      }
    });

    /* exactly one current year */
    var cur = d.financialYears.filter(function (y) { return yes(y.Is_Current); });
    if (cur.length !== 1) {
      warn('Financial_Years', '', cur.length + ' rows have Is_Current=Yes (expected 1) — using newest year instead');
    }

    /* ---- posts: FK, slug uniqueness, derived visibility & timing ---- */
    var pcats = {};
    d.postCategories.forEach(function (c) { pcats[c.Category_ID] = c; });
    var slugSeen = {}, postIds = {};
    var now = new Date();
    var todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);

    d.posts = d.posts.filter(function (p) {
      var slug = String(p.Slug || '').trim().toLowerCase();
      if (!slug) { err('Posts', p.Post_ID, 'Blank Slug — row skipped'); return false; }
      if (slugSeen[slug]) {
        err('Posts', p.Post_ID, 'Duplicate Slug "' + slug + '" — row skipped');
        return false;
      }
      slugSeen[slug] = true;

      if (p.Category_ID && !pcats[p.Category_ID]) {
        warn('Posts', p.Post_ID, 'Unknown Category_ID "' + p.Category_ID + '" — shown without a category');
        p.Category_ID = '';
      }
      p._category = pcats[p.Category_ID] || null;

      /* Visibility is DERIVED, never trusted from a "is it live?" column.
         Scheduled posts appear on their own once the clock passes. */
      var st = String(p.Status || '').trim().toLowerCase();
      var sched = parseWhen(p.Scheduled_Date);
      p._live = (st === 'published') || (st === 'scheduled' && !!sched && sched <= now);
      p._archived = (st === 'archived');
      p._pending = (st === 'scheduled' && (!sched || sched > now));
      if (st === 'scheduled' && !sched) {
        warn('Posts', p.Post_ID, 'Status is Scheduled but Scheduled_Date is unreadable — stays hidden');
      }

      /* Upcoming vs past is DERIVED from the event date — no manual status flips. */
      var s = parseDate(p.Event_Start_Date), e = parseDate(p.Event_End_Date) || s;
      p._isEvent = String(p.Content_Type || '').toLowerCase() === 'event' && !!s;
      p._upcoming = p._isEvent && s >= todayMid;
      p._ongoing  = p._isEvent && s <= todayMid && !!e && e >= todayMid;
      p._past     = p._isEvent && !!e && e < todayMid;

      /* Sort key: events by their date, news by publication date. */
      p._sortDate = s || parseDate(p.Published_Date) || parseDate(p.Created_Date) || null;
      p._featured = yes(p.Is_Featured);
      postIds[p.Post_ID] = true;
      return true;
    });

    d.postMedia = d.postMedia.filter(function (m) {
      if (!postIds[m.Post_ID]) {
        warn('Post_Media', m.Media_ID, 'Post_ID "' + m.Post_ID + '" not found — image dropped');
        return false;
      }
      m._url = validUrl(m.Media_URL);
      return true;
    });

    /* expired notices drop out silently */
    var today = new Date(); today.setHours(0, 0, 0, 0);
    d.notices = d.notices.filter(function (n) {
      var x = parseDate(n.Expiry_Date);
      return !x || x >= today;
    });

    return d;
  }

  /* ---------- queries ---------- */

  var Q = {
    /**
     * Years offered in the selector: not Inactive, and holding something to show.
     * Archived years stay listed — they are the historical record — but are
     * flagged so the UI can label them.
     */
    years: function (d) {
      return (d.financialYears || []).filter(function (y) {
        var s = String(y.Status || 'Active').trim().toLowerCase();
        if (s === 'inactive') return false;
        y._archived = (s === 'archived');
        return y._hasData;
      }).sort(byOrder);
    },

    currentYear: function (d) {
      var ys = Q.years(d);
      if (!ys.length) return null;
      var flagged = ys.filter(function (y) { return yes(y.Is_Current); });
      if (flagged.length === 1) return flagged[0];
      var settingFY = String((d.settings || {}).current_financial_year || '').trim();
      var bySetting = ys.filter(function (y) { return y.Financial_Year === settingFY; });
      if (bySetting.length) return bySetting[0];
      return ys.slice().sort(function (a, b) { return num(b.Start_Year) - num(a.Start_Year); })[0];
    },

    yearBySlug: function (d, slug) {
      if (!slug) return null;
      var m = Q.years(d).filter(function (y) { return y.Financial_Year === slug || y.Year_ID === slug; });
      return m.length ? m[0] : null;
    },

    categories: function (d) { return active(d.categories).sort(byOrder); },

    /** Programme rows for one year, optionally one category. */
    programs: function (d, yearId, catId) {
      return active(d.programs).filter(function (p) {
        return p.Year_ID === yearId && (!catId || p.Category_ID === catId);
      }).sort(byOrder);
    },

    programById: function (d, id) {
      var m = d.programs.filter(function (p) { return p.Program_ID === id; });
      return m.length ? m[0] : null;
    },

    programByCode: function (d, yearId, code) {
      var c = String(code || '').toUpperCase().trim();
      var m = active(d.programs).filter(function (p) {
        return p.Year_ID === yearId && String(p.FMR_Code).toUpperCase().trim() === c;
      });
      return m.length ? m[0] : null;
    },

    /** The per-category Budget Allocation / Budget Guidelines file for a year. */
    categoryDoc: function (d, yearId, catId, type) {
      var m = active(d.documents).filter(function (x) {
        return x.Year_ID === yearId && x.Category_ID === catId && x.Document_Type === type;
      }).sort(byOrder);
      return m.length ? m[0] : null;
    },

    pipDocs: function (d, yearId) {
      return (d.pipDocuments || []).filter(function (x) {
        var s = String(x.Status || '').toLowerCase();
        return x.Year_ID === yearId && (s === 'active' || s === 'archived' || s === '');
      }).sort(byOrder);
    },

    docsForProgram: function (d, programId) {
      return active(d.documents).filter(function (x) { return x.Program_ID === programId; }).sort(byOrder);
    },

    /** Every downloadable item, both sheets unioned into one shape. */
    allDocuments: function (d) {
      var out = [];
      active(d.pipDocuments).forEach(function (x) {
        out.push({
          id: x.Doc_ID, title: x.Document_Name, type: x.Document_Type, desc: x.Description,
          url: x._url, fileType: x.File_Type, size: x.File_Size_MB,
          date: x.Upload_Date || x.Issue_Date, yearId: x.Year_ID, catId: '', programId: '',
          featured: false, source: 'PIP_Documents'
        });
      });
      active(d.documents).forEach(function (x) {
        out.push({
          id: x.Document_ID, title: x.Document_Title, type: x.Document_Type, desc: x.Description,
          url: x._url, fileType: x.File_Type, size: x.File_Size_MB,
          date: x.Upload_Date, yearId: x.Year_ID, catId: x.Category_ID, programId: x.Program_ID,
          featured: yes(x.Is_Featured), source: 'Documents'
        });
      });
      return out;
    },

    notices: function (d, includeArchived) {
      return (d.notices || []).filter(function (n) {
        var s = String(n.Status || '').toLowerCase();
        return includeArchived ? s !== 'inactive' : (s === 'active' || s === '');
      }).sort(function (a, b) {
        var da = parseDate(a.Notice_Date), db = parseDate(b.Notice_Date);
        if (da && db && da.getTime() !== db.getTime()) return db - da;
        return num(a.Display_Order) - num(b.Display_Order);
      });
    },

    links: function (d, where) {
      return active(d.links).filter(function (l) {
        if (where === 'home') return yes(l.Show_On_Home);
        if (where === 'footer') return yes(l.Show_In_Footer);
        return true;
      }).sort(byOrder);
    },

    contacts: function (d) { return active(d.contacts).sort(byOrder); },

    nav: function (d) {
      var rows = (d.navigation || []).filter(function (n) { return yes(n.Is_Active); }).sort(byOrder);
      var tops = rows.filter(function (n) { return !String(n.Parent_Menu_ID || '').trim(); });
      return tops.map(function (t) {
        t._children = rows.filter(function (n) { return n.Parent_Menu_ID === t.Menu_ID; });
        return t;
      });
    },

    home: function (d, key) {
      var m = active(d.home).filter(function (h) { return h.Section_Key === key; });
      return m.length ? m[0] : null;
    },

    homeByType: function (d, type) {
      return active(d.home).filter(function (h) { return h.Section_Type === type; }).sort(byOrder);
    },

    footer: function (d) { return active(d.footer).sort(byOrder); },

    /** Free-text search across programmes and documents. */
    search: function (d, term, yearId) {
      var q = String(term || '').toLowerCase().trim();
      if (!q) return { programs: [], documents: [] };
      var catName = {};
      d.categories.forEach(function (c) { catName[c.Category_ID] = c.Short_Name + ' ' + c.Category_Name; });

      var progs = active(d.programs).filter(function (p) {
        if (yearId && p.Year_ID !== yearId) return false;
        return [p.FMR_Code, p.Program_Name, p.Program_Name_HI, p.Program_Description,
                p.Budget_Guidelines, p.Nodal_Officer, catName[p.Category_ID]]
          .join(' ').toLowerCase().indexOf(q) > -1;
      });

      var docs = Q.allDocuments(d).filter(function (x) {
        if (yearId && x.yearId && x.yearId !== yearId) return false;
        return [x.title, x.desc, x.type, x.fileType].join(' ').toLowerCase().indexOf(q) > -1;
      });

      return { programs: progs, documents: docs };
    },

    /* ── Posts / Events / What's New ── */

    postCategories: function (d) { return active(d.postCategories).sort(byOrder); },

    /**
     * Public post list. Only live posts (Published, or Scheduled and due).
     * opts: { type, categoryId, when: 'upcoming'|'past'|'all', q, includeArchived, limit }
     */
    posts: function (d, opts) {
      var o = opts || {};
      var q = String(o.q || '').toLowerCase().trim();

      var rows = d.posts.filter(function (p) {
        if (!p._live && !(o.includeArchived && p._archived)) return false;
        if (!o.includeArchived && p._archived) return false;
        if (o.type && String(p.Content_Type) !== o.type) return false;
        if (o.categoryId && p.Category_ID !== o.categoryId) return false;
        if (o.when === 'upcoming' && !(p._upcoming || p._ongoing)) return false;
        if (o.when === 'past' && !p._past) return false;
        if (q) {
          var hay = [p.Title, p.Short_Description, p.Full_Description, p.Venue,
                     p.Location, p.Content_Type, p._category && p._category.Category_Name]
                    .join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });

      rows.sort(function (a, b) {
        /* Upcoming events lead — a camp next week matters more than last month's news. */
        var au = a._upcoming || a._ongoing, bu = b._upcoming || b._ongoing;
        if (au !== bu) return au ? -1 : 1;
        if (au && bu) {                               // soonest first among upcoming
          return (a._sortDate ? a._sortDate.getTime() : 0) - (b._sortDate ? b._sortDate.getTime() : 0);
        }
        if (a._featured !== b._featured) return a._featured ? -1 : 1;
        return (b._sortDate ? b._sortDate.getTime() : 0) - (a._sortDate ? a._sortDate.getTime() : 0);
      });

      return o.limit ? rows.slice(0, o.limit) : rows;
    },

    postBySlug: function (d, slug) {
      var s = String(slug || '').trim().toLowerCase();
      var m = d.posts.filter(function (p) {
        return String(p.Slug).toLowerCase() === s && (p._live || p._archived);
      });
      return m.length ? m[0] : null;
    },

    postGallery: function (d, postId) {
      return active(d.postMedia)
        .filter(function (m) { return m.Post_ID === postId && m._url; })
        .sort(byOrder);
    },

    /** Counts for the admin dashboard. Works off the full set when authenticated. */
    postStats: function (d) {
      var s = { total: d.posts.length, published: 0, draft: 0, scheduled: 0, archived: 0, upcoming: 0 };
      d.posts.forEach(function (p) {
        var st = String(p.Status || '').toLowerCase();
        if (st === 'published') s.published++;
        else if (st === 'draft') s.draft++;
        else if (st === 'scheduled') s.scheduled++;
        else if (st === 'archived') s.archived++;
        if (p._upcoming || p._ongoing) s.upcoming++;
      });
      return s;
    },

    stats: function (d) {
      var cy = Q.currentYear(d);
      return {
        years: Q.years(d).length,
        categories: Q.categories(d).length,
        programs: cy ? Q.programs(d, cy.Year_ID).length : 0,
        documents: Q.allDocuments(d).length,
        notices: Q.notices(d).length,
        posts: Q.posts(d).length,
        upcoming: Q.posts(d, { when: 'upcoming' }).length
      };
    }
  };

  w.PortalData = {
    load: load, query: Q,
    esc: esc, yes: yes, num: num, validUrl: validUrl,
    fmtDate: fmtDate, parseDate: parseDate, parseWhen: parseWhen, fmtRange: fmtRange,
    active: active, byOrder: byOrder,
    clear: function () { cache = null; try { sessionStorage.removeItem(STORE_KEY); } catch (_) {} }
  };
})(window);

/* ============================================================
   Shared UI shell — utility bar, masthead, nav, breadcrumb, footer.
   Every string comes from the data source. Nothing here is content.
   ============================================================ */
(function (w, D) {
  'use strict';
  var esc = D.esc, yes = D.yes, Q = D.query;

  /* ---------- preferences (theme / font size / language) ---------- */
  var Prefs = {
    get: function (k, dflt) { try { return localStorage.getItem('shk_' + k) || dflt; } catch (_) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem('shk_' + k, v); } catch (_) {} }
  };

  var FS = ['s', 'm', 'l', 'xl'];

  function applyPrefs() {
    var root = document.documentElement;
    root.setAttribute('data-theme', Prefs.get('theme', 'light'));
    root.setAttribute('data-fs', Prefs.get('fs', 'm'));
    var lang = Prefs.get('lang', 'en');
    root.setAttribute('lang', lang === 'hi' ? 'hi' : 'en');
    document.body && document.body.setAttribute('data-lang', lang);
  }
  applyPrefs();

  function setTheme(t) { Prefs.set('theme', t); applyPrefs(); syncToggles(); }
  function stepFont(dir) {
    var i = FS.indexOf(Prefs.get('fs', 'm'));
    i = Math.max(0, Math.min(FS.length - 1, i + dir));
    Prefs.set('fs', FS[i]); applyPrefs();
  }
  function setLang(l) { Prefs.set('lang', l); applyPrefs(); w.location.reload(); }
  function lang() { return Prefs.get('lang', 'en'); }

  /** Pick the Hindi string when Hindi is on and a translation actually exists. */
  function t(en, hi) {
    return (lang() === 'hi' && hi && String(hi).trim()) ? hi : en;
  }

  function syncToggles() {
    var th = Prefs.get('theme', 'light');
    var b = document.getElementById('themeBtn');
    if (b) {
      b.setAttribute('aria-pressed', th === 'dark' ? 'true' : 'false');
      b.textContent = th === 'dark' ? '☀ Light' : '☾ Dark';
    }
  }

  /* ---------- icons ---------- */
  var ICON = {
    home: '⌂', file: '▤', grid: '▦', download: '⭳', bell: '◈', phone: '✆',
    external: '↗', heart: '♥', shield: '⛨', pulse: '⌁', city: '▤', hospital: '✚',
    layers: '≡', list: '☰'
  };
  function icon(n) { return ICON[n] || '•'; }

  /* ---------- utility bar + masthead + nav ---------- */

  function renderShell(d, activePage) {
    var S = d.settings || {};
    var hindiOn = yes(S.enable_hindi);
    var cur = lang();

    var contactBits = [];
    if (D.validUrl('mailto:') || S.contact_email) {
      var em = String(S.contact_email || '');
      contactBits.push(em && em !== 'NEEDS MANUAL INPUT'
        ? '<a class="u-item hide-sm" href="mailto:' + esc(em) + '">✉ ' + esc(em) + '</a>'
        : '');
    }
    var ph = String(S.contact_phone || '');
    if (ph && ph !== 'NEEDS MANUAL INPUT') {
      contactBits.push('<a class="u-item hide-sm" href="tel:' + esc(ph.replace(/\s/g, '')) + '">✆ ' + esc(ph) + '</a>');
    }
    if (S.helpline_104) contactBits.push('<span class="u-item">☎ ' + esc(S.helpline_104) + ' Health</span>');
    if (S.helpline_102) contactBits.push('<span class="u-item">⛑ ' + esc(S.helpline_102) + ' Ambulance</span>');

    var util =
      '<div class="utilbar"><div class="container">' +
        '<div class="u-left">' + contactBits.filter(Boolean).join('<span class="sep"></span>') + '</div>' +
        '<div class="u-right">' +
          (hindiOn
            ? '<button class="ubtn" type="button" id="langEn" aria-pressed="' + (cur === 'en') + '">English</button>' +
              '<button class="ubtn" type="button" id="langHi" aria-pressed="' + (cur === 'hi') + '">हिंदी</button>' +
              '<span class="sep"></span>' : '') +
          '<button class="ubtn" type="button" id="fsDown" title="Decrease text size" aria-label="Decrease text size">A−</button>' +
          '<button class="ubtn" type="button" id="fsUp" title="Increase text size" aria-label="Increase text size">A+</button>' +
          '<span class="sep"></span>' +
          '<button class="ubtn" type="button" id="themeBtn" aria-pressed="false">☾ Dark</button>' +
        '</div>' +
      '</div></div>';

    var mast =
      '<header class="masthead"><div class="container">' +
        '<a class="brand" href="index.html">' +
          emblem() +
          '<span class="brand-text">' +
            '<span class="l1">' + esc(t(S.site_title, S.site_title_hi)) + '</span>' +
            '<span class="l2">' + esc(t(S.site_subtitle, S.site_subtitle_hi)) + '</span>' +
            (S.parent_body ? '<span class="l3">' + esc(S.parent_body) + '</span>' : '') +
          '</span>' +
        '</a>' +
        '<div class="masthead-right">' +
          '<span class="gov-badge">Government of Bihar</span>' +
        '</div>' +
      '</div></header>';

    var items = Q.nav(d).map(function (n) {
      var label = esc(t(n.Menu_Label_EN, n.Menu_Label_HI));
      var ext = String(n.Link_Type || '').toLowerCase() === 'external';
      var isCur = activePage && String(n.URL).split('#')[0].split('?')[0] === activePage;
      var attrs = ' href="' + esc(n.URL) + '"' +
                  (n.Target === '_blank' || ext ? ' target="_blank" rel="noopener noreferrer"' : '') +
                  (isCur ? ' aria-current="page"' : '');
      var kids = (n._children || []).map(function (c) {
        var cext = String(c.Link_Type || '').toLowerCase() === 'external';
        return '<li><a href="' + esc(c.URL) + '"' +
               (c.Target === '_blank' || cext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
               esc(t(c.Menu_Label_EN, c.Menu_Label_HI)) +
               (cext ? ' <span class="ext-mark">' + icon('external') + '</span>' : '') + '</a></li>';
      }).join('');
      return '<li><a' + attrs + '>' + label +
             (ext ? ' <span class="ext-mark" aria-label="opens in a new window">' + icon('external') + '</span>' : '') +
             '</a>' + (kids ? '<ul class="subnav">' + kids + '</ul>' : '') + '</li>';
    }).join('');

    var nav =
      '<nav class="mainnav" aria-label="Main navigation"><div class="container">' +
        '<button class="navtoggle" type="button" id="navToggle" aria-expanded="false" aria-controls="navList">☰ Menu</button>' +
        '<ul class="navlist" id="navList">' + items + '</ul>' +
      '</div></nav>';

    var host = document.getElementById('shell-top');
    if (host) host.innerHTML = util + mast + nav;

    /* maintenance banner */
    if (String(S.site_status || '').toLowerCase() === 'maintenance' && S.maintenance_message) {
      var m = document.createElement('div');
      m.className = 'container';
      m.style.marginTop = '16px';
      m.innerHTML = '<div class="alert alert-warn" role="status">⚠ ' + esc(S.maintenance_message) + '</div>';
      var mn = document.querySelector('main');
      mn && mn.parentNode.insertBefore(m, mn);
    }

    /* degraded-source banner */
    if (d.degraded) {
      var g = document.createElement('div');
      g.className = 'container'; g.style.marginTop = '16px';
      g.innerHTML = '<div class="alert alert-warn" role="status">⚠ ' + esc(d.degraded) + '</div>';
      var mn2 = document.querySelector('main');
      mn2 && mn2.parentNode.insertBefore(g, mn2);
    }

    wireShell();
    syncToggles();
  }

  function emblem() {
    return '<svg class="emblem" viewBox="0 0 64 64" role="img" aria-label="District Health Society emblem">' +
      '<circle cx="32" cy="32" r="30" fill="#1B3A5C"/>' +
      '<circle cx="32" cy="32" r="30" fill="none" stroke="#F2994A" stroke-width="2.5"/>' +
      '<path d="M27 15h10v12h12v10H37v12H27V37H15V27h12z" fill="#fff"/>' +
      '<path d="M12 48c6-5 10 3 16-1s10 3 16-1 8 0 8 0" fill="none" stroke="#F2994A" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
  }

  function wireShell() {
    var on = function (id, ev, fn) { var e = document.getElementById(id); e && e.addEventListener(ev, fn); };
    on('themeBtn', 'click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    on('fsUp', 'click', function () { stepFont(1); });
    on('fsDown', 'click', function () { stepFont(-1); });
    on('langEn', 'click', function () { setLang('en'); });
    on('langHi', 'click', function () { setLang('hi'); });
    on('navToggle', 'click', function () {
      var l = document.getElementById('navList');
      var open = l.classList.toggle('open');
      this.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------- breadcrumb ---------- */
  function crumbs(trail) {
    var host = document.getElementById('crumbs');
    if (!host) return;
    var items = [{ label: 'Home', url: 'index.html' }].concat(trail || []);
    host.innerHTML = '<div class="crumbs"><div class="container"><ol>' +
      items.map(function (c, i) {
        var last = i === items.length - 1;
        return '<li>' + (last || !c.url
          ? '<span aria-current="page">' + esc(c.label) + '</span>'
          : '<a href="' + esc(c.url) + '">' + esc(c.label) + '</a>') + '</li>';
      }).join('') + '</ol></div></div>';
  }

  /* ---------- footer ---------- */
  function renderFooter(d) {
    var S = d.settings || {};
    var rows = Q.footer(d);
    var byCol = {};
    rows.forEach(function (r) {
      var c = String(D.num(r.Column_Number) || 1);
      (byCol[c] = byCol[c] || []).push(r);
    });

    var cols = ['1', '2', '3', '4'].map(function (c) {
      var list = byCol[c] || [];
      if (!list.length) return '';
      var title = (list.find(function (x) { return x.Block_Title; }) || {}).Block_Title || '';
      var linkRows = list.filter(function (x) { return x.Block_Type === 'link'; });
      var textRows = list.filter(function (x) { return x.Block_Type === 'about' || x.Block_Type === 'contact'; });

      var inner = '';
      textRows.forEach(function (x) {
        var txt = x.Content_Text || (x.Block_Type === 'about' ? S.footer_about : '');
        if (txt) inner += '<p>' + esc(txt) + '</p>';
      });
      if (linkRows.length) {
        inner += '<ul>' + linkRows.map(function (x) {
          var ext = yes(x.Is_External);
          return '<li><a href="' + esc(x.URL) + '"' +
                 (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(x.Label) +
                 (ext ? ' <span class="ext-mark">' + icon('external') + '</span>' : '') + '</a></li>';
        }).join('') + '</ul>';
      }
      return '<div class="foot-col">' + (title ? '<h4>' + esc(title) + '</h4>' : '') + inner + '</div>';
    }).join('');

    var portals = Q.links(d, 'footer').map(function (l) {
      return '<li><a href="' + esc(l.URL) + '" target="_blank" rel="noopener noreferrer" title="' +
             esc(l.Description || '') + '">' + esc(l.Link_Name) + '</a></li>';
    }).join('');

    var legal = rows.filter(function (r) { return r.Block_Type === 'legal'; })
      .map(function (r) { return '<li><a href="' + esc(r.URL) + '">' + esc(r.Label) + '</a></li>'; }).join('');

    var social = ['facebook', 'twitter', 'youtube'].map(function (k) {
      var u = S['social_' + k];
      if (!D.validUrl(u)) return '';
      var g = { facebook: 'f', twitter: '𝕏', youtube: '▶' }[k];
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" aria-label="' + k + '">' + g + '</a>';
    }).join('');

    var host = document.getElementById('shell-footer');
    if (!host) return;
    host.innerHTML =
      '<footer class="site-footer">' +
        '<div class="container"><div class="foot-main">' + cols + '</div></div>' +
        (portals ? '<div class="foot-links"><div class="container">' +
          '<ul>' + portals + '</ul></div></div>' : '') +
        '<div class="container"><div class="foot-bottom">' +
          '<div>' + esc(S.footer_copyright || '') +
            (S.footer_credit ? ' &nbsp;|&nbsp; ' + esc(S.footer_credit) : '') + '</div>' +
          (legal ? '<ul class="foot-links-inline" style="list-style:none;display:flex;gap:16px;margin:0;padding:0;flex-wrap:wrap">' + legal + '</ul>' : '') +
          (social ? '<div class="social">' + social + '</div>' : '') +
        '</div></div>' +
      '</footer>';
  }

  /* ---------- shared renderers ---------- */

  function docIcon(ft) {
    var f = String(ft || '').toLowerCase();
    var cls = f === 'pdf' ? 'pdf' : (f === 'xlsx' || f === 'xls' ? 'xlsx' : (f === 'zip' ? 'zip' : ''));
    return '<span class="doc-ico ' + cls + '" aria-hidden="true">' + esc(String(ft || 'FILE').toUpperCase().slice(0, 4)) + '</span>';
  }

  /** One document row. Never renders a live link for an unusable URL. */
  function docRow(x, extraChips) {
    var chips = [];
    if (x.type) chips.push('<span class="chip">' + esc(x.type) + '</span>');
    if (x.fileType) chips.push('<span class="chip chip--file">' + esc(x.fileType) + '</span>');
    if (x.size) chips.push('<span class="chip">' + esc(x.size) + ' MB</span>');
    if (x.date) chips.push('<span class="chip">' + esc(D.fmtDate(x.date)) + '</span>');
    (extraChips || []).forEach(function (c) { chips.push(c); });

    var action = x.url
      ? '<a class="btn btn-outline btn-sm" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer" ' +
        'aria-label="Download ' + esc(x.title) + '">⭳ Download</a>'
      : '<span class="unavailable" title="No file link has been published for this document yet">Not yet published</span>';

    return '<div class="doc-row">' + docIcon(x.fileType) +
      '<div class="doc-main"><div class="t">' + esc(x.title) + '</div>' +
      (x.desc ? '<div class="d">' + esc(x.desc) + '</div>' : '') +
      '<div class="doc-meta">' + chips.join('') + '</div></div>' +
      '<div class="doc-act">' + action + '</div></div>';
  }

  /* ---------- posts / events ---------- */

  /**
   * Deterministic placeholder art for posts with no cover image, so a card
   * without a photo still looks deliberate rather than broken.
   */
  function postArt(p, h) {
    var colour = (p._category && p._category.Colour) || '#1B3A5C';
    var label = esc(((p._category && p._category.Category_Name) || p.Content_Type || 'Post')
                    .split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 3).toUpperCase());
    var seed = String(p.Post_ID || p.Slug || '').split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
    return '<svg class="post-art" style="height:' + (h || 180) + 'px" viewBox="0 0 400 200" ' +
      'preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + esc(p.Title) + '">' +
      '<rect width="400" height="200" fill="' + colour + '"/>' +
      '<circle cx="' + (60 + seed % 120) + '" cy="40" r="90" fill="#fff" opacity=".07"/>' +
      '<circle cx="' + (300 + seed % 60) + '" cy="180" r="110" fill="#fff" opacity=".05"/>' +
      '<text x="200" y="112" text-anchor="middle" fill="#fff" opacity=".9" ' +
      'font-family="Segoe UI,Arial,sans-serif" font-size="44" font-weight="800">' + label + '</text>' +
      '</svg>';
  }

  function postCover(p, h) {
    /* _previewSrc is set ONLY by the admin composer, to show a data: URL that has
       not been uploaded yet. Data arriving from the sheet never carries it, so
       validUrl() still governs everything public. */
    if (p._previewSrc) {
      return '<img class="post-art" style="height:' + (h || 180) + 'px" src="' + esc(p._previewSrc) +
             '" alt="' + esc(p.Title) + '">';
    }
    var u = D.validUrl(p.Featured_Image_URL);
    return u
      ? '<img class="post-art" style="height:' + (h || 180) + 'px" src="' + esc(u) + '" alt="' + esc(p.Title) +
        '" loading="lazy" onerror="this.style.display=\'none\'">'
      : postArt(p, h);
  }

  /** Upcoming / Ongoing / Past / News — all derived, never stored. */
  function postTiming(p) {
    if (p._ongoing)  return '<span class="chip chip--live">● Ongoing</span>';
    if (p._upcoming) return '<span class="chip chip--upcoming">Upcoming</span>';
    if (p._past)     return '<span class="chip">Past event</span>';
    return '';
  }

  function postWhen(p) {
    if (p._isEvent) {
      var r = D.fmtRange(p.Event_Start_Date, p.Event_End_Date);
      return r ? '📅 ' + r + (p.Event_Time ? ' · ' + p.Event_Time : '') : '';
    }
    return p.Published_Date ? '📅 ' + D.fmtDate(p.Published_Date) : '';
  }

  function postCard(p) {
    var cat = p._category;
    var when = postWhen(p);
    var where = p.Venue || p.Location;
    return '<article class="card post-card">' +
      '<a class="post-cover" href="event.html?slug=' + encodeURIComponent(p.Slug) + '" ' +
        'aria-label="' + esc(p.Title) + '">' + postCover(p) +
        '<span class="post-type">' + esc(p.Content_Type) + '</span>' + '</a>' +
      '<div class="post-body">' +
        '<div class="post-chips">' +
          (cat ? '<span class="chip" style="background:' + esc(cat.Colour) + ';color:#fff;border-color:' +
                 esc(cat.Colour) + '">' + esc(cat.Category_Name) + '</span>' : '') +
          postTiming(p) +
          (p._featured ? '<span class="chip chip--ok">Featured</span>' : '') +
        '</div>' +
        '<h3><a href="event.html?slug=' + encodeURIComponent(p.Slug) + '">' + esc(p.Title) + '</a></h3>' +
        (p.Short_Description ? '<p>' + esc(p.Short_Description) + '</p>' : '') +
        '<div class="post-meta">' +
          (when ? '<span>' + esc(when) + '</span>' : '') +
          (where ? '<span>📍 ' + esc(where) + '</span>' : '') +
        '</div>' +
        '<a class="btn btn-outline btn-sm" href="event.html?slug=' + encodeURIComponent(p.Slug) + '">Read More →</a>' +
      '</div></article>';
  }

  /**
   * One citizen benefit. Written for a resident, not an official: what you get,
   * whether you qualify, where to go, what to carry, who to call.
   */
  function benefitCard(b, opts) {
    var o = opts || {};
    /* The (VERIFY …) marker is an instruction to the district office, not
       something a citizen should read. Strip it here; it is surfaced instead
       as an admin validation warning. */
    var amt = String(b.Amount || '').replace(/\s*\(VERIFY[^)]*\)/ig, '').trim();
    var free = /^free/i.test(amt);
    /* Don't prepend ₹ when the text already carries a currency word or symbol. */
    var hasCur = /(^|\s)(rs\.?|inr|₹)/i.test(amt);
    var title = t(b.Benefit_Title, b.Benefit_Title_HI);
    var desc = t(b.Benefit_Description, b.Benefit_Description_HI);

    var rows = '';
    if (b.Who_Is_Eligible)     rows += '<dt>Who can get it</dt><dd>' + esc(b.Who_Is_Eligible) + '</dd>';
    if (b.Where_To_Avail)      rows += '<dt>Where to go</dt><dd>' + esc(b.Where_To_Avail) + '</dd>';
    if (b.Documents_Required)  rows += '<dt>What to carry</dt><dd>' + esc(b.Documents_Required) + '</dd>';

    var help = String(b.Helpline || '').trim();
    var helpHtml = help
      ? '<div class="b-help">Helpline: ' + help.split('/').map(function (n) {
          var x = n.trim();
          return '<a href="tel:' + esc(x.replace(/[^0-9]/g, '')) + '">' + esc(x) + '</a>';
        }).join(' &nbsp;·&nbsp; ') + '</div>'
      : '';

    return '<div class="benefit">' +
      '<div class="post-chips">' +
        '<span class="chip b-type' + (free ? ' b-free' : '') + '">' + esc(b.Benefit_Type || '') + '</span>' +
        (o.showProgram && b._program
          ? '<a class="chip" href="program.html?p=' + encodeURIComponent(b._program.Program_ID) + '">' +
            esc(b._program.Program_Name) + '</a>' : '') +
      '</div>' +
      '<h3>' + esc(title) + '</h3>' +
      (amt ? '<span class="b-amount">' + (free ? '✔ ' : (hasCur ? '' : '₹ ')) + esc(amt) + '</span>' : '') +
      (desc ? '<p class="b-desc">' + esc(desc) + '</p>' : '') +
      (rows ? '<dl>' + rows + '</dl>' : '') +
      helpHtml +
    '</div>';
  }

  /* ---------- facilities ---------- */

  var FAC_TYPE = {
    DH:   'District Hospital',
    CHC:  'Community Health Centre',
    PHC:  'Primary Health Centre',
    APHC: 'Additional Primary Health Centre',
    HSC:  'Ayushman Arogya Mandir'
  };
  function facilityTypeName(t) { return FAC_TYPE[t] || t || 'Health Centre'; }

  /**
   * Directions are offered ONLY for a coordinate verified inside the district.
   * A wrong pin could send someone hundreds of kilometres, so no button at all
   * is the safer failure.
   */
  function directionsButton(f, cls) {
    if (f._mapOk && f._mapUrl) {
      return '<a class="btn ' + (cls || 'btn-outline btn-sm') + '" href="' + esc(f._mapUrl) +
             '" target="_blank" rel="noopener noreferrer">\u25ce Get directions</a>';
    }
    return '<span class="btn ' + (cls || 'btn-outline btn-sm') + '" aria-disabled="true" ' +
           'title="Location being verified">\u25ce Location being verified</span>';
  }

  function facilityCard(f) {
    var href = 'facility.html?id=' + encodeURIComponent(f.Facility_ID);
    var svc = (f._services || []).slice(0, 4);
    return '<article class="card facility-card">' +
      '<div class="fc-top">' +
        '<span class="fc-type fc-' + esc(f.Facility_Type) + '">' + esc(f.Facility_Type) + '</span>' +
        '<div style="min-width:0;flex:1">' +
          '<h3><a href="' + href + '">' + esc(t(f.Facility_Name, f.Facility_Name_HI)) + '</a></h3>' +
          '<div class="fc-meta">' + esc(facilityTypeName(f.Facility_Type)) + ' \u00b7 ' + esc(f.Block) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="post-chips">' +
        (f._is24x7 ? '<span class="chip chip--live">\u25cf 24\u00d77 emergency</span>'
                   : '<span class="chip">' + esc(f.Operating_Hours) + '</span>') +
        (f._beds ? '<span class="chip">' + f._beds + ' beds</span>' : '') +
      '</div>' +
      (svc.length ? '<div class="svc-list">' + svc.map(function (x) {
          return '<span class="svc-chip">' + esc(x) + '</span>';
        }).join('') + ((f._services || []).length > svc.length
          ? '<span class="svc-chip svc-more">+' + ((f._services.length) - svc.length) + '</span>' : '') +
        '</div>' : '') +
      '<div class="fc-actions">' +
        '<a class="btn btn-outline btn-sm" href="' + href + '">Details</a>' +
        directionsButton(f) +
      '</div>' +
    '</article>';
  }

  function emptyState(title, msg) {
    return '<div class="state"><div class="ico">◌</div><h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p></div>';
  }

  function errorState(msg) {
    return '<div class="state"><div class="ico">⚠</div><h3>Data could not be loaded</h3>' +
           '<p>' + esc(msg) + '</p>' +
           '<p><button class="btn btn-outline" onclick="PortalData.clear();location.reload()">Retry</button></p></div>';
  }

  function skeleton(n) {
    var s = '';
    for (var i = 0; i < (n || 4); i++) s += '<div class="skel skel-row"></div>';
    return s;
  }

  function param(name) {
    return new URLSearchParams(w.location.search).get(name) || '';
  }

  /**
   * Reads a value out of the PATH, for the pretty URLs in vercel.json:
   *   /events/world-breastfeeding-week-2026  → pathSeg('events') === 'world-…'
   *   /pip/2025-26                           → pathSeg('pip')    === '2025-26'
   *
   * A server rewrite only decides which FILE is served — the browser's URL,
   * and therefore location.search, still has no query string. So the pretty
   * routes have to be read from the path here, or they silently fall back to
   * the default view.
   */
  function pathSeg(prefix) {
    var parts = w.location.pathname.split('/').filter(Boolean);
    var i = parts.indexOf(prefix);
    return (i > -1 && parts[i + 1]) ? decodeURIComponent(parts[i + 1]) : '';
  }

  /** Query string first (canonical), then pretty path, then hash. */
  function route(name, prefix) {
    return param(name) || pathSeg(prefix) ||
           (w.location.hash ? decodeURIComponent(w.location.hash.replace(/^#\/?/, '')) : '');
  }

  function money(v) {
    var n = D.num(v);
    if (!n) return '—';
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L';
  }

  /**
   * Standard page boot: load data, paint shell + footer, hand data to the page.
   * Any failure lands in the page container as a retry-able error state.
   */
  function boot(activePage, render) {
    var main = document.getElementById('page');
    D.load().then(function (d) {
      renderShell(d, activePage);
      try { render(d); } catch (e) {
        console.error(e);
        if (main) main.innerHTML = '<div class="container">' + errorState(e.message) + '</div>';
      }
      renderFooter(d);
      if ((w.PORTAL_CONFIG || {}).SHOW_VALIDATION_TO_PUBLIC && d.validation.errors.length) {
        var b = document.createElement('div');
        b.className = 'container';
        b.innerHTML = '<div class="alert alert-warn">' + d.validation.errors.length +
          ' data row(s) were skipped because of errors in the source sheet.</div>';
        main && main.prepend(b);
      }
    }).catch(function (e) {
      console.error(e);
      if (main) main.innerHTML = '<div class="container" style="padding:48px 16px">' + errorState(e.message) + '</div>';
    });
  }

  w.UI = {
    boot: boot, renderShell: renderShell, renderFooter: renderFooter, crumbs: crumbs,
    docRow: docRow, docIcon: docIcon, emptyState: emptyState, errorState: errorState,
    postCard: postCard, postCover: postCover, postArt: postArt, benefitCard: benefitCard,
    facilityCard: facilityCard, facilityTypeName: facilityTypeName,
    directionsButton: directionsButton,
    postTiming: postTiming, postWhen: postWhen,
    skeleton: skeleton, icon: icon, t: t, lang: lang,
    param: param, pathSeg: pathSeg, route: route, money: money,
    setTheme: setTheme, Prefs: Prefs
  };
})(window, window.PortalData);

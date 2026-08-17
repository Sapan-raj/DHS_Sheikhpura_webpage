/* ============================================================
   Admin post composer — create / edit / publish / schedule posts,
   with local image upload straight from the computer or phone.

   Images are downscaled and re-encoded IN THE BROWSER before upload.
   A 4 MB phone photo becomes ~250 KB, which is what makes uploading
   over a district connection — and storing in Drive — practical.

   No storage credential exists in this file. Uploads are posted to the
   authenticated Apps Script endpoint, which writes to Drive as the owner.
   ============================================================ */
(function (w, D) {
  'use strict';
  var esc = D.esc;

  var MAX_EDGE = 1600;       // longest side after downscaling
  var QUALITY = 0.82;        // JPEG/WebP quality
  var MAX_SOURCE_BYTES = 25 * 1024 * 1024;   // reject absurd inputs before decoding
  var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;    // must match Code.gs MAX_UPLOAD_BYTES
  var MAX_GALLERY = 12;
  var OK_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  /* ---------- image processing ---------- */

  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('Could not read the file.')); };
      r.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error('That file is not a readable image.')); };
      i.src = dataUrl;
    });
  }

  /**
   * Downscale + re-encode. Returns { dataUrl, mimeType, bytes, w, h }.
   * PNGs with transparency stay PNG; everything else becomes JPEG.
   */
  function compress(file) {
    if (OK_TYPES.indexOf(String(file.type).toLowerCase()) === -1) {
      return Promise.reject(new Error('"' + file.name + '" is a ' + (file.type || 'unknown type') +
        '. Please choose a JPG, PNG or WebP image.'));
    }
    if (file.size > MAX_SOURCE_BYTES) {
      return Promise.reject(new Error('"' + file.name + '" is ' + mb(file.size) +
        ' MB. Please choose an image under ' + (MAX_SOURCE_BYTES / 1048576) + ' MB.'));
    }

    return readFile(file).then(loadImage).then(function (img) {
      var w0 = img.naturalWidth, h0 = img.naturalHeight;
      if (!w0 || !h0) throw new Error('That image has no readable dimensions.');

      var scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
      var w1 = Math.round(w0 * scale), h1 = Math.round(h0 * scale);

      var c = document.createElement('canvas');
      c.width = w1; c.height = h1;
      var ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w1, h1);

      /* PNG is only worth keeping when the image actually uses transparency.
         An opaque PNG photo or screenshot re-encodes to several times the size
         of the equivalent JPEG, and every home-page visitor pays for it. */
      var keepPng = String(file.type).toLowerCase() === 'image/png' && hasAlpha(ctx, w1, h1);
      var mime = keepPng ? 'image/png' : 'image/jpeg';

      if (!keepPng) {
        /* JPEG has no alpha — flatten onto white first, or transparent areas go black. */
        ctx.clearRect(0, 0, w1, h1);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w1, h1);
        ctx.drawImage(img, 0, 0, w1, h1);
      }
      var out = c.toDataURL(mime, QUALITY);

      var bytes = Math.round((out.length - out.indexOf(',') - 1) * 3 / 4);
      if (bytes > MAX_UPLOAD_BYTES) {
        throw new Error('"' + file.name + '" is still ' + mb(bytes) +
          ' MB after compression. Please use a smaller image.');
      }
      return { dataUrl: out, mimeType: mime, bytes: bytes, w: w1, h: h1,
               fileName: file.name, originalBytes: file.size };
    });
  }

  /** Sample the alpha channel on a grid — full-image scans are needlessly slow. */
  function hasAlpha(ctx, w, h) {
    var step = Math.max(1, Math.floor(Math.min(w, h) / 64));
    for (var y = 0; y < h; y += step) {
      var row = ctx.getImageData(0, y, w, 1).data;
      for (var x = 3; x < row.length; x += 4 * step) {
        if (row[x] < 250) return true;
      }
    }
    return false;
  }

  function mb(b) { return Math.round(b / 1048576 * 10) / 10; }
  function kb(b) { return Math.round(b / 1024); }

  /* ---------- composer ---------- */

  /**
   * @param opts.mount       element to render into
   * @param opts.data        the loaded dataset (for categories)
   * @param opts.post        existing post to edit, or null for a new one
   * @param opts.api         function(payload) -> Promise, the authenticated POST helper
   * @param opts.canPublish  false in local-preview mode (no API configured)
   * @param opts.onSaved     callback after a successful save
   * @param opts.onCancel    callback when the admin backs out
   */
  function open(opts) {
    var d = opts.data;
    var editing = !!(opts.post && opts.post.Post_ID);
    var p = opts.post || {};
    var cats = D.query.postCategories(d);

    /* working copy of the gallery: {url, caption, fileName, sizeKB, type, _pending, _dataUrl} */
    var gallery = editing
      ? D.query.postGallery(d, p.Post_ID).map(function (m) {
          return { url: m._url, caption: m.Caption || '', fileName: m.File_Name || '',
                   sizeKB: m.File_Size_KB || '', type: m.Media_Type || 'image' };
        })
      : [];
    var cover = { url: D.validUrl(p.Featured_Image_URL) || '', dataUrl: '', mimeType: '', bytes: 0, fileName: '' };

    var f = function (k, dflt) { return p[k] !== undefined && p[k] !== null && p[k] !== '' ? p[k] : (dflt || ''); };

    opts.mount.innerHTML =
      '<div class="composer" id="cmp">' +
        '<div class="composer-head">' +
          '<h3>' + (editing ? 'Edit post' : 'Create a new post') + '</h3>' +
          (editing ? '<span class="chip chip--code">' + esc(p.Post_ID) + '</span>' +
                     '<span class="status-pill st-' + esc(p.Status) + '">' + esc(p.Status) + '</span>' : '') +
          '<div class="spacer" style="margin-left:auto"></div>' +
          '<button class="btn btn-outline btn-sm" type="button" id="cCancel">← Back to posts</button>' +
        '</div>' +

        '<div class="composer-body">' +
          '<div id="cMsg"></div>' +

          '<div class="field"><label for="cTitle">Post title *</label>' +
            '<input id="cTitle" type="text" maxlength="150" placeholder="Give the post a clear, specific title" value="' + esc(f('Title')) + '"></div>' +

          '<div class="field"><label for="cShort">Short description <span style="font-weight:400;text-transform:none">— shown on the card</span></label>' +
            '<textarea id="cShort" maxlength="300" style="min-height:64px" placeholder="One or two sentences summarising the post.">' + esc(f('Short_Description')) + '</textarea>' +
            '<div class="upload-note" id="cShortCount"></div></div>' +

          '<div class="field"><label for="cFull">Full description</label>' +
            '<textarea id="cFull" style="min-height:170px" placeholder="The full text shown on the post page. Leave a blank line between paragraphs.">' + esc(f('Full_Description')) + '</textarea></div>' +

          /* ---- cover image ---- */
          '<div class="field"><label>Cover photo</label>' +
            '<div id="cCoverWrap"></div>' +
            '<input type="file" id="cCoverInput" accept="image/jpeg,image/png,image/webp" hidden>' +
          '</div>' +

          /* ---- gallery ---- */
          '<div class="field"><label>More photos <span style="font-weight:400;text-transform:none">— optional, up to ' + MAX_GALLERY + '</span></label>' +
            '<div id="cGalWrap"></div>' +
            '<input type="file" id="cGalInput" accept="image/jpeg,image/png,image/webp" multiple hidden>' +
          '</div>' +

          '<div class="composer-row thirds">' +
            '<div class="field"><label for="cType">Content type *</label><select id="cType">' +
              ['Event', 'News', 'Update'].map(function (t) {
                return '<option' + (f('Content_Type', 'Event') === t ? ' selected' : '') + '>' + t + '</option>';
              }).join('') + '</select></div>' +
            '<div class="field"><label for="cCat">Category</label><select id="cCat"><option value="">— none —</option>' +
              cats.map(function (c) {
                return '<option value="' + esc(c.Category_ID) + '"' +
                  (f('Category_ID') === c.Category_ID ? ' selected' : '') + '>' + esc(c.Category_Name) + '</option>';
              }).join('') + '</select></div>' +
            '<div class="field"><label for="cFeat">Featured post</label><select id="cFeat">' +
              '<option value="No"' + (D.yes(f('Is_Featured')) ? '' : ' selected') + '>No</option>' +
              '<option value="Yes"' + (D.yes(f('Is_Featured')) ? ' selected' : '') + '>Yes — pin to the top</option>' +
            '</select></div>' +
          '</div>' +

          '<div id="cEventFields">' +
            '<div class="composer-row thirds">' +
              '<div class="field"><label for="cStart">Event start date</label><input id="cStart" type="date" value="' + esc(f('Event_Start_Date')) + '"></div>' +
              '<div class="field"><label for="cEnd">Event end date</label><input id="cEnd" type="date" value="' + esc(f('Event_End_Date')) + '"></div>' +
              '<div class="field"><label for="cTime">Time</label><input id="cTime" type="text" placeholder="e.g. 10:00 AM" value="' + esc(f('Event_Time')) + '"></div>' +
            '</div>' +
            '<div class="composer-row">' +
              '<div class="field"><label for="cVenue">Venue</label><input id="cVenue" type="text" placeholder="e.g. PHC Chewara" value="' + esc(f('Venue')) + '"></div>' +
              '<div class="field"><label for="cLoc">Location / block</label><input id="cLoc" type="text" placeholder="e.g. Chewara Block, Sheikhpura" value="' + esc(f('Location', 'Sheikhpura District')) + '"></div>' +
            '</div>' +
          '</div>' +

          '<div class="composer-row">' +
            '<div class="field"><label for="cExt">External link <span style="font-weight:400;text-transform:none">— optional</span></label>' +
              '<input id="cExt" type="url" placeholder="https://…" value="' + esc(f('External_URL')) + '"></div>' +
            '<div class="field"><label>Attachment <span style="font-weight:400;text-transform:none">— PDF, XLSX, DOCX, PPTX</span></label>' +
              '<div id="cAttWrap"></div>' +
              '<input type="file" id="cAttInput" accept=".pdf,.xlsx,.docx,.pptx" hidden></div>' +
          '</div>' +

          '<div class="composer-row">' +
            '<div class="field"><label for="cStatus">Status *</label><select id="cStatus">' +
              ['Draft', 'Published', 'Scheduled', 'Archived'].map(function (s) {
                return '<option' + (f('Status', 'Draft') === s ? ' selected' : '') + '>' + s + '</option>';
              }).join('') + '</select>' +
              '<div class="upload-note" id="cStatusHint"></div></div>' +
            '<div class="field" id="cSchedWrap"><label for="cSched">Publish at</label>' +
              '<input id="cSched" type="datetime-local" value="' + esc(toLocalInput(f('Scheduled_Date'))) + '">' +
              '<div class="upload-note">The post stays hidden until this moment, then appears on its own.</div></div>' +
          '</div>' +

        '</div>' +

        '<div class="composer-foot">' +
          '<button class="btn btn-outline" type="button" id="cPreview">👁 Preview</button>' +
          '<div class="spacer"></div>' +
          '<button class="btn btn-outline" type="button" id="cDraft">Save as draft</button>' +
          '<button class="btn btn-primary" type="button" id="cPublish">Publish</button>' +
        '</div>' +
      '</div>' +
      '<div id="cPreviewWrap" style="margin-top:24px"></div>';

    /* ---------- element refs ---------- */
    var $ = function (id) { return document.getElementById(id); };
    var att = { url: D.validUrl(p.Attachment_URL) || '', name: f('Attachment_Name'), dataUrl: '', mimeType: '', bytes: 0 };

    function msg(kind, text) {
      $('cMsg').innerHTML = text ? '<div class="alert alert-' + kind + '">' + esc(text) + '</div>' : '';
      if (text) $('cMsg').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ---------- cover ---------- */
    function drawCover() {
      var src = cover.dataUrl || cover.url;
      $('cCoverWrap').innerHTML = src
        ? '<div class="thumbs"><div class="thumb" style="max-width:260px">' +
            '<span class="th-badge">Cover</span>' +
            '<img src="' + esc(src) + '" alt="Cover preview" style="height:150px">' +
            '<div class="th-bar"><button type="button" id="cCoverReplace">Replace</button>' +
            '<button type="button" id="cCoverRemove">Remove</button></div>' +
          '</div></div>' +
          '<div class="upload-note" style="margin-top:8px">' +
            (cover.bytes ? esc(cover.fileName) + ' · ' + kb(cover.bytes) + ' KB after compression'
                         : 'Existing cover image') + '</div>'
        : '<div class="dropzone" id="cCoverZone" tabindex="0" role="button">' +
            '<div class="dz-ico">🖼</div>' +
            '<div><strong>Add a cover photo</strong></div>' +
            '<div class="dz-hint">Click to choose from this device, or drag an image here.<br>' +
            'JPG, PNG or WebP. Large photos are resized automatically.</div>' +
          '</div>';
      wireCover();
    }

    function wireCover() {
      var zone = $('cCoverZone');
      if (zone) {
        zone.addEventListener('click', function () { $('cCoverInput').click(); });
        zone.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('cCoverInput').click(); }
        });
        dragTarget(zone, function (files) { pickCover(files[0]); });
      }
      var rep = $('cCoverReplace'), rem = $('cCoverRemove');
      rep && rep.addEventListener('click', function () { $('cCoverInput').click(); });
      rem && rem.addEventListener('click', function () {
        cover = { url: '', dataUrl: '', mimeType: '', bytes: 0, fileName: '' };
        drawCover();
      });
    }

    function pickCover(file) {
      if (!file) return;
      msg('', '');
      compress(file).then(function (r) {
        cover = { url: '', dataUrl: r.dataUrl, mimeType: r.mimeType, bytes: r.bytes, fileName: r.fileName };
        drawCover();
      }).catch(function (e) { msg('err', e.message); });
    }

    $('cCoverInput').addEventListener('change', function () {
      pickCover(this.files[0]); this.value = '';
    });

    /* ---------- gallery ---------- */
    function drawGallery() {
      var html = '';
      if (gallery.length) {
        html += '<div class="thumbs">' + gallery.map(function (g, i) {
          return '<div class="thumb">' +
            '<span class="th-badge">' + (i + 1) + '</span>' +
            '<img src="' + esc(g._dataUrl || g.url) + '" alt="' + esc(g.caption || 'Photo ' + (i + 1)) + '">' +
            '<div class="th-bar">' +
              '<button type="button" data-cap="' + i + '">Caption</button>' +
              '<button type="button" data-del="' + i + '">Remove</button>' +
            '</div>' +
            (g.caption ? '<div class="upload-note" style="padding:0 6px 6px">' + esc(g.caption) + '</div>' : '') +
          '</div>';
        }).join('') + '</div>';
      }
      if (gallery.length < MAX_GALLERY) {
        html += '<div class="dropzone" id="cGalZone" tabindex="0" role="button" style="margin-top:' + (gallery.length ? '12px' : '0') + ';padding:' + (gallery.length ? '20px' : '40px') + '">' +
          '<div class="dz-ico">➕</div>' +
          '<div><strong>Add photos</strong></div>' +
          '<div class="dz-hint">Select several at once. ' + (MAX_GALLERY - gallery.length) + ' remaining.</div></div>';
      }
      $('cGalWrap').innerHTML = html;

      var z = $('cGalZone');
      if (z) {
        z.addEventListener('click', function () { $('cGalInput').click(); });
        z.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('cGalInput').click(); }
        });
        dragTarget(z, addGallery);
      }
      Array.prototype.forEach.call($('cGalWrap').querySelectorAll('[data-del]'), function (b) {
        b.addEventListener('click', function () {
          gallery.splice(D.num(this.dataset.del), 1); drawGallery();
        });
      });
      Array.prototype.forEach.call($('cGalWrap').querySelectorAll('[data-cap]'), function (b) {
        b.addEventListener('click', function () {
          var i = D.num(this.dataset.cap);
          var v = w.prompt('Caption for photo ' + (i + 1) + ':', gallery[i].caption || '');
          if (v !== null) { gallery[i].caption = v.slice(0, 160); drawGallery(); }
        });
      });
    }

    function addGallery(files) {
      var list = Array.prototype.slice.call(files, 0, MAX_GALLERY - gallery.length);
      if (!list.length) return;
      msg('ok', 'Processing ' + list.length + ' image' + (list.length === 1 ? '' : 's') + '…');
      var errors = [];
      list.reduce(function (chain, file) {
        return chain.then(function () {
          return compress(file).then(function (r) {
            gallery.push({ url: '', _dataUrl: r.dataUrl, mimeType: r.mimeType, bytes: r.bytes,
                           fileName: r.fileName, caption: '', type: 'image', _pending: true });
            drawGallery();
          }).catch(function (e) { errors.push(e.message); });
        });
      }, Promise.resolve()).then(function () {
        msg(errors.length ? 'warn' : '', errors.length ? errors.join(' ') : '');
      });
    }

    $('cGalInput').addEventListener('change', function () {
      addGallery(this.files); this.value = '';
    });

    /* ---------- attachment ---------- */
    function drawAtt() {
      $('cAttWrap').innerHTML = (att.dataUrl || att.url)
        ? '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<span class="chip chip--file">' + esc((att.name || 'file').split('.').pop().toUpperCase()) + '</span>' +
            '<span style="font-size:.85rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(att.name) + '</span>' +
            '<button class="btn btn-outline btn-sm" type="button" id="cAttRemove">Remove</button></div>'
        : '<button class="btn btn-outline btn-sm" type="button" id="cAttPick" style="width:100%">📎 Choose a document</button>';
      var pick = $('cAttPick'), rem = $('cAttRemove');
      pick && pick.addEventListener('click', function () { $('cAttInput').click(); });
      rem && rem.addEventListener('click', function () {
        att = { url: '', name: '', dataUrl: '', mimeType: '', bytes: 0 }; drawAtt();
      });
    }

    $('cAttInput').addEventListener('change', function () {
      var file = this.files[0]; this.value = '';
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) { msg('err', 'Attachment is ' + mb(file.size) + ' MB. Maximum is ' + (MAX_UPLOAD_BYTES / 1048576) + ' MB.'); return; }
      readFile(file).then(function (dataUrl) {
        att = { url: '', name: file.name, dataUrl: dataUrl, mimeType: file.type, bytes: file.size };
        drawAtt(); msg('', '');
      }).catch(function (e) { msg('err', e.message); });
    });

    /* ---------- drag & drop ---------- */
    function dragTarget(el, cb) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.remove('drag'); });
      });
      el.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files.length) cb(e.dataTransfer.files);
      });
    }

    /* ---------- conditional fields ---------- */
    function syncType() {
      var isEvent = $('cType').value === 'Event';
      $('cEventFields').style.display = isEvent ? '' : 'none';
    }
    function syncStatus() {
      var s = $('cStatus').value;
      $('cSchedWrap').style.display = s === 'Scheduled' ? '' : 'none';
      $('cStatusHint').textContent = {
        Draft: 'Saved but not visible on the website.',
        Published: 'Live on the website as soon as you save.',
        Scheduled: 'Hidden until the date and time below.',
        Archived: 'Hidden from listings but kept for the record.'
      }[s] || '';
      $('cPublish').textContent = s === 'Scheduled' ? 'Schedule' : (s === 'Published' ? 'Publish' : 'Save');
    }
    function syncCount() {
      var n = $('cShort').value.length;
      $('cShortCount').textContent = n + ' / 300 characters';
    }
    $('cType').addEventListener('change', syncType);
    $('cStatus').addEventListener('change', syncStatus);
    $('cShort').addEventListener('input', syncCount);

    /* ---------- preview ---------- */
    $('cPreview').addEventListener('click', function () {
      var draft = collect();
      draft._category = cats.filter(function (c) { return c.Category_ID === draft.Category_ID; })[0] || null;
      draft.Featured_Image_URL = cover.url;
      draft._previewSrc = cover.dataUrl || cover.url;   // shows the un-uploaded image
      var s = D.parseDate(draft.Event_Start_Date), e = D.parseDate(draft.Event_End_Date) || s;
      var mid = new Date(); mid.setHours(0, 0, 0, 0);
      draft._isEvent = draft.Content_Type === 'Event' && !!s;
      draft._upcoming = draft._isEvent && s >= mid;
      draft._ongoing = draft._isEvent && s <= mid && !!e && e >= mid;
      draft._past = draft._isEvent && !!e && e < mid;
      draft._featured = D.yes(draft.Is_Featured);
      draft.Slug = draft.Slug || 'preview';

      $('cPreviewWrap').innerHTML =
        '<div class="section-head"><h2>Preview</h2><p>This is how the card will look on the home page and events listing.</p></div>' +
        '<div class="grid grid-3">' + w.UI.postCard(draft) + '</div>';
      $('cPreviewWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ---------- collect + save ---------- */
    function collect() {
      return {
        Post_ID: p.Post_ID || '',
        Slug: p.Slug || '',
        Title: $('cTitle').value.trim(),
        Short_Description: $('cShort').value.trim(),
        Full_Description: $('cFull').value.trim(),
        Content_Type: $('cType').value,
        Category_ID: $('cCat').value,
        Featured_Image_URL: cover.url,
        Event_Start_Date: $('cType').value === 'Event' ? $('cStart').value : '',
        Event_End_Date: $('cType').value === 'Event' ? $('cEnd').value : '',
        Event_Time: $('cType').value === 'Event' ? $('cTime').value.trim() : '',
        Venue: $('cType').value === 'Event' ? $('cVenue').value.trim() : '',
        Location: $('cLoc').value.trim(),
        External_URL: $('cExt').value.trim(),
        Attachment_URL: att.url,
        Attachment_Name: att.name,
        Published_Date: p.Published_Date || '',
        Scheduled_Date: $('cStatus').value === 'Scheduled' ? fromLocalInput($('cSched').value) : '',
        Author: p.Author || '',
        Is_Featured: $('cFeat').value,
        Status: $('cStatus').value,
        Created_Date: p.Created_Date || '',
        Updated_Date: ''
      };
    }

    function validate(rec) {
      if (!rec.Title) return 'Please enter a post title.';
      if (rec.Status === 'Scheduled' && !rec.Scheduled_Date) return 'Choose the date and time to publish at.';
      if (rec.Status === 'Scheduled' && D.parseWhen(rec.Scheduled_Date) <= new Date()) {
        return 'The scheduled time is in the past. Pick a future time, or set the status to Published.';
      }
      if (rec.Content_Type === 'Event' && rec.Event_Start_Date && rec.Event_End_Date &&
          rec.Event_End_Date < rec.Event_Start_Date) return 'The event end date is before the start date.';
      if (rec.External_URL && !/^https?:\/\//i.test(rec.External_URL)) {
        return 'The external link must start with http:// or https://';
      }
      return '';
    }

    function save(forceStatus) {
      if (forceStatus) { $('cStatus').value = forceStatus; syncStatus(); }
      var rec = collect();
      var err = validate(rec);
      if (err) { msg('err', err); return; }

      if (!opts.canPublish) {
        msg('warn', 'Local preview mode — there is no data service configured, so nothing can be saved. ' +
                    'Set API_URL in assets/js/config.js to enable publishing. ' +
                    'Everything else on this screen, including image compression and preview, is working normally.');
        return;
      }

      var btns = [$('cDraft'), $('cPublish')];
      btns.forEach(function (b) { b.disabled = true; });
      var origLabel = $('cPublish').textContent;
      var step = function (t) { $('cPublish').textContent = t; };

      /* 1. upload cover  2. upload new gallery images  3. upload attachment  4. save the row */
      var chain = Promise.resolve();

      if (cover.dataUrl) {
        chain = chain.then(function () {
          step('Uploading cover…');
          return opts.api({ action: 'mediaUpload', data: cover.dataUrl,
                            mimeType: cover.mimeType, fileName: cover.fileName })
            .then(function (r) {
              if (!r.ok) throw new Error('Cover image: ' + r.error);
              rec.Featured_Image_URL = r.url;
            });
        });
      }

      var pending = gallery.filter(function (g) { return g._pending; });
      pending.forEach(function (g, i) {
        chain = chain.then(function () {
          step('Uploading photo ' + (i + 1) + ' of ' + pending.length + '…');
          return opts.api({ action: 'mediaUpload', data: g._dataUrl,
                            mimeType: g.mimeType, fileName: g.fileName })
            .then(function (r) {
              if (!r.ok) throw new Error('Photo "' + g.fileName + '": ' + r.error);
              g.url = r.url; g.sizeKB = r.sizeKB; g._pending = false; delete g._dataUrl;
            });
        });
      });

      if (att.dataUrl) {
        chain = chain.then(function () {
          step('Uploading attachment…');
          return opts.api({ action: 'mediaUpload', data: att.dataUrl,
                            mimeType: att.mimeType, fileName: att.name })
            .then(function (r) {
              if (!r.ok) throw new Error('Attachment: ' + r.error);
              rec.Attachment_URL = r.url; att.url = r.url; att.dataUrl = '';
            });
        });
      }

      chain.then(function () {
        step('Saving…');
        return opts.api({
          action: 'postSave', post: rec,
          gallery: gallery.map(function (g) {
            return { url: g.url, caption: g.caption, fileName: g.fileName, sizeKB: g.sizeKB, type: g.type || 'image' };
          })
        });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.error || 'Save failed.');
        msg('ok', 'Saved. ' + (rec.Status === 'Published'
          ? 'The post is now live on the website.'
          : rec.Status === 'Scheduled'
            ? 'It will appear automatically at the scheduled time.'
            : 'It is saved as ' + rec.Status.toLowerCase() + ' and is not visible to the public.'));
        D.clear();
        setTimeout(function () { opts.onSaved && opts.onSaved(r.post); }, 1200);
      }).catch(function (e) {
        btns.forEach(function (b) { b.disabled = false; });
        $('cPublish').textContent = origLabel;
        msg('err', e.message);
      });
    }

    $('cDraft').addEventListener('click', function () { save('Draft'); });
    $('cPublish').addEventListener('click', function () { save(); });
    $('cCancel').addEventListener('click', function () { opts.onCancel && opts.onCancel(); });

    drawCover(); drawGallery(); drawAtt(); syncType(); syncStatus(); syncCount();
    $('cTitle').focus();
  }

  /* "2026-08-28 09:00" <-> "2026-08-28T09:00" */
  function toLocalInput(s) {
    var m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
    if (m) return m[1] + 'T' + String(m[2]).padStart(2, '0') + ':' + m[3];
    var d = String(s || '').match(/^(\d{4}-\d{2}-\d{2})$/);
    return d ? d[1] + 'T09:00' : '';
  }
  function fromLocalInput(v) {
    return String(v || '').replace('T', ' ').slice(0, 16);
  }

  w.Composer = { open: open, compress: compress };
})(window, window.PortalData);

// Settings page logic. index.js writes STATE into the page before opening it:
// { settings: what is saved, platform: the watch's }. Save hands the whole
// settings object back as JSON (return_to, or the pebblejs://close form).
//
// One settings object, S, is the truth; every change goes through set() and
// redraws what it touches. The face drawing is face.js, the block list and the
// column rule catalog.js, share codes and presets code.js.
(function () {
  var catalog = require('./catalog');
  var face = require('./face');
  var code = require('./code');
  var tz = require('./timezone');

  var state = window.STATE || {};
  var VERSION = '%%VERSION%%';   // written in by scripts/inline-config.mjs
  var platform = state.platform || 'basalt';
  var round = catalog.isRoundPlatform(platform);
  var S = catalog.settle(catalog.normalize(state.settings), platform);
  var ui = { tab: 'face', sel: null, cat: 'all', sheet: null };

  var WATCHES = { aplite: 'Pebble', basalt: 'Pebble Time', chalk: 'Pebble Time Round',
    diorite: 'Pebble 2', emery: 'Pebble Time 2', flint: 'Pebble 2 Duo', gabbro: 'Pebble Round 2' };

  function $(id) { return document.getElementById(id); }
  function hex(n) { return '#' + ('00000' + (n & 0xFFFFFF).toString(16)).slice(-6).toUpperCase(); }
  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function slotIndex(key) { return catalog.SLOT_KEYS.indexOf(key); }

  var CHEVRON = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  // --- Drawing the face ----------------------------------------------------

  // A slot's second time zone as the preview draws it: the zone's offset now,
  // and its distance from this phone, so every clock shows the same moment.
  function zoneSample(s, i) {
    var info = tz.tzInfo(s['TZ_ZONE[' + i + ']'] || 'UTC', new Date());
    return { delta: info.offset + new Date().getTimezoneOffset(), abbr: info.abbr, offset: info.offset };
  }

  // aplite draws with the system fonts, so it previews the default.
  function fontCss(s) { return catalog.FONTS[platform === 'aplite' ? 0 : s.FONT].css; }

  function faceCfg(s, opts) {
    return {
      platform: platform, font: fontCss(s), sel: opts.sel || null, overlays: opts.overlays, width: opts.width,
      layout: s.LAYOUT, yearTop: s.YEAR_TOP, lang: s.LANG, units: s.UNITS,
      tz: catalog.SLOTS.map(function (x, i) { return zoneSample(s, i); }),
      texts: catalog.SLOTS.map(function (x, i) { return s['TEXT[' + i + ']']; }),
      band: s.BLOCK_BAND, midLeft: s.BLOCK_MID_LEFT, midRight: s.BLOCK_MID_RIGHT,
      blocks: [s.BLOCK_TOP_LEFT, s.BLOCK_TOP_RIGHT, s.BLOCK_BOTTOM_LEFT, s.BLOCK_BOTTOM_RIGHT],
      face: hex(s.FACE_COLOR), weekend: hex(s.WEEKEND_COLOR),
      panels: catalog.PANEL_KEYS.map(function (k) { return hex(s[k]); }),
      showSeconds: s.SHOW_SECONDS, drawSeam: s.DRAW_SEAM
    };
  }

  // One block on its own, drawn for slot `key` (its panel, zone and text).
  function swatch(v, key, opts) {
    var i = slotIndex(key);
    return face.swatch(v, {
      panel: hex(opts.panel !== undefined ? opts.panel : S[catalog.PANEL_KEYS[i]]),
      weekend: hex(opts.weekend !== undefined ? opts.weekend : S.WEEKEND_COLOR),
      face: hex(S.FACE_COLOR), showSeconds: S.SHOW_SECONDS, font: fontCss(S),
      tz: zoneSample(S, i), str: S['TEXT[' + i + ']'], box: 48, scale: opts.scale
    });
  }

  function slotName(key) {
    if (round && S.LAYOUT) {
      if (key === 'BLOCK_MID_LEFT') { return 'Top strip'; }
      if (key === 'BLOCK_MID_RIGHT') { return 'Bottom strip'; }
    }
    return catalog.SLOTS[slotIndex(key)].name;
  }

  function drawFace() {
    $('face-preview').innerHTML = face.build(faceCfg(S, { sel: ui.sel, width: round ? 230 : 210 }));
    $('style-preview').innerHTML = face.build(faceCfg(S, { overlays: false, width: round ? 120 : 110 }));
    $('face-hint').textContent = ui.sel ? slotName(ui.sel) + ' selected. Tap it again to close.'
      : 'Tap a block on the face to change it.';
  }

  // --- Face tab: the block picker -------------------------------------------

  // A tile stands for its whole variation group (it places the group's first
  // block), so the other members are folded away.
  function folded(v) {
    var g = catalog.VARIATION_OF[v];
    return !!g && g.options[0][0] !== v;
  }

  function tileHtml(v, key) {
    var cur = S[key], g = catalog.VARIATION_OF[v];
    var on = v === cur || (!!g && g === catalog.VARIATION_OF[cur]);
    var draw = on ? cur : v;
    var label = catalog.BLOCKS[v].label;
    return '<button type="button" class="tile" data-block="' + draw + '" aria-pressed="' + on + '">' +
      swatch(draw, key, { scale: 1.9 }) + '<span>' + esc(label) + '</span></button>';
  }

  function drawEditor() {
    var host = $('editor');
    var key = ui.sel;
    if (!key) { host.innerHTML = ''; return; }
    var allows = catalog.slotAllows(key, S, platform);
    var ids = catalog.ORDER.filter(function (v) {
      return allows(v) && !folded(v) && (ui.cat === 'all' || catalog.BLOCKS[v].cat === ui.cat);
    });
    var big = ids.filter(catalog.isBig), small = ids.filter(function (v) { return !catalog.isBig(v); });
    var cur = S[key], i = slotIndex(key);
    var group = catalog.VARIATION_OF[cur];
    var title = catalog.BLOCKS[group ? group.options[0][0] : cur].label;

    var html = '<div class="block stack">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">' +
      '<h2>' + esc(slotName(key)) + '</h2><span class="sub">' +
      (allows(7) && !allows(2) ? 'Short blocks only' : (catalog.isBig(cur) ? 'Big block' : 'Short block')) +
      '</span></div>';

    // What the placed block can be tuned to.
    html += '<div class="card options"><h3>' + esc(title) + '</h3>';
    var opts = group ? group.options.filter(function (o) { return allows(o[0]); }) : [];
    if (opts.length > 1) {
      html += '<div class="field"><span class="label" id="var-label">' + esc(group.name) + '</span>' +
        '<div class="seg inset" role="group" aria-labelledby="var-label">' + opts.map(function (o) {
          return '<button type="button" data-block="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>';
        }).join('') + '</div>';
      if (group.name === 'Type') {
        html += '<span class="note">Auto shows whichever comes next, and switches the minute it goes by.</span>';
      }
      html += '</div>';
    }
    if (catalog.TZ_BLOCKS[cur]) {
      var zone = S['TZ_ZONE[' + i + ']'];
      html += '<label class="field"><span class="label">Time zone</span><select data-zone="' + i + '">' +
        tz.ZONES.map(function (z) {
          return '<option value="' + z.zone + '"' + (z.zone === zone ? ' selected' : '') + '>' +
            esc(z.city + ' (' + z.abbr + (z.dst ? '/' + z.dst : '') + ')') + '</option>';
        }).join('') + '</select></label>';
    }
    if (catalog.TEXT_BLOCKS[cur]) {
      html += '<label class="field"><span class="label">Text</span>' +
        '<input type="text" data-text="' + i + '" maxlength="15" placeholder="Up to 15 characters" value="' + esc(S['TEXT[' + i + ']']) + '">' +
        '<span class="note">Letters, digits and . - / % : @ only. Long text shrinks to fit.</span></label>';
    }
    html += '<button type="button" class="row" data-sheet="' + catalog.PANEL_KEYS[i] + '" aria-haspopup="dialog">' +
      '<span class="grow"><b style="font-size:15px">Panel color</b></span>' +
      '<span class="chip" style="background:' + hex(S[catalog.PANEL_KEYS[i]]) + '"></span>' + CHEVRON + '</button>';
    html += '</div>';
    html += '<h3 style="margin-top:12px">Choose a block</h3>';
    html += '<div class="chips" role="group" aria-label="Block categories">' +
      catalog.CATEGORIES.map(function (c) {
        return '<button type="button" data-cat="' + c[0] + '" aria-pressed="' + (ui.cat === c[0]) + '">' + c[1] + '</button>';
      }).join('') + '</div>';

    if (big.length) {
      html += '<p class="kind">Big</p><div class="tiles">' + big.map(function (v) { return tileHtml(v, key); }).join('') + '</div>';
    }
    if (small.length) {
      html += '<p class="kind">' + (big.length ? 'Short' : 'Blocks') + '</p><div class="tiles">' +
        small.map(function (v) { return tileHtml(v, key); }).join('') + '</div>';
    }
    if (!ids.length) { html += '<p class="note">Nothing in this category fits here.</p>'; }

    html += '</div>';
    host.innerHTML = html;
  }

  // --- Style tab --------------------------------------------------------------

  var THUMBS = {
    classic: [[22, 6, 28, 12], [5, 22, 29, 15], [38, 22, 29, 29], [5, 41, 29, 29], [38, 55, 29, 15]],
    six: [[5, 7, 29, 14], [5, 24, 29, 14], [5, 41, 29, 31], [38, 7, 29, 31], [38, 41, 29, 14], [38, 58, 29, 14]],
    classicRound: [[27, 6, 28, 12], [10, 22, 29, 15], [43, 22, 29, 29], [10, 41, 29, 29], [43, 55, 29, 15]],
    sixRound: [[27, 4, 28, 10], [10, 17, 29, 14], [43, 17, 29, 29], [10, 34, 29, 29], [43, 49, 29, 14], [27, 68, 28, 10]]
  };

  function drawStyle() {
    $('layouts').innerHTML = [[0, 'Classic', 'Banner + 4 blocks', 'classic'],
      [1, 'Columns', round ? '4 blocks + 2 strips' : '6 blocks', 'six']].map(function (l) {
      var rects = THUMBS[l[3] + (round ? 'Round' : '')];
      return '<button type="button" class="layout" data-layout="' + l[0] + '" aria-pressed="' + (S.LAYOUT === l[0]) + '">' +
        '<span class="thumb' + (round ? ' round' : '') + '" aria-hidden="true">' + rects.map(function (r) {
          return '<i style="left:' + r[0] + 'px;top:' + r[1] + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px"></i>';
        }).join('') + '</span><span><b style="display:block;font-size:16px">' + l[1] + '</b>' +
        '<span class="sub">' + l[2] + '</span></span></button>';
    }).join('');

    $('colors').innerHTML = [['FACE_COLOR', 'Face background', 'Shows in the gaps around the blocks'],
      ['PANEL_COLOR', 'All panels', 'Sets every block. Change one on the Face tab'],
      ['WEEKEND_COLOR', 'Weekend & accent', 'The weekday block on Saturday and Sunday']].map(function (c) {
      return '<button type="button" class="row" data-sheet="' + c[0] + '" aria-haspopup="dialog">' +
        '<span class="grow"><b>' + esc(c[1]) + '</b><small>' + esc(c[2]) + '</small></span>' +
        '<span class="chip" style="background:' + hex(S[c[0]]) + '"></span>' + CHEVRON + '</button>';
    }).join('');

    var toggles = [['DRAW_SEAM', 'Seam line', 'The thin line across each block, like a flip display.'],
      ['FLIP_ANIM', 'Flip animation', 'Blocks flip over when their value changes.'],
      ['YEAR_TOP', 'Banner at top', 'Off puts the banner under the blocks.'],
      ['SHOW_SECONDS', 'Seconds hand', 'Analog clock only. It redraws every second, so it uses more battery.']];
    $('toggles').innerHTML = toggles.filter(function (t) { return !(t[0] === 'YEAR_TOP' && S.LAYOUT); }).map(function (t) {
      return '<div class="row"><span class="grow"><b id="lbl-' + t[0] + '">' + t[1] + '</b><small>' + t[2] + '</small></span>' +
        '<button type="button" class="switch" role="switch" data-toggle="' + t[0] + '" aria-checked="' + !!S[t[0]] +
        '" aria-labelledby="lbl-' + t[0] + '"><i></i></button></div>';
    }).join('');

    $('font').innerHTML = catalog.FONTS.map(function (f, i) {
      return '<option value="' + i + '"' + (S.FONT === i ? ' selected' : '') + '>' + f.name + '</option>';
    }).join('');
    $('lang').innerHTML = catalog.LANGS.map(function (name, i) {
      return '<option value="' + i + '"' + (S.LANG === i ? ' selected' : '') + '>' + name + '</option>';
    }).join('');
    $('units').innerHTML = [[0, 'Metric · °C, mm'], [1, 'Imperial · °F, in']].map(function (u) {
      return '<button type="button" data-units="' + u[0] + '" aria-pressed="' + (S.UNITS === u[0]) + '">' + u[1] + '</button>';
    }).join('');
  }

  // --- Presets tab ------------------------------------------------------------

  function drawPresets() {
    $('preset-list').innerHTML = code.PRESETS.map(function (p, n) {
      var values = code.decode(p.code);
      if (typeof values === 'string') { return ''; }
      var look = catalog.settle(code.apply(S, values, code.PRESET_SKIP), platform);
      return '<button type="button" class="preset" data-preset="' + n + '">' +
        '<span class="bezel small' + (round ? ' round' : '') + '" aria-hidden="true">' +
        face.build(faceCfg(look, { overlays: false, width: 100 })) + '</span>' + esc(p.name) + '</button>';
    }).join('');
    $('code-out').value = code.encode(S);
  }

  // --- The color sheet ------------------------------------------------------------

  // The watch's 64 colors as a honeycomb, as Ultra lays them out: the four grays
  // in the corners, the other 60 in rings 1..4, dark in the middle, light at the
  // rim, hue around.
  var HONEY = (function () {
    function chans(a) { return [((a >> 4) & 3) * 85, ((a >> 2) & 3) * 85, (a & 3) * 85]; }
    function total(a) { var v = chans(a); return v[0] + v[1] + v[2]; }
    function hue(a) {
      var v = chans(a), h = Math.atan2(1.732 * (v[1] - v[2]), 2 * v[0] - v[1] - v[2]);
      return h < 0 ? h + 2 * Math.PI : h;
    }
    var out = [[-2, -4, 0xFF], [6, -4, 0xEA], [-6, 4, 0xD5], [2, 4, 0xC0]], hued = [];
    for (var a = 0xC0; a <= 0xFF; a++) {
      var v = chans(a);
      if (v[0] !== v[1] || v[1] !== v[2]) { hued.push(a); }
    }
    hued.sort(function (x, y) { return total(x) - total(y); });
    for (var ring = 1; ring <= 4; ring++) {
      var cells = hued.splice(0, 6 * ring).sort(function (x, y) { return hue(x) - hue(y); });
      var q = ring, r = 0;
      [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]].forEach(function (d) {
        for (var n = 0; n < ring; n++) { out.push([q, r, cells.shift()]); q += d[0]; r += d[1]; }
      });
    }
    return out.map(function (c) {
      var ch = chans(c[2]);
      return { color: (ch[0] << 16) | (ch[1] << 8) | ch[2],
        left: ((c[0] + c[1] / 2 + 4) / 9 * 100).toFixed(2), top: ((1.5 * c[1] + 6) / 14 * 100).toFixed(2) };
    });
  })();

  var SHEETS = {
    FACE_COLOR: ['Face background', 'Shows around the blocks'],
    PANEL_COLOR: ['All panels', 'Sets every block'],
    WEEKEND_COLOR: ['Weekend & accent', 'The weekday block on Saturday and Sunday']
  };

  function light(n) { return (((n >> 16) & 255) * 30 + ((n >> 8) & 255) * 59 + (n & 255) * 11) / 100 >= 128; }

  function drawSheet() {
    var host = $('sheet-host'), key = ui.sheet;
    if (!key) { host.innerHTML = ''; return; }
    var panelOf = catalog.PANEL_KEYS.indexOf(key);
    var title, sub, preview, note;
    if (panelOf > -1) {
      var slot = catalog.SLOT_KEYS[panelOf];
      title = 'Panel color';
      sub = slotName(slot) + ' · ' + catalog.BLOCKS[S[slot]].label;
      preview = swatch(S[slot], slot, { scale: 2.1 });
      note = light(S[key]) ? 'Text turns black on this panel.' : 'Text stays white on this panel.';
    } else if (key === 'WEEKEND_COLOR') {
      title = SHEETS[key][0]; sub = SHEETS[key][1];
      preview = swatch(0, catalog.SLOT_KEYS[0], { scale: 2.1 });
      note = 'Shown on Sunday, as here.';
    } else {
      title = SHEETS[key][0]; sub = SHEETS[key][1];
      preview = '<span class="bezel small' + (round ? ' round' : '') + '" style="padding:4px">' +
        face.build(faceCfg(S, { overlays: false, width: 92 })) + '</span>';
      note = key === 'PANEL_COLOR' ? (light(S[key]) ? 'Text turns black.' : 'Text stays white.') : '';
    }
    host.innerHTML = '<button type="button" class="scrim" data-close aria-label="Close color picker"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<span class="grab" aria-hidden="true"></span>' +
      '<div class="sheet-head"><div><h3 id="sheet-title">' + esc(title) + '</h3><span class="sub">' + esc(sub) + '</span></div>' +
      '<button type="button" class="close" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="picker"><div class="honey" role="group" aria-label="' + esc(title) + '">' + HONEY.map(function (c) {
        return '<button type="button" data-color="' + c.color + '" aria-label="' + hex(c.color) + '" aria-pressed="' + (c.color === S[key]) +
          '" style="background:' + hex(c.color) + ';left:' + c.left + '%;top:' + c.top + '%"></button>';
      }).join('') + '</div><div class="side">' + preview + (note ? '<p class="note">' + note + '</p>' : '') + '</div></div>' +
      '<button type="button" class="solid" data-close style="height:52px;border-radius:16px;font-size:16px">Done</button></div>';
  }

  // --- Changes --------------------------------------------------------------------

  function drawAll() {
    ['face', 'style', 'presets'].forEach(function (t) {
      $(t).hidden = ui.tab !== t;
      $('tab-' + t).setAttribute('aria-selected', ui.tab === t);
    });
    drawFace();
    drawEditor();
    drawStyle();
    drawPresets();
    drawSheet();
  }

  function placeBlock(v) {
    S[ui.sel] = v;
    catalog.reconcile(S, ui.sel, platform);
  }

  function setColor(key, color) {
    S[key] = color;
    // "All panels" sets every block's own color too.
    if (key === 'PANEL_COLOR') { catalog.PANEL_KEYS.forEach(function (k) { S[k] = color; }); }
  }

  function setLayout(v) {
    S.LAYOUT = v;
    catalog.settle(S, platform);
    if (ui.sel && catalog.liveSlots(S).indexOf(ui.sel) < 0) { ui.sel = null; }
  }

  function say(id, text, ok) {
    var el = $(id);
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'bad');
  }

  function closest(el, attr) {
    while (el && el.getAttribute) {
      if (el.getAttribute(attr) !== null) { return el; }
      el = el.parentNode;
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var n;
    if ((n = closest(e.target, 'data-close'))) { ui.sheet = null; drawSheet(); return; }
    if ((n = closest(e.target, 'data-color'))) {
      setColor(ui.sheet, parseInt(n.getAttribute('data-color'), 10));
      drawAll();
      return;
    }
    if ((n = closest(e.target, 'data-tab'))) { ui.tab = n.getAttribute('data-tab'); drawAll(); window.scrollTo(0, 0); return; }
    if ((n = closest(e.target, 'data-slot'))) {
      var slot = n.getAttribute('data-slot');
      ui.sel = ui.sel === slot ? null : slot;
      ui.cat = 'all';
      drawFace();
      drawEditor();
      return;
    }
    if ((n = closest(e.target, 'data-block'))) { placeBlock(parseInt(n.getAttribute('data-block'), 10)); drawAll(); return; }
    if ((n = closest(e.target, 'data-cat'))) { ui.cat = n.getAttribute('data-cat'); drawEditor(); return; }
    if ((n = closest(e.target, 'data-sheet'))) { ui.sheet = n.getAttribute('data-sheet'); drawSheet(); return; }
    if ((n = closest(e.target, 'data-layout'))) { setLayout(parseInt(n.getAttribute('data-layout'), 10)); drawAll(); return; }
    if ((n = closest(e.target, 'data-toggle'))) { var k = n.getAttribute('data-toggle'); S[k] = !S[k]; drawAll(); return; }
    if ((n = closest(e.target, 'data-units'))) { S.UNITS = parseInt(n.getAttribute('data-units'), 10); drawAll(); return; }
    if ((n = closest(e.target, 'data-preset'))) {
      var p = code.PRESETS[parseInt(n.getAttribute('data-preset'), 10)];
      S = catalog.settle(code.apply(S, code.decode(p.code), code.PRESET_SKIP), platform);
      if (ui.sel && catalog.liveSlots(S).indexOf(ui.sel) < 0) { ui.sel = null; }
      drawAll();
      say('preset-msg', p.name + ' applied. Tap Save to send it to the watch.', true);
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'lang') { S.LANG = parseInt(t.value, 10); drawAll(); }
    if (t.id === 'font') { S.FONT = parseInt(t.value, 10); drawAll(); }
    if (t.getAttribute('data-zone') !== null) { S['TZ_ZONE[' + t.getAttribute('data-zone') + ']'] = t.value; drawAll(); }
  });

  // Typing redraws the face and the tiles, not the field being typed in.
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.getAttribute('data-text') === null) { return; }
    S['TEXT[' + t.getAttribute('data-text') + ']'] = t.value;
    drawFace();
    var tiles = document.querySelectorAll('#editor .tiles');
    Array.prototype.forEach.call(tiles, function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-block]'), function (b) {
        var v = parseInt(b.getAttribute('data-block'), 10);
        if (catalog.TEXT_BLOCKS[v]) { b.outerHTML = tileHtml(v, ui.sel); }
      });
    });
    $('code-out').value = code.encode(S);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; drawSheet(); }
  });

  $('code-copy').addEventListener('click', function () {
    var out = $('code-out');
    out.select();
    // execCommand is deprecated but is what older config webviews have; the
    // clipboard API goes first where there is one.
    try {
      if (navigator.clipboard) { navigator.clipboard.writeText(out.value); } else { document.execCommand('copy'); }
      say('code-msg', 'Copied.', true);
    } catch (err) {
      say('code-msg', 'This browser blocked copying. Select the code and copy it by hand.', false);
    }
  });

  $('code-import').addEventListener('click', function () {
    var input = $('code-in'), values = code.decode(input.value);
    if (typeof values === 'string') { say('code-msg', values, false); return; }
    S = catalog.settle(code.apply(S, values), platform);
    if (ui.sel && catalog.liveSlots(S).indexOf(ui.sel) < 0) { ui.sel = null; }
    input.value = '';
    drawAll();
    say('code-msg', 'Imported. Tap Save to send it to the watch.', true);
  });

  // pebblejs://close is the old way out; return_to is what newer apps pass.
  $('save').addEventListener('click', function () {
    var payload = encodeURIComponent(JSON.stringify(S));
    var returnTo = (/[?&]return_to=([^&]*)/.exec(location.search) || [])[1];
    location.href = returnTo ? decodeURIComponent(returnTo) + payload : 'pebblejs://close#' + payload;
  });

  $('watch').textContent = (WATCHES[platform] || 'Pebble') + ' · v' + VERSION;
  $('font-block').hidden = platform === 'aplite';
  if (round) {
    $('face-bezel').className = 'bezel round';
    $('style-bezel').className = 'bezel small round';
  }
  drawAll();
  // The face is measured to fit with the web font; redraw once it has loaded.
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(drawAll); }
})();

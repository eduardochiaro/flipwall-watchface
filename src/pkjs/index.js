var Clay = require('@rebble/clay');
var clayConfig = require('./config');

// QuadBlock enum (must match flipwall-watchface.c):
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month.
// "Big" blocks fill a square; "small" blocks are half height. Each column must
// pair exactly one of each, so the two columns line up.
var BIG_BLOCKS = { 1: true, 2: true, 8: true };   // Day of month, Clock, Weather
var FALLBACK_SMALL = 0;                   // Day of week
var FALLBACK_BIG = 2;                     // Clock

function isBig(v) {
  return !!BIG_BLOCKS[parseInt(v, 10)];
}

// The two block selectors that make up one column (top + bottom).
var COLUMNS = [
  ['BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT'],
  ['BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT']
];

// ---------------------------------------------------------------------------
// Config-page logic. Clay serialises this function with .toString() and runs
// ONLY its own source inside the config webview, so everything it needs (the
// column-linking rule and the live preview) must be defined in here — it cannot
// reach module-scope variables. The phone-side sanitize() below keeps its own
// copies of the block-size helpers.
//
// It does two things:
//   - Live UI rule: when one block in a column changes and leaves the column
//     with two big or two small blocks, flip the other selector so the column
//     stays valid (one big + one small).
//   - Live preview: renders a small HTML mock-up of the rectangular face that
//     mirrors the C layout in flipwall-watchface.c (2x2 grid + year band),
//     written into the `PREVIEW` text item via .set(html).
// ---------------------------------------------------------------------------
function clayCustomFn() {
  var clayConfig = this;

  // Block-size helpers (duplicated from module scope for the reasons above):
  // big = Day of month / Clock; small = Day of week / Month.
  function isBig(v) {
    var n = parseInt(v, 10);
    return n === 1 || n === 2 || n === 8;
  }
  var FALLBACK_SMALL = 0;   // Day of week
  var FALLBACK_BIG = 2;     // Clock

  // --- Live preview -------------------------------------------------------
  var PREVIEW = (function() {
  var SCALE = 1.4;                 // device px -> preview px
  var W = 144, H = 168;            // base (aplite/basalt) screen
  var MARGIN = 3, GUTTER = 3;
  var SEAM = '#555555';            // GColorDarkGray
  var DIM = '#555555';
  var SECOND = '#FF0000';          // SECOND_FG (red on color screens)

  // Sample data shown in the mock-up. Sunday so the weekend/accent color is
  // visible; 10:09 -> AM active.
  var SAMPLE = { dow: 'Sun', day: '26', month: 'Jun', year: '2020',
                 steps: '8.2K', dist: '8.2km', batt: '82%',
                 weekend: true, isPM: false, hour: 10, min: 9, sec: 30 };

  // Localised month/weekday names — must match MONTHS/WDAYS in the C source.
  // Sample date is June (mon 5), Sunday (wday 0).
  var MONTHS = [
    'Jun','Jun','Jun','Jui','Jun','Giu','Jun','Cze','Haz','Jun'  // index = lang
  ];
  var WDAYS = [
    'Sun','Dom','Dom','Dim','Son','Dom','Zon','Nie','Paz','Min'  // index = lang
  ];

  // Block ids match the QuadBlock enum: 0 DoW, 1 Day, 2 Clock, 3 Month,
  // 4 Steps, 5 Distance, 6 Battery, 7 Year, 8 Weather, 9 Month+Day,
  // 10 Weekday+Day. Day/Clock/Weather big.
  function isShort(v) { return v !== 1 && v !== 2 && v !== 8; }

  // Display text for the data blocks (steps / distance / battery / year).
  function valueText(v) {
    if (v === 4) { return SAMPLE.steps; }
    if (v === 5) { return SAMPLE.dist; }
    if (v === 6) { return SAMPLE.batt; }
    if (v === 9) { return SAMPLE.month + ' ' + SAMPLE.day; }
    if (v === 10) { return SAMPLE.dow + ' ' + SAMPLE.day; }
    return SAMPLE.year;
  }

  function px(n) { return (n * SCALE).toFixed(2) + 'px'; }

  function panelDiv(x, y, w, h, bg, inner) {
    return '<div style="position:absolute;left:' + px(x) + ';top:' + px(y) +
      ';width:' + px(w) + ';height:' + px(h) + ';background:' + bg +
      ';border-radius:' + px(4) + ';overflow:hidden;">' + inner + '</div>';
  }

  function seam(w, h) {
    return '<div style="position:absolute;left:' + px(2) + ';top:' +
      px(Math.floor(h / 2)) + ';width:' + px(w - 4) + ';height:' +
      Math.max(1, SCALE).toFixed(2) + 'px;background:' + SEAM + ';"></div>';
  }

  function textDiv(txt, color, fontPx, align, padL) {
    return '<div style="position:absolute;left:0;top:0;right:0;bottom:0;' +
      'display:flex;align-items:center;justify-content:' +
      (align === 'left' ? 'flex-start' : 'center') + ';padding-left:' +
      px(padL || 0) + ';white-space:nowrap;color:' + color + ';font-weight:bold;font-size:' +
      px(fontPx) + ';line-height:1;">' + txt + '</div>';
  }

  function ampm(txt, top, color) {
    return '<div style="position:absolute;right:' + px(3) + ';' +
      (top ? 'top:' + px(2) : 'bottom:' + px(2)) + ';color:' + color +
      ';font-weight:bold;font-size:' + px(9) + ';line-height:1;">' + txt +
      '</div>';
  }

  // A line from polar (deg/r0) to polar (deg/r1) about (cx,cy). 12 o'clock is
  // deg 0, increasing clockwise (matches the C hand_point helper).
  function radialLine(cx, cy, deg, r0, r1, color, sw) {
    var a = deg * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    return '<line x1="' + (cx + r0 * s).toFixed(2) + '" y1="' +
      (cy - r0 * c).toFixed(2) + '" x2="' + (cx + r1 * s).toFixed(2) +
      '" y2="' + (cy - r1 * c).toFixed(2) + '" stroke="' + color +
      '" stroke-width="' + sw + '" stroke-linecap="round"/>';
  }

  function hand(cx, cy, deg, len, color, sw) {
    return radialLine(cx, cy, deg, 0, len, color, sw);
  }

  function clockBlock(x, y, w, h, panelC, textC, showSeconds) {
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 1, rr = r - 4;
    var s = '<svg width="' + px(w) + '" height="' + px(h) + '" viewBox="0 0 ' +
      w + ' ' + h + '">';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' +
      panelC + '"/>';
    for (var i = 0; i < 12; i++) {
      var inner = rr - (i % 3 === 0 ? 5 : 3);
      s += radialLine(cx, cy, i * 30, inner, rr, textC, 1);
    }
    var minA = SAMPLE.min * 6;
    var hourA = ((SAMPLE.hour % 12) * 60 + SAMPLE.min) / (12 * 60) * 360;
    s += hand(cx, cy, hourA, rr * 0.5, textC, 3);
    s += hand(cx, cy, minA, rr * 0.8, textC, 3);
    if (showSeconds) {
      s += hand(cx, cy, SAMPLE.sec * 6, rr * 0.9, SECOND, 1);
    }
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="' + SECOND +
      '"/></svg>';
    return '<div style="position:absolute;left:' + px(x) + ';top:' + px(y) +
      ';width:' + px(w) + ';height:' + px(h) + ';">' + s + '</div>';
  }

  // A big block holding a sun icon. Mirrors draw_icon_block in the C source:
  // panel-filled block, the icon scaled to nearly fill with a small pad, stroke
  // in the text colour and fill in the panel colour (so it reads as an outline).
  function iconBlock(x, y, w, h, panelC, textC) {
    var side = Math.min(w, h) - 16;         // pad ~8 each side
    var cx = w / 2, cy = h / 2, rr = side / 2;
    var core = rr * 0.45;
    var s = '<svg width="' + px(w) + '" height="' + px(h) + '" viewBox="0 0 ' +
      w + ' ' + h + '">';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + core + '" fill="' +
      panelC + '" stroke="' + textC + '" stroke-width="3"/>';
    for (var i = 0; i < 8; i++) {
      s += radialLine(cx, cy, i * 45, core + rr * 0.18, rr, textC, 3);
    }
    s += '</svg>';
    return '<div style="position:absolute;left:' + px(x) + ';top:' + px(y) +
      ';width:' + px(w) + ';height:' + px(h) + ';background:' + panelC +
      ';border-radius:' + px(4) + ';overflow:hidden;">' + s + '</div>';
  }

  // Render one grid block (by QuadBlock id) into the given rect.
  function block(v, x, y, w, h, c) {
    if (v === 2) {  // clock
      return clockBlock(x, y, w, h, c.panel, c.text, c.showSeconds);
    }
    if (v === 8) {  // weather icon
      return iconBlock(x, y, w, h, c.panel, c.text);
    }
    if (v === 0) {  // day of week
      var bg = SAMPLE.weekend ? c.weekend : c.panel;
      var fg = SAMPLE.weekend ? contrast(c.weekend) : c.text;
      var inner = textDiv(SAMPLE.dow, fg, Math.round(h * 0.5), 'left',
        Math.round(w * 0.08)) +
        ampm('AM', true, SAMPLE.isPM ? DIM : fg) +
        ampm('PM', false, SAMPLE.isPM ? fg : DIM) + seam(w, h);
      return panelDiv(x, y, w, h, bg, inner);
    }
    // day number (big), month name, or a data readout (steps/km/battery).
    var txt = v === 1 ? SAMPLE.day : (v === 3 ? SAMPLE.month : valueText(v));
    var font = v === 1 ? Math.round(h * 0.6) : Math.round(h * 0.5);
    return panelDiv(x, y, w, h, c.panel,
      textDiv(txt, c.text, font, 'center', 0) + seam(w, h));
  }

  function bandBlock(v, x, y, w, h, c) {
    var txt = valueText(v);
    var font = Math.round(h * 0.62);
    // Width the panel to the text (mirrors draw_band sizing to content), so
    // longer strings like "Jun 26" don't wrap onto a second line.
    var pw = Math.max(Math.round(h * 1.9), Math.round(txt.length * font * 0.62) + 12);
    var px0 = x + Math.floor((w - pw) / 2);
    return panelDiv(px0, y, pw, h, c.panel,
      textDiv(txt, c.text, font, 'center', 0) + seam(pw, h));
  }

  // Black on light backgrounds, white on dark ones (mirrors contrast_color in C).
  function contrast(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 30 + g * 59 + b * 11) / 100 < 128 ? '#FFFFFF' : '#000000';
  }

  // cfg: { yearTop, band, blocks:[tl,tr,bl,br], face, panel, weekend,
  //        showSeconds }. Mirrors main_layer_update() in the C source.
  function build(cfg) {
    var lang = cfg.lang || 0;
    SAMPLE.month = MONTHS[lang];
    SAMPLE.dow = WDAYS[lang];

    var innerW = W - 2 * MARGIN, innerH = H - 2 * MARGIN;
    var colW = Math.floor((innerW - GUTTER) / 2);
    var square = colW, shortH = Math.floor(square / 2);
    var colH = square + GUTTER + shortH;
    var yearH = 22;
    var groupH = yearH + GUTTER + colH;
    var topY = MARGIN + Math.floor((innerH - groupH) / 2);

    var bandY, areaY;
    if (cfg.yearTop) { bandY = topY; areaY = topY + yearH + GUTTER; }
    else { areaY = topY; bandY = topY + colH + GUTTER; }

    var c = { panel: cfg.panel, weekend: cfg.weekend, text: contrast(cfg.panel),
              showSeconds: cfg.showSeconds };
    var html = '<div style="position:relative;width:' + px(W) + ';height:' +
      px(H) + ';margin:8px auto;background:' + cfg.face + ';border-radius:' +
      px(6) + ';overflow:hidden;font-family:Arial,Helvetica,sans-serif;">';

    html += bandBlock(cfg.band, MARGIN, bandY, innerW, yearH, c);

    for (var col = 0; col < 2; col++) {
      var topBlk = cfg.blocks[col];        // tl / tr
      var botBlk = cfg.blocks[col + 2];    // bl / br
      var topH, botH;
      if (isShort(topBlk) === isShort(botBlk)) {
        topH = Math.floor((colH - GUTTER) / 2);
        botH = colH - GUTTER - topH;
      } else if (isShort(topBlk)) {
        topH = shortH; botH = square;
      } else {
        topH = square; botH = shortH;
      }
      var x = MARGIN + col * (colW + GUTTER);
      html += block(topBlk, x, areaY, colW, topH, c);
      html += block(botBlk, x, areaY + topH + GUTTER, colW, botH, c);
    }

    html += '</div>';
    return html;
  }

  return { build: build };
  })();

  // Convert a Clay color value (decimal int) to a CSS #RRGGBB string.
  function colorHex(key) {
    var v = clayConfig.getItemByMessageKey(key).get();
    var n = parseInt(v, 10) & 0xFFFFFF;
    var s = n.toString(16);
    while (s.length < 6) { s = '0' + s; }
    return '#' + s.toUpperCase();
  }

  function blockVal(key) {
    return parseInt(clayConfig.getItemByMessageKey(key).get(), 10) || 0;
  }

  function refreshPreview() {
    var item = clayConfig.getItemById('PREVIEW');
    if (!item) { return; }
    item.set(PREVIEW.build({
      yearTop: clayConfig.getItemByMessageKey('YEAR_TOP').get(),
      lang: blockVal('LANG'),
      band: blockVal('BLOCK_BAND'),
      blocks: [
        blockVal('BLOCK_TOP_LEFT'), blockVal('BLOCK_TOP_RIGHT'),
        blockVal('BLOCK_BOTTOM_LEFT'), blockVal('BLOCK_BOTTOM_RIGHT')
      ],
      face: colorHex('FACE_COLOR'),
      panel: colorHex('PANEL_COLOR'),
      weekend: colorHex('WEEKEND_COLOR'),
      showSeconds: clayConfig.getItemByMessageKey('SHOW_SECONDS').get()
    }));
  }

  function link(aKey, bKey) {
    var a = clayConfig.getItemByMessageKey(aKey);
    var b = clayConfig.getItemByMessageKey(bKey);
    if (!a || !b) { return; }
    var guard = false;

    // When `changed` moves, fix `other` if they now share a size category.
    function reconcile(changed, other) {
      if (guard) { return; }
      if (isBig(changed.get()) === isBig(other.get())) {
        guard = true;   // other.set() re-fires change; don't bounce back
        other.set(isBig(changed.get()) ? FALLBACK_SMALL : FALLBACK_BIG);
        guard = false;
      }
    }

    a.on('change', function() { reconcile(a, b); });
    b.on('change', function() { reconcile(b, a); });
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    link('BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT');
    link('BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT');

    // Draw once, then redraw whenever any setting that affects the face changes.
    var watched = ['YEAR_TOP', 'LANG', 'BLOCK_BAND', 'BLOCK_TOP_LEFT',
      'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_LEFT', 'BLOCK_BOTTOM_RIGHT', 'FACE_COLOR',
      'PANEL_COLOR', 'WEEKEND_COLOR', 'SHOW_SECONDS'];
    watched.forEach(function(key) {
      var item = clayConfig.getItemByMessageKey(key);
      if (item) { item.on('change', refreshPreview); }
    });
    refreshPreview();
  });
}

var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });

// ---------------------------------------------------------------------------
// Submit-time sanitiser (runs on the phone). Two jobs:
//   1. Coerce select values to integers — Clay serialises <select> values as
//      strings, which the watch would otherwise read as garbage.
//   2. Re-enforce the small+big-per-column rule as a safety net (the live rule
//      above normally keeps it valid; this guards stale/odd responses).
// ---------------------------------------------------------------------------
function readValue(settings, key) {
  var s = settings[key];
  return s && typeof s === 'object' ? s.value : s;
}

function writeValue(settings, key, value) {
  if (settings[key] && typeof settings[key] === 'object') {
    settings[key].value = value;
  } else {
    settings[key] = { value: value };
  }
}

function sanitize(settings) {
  // Banner select also serialises as a string; ship it as an int. Default 7 (Year).
  if (readValue(settings, 'BLOCK_BAND') !== undefined) {
    writeValue(settings, 'BLOCK_BAND',
               parseInt(readValue(settings, 'BLOCK_BAND'), 10) || 7);
  }

  // Language select likewise ships as an int (0 = English).
  if (readValue(settings, 'LANG') !== undefined) {
    writeValue(settings, 'LANG', parseInt(readValue(settings, 'LANG'), 10) || 0);
  }

  COLUMNS.forEach(function(col) {
    var topKey = col[0];
    var botKey = col[1];
    if (readValue(settings, topKey) === undefined ||
        readValue(settings, botKey) === undefined) {
      return;
    }

    var top = parseInt(readValue(settings, topKey), 10) || 0;
    var bot = parseInt(readValue(settings, botKey), 10) || 0;

    // If the column ended up with two of the same size, fix the bottom block.
    if (isBig(top) === isBig(bot)) {
      bot = isBig(top) ? FALLBACK_SMALL : FALLBACK_BIG;
    }

    writeValue(settings, topKey, top);   // store as numbers so they ship as ints
    writeValue(settings, botKey, bot);
  });
  return settings;
}

Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) { return; }

  var settings = sanitize(clay.getSettings(e.response, false));
  var dict = Clay.prepareSettingsForAppMessage(settings);

  Pebble.sendAppMessage(dict, function() {
    console.log('Sent config data to Pebble');
  }, function(error) {
    console.log('Failed to send config data: ' + JSON.stringify(error));
  });
});


// QuadBlock enum (must match flipwall-watchface.c):
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month.
// "Big" blocks fill a square; "small" blocks are half height. Each column must
// pair exactly one of each, so the two columns line up.
var BIG_BLOCKS = { 1: true, 2: true, 8: true, 12: true, 17: true, 19: true,
  21: true, 26: true, 27: true, 28: true, 29: true, 30: true, 31: true, 32: true };
// Day, Clock, Weather, Temp(big), Digital(big), Hours(big), Minutes(big),
// Calendar, Humidity, Battery, Calendar+Month, HR, Distance, Max/Min (all big)
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
    return n === 1 || n === 2 || n === 8 || n === 12 || n === 17 ||
           n === 19 || n === 21 || n === 26 || (n >= 27 && n <= 32);
  }
  var FALLBACK_SMALL = 0;   // Day of week
  var FALLBACK_BIG = 2;     // Clock

  // --- Live preview -------------------------------------------------------
  var PREVIEW = (function() {
  var SCALE = 1.4;                 // device px -> preview px
  var W = 144, H = 168;            // base (aplite/basalt) screen
  var MARGIN = 3, GUTTER = 3;
  var SEAM = '#555555';            // GColorDarkGray
  var drawSeam = true;             // set per-render from cfg.drawSeam
  var DIM = '#555555';
  var SECOND = '#FF0000';          // SECOND_FG (red on color screens)

  // Sample data shown in the mock-up. Sunday so the weekend/accent color is
  // visible; 10:09 -> AM active.
  var SAMPLE = { dow: 'Sun', day: '26', month: 'Jun', year: '2020',
                 steps: '8.2K', dist: '3.2km', batt: '82%',
                 temp: '22°', humid: '45%', humLabel: 'Hu', humLabel3: 'Hum',
                 battLabel: 'Batt', minmax: '24/12°', tmax: '24°', tmin: '12°',
                 distNum: '3.2', distUnit: 'KM',
                 precip: '2mm', time: '10:09', hr: '72',
                 weekend: true, isPM: false, hour: 10, min: 9, sec: 30 };

  // Localised month/weekday names — must match MONTHS/WDAYS in the C source.
  // Sample date is June (mon 5), Sunday (wday 0).
  var MONTHS = [
    'Jun','Jun','Jun','Jui','Jun','Giu','Jun','Cze','Haz','Jun'  // index = lang
  ];
  var WDAYS = [
    'Sun','Dom','Dom','Dim','Son','Dom','Zon','Nie','Paz','Min'  // index = lang
  ];
  // Humidity prefix per language — must match HUMIDITY in the C source (lang.c).
  var HUM_LABELS = [
    'Hu','Hu','Um','Hu','Lf','Um','Vo','Wi','Ne','Ke'  // index = lang
  ];
  // 3-letter humidity caption + battery caption — must match HUMIDITY3/BATTERY
  // in the C source (lang.c).
  var HUM3_LABELS = [
    'Hum','Hum','Umi','Hum','Luf','Umi','Voc','Wil','Nem','Kel'  // index = lang
  ];
  var BATT_LABELS = [
    'Batt','Bat','Bat','Batt','Batt','Batt','Batt','Bat','Pil','Bat'  // index = lang
  ];

  // Block ids match the QuadBlock enum: 0 DoW, 1 Day, 2 Clock, 3 Month,
  // 4 Steps, 5 Distance, 6 Battery, 7 Year, 8 Weather, 9 Month+Day,
  // 10 Weekday+Day, 11 Temp, 12 Temp(big), 13 Humidity, 14 Max/Min,
  // 15 Precipitation. Day/Clock/Weather/Temp(big) big.
  function isShort(v) {
    return v !== 1 && v !== 2 && v !== 8 && v !== 12 && v !== 17 &&
           v !== 19 && v !== 21 && v !== 26 && !(v >= 27 && v <= 32);
  }

  // Display text for the data blocks (steps / distance / battery / year).
  function valueText(v) {
    if (v === 4) { return SAMPLE.steps; }
    if (v === 5) { return SAMPLE.dist; }
    if (v === 6) { return SAMPLE.batt; }
    if (v === 9) { return SAMPLE.month + ' ' + SAMPLE.day; }
    if (v === 10) { return SAMPLE.dow + ' ' + SAMPLE.day; }
    if (v === 11 || v === 12) { return SAMPLE.temp; }
    if (v === 13) { return SAMPLE.humLabel + SAMPLE.humid; }
    if (v === 14) { return SAMPLE.minmax; }
    if (v === 15) { return SAMPLE.precip; }
    if (v === 16) { return SAMPLE.time; }
    if (v === 18 || v === 19) { return (SAMPLE.hour < 10 ? '0' : '') + SAMPLE.hour; }
    if (v === 20 || v === 21) { return (SAMPLE.min < 10 ? '0' : '') + SAMPLE.min; }
    if (v === 24) { return '♥' + SAMPLE.hr; }   // heart + BPM
    if (v === 25) { return '☀' + SAMPLE.temp; } // icon + temperature
    return SAMPLE.year;
  }

  function px(n) { return (n * SCALE).toFixed(2) + 'px'; }

  function panelDiv(x, y, w, h, bg, inner) {
    return '<div style="position:absolute;left:' + px(x) + ';top:' + px(y) +
      ';width:' + px(w) + ';height:' + px(h) + ';background:' + bg +
      ';border-radius:' + px(4) + ';overflow:hidden;">' + inner + '</div>';
  }

  function seam(w, h) {
    if (!drawSeam) { return ''; }
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
    if (v === 22) {  // AM (left) / PM (right), active bright, other dim
      var fpx = Math.round(h * 0.29), pad = Math.round(w * 0.08);
      function side(txt, isRight, color) {
        return '<div style="position:absolute;top:0;bottom:0;' +
          (isRight ? 'right:0;padding-right:' : 'left:0;padding-left:') + px(pad) +
          ';display:flex;align-items:center;color:' + color +
          ';font-weight:bold;font-size:' + px(fpx) + ';line-height:1;">' + txt + '</div>';
      }
      var inner = side('AM', false, SAMPLE.isPM ? DIM : c.text) +
        side('PM', true, SAMPLE.isPM ? c.text : DIM) + seam(w, h);
      return panelDiv(x, y, w, h, c.panel, inner);
    }
    if (v === 23) {  // AM (top-left) / PM (bottom-right), active bright, other dim
      var fpx2 = Math.round(h * 0.29), pad2 = Math.round(w * 0.08);
      function half(txt, bottom, color) {
        return '<div style="position:absolute;left:0;right:0;' +
          (bottom ? 'bottom:0;justify-content:flex-end;padding-right:'
                  : 'top:0;justify-content:flex-start;padding-left:') + px(pad2) +
          ';height:50%;display:flex;align-items:center;color:' +
          color + ';font-weight:bold;font-size:' + px(fpx2) + ';line-height:1;">' +
          txt + '</div>';
      }
      var inner2 = half('AM', false, SAMPLE.isPM ? DIM : c.text) +
        half('PM', true, SAMPLE.isPM ? c.text : DIM) + seam(w, h);
      return panelDiv(x, y, w, h, c.panel, inner2);
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
    if (v === 17) {  // digital clock (big): hours over minutes, split by seam
      var hh = (SAMPLE.hour < 10 ? '0' : '') + SAMPLE.hour;   // leading zero
      var mm = (SAMPLE.min < 10 ? '0' : '') + SAMPLE.min;
      var fontD = Math.round(h * 0.34);
      function halfText(t, topHalf, color) {
        return '<div style="position:absolute;left:0;right:0;' +
          (topHalf ? 'top:0' : 'bottom:0') +
          ';height:50%;display:flex;align-items:center;justify-content:center;' +
          'color:' + color + ';font-weight:bold;font-size:' + px(fontD) +
          ';line-height:1;">' + t + '</div>';
      }
      return panelDiv(x, y, w, h, c.panel,
        halfText(hh, true, c.text) +
        halfText(mm, false, accent(c.text)) + seam(w, h));
    }
    if (v === 26) {  // calendar: weekday (small) over day-of-month (big)
      var dowFg = SAMPLE.weekend ? c.weekend : c.text;
      var calM = Math.round(h * 0.12), calInH = h - 2 * calM;
      var calTop = calM + Math.round(calInH * 0.38);
      function calBand(t, top, bandH, color, fpx) {
        return '<div style="position:absolute;left:0;right:0;top:' + px(top) +
          ';height:' + px(bandH) + ';display:flex;align-items:center;' +
          'justify-content:center;color:' + color + ';font-weight:bold;font-size:' +
          px(fpx) + ';line-height:1;">' + t + '</div>';
      }
      return panelDiv(x, y, w, h, c.panel,
        calBand(SAMPLE.dow, calM, calTop - calM, dowFg, Math.round(h * 0.19)) +
        calBand(SAMPLE.day, calTop, h - calM - calTop, c.text, Math.round(h * 0.46)) +
        seam(w, h));
    }
    // Big two-line blocks (caption + big value). label_top = caption on top.
    // Mirrors draw_caption_value in the C source (same 12%/38% proportions).
    if (v === 27 || v === 28 || v === 29 || v === 30 || v === 31) {
      var cvM = Math.round(h * 0.12), cvInH = h - 2 * cvM;
      var cvSmallH = Math.round(cvInH * 0.38);
      var caption, value, capColor = c.text, labelTop;
      if (v === 27) { caption = SAMPLE.humLabel3; value = SAMPLE.humid; labelTop = true; }
      else if (v === 28) { caption = SAMPLE.battLabel; value = SAMPLE.batt; labelTop = true; }
      else if (v === 29) { caption = SAMPLE.month; value = SAMPLE.day; labelTop = true; }
      else if (v === 30) { caption = 'BPM'; value = SAMPLE.hr; labelTop = false; }
      else { caption = SAMPLE.distUnit; value = SAMPLE.distNum; labelTop = false; }
      var smallY, bigY, bigH;
      if (labelTop) { smallY = cvM; bigY = cvM + cvSmallH; bigH = cvInH - cvSmallH; }
      else { bigY = cvM; bigH = cvInH - cvSmallH; smallY = cvM + bigH; }
      function cvBand(t, top, bandH, color, fpx) {
        return '<div style="position:absolute;left:0;right:0;top:' + px(top) +
          ';height:' + px(bandH) + ';display:flex;align-items:center;' +
          'justify-content:center;color:' + color + ';font-weight:bold;font-size:' +
          px(fpx) + ';line-height:1;">' + t + '</div>';
      }
      return panelDiv(x, y, w, h, c.panel,
        cvBand(caption, smallY, cvSmallH, capColor, Math.round(h * 0.19)) +
        cvBand(value, bigY, bigH, c.text, Math.round(h * 0.46)) + seam(w, h));
    }
    if (v === 32) {  // max/min temp (big): max over min, min in accent
      var fontMM = Math.round(h * 0.34);
      function mmHalf(t, topHalf, color) {
        return '<div style="position:absolute;left:0;right:0;' +
          (topHalf ? 'top:0' : 'bottom:0') +
          ';height:50%;display:flex;align-items:center;justify-content:center;' +
          'color:' + color + ';font-weight:bold;font-size:' + px(fontMM) +
          ';line-height:1;">' + t + '</div>';
      }
      return panelDiv(x, y, w, h, c.panel,
        mmHalf(SAMPLE.tmax, true, c.text) +
        mmHalf(SAMPLE.tmin, false, accent(c.text)) + seam(w, h));
    }
    // day number (big), temp (big), month name, or a data readout.
    var txt = v === 1 ? SAMPLE.day : (v === 3 ? SAMPLE.month : valueText(v));
    var font = (v === 1 || v === 12) ? Math.round(h * 0.6) : Math.round(h * 0.5);
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

  // Lighten dark colours, darken light ones (mirrors get_closest_accent_color).
  function accent(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var dark = (r * 30 + g * 59 + b * 11) / 100 < 128;
    function adj(x) { return Math.round(dark ? x + (255 - x) * 0.3 : x * 0.7); }
    function hx(x) { return (x < 16 ? '0' : '') + x.toString(16); }
    return '#' + hx(adj(r)) + hx(adj(g)) + hx(adj(b));
  }

  // cfg: { yearTop, band, blocks:[tl,tr,bl,br], face, panel, weekend,
  //        showSeconds }. Mirrors main_layer_update() in the C source.
  function build(cfg) {
    drawSeam = cfg.drawSeam !== false;   // gate the seam line on the config toggle
    var lang = cfg.lang || 0;
    SAMPLE.month = MONTHS[lang];
    SAMPLE.dow = WDAYS[lang];
    SAMPLE.humLabel = HUM_LABELS[lang];
    SAMPLE.humLabel3 = HUM3_LABELS[lang];
    SAMPLE.battLabel = BATT_LABELS[lang];
    if (cfg.units) {  // imperial
      SAMPLE.temp = '72°'; SAMPLE.minmax = '75/54°'; SAMPLE.precip = '0in';
      SAMPLE.dist = '2.0mi';
    } else {          // metric
      SAMPLE.temp = '22°'; SAMPLE.minmax = '24/12°'; SAMPLE.precip = '2mm';
      SAMPLE.dist = '3.2km';
    }
    // Split the combined samples into the parts the big blocks show separately.
    var mm = SAMPLE.minmax.replace('°', '').split('/');
    SAMPLE.tmax = mm[0] + '°'; SAMPLE.tmin = mm[1] + '°';
    var dm = /^([\d.]+)([a-z]+)$/i.exec(SAMPLE.dist);
    SAMPLE.distNum = dm ? dm[1] : SAMPLE.dist;
    SAMPLE.distUnit = dm ? dm[2].toUpperCase() : '';

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

    // Per-block panel colors: [banner, TL, TR, BL, BR]. Fall back to the single
    // cfg.panel when a per-block value isn't supplied.
    var panels = cfg.panels || [cfg.panel, cfg.panel, cfg.panel, cfg.panel, cfg.panel];
    function mk(panel) {
      return { panel: panel, weekend: cfg.weekend, text: contrast(panel),
               showSeconds: cfg.showSeconds };
    }
    var html = '<div style="position:relative;width:' + px(W) + ';height:' +
      px(H) + ';margin:8px auto;background:' + cfg.face + ';border-radius:' +
      px(6) + ';overflow:hidden;font-family:Arial,Helvetica,sans-serif;">';

    html += bandBlock(cfg.band, MARGIN, bandY, innerW, yearH, mk(panels[0]));

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
      html += block(topBlk, x, areaY, colW, topH, mk(panels[1 + col]));       // TL / TR
      html += block(botBlk, x, areaY + topH + GUTTER, colW, botH, mk(panels[3 + col]));  // BL / BR
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
      units: blockVal('UNITS'),
      band: blockVal('BLOCK_BAND'),
      blocks: [
        blockVal('BLOCK_TOP_LEFT'), blockVal('BLOCK_TOP_RIGHT'),
        blockVal('BLOCK_BOTTOM_LEFT'), blockVal('BLOCK_BOTTOM_RIGHT')
      ],
      face: colorHex('FACE_COLOR'),
      panels: [
        colorHex('PANEL_BAND_COLOR'), colorHex('PANEL_TL_COLOR'),
        colorHex('PANEL_TR_COLOR'), colorHex('PANEL_BL_COLOR'),
        colorHex('PANEL_BR_COLOR')
      ],
      weekend: colorHex('WEEKEND_COLOR'),
      showSeconds: clayConfig.getItemByMessageKey('SHOW_SECONDS').get(),
      drawSeam: clayConfig.getItemByMessageKey('DRAW_SEAM').get()
    }));
  }

  // --- Presets ------------------------------------------------------------
  // Each fills the four grid blocks (one big + one small per column), the
  // banner, top/bottom banner position, and the three colors. Block ids match
  // the QuadBlock enum. Colors are hex (no '#'). `panel` sets every block; add
  // `panels` {band,tl,tr,bl,br} to override individual block colors. `drawSeam`
  // toggles the seam line (omit = on, the default).
  var PRESETS = [
    { name: 'Standard', tl: 0, bl: 2, tr: 1, br: 3, band: 7, yearTop: true,
      face: 'FF5500', panel: '000000', weekend: 'FF0000', drawSeam: true },
    { name: 'Digital', tl: 17, bl: 0, tr: 1, br: 3, band: 7, yearTop: true,
      face: '9A7099', panel: '004387', weekend: '004387', drawSeam: false },
    { name: 'Flip Clock', tl: 19, bl: 22, tr: 21, br: 3, band: 10, yearTop: false,
      face: '222222', panel: 'EEEEEE', weekend: 'FF0000', drawSeam: true },
    { name: 'Weather Station', tl: 8, bl: 15, tr: 12, br: 13, band: 16, yearTop: true,
      face: '005588', panel: 'FFFFFF', weekend: 'FFAA00', drawSeam: false },
    { name: 'Sport', tl: 17, bl: 4, tr: 1, br: 5, band: 6, yearTop: false,
      face: '004400', panel: '000000', weekend: '00FF00', drawSeam: false },
    { name: 'Colorful', tl: 2, bl: 0, tr: 1, br: 3, band: 7, yearTop: true,
      face: 'FFEEAB', panel: '6C5CE7', weekend: 'FF0000',
      panels: { band: '6C5CE7', tl: 'E17055', tr: '0984E3', bl: '00B894', br: 'D63031' } }
  ];

  function contrastHex(hex) {   // white text on dark bg, black on light
    var n = parseInt(hex, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 30 + g * 59 + b * 11) / 100 < 128 ? '#FFFFFF' : '#000000';
  }

  function applyPreset(p) {
    function set(key, val) {
      var it = clayConfig.getItemByMessageKey(key);
      if (it) { it.set(val); }
    }
    // Set top before bottom in each column so the link() reconcile (which only
    // touches the sibling) settles on our valid pair rather than a fallback.
    set('BLOCK_TOP_LEFT', p.tl);     set('BLOCK_BOTTOM_LEFT', p.bl);
    set('BLOCK_TOP_RIGHT', p.tr);    set('BLOCK_BOTTOM_RIGHT', p.br);
    set('BLOCK_BAND', p.band);
    set('YEAR_TOP', p.yearTop);
    set('DRAW_SEAM', p.drawSeam !== false);   // omitted = seam on (the default)
    set('FACE_COLOR', parseInt(p.face, 16));
    set('PANEL_COLOR', parseInt(p.panel, 16));   // change -> syncPanels fills all
    set('WEEKEND_COLOR', parseInt(p.weekend, 16));
    // Per-block overrides (run after the master broadcast above).
    if (p.panels) {
      set('PANEL_BAND_COLOR', parseInt(p.panels.band, 16));
      set('PANEL_TL_COLOR',   parseInt(p.panels.tl, 16));
      set('PANEL_TR_COLOR',   parseInt(p.panels.tr, 16));
      set('PANEL_BL_COLOR',   parseInt(p.panels.bl, 16));
      set('PANEL_BR_COLOR',   parseInt(p.panels.br, 16));
    }
    refreshPreview();
  }

  function buildPresetButtons() {
    var item = clayConfig.getItemById('PRESETS');
    if (!item) { return; }
    var html = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    PRESETS.forEach(function(p, i) {
      html += '<button type="button" data-preset="' + i + '" style="flex:1 1 40%;' +
        'padding:10px 6px;border:none;border-radius:6px;cursor:pointer;' +
        'font-weight:bold;font-size:14px;background:#' + p.panel +
        ';color:' + contrastHex(p.panel) + ';">' + p.name + '</button>';
    });
    item.set(html + '</div>');
    PRESETS.forEach(function(p, i) {
      var el = document.querySelector('[data-preset="' + i + '"]');
      if (el) {
        el.addEventListener('click', function(e) { e.preventDefault(); applyPreset(p); });
      }
    });
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

  // "All panels" master: broadcast its value to every per-block color picker.
  var PANEL_KEYS = ['PANEL_BAND_COLOR', 'PANEL_TL_COLOR', 'PANEL_TR_COLOR',
    'PANEL_BL_COLOR', 'PANEL_BR_COLOR'];
  function syncPanels() {
    var master = clayConfig.getItemByMessageKey('PANEL_COLOR');
    if (!master) { return; }
    var v = master.get();
    PANEL_KEYS.forEach(function(k) {
      var it = clayConfig.getItemByMessageKey(k);
      if (it) { it.set(v); }
    });
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    link('BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT');
    link('BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT');

    // Changing the master color (or a preset) refills every per-block picker.
    var masterItem = clayConfig.getItemByMessageKey('PANEL_COLOR');
    if (masterItem) { masterItem.on('change', syncPanels); }

    // One-time migration: seed per-block colors from the saved master so
    // existing users keep their panel color instead of jumping to the default.
    // Flag lives in the config webview's localStorage, not a visible setting.
    try {
      if (!localStorage.getItem('flipwall_panel_split_init')) {
        syncPanels();
        localStorage.setItem('flipwall_panel_split_init', '1');
      }
    } catch (e) { /* no localStorage: skip the one-time seed */ }

    // Draw once, then redraw whenever any setting that affects the face changes.
    var watched = ['YEAR_TOP', 'LANG', 'UNITS', 'BLOCK_BAND', 'BLOCK_TOP_LEFT',
      'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_LEFT', 'BLOCK_BOTTOM_RIGHT', 'FACE_COLOR',
      'PANEL_COLOR', 'WEEKEND_COLOR', 'SHOW_SECONDS', 'DRAW_SEAM'].concat(PANEL_KEYS);
    watched.forEach(function(key) {
      var item = clayConfig.getItemByMessageKey(key);
      if (item) { item.on('change', refreshPreview); }
    });
    refreshPreview();
    buildPresetButtons();
  });
}

module.exports = {clayCustomFn, isBig, COLUMNS, FALLBACK_SMALL, FALLBACK_BIG};
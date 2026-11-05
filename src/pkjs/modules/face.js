// The face preview: an HTML mock-up of the watch face that mirrors layout() in
// src/c/flipwall-watchface.c and the block drawing in src/c/modules/blocks.c.
// Used by the settings page (inlined by scripts/inline-config.mjs) and the
// tests. build() draws a whole face, swatch() one block on its own.
var catalog = require('./catalog');

// Screen geometry per platform. `side` mirrors SIDE_MARGIN in the C source
// (round faces pull in so the panels clear the circle); `gutter` mirrors
// GUTTER. Set per render from cfg.platform in build(); aplite, basalt,
// diorite and flint all share the plain 144x168 rectangle.
var RECT = { w: 144, h: 168, round: false, side: 0, gutter: 3 };
var SPECS = {
  emery:   { w: 200, h: 228, round: false, side: 4,  gutter: 6 },
  chalk:   { w: 180, h: 180, round: true,  side: 22, gutter: 3 },
  gabbro:  { w: 260, h: 260, round: true,  side: 30, gutter: 3 }
};
var SCALE = 1.4;                 // device px -> preview px (200px wide face)
var W = 144, H = 168;            // screen, set per render
var SIDE = 0, ROUND = false;     // side inset / circular face
var MARGIN = 3, GUTTER = 3;
var SEAM = '#555555';            // GColorDarkGray
var drawSeam = true;             // set per-render from cfg.drawSeam
var imperial = false;            // set per-render from cfg.units (AQI scale)
var DIM = '#555555';
var SECOND = '#FF0000';          // SECOND_FG (red on color screens)

// Sample data shown in the mock-up. Sunday so the weekend/accent color is
// visible; 10:09 -> AM active.
var SAMPLE = { dow: 'Sun', day: '26', month: 'Jun', year: '2020',
               steps: '8.2K', stepsFull: '8234', dist: '3.2km', batt: '82%',
               temp: '22°', humid: '45%', humLabel: 'Hu', humLabel3: 'Hum',
               battLabel: 'Batt', minmax: '24/12°', tmax: '24°', tmin: '12°',
               distNum: '3.2', distUnit: 'KM',
               precip: '2mm', time: '10:09', timeLead: '09:09',
               hr: '72', uv: '7',
               wind: '12km/h', windNum: '12', windUnit: 'KM/H',
               windDir: 'WNW', windDeg: 292, aqi: '34', beat: '642',
               sunrise: '06:12', sunset: '20:45',
               tzTime: '10:09', tzAbbr: 'UTC', tzOff: '+0',
               // Utility statuses: connected, not charging, quiet time off —
               // so the preview shows both the lit and the ghosted state.
               bt: true, charging: false, quiet: false,
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

// Block ids match the QuadBlock enum; a short block is any that isn't big
// (the sizes come from the config page's own option groups, see BIG above).
function isShort(v) { return !catalog.isBig(v); }

// The wind arrow, approximated to the nearest of 8 glyphs (the watch rotates
// the real pdc to the exact bearing). 0 deg = north = up. The bearing is where
// the wind blows from, so the arrow points the opposite way.
function windArrow(deg) {
  return ['↑', '↗', '→', '↘',
          '↓', '↙', '←', '↖'][Math.round((deg + 180) / 45) % 8];
}

// Display text for the data blocks (steps / distance / battery / year). `tz`
// is the block's own second time zone (see tzText), needed by 50/51/55/56;
// `str` is its own free text, which only 57 shows.
function valueText(v, tz, str) {
  if (v === 4) { return SAMPLE.steps; }
  if (v === 49) { return SAMPLE.stepsFull; }
  if (v === 5) { return SAMPLE.dist; }
  if (v === 6) { return SAMPLE.batt; }
  if (v === 9) { return SAMPLE.month + ' ' + SAMPLE.day; }
  if (v === 10) { return SAMPLE.dow + ' ' + SAMPLE.day; }
  if (v === 11 || v === 12) { return SAMPLE.temp; }
  if (v === 13) { return SAMPLE.humLabel + SAMPLE.humid; }
  if (v === 14) { return SAMPLE.minmax; }
  if (v === 15) { return SAMPLE.precip; }
  if (v === 16) { return SAMPLE.time; }
  // 47 drops the hour's leading zero but keeps its width, which a two-digit
  // hour can't show — preview it an hour earlier ("09:09") so the gap is
  // visible. nozeroMarkup() hides the zero and leaves its width behind.
  if (v === 47) { return SAMPLE.timeLead; }
  if (v === 18 || v === 19) { return (SAMPLE.hour < 10 ? '0' : '') + SAMPLE.hour; }
  if (v === 20 || v === 21) { return (SAMPLE.min < 10 ? '0' : '') + SAMPLE.min; }
  if (v === 24) { return '♥' + SAMPLE.hr; }   // heart + BPM
  if (v === 25) { return '☀' + SAMPLE.temp; } // icon + temperature
  if (v === 33) { return '☼' + SAMPLE.uv; }   // UV icon + index
  if (v === 35) { return SAMPLE.wind; }
  if (v === 37) { return windArrow(SAMPLE.windDeg) + ' ' + SAMPLE.windDir; }
  if (v === 39) { return 'AQI ' + SAMPLE.aqi; }
  // Sun blocks: glyph stand-ins for the pdc icons, sunrise's before the time
  // and sunset's after it (the watch mirrors the two, see draw_icon_value).
  if (v === 58) { return '☀↑' + SAMPLE.sunrise; }
  if (v === 59) { return SAMPLE.sunset + '☀↓'; }
  if (v === 45) { return '@' + SAMPLE.beat; }
  // Second time zone: the clock there, then its offset / abbreviation.
  if (v === 50) { return tz.time + ' ' + tz.off; }
  if (v === 51) { return tz.time + ' ' + tz.abbr; }
  if (v === 55 || v === 56) { return tz.time; }   // no label, just the clock
  if (v === 57) { return str || ''; }
  return SAMPLE.year;
}

// The "- color" variants (41..44) draw like their plain counterpart, but the
// panel takes the reading's band color. Ramps and thresholds mirror
// block_panel_color in blocks.c and weather_*_band in weather.c.
var UV_RAMP = ['#00FF00', '#FFFF00', '#FFAA00', '#FF0000', '#AA00AA'];
var AQI_RAMP = UV_RAMP.concat(['#550000']);
var BASE_BLOCK = { 41: 33, 42: 34, 43: 39, 44: 40 };

function bandOf(value, edges) {
  var b = 0;
  while (b < edges.length && value >= edges[b]) { b++; }
  return b;
}

// The band color for a color variant, or null for every other block.
function indexColor(v) {
  if (v === 41 || v === 42) {
    return UV_RAMP[bandOf(parseInt(SAMPLE.uv, 10), [3, 6, 8, 11])];
  }
  if (v === 43 || v === 44) {
    return AQI_RAMP[bandOf(parseInt(SAMPLE.aqi, 10),
                           imperial ? [51, 101, 151, 201, 301]
                                    : [20, 40, 60, 80, 100])];
  }
  return null;
}

// .beat time draws its "@" in the text's accent colour (as the big digital
// clock does its minutes), lifted off the shared baseline it otherwise hangs
// below (draw_beat_text in the C source, where the same lift is cap_h / 6);
// everything after it stays in the plain text colour.
function beatMarkup(txt, text) {
  return '<span style="color:' + accent(text) +
    ';position:relative;top:-0.17em;">@</span>' + txt.slice(1);
}

// One slot's second time zone, as the block draws it: the sample clock moved
// by the zone's distance from here (`delta`, worked out in clayCustomFn), so
// every clock on the face reads as the same moment. `offset` is the zone's
// own distance from UTC, which is what the offset label says.
function tzText(tz) {
  tz = tz || { delta: 0, abbr: 'UTC', offset: 0 };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  var m = ((SAMPLE.hour * 60 + SAMPLE.min + tz.delta) % 1440 + 1440) % 1440;
  var ao = Math.abs(tz.offset);
  return {
    time: pad2(Math.floor(m / 60)) + ':' + pad2(m % 60),
    abbr: tz.abbr,
    off: (tz.offset < 0 ? '-' : '+') + Math.floor(ao / 60) +
      (ao % 60 ? ':' + pad2(ao % 60) : '')
  };
}

// The zone label after a second-time-zone clock is drawn in the accent colour
// (draw_tz_text in the C source), so it reads as an annotation, not a digit.
function tzMarkup(txt, text) {
  var at = txt.lastIndexOf(' ') + 1;
  return txt.slice(0, at) + '<span style="color:' + accent(text) + ';">' +
    txt.slice(at) + '</span>';
}

// The no-zero clocks drop the hour's leading zero but keep its width (the
// watch measures a "0" and lays the text out in the full-width box); hiding
// the digit rather than deleting it reproduces that in HTML.
function nozeroMarkup(txt) {
  return '<span style="visibility:hidden">' + txt.charAt(0) + '</span>' +
    txt.slice(1);
}

function px(n) { return (n * SCALE).toFixed(2) + 'px'; }

function panelDiv(x, y, w, h, bg, inner) {
  return '<div style="position:absolute;left:' + px(x) + ';top:' + px(y) +
    ';width:' + px(w) + ';height:' + px(h) + ';background:' + bg +
    ';border-radius:' + px(4) + ';overflow:hidden;">' + inner + '</div>';
}

// Every drawn block gets a transparent hit target on top of it, tagged with
// the message key it edits, so the preview doubles as the block picker. Set
// per render from cfg.sel; the ring is inset so a neighbouring panel drawn
// later can't paint over it.
var SLOT_KEYS = ['BLOCK_TOP_LEFT', 'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_LEFT',
  'BLOCK_BOTTOM_RIGHT', 'BLOCK_BAND', 'BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT'];
var selIdx = -1;
var overlays = true;

function slotOverlay(i, x, y, w, h) {
  if (!overlays) { return ''; }
  return '<div data-slot="' + SLOT_KEYS[i] + '" style="position:absolute;left:' +
    px(x) + ';top:' + px(y) + ';width:' + px(w) + ';height:' + px(h) +
    ';border-radius:' + px(4) + ';cursor:pointer;' + (i === selIdx
      ? 'box-shadow:inset 0 0 0 ' + px(2) + ' #FFFFFF, inset 0 0 0 ' +
        px(4) + ' #0A84FF;'
      : '') + '"></div>';
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

// One half of a block (top or bottom) holding a single line — the shape the
// big digital clock, the max/min block and the stacked AM/PM all draw.
function halfDiv(t, bottom, color, fpx, justify, pad) {
  return '<div style="position:absolute;left:0;right:0;' +
    (bottom ? 'bottom:0;' : 'top:0;') + 'height:50%;display:flex;' +
    'align-items:center;justify-content:' + (justify || 'center') +
    ';padding:0 ' + px(pad || 0) + ';white-space:nowrap;color:' + color +
    ';font-weight:bold;font-size:' + px(fpx) + ';line-height:1;">' + t + '</div>';
}

// How wide `t` draws at `fpx` (device px), for the shrink-to-fit the watch
// does in draw_centered. Measured on a canvas in the config webview. The node
// test harness has no canvas, so there it adds up rough monospace glyph
// widths instead; the icon stand-ins (☀ ↑ →) count as a full em, which is
// what the old flat 0.62em-per-character guess got wrong.
var measureCtx = null;
function textWidth(t, fpx) {
  t = String(t).replace(/<[^>]*>/g, '');
  if (measureCtx === null) {
    var cv = typeof document !== 'undefined' && document.createElement &&
             document.createElement('canvas');
    measureCtx = (cv && cv.getContext && cv.getContext('2d')) || false;
  }
  if (measureCtx) {
    measureCtx.font = 'bold ' + fpx + 'px Lekton, ui-monospace, Menlo, monospace';
    return measureCtx.measureText(t).width;
  }
  var em = 0;
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    em += /[0-9]/.test(ch) ? 0.56 : /[:.,\/ ]/.test(ch) ? 0.3
        : /[A-Z%mw]/.test(ch) ? 0.75 : /[a-z°]/.test(ch) ? 0.58 : 1;
  }
  return em * fpx;
}

// `fpx`, shrunk so `t` fits in `avail` (draw_centered's one-pass shrink).
function fitPx(t, fpx, avail) {
  var w = textWidth(t, fpx);
  return w > avail && w > 0 ? Math.floor(fpx * avail / w) : fpx;
}

// A caption or value band inside a big two-line block, padded off the side
// borders. Mirrors draw_centered's one-pass shrink so a wide caption
// ("UV Index") stays on one line inside the padding instead of wrapping.
function cvBand(t, top, bandH, color, fpx, w) {
  var mx = Math.round(w * 0.10);
  fpx = fitPx(t, fpx, w - 2 * mx);
  return '<div style="position:absolute;left:' + px(mx) + ';right:' +
    px(mx) + ';top:' + px(top) +
    ';height:' + px(bandH) + ';display:flex;align-items:center;' +
    'justify-content:center;white-space:nowrap;color:' + color +
    ';font-weight:bold;font-size:' + px(fpx) + ';line-height:1;">' + t + '</div>';
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
// The auto sun blocks (62 / 63) draw as whichever event comes next. At the
// sample time, 10:09, that is the sunset (see weather_sun_next_is_set).
var SUN_AUTO = { 62: 59, 63: 61 };

function block(v, x, y, w, h, c) {
  v = SUN_AUTO[v] || v;
  var band = indexColor(v);
  if (band) {
    c = { panel: band, text: contrast(band), weekend: c.weekend,
          showSeconds: c.showSeconds, tz: c.tz, str: c.str };
    v = BASE_BLOCK[v];
  }
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
    var inner2 =
      halfDiv('AM', false, SAMPLE.isPM ? DIM : c.text, fpx2, 'flex-start', pad2) +
      halfDiv('PM', true, SAMPLE.isPM ? c.text : DIM, fpx2, 'flex-end', pad2) +
      seam(w, h);
    return panelDiv(x, y, w, h, c.panel, inner2);
  }
  if (v === 54) {  // utility: quiet time / charging / bluetooth, evenly spaced
    // Glyph stand-ins for the pdc icons the watch draws (as elsewhere in the
    // preview); an off status takes the panel's own accent, an on one the
    // text colour. Mirrors draw_utility in the C source.
    var uIcons = ['☾', '⚡', 'ᛒ'];
    var uOn = [SAMPLE.quiet, SAMPLE.charging, SAMPLE.bt];
    var uOff = accent(c.panel), uFont = Math.round(h * 0.55), uInner = '';
    for (var ui = 0; ui < 3; ui++) {
      uInner += '<div style="position:absolute;top:0;bottom:0;left:' +
        (ui * 100 / 3).toFixed(2) + '%;width:' + (100 / 3).toFixed(2) +
        '%;display:flex;align-items:center;justify-content:center;color:' +
        (uOn[ui] ? c.text : uOff) + ';font-size:' + px(uFont) +
        ';line-height:1;">' + uIcons[ui] + '</div>';
    }
    return panelDiv(x, y, w, h, c.panel, uInner + seam(w, h));
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
  if (v === 17 || v === 48) {  // digital clock (big): hours over minutes
    // 48 drops the hour's leading zero and keeps its width, so it previews an
    // hour earlier ("09") with the zero hidden — a two-digit hour shows nothing.
    var hh = v === 48 ? nozeroMarkup(SAMPLE.timeLead.slice(0, 2))
                      : (SAMPLE.hour < 10 ? '0' : '') + SAMPLE.hour;
    var mm = (SAMPLE.min < 10 ? '0' : '') + SAMPLE.min;
    var fontD = Math.round(h * 0.34);
    return panelDiv(x, y, w, h, c.panel,
      halfDiv(hh, false, c.text, fontD) +
      halfDiv(mm, true, accent(c.text), fontD) + seam(w, h));
  }
  // Big two-line blocks (caption + big value). label_top = caption on top.
  // Mirrors draw_caption_value in the C source (same 12%/38% proportions).
  if (v === 26 || v === 27 || v === 28 || v === 29 || v === 30 || v === 31 ||
      v === 34 || v === 36 || v === 38 || v === 40 || v === 46 ||
      v === 52 || v === 53 || v === 60 || v === 61) {
    var cvM = Math.round(h * 0.12), cvInH = h - 2 * cvM;
    var cvSmallH = Math.round(cvInH * 0.38);
    var caption, value, capColor = c.text, labelTop;
    // Calendar: the weekday captions the day, in the weekend colour on a
    // weekend (the one caption that isn't drawn in the text colour).
    if (v === 26) { caption = SAMPLE.dow; value = SAMPLE.day; labelTop = true;
                    if (SAMPLE.weekend) { capColor = c.weekend; } }
    else if (v === 27) { caption = SAMPLE.humLabel3; value = SAMPLE.humid; labelTop = true; }
    else if (v === 28) { caption = SAMPLE.battLabel; value = SAMPLE.batt; labelTop = true; }
    else if (v === 29) { caption = SAMPLE.month; value = SAMPLE.day; labelTop = true; }
    else if (v === 30) { caption = 'BPM'; value = SAMPLE.hr; labelTop = false; }
    else if (v === 34) { caption = 'UV Index'; value = SAMPLE.uv; labelTop = false; }
    else if (v === 36) { caption = SAMPLE.windUnit; value = SAMPLE.windNum; labelTop = false; }
    else if (v === 40) { caption = 'AQI'; value = SAMPLE.aqi; labelTop = false; }
    // ".beat" captions in the accent colour, like the "@" on the small block.
    else if (v === 46) { caption = '.beat'; value = SAMPLE.beat; labelTop = false;
                         capColor = accent(c.text); }
    // Second time zone: the clock over its label, captioned in the accent
    // like the label on the short block.
    else if (v === 52 || v === 53) {
      caption = v === 53 ? c.tz.abbr : c.tz.off;
      value = c.tz.time; labelTop = false; capColor = accent(c.text);
    }
    // Sunrise / sunset: the time captioned with the word, in the accent like
    // the zone blocks.
    else if (v === 60 || v === 61) {
      caption = v === 61 ? 'Sunset' : 'Sunrise';
      value = v === 61 ? SAMPLE.sunset : SAMPLE.sunrise;
      labelTop = false; capColor = accent(c.text);
    }
    // Wind direction: the arrow takes the big line, the compass word captions it.
    else if (v === 38) { caption = SAMPLE.windDir; value = windArrow(SAMPLE.windDeg); labelTop = false; }
    else { caption = SAMPLE.distUnit; value = SAMPLE.distNum; labelTop = false; }
    var smallY, smallH = cvSmallH, bigY, bigH;
    if (labelTop) { smallY = cvM; bigY = cvM + cvSmallH; bigH = cvInH - cvSmallH; }
    else { bigY = cvM; bigH = cvInH - cvSmallH; smallY = cvM + bigH; }
    // A value cvBand will shrink to fit (a clock) moves into its own half,
    // across the seam from the caption, like draw_caption_value.
    var bigPx = Math.round(h * 0.46);
    if (textWidth(value, bigPx) > w - 2 * Math.round(w * 0.10)) {
      bigH = Math.round(h / 2); bigY = labelTop ? h - bigH : 0;
    }
    return panelDiv(x, y, w, h, c.panel,
      cvBand(caption, smallY, smallH, capColor, Math.round(h * 0.19), w) +
      cvBand(value, bigY, bigH, c.text, bigPx, w) + seam(w, h));
  }
  if (v === 32) {  // max/min temp (big): max over min, min in accent
    var fontMM = Math.round(h * 0.34);
    return panelDiv(x, y, w, h, c.panel,
      halfDiv(SAMPLE.tmax, false, c.text, fontMM) +
      halfDiv(SAMPLE.tmin, true, accent(c.text), fontMM) + seam(w, h));
  }
  // day number (big), temp (big), month name, or a data readout.
  var txt = v === 1 ? SAMPLE.day
          : (v === 3 ? SAMPLE.month : valueText(v, c.tz, c.str));
  var font = (v === 1 || v === 12) ? Math.round(h * 0.6) : Math.round(h * 0.5);
  font = fitPx(txt, font, w - 6);   // before the markup: measure the text only
  if (v === 45) { txt = beatMarkup(txt, c.text); }
  if (v === 47) { txt = nozeroMarkup(txt); }
  if (v === 50 || v === 51) { txt = tzMarkup(txt, c.text); }
  return panelDiv(x, y, w, h, c.panel,
    textDiv(txt, c.text, font, 'center', 0) + seam(w, h));
}

function bandBlock(v, x, y, w, h, c, idx) {
  v = SUN_AUTO[v] || v;
  var band = indexColor(v);
  if (band) {
    c = { panel: band, text: contrast(band), weekend: c.weekend, tz: c.tz,
          str: c.str };
    v = BASE_BLOCK[v];
  }
  var txt = valueText(v, c.tz, c.str);
  var font = Math.round(h * 0.62);
  // Width the panel to the text (mirrors draw_band sizing to content), so
  // longer strings like "Jun 26" don't wrap onto a second line.
  // A string wider than the whole banner shrinks to fit it, as on the watch.
  font = fitPx(txt, font, w - 12);
  var pw = Math.min(w, Math.max(Math.round(h * 1.9),
                                Math.round(textWidth(txt, font)) + 12));
  if (v === 45) { txt = beatMarkup(txt, c.text); }
  if (v === 47) { txt = nozeroMarkup(txt); }   // after the width, so the pill keeps it
  if (v === 50 || v === 51) { txt = tzMarkup(txt, c.text); }
  var px0 = x + Math.floor((w - pw) / 2);
  return panelDiv(px0, y, pw, h, c.panel,
    textDiv(txt, c.text, font, 'center', 0) + seam(pw, h)) +
    slotOverlay(idx, px0, y, pw, h);
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

// cfg: { platform, layout, yearTop, band, midLeft, midRight,
//        blocks:[tl,tr,bl,br], face, panels, weekend, showSeconds }.
// Mirrors layout() in the C source.
function build(cfg) {
  var spec = SPECS[cfg.platform] || RECT;
  selIdx = SLOT_KEYS.indexOf(cfg.sel);   // -1 when nothing is selected
  overlays = cfg.overlays !== false;     // tap targets, off for thumbnails
  W = spec.w; H = spec.h; SIDE = spec.side; ROUND = spec.round;
  GUTTER = spec.gutter;
  SCALE = (cfg.width || 200) / W;      // the face previews `width` px wide
  drawSeam = cfg.drawSeam !== false;   // gate the seam line on the config toggle
  imperial = !!cfg.units;              // picks the AQI scale for the color ramp
  var lang = cfg.lang || 0;
  SAMPLE.month = MONTHS[lang];
  SAMPLE.dow = WDAYS[lang];
  SAMPLE.humLabel = HUM_LABELS[lang];
  SAMPLE.humLabel3 = HUM3_LABELS[lang];
  SAMPLE.battLabel = BATT_LABELS[lang];
  if (cfg.units) {  // imperial
    SAMPLE.temp = '72°'; SAMPLE.minmax = '75/54°'; SAMPLE.precip = '0.1in';
    SAMPLE.dist = '2.0mi'; SAMPLE.wind = '7mph';
  } else {          // metric
    SAMPLE.temp = '22°'; SAMPLE.minmax = '24/12°'; SAMPLE.precip = '2mm';
    SAMPLE.dist = '3.2km'; SAMPLE.wind = '12km/h';
  }
  // Split the combined samples into the parts the big blocks show separately.
  var mm = SAMPLE.minmax.replace('°', '').split('/');
  SAMPLE.tmax = mm[0] + '°'; SAMPLE.tmin = mm[1] + '°';
  var dm = /^([\d.]+)([a-z]+)$/i.exec(SAMPLE.dist);
  SAMPLE.distNum = dm ? dm[1] : SAMPLE.dist;
  SAMPLE.distUnit = dm ? dm[2].toUpperCase() : '';
  var wm = /^([\d.]+)([a-z/]+)$/i.exec(SAMPLE.wind);
  SAMPLE.windNum = wm ? wm[1] : SAMPLE.wind;
  SAMPLE.windUnit = wm ? wm[2].toUpperCase() : '';

  var innerX = MARGIN + SIDE;
  var innerW = W - 2 * innerX, innerH = H - 2 * MARGIN;
  var colW = Math.floor((innerW - GUTTER) / 2);
  var square = colW, shortH = Math.floor(square / 2);
  var colH = square + GUTTER + shortH;
  var yearH = Math.floor(square * 45 / 100);

  // Per-block panel colors and second time zones, indexed like BlockPos in
  // the C source: [TL, TR, BL, BR, banner, midLeft, midRight]. Colors fall
  // back to cfg.panel, zones to UTC.
  var panels = cfg.panels || [cfg.panel, cfg.panel, cfg.panel, cfg.panel,
                              cfg.panel, cfg.panel, cfg.panel];
  var zones = (cfg.tz || []).map(tzText);
  var texts = cfg.texts || [];
  // `pos` is the slot, so one index picks its color, its zone and its text.
  function mk(pos) {
    var panel = panels[pos];
    return { panel: panel, weekend: cfg.weekend, text: contrast(panel),
             showSeconds: cfg.showSeconds, tz: zones[pos] || tzText(),
             str: texts[pos] || '' };
  }
  // BlockPos order, so a position indexes blocks[] and panels[] alike.
  var blocks = cfg.blocks.concat([cfg.band, cfg.midLeft, cfg.midRight]);
  var html = '<div style="position:relative;width:' + px(W) + ';height:' +
    px(H) + ';margin:0 auto;background:' + cfg.face + ';border-radius:' +
    (ROUND ? '50%' : px(6)) +
    ';overflow:hidden;font-family:Lekton,ui-monospace,Menlo,monospace;">';

  // The 2x2 grid: each column pairs a square block with a short one.
  function grid(areaY) {
    var out = '';
    for (var col = 0; col < 2; col++) {
      var topBlk = blocks[col];        // tl / tr
      var botBlk = blocks[col + 2];    // bl / br
      var topH, botH;
      if (isShort(topBlk) === isShort(botBlk)) {
        topH = Math.floor((colH - GUTTER) / 2);
        botH = colH - GUTTER - topH;
      } else if (isShort(topBlk)) {
        topH = shortH; botH = square;
      } else {
        topH = square; botH = shortH;
      }
      var x = innerX + col * (colW + GUTTER);
      out += block(topBlk, x, areaY, colW, topH, mk(col));
      out += slotOverlay(col, x, areaY, colW, topH);
      out += block(botBlk, x, areaY + topH + GUTTER, colW, botH, mk(col + 2));
      out += slotOverlay(col + 2, x, areaY + topH + GUTTER, colW, botH);
    }
    return out;
  }

  // One six-block column: three stacked blocks, the square one going to
  // whichever slot holds the big block (mirrors layout_column in the C
  // source; a column without one falls back to the first slot).
  function column(x, y, colH, bigH, top, mid, bot) {
    var order = [top, mid, bot];
    var bigI = 0;
    for (var b = 0; b < 3; b++) {
      if (!isShort(blocks[order[b]])) { bigI = b; break; }
    }
    var shortH2 = Math.floor((colH - bigH - 2 * GUTTER) / 2);
    var h = [0, 1, 2].map(function(i) { return i === bigI ? bigH : shortH2; });
    h[2] = colH - h[0] - h[1] - 2 * GUTTER;
    var out = '';
    for (var i = 0; i < 3; i++) {
      out += block(blocks[order[i]], x, y, colW, h[i], mk(order[i]));
      out += slotOverlay(order[i], x, y, colW, h[i]);
      y += h[i] + GUTTER;
    }
    return out;
  }

  if (cfg.layout && !ROUND) {
    // Six blocks: two columns of three, each a square block plus two shorts.
    var bigH = square, colFull = 2 * square + GUTTER;
    if (colFull > innerH) {
      colFull = innerH;
      bigH = Math.floor((colFull - 2 * GUTTER) / 2);
    }
    var cTop = MARGIN + Math.floor((innerH - colFull) / 2);
    html += column(innerX, cTop, colFull, bigH, 0, 5, 2);                  // left
    html += column(innerX + colW + GUTTER, cTop, colFull, bigH, 1, 6, 3);  // right
  } else {
    // Classic (banner + grid), or the round six-block face, which lifts the
    // two column middles into strips above and below the grid.
    var strips = !!cfg.layout;   // implies ROUND here
    var bands = strips ? 2 : 1;
    var groupH = colH + bands * (yearH + GUTTER);
    var topY = MARGIN + Math.floor((innerH - groupH) / 2);
    // Round-bezel nudge, mirrors the same knob in the C layout().
    if (ROUND && !strips) {
      var nudge = W >= 200 ? [-10, 20] : [-5, 10];
      topY += cfg.yearTop ? nudge[0] : nudge[1];
    }
    var y = topY;
    if (strips || cfg.yearTop) {
      var first = strips ? 5 : 4;   // top strip = middle left / the banner
      html += bandBlock(blocks[first], innerX, y, innerW, yearH, mk(first), first);
      y += yearH + GUTTER;
    }
    html += grid(y);
    y += colH + GUTTER;
    if (strips || !cfg.yearTop) {
      var last = strips ? 6 : 4;    // bottom strip = middle right / the banner
      html += bandBlock(blocks[last], innerX, y, innerW, yearH, mk(last), last);
    }
  }

  html += '</div>';
  return html;
}

// One block on its own, for the palette chips: the same renderer the face
// uses, so a chip is exactly what the watch will draw. The box takes the
// block's own shape — square for a big one, half height for a small one — so
// a chip is never mostly empty.
// o: { panel, weekend, face, showSeconds, tz, str, box, scale }; `tz` and
// `str` are the selected slot's own zone and text, so a time-zone or text
// chip previews what it would place.
function swatch(v, o) {
  SCALE = o.scale;
  var h = isShort(v) ? Math.round(o.box / 2) : o.box;
  var c = { panel: o.panel, text: contrast(o.panel), weekend: o.weekend,
            showSeconds: o.showSeconds, tz: tzText(o.tz), str: o.str };
  return '<div style="position:relative;margin:0 auto;font-family:Lekton,ui-monospace,Menlo,monospace;width:' + px(o.box) +
    ';height:' + px(h) + ';background:' + o.face + ';border-radius:' + px(4) +
    ';overflow:hidden;">' + block(v, 0, 0, o.box, h, c) + '</div>';
}

module.exports = { build: build, swatch: swatch, contrast: contrast, accent: accent };

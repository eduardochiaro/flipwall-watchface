
// QuadBlock enum (must match flipwall-watchface.c):
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month.
// "Big" blocks fill a square; "small" blocks are half height. Each column must
// pair exactly one of each, so the two columns line up.
var BIG_BLOCKS = { 1: true, 2: true, 8: true, 12: true, 17: true, 19: true,
  21: true, 26: true, 27: true, 28: true, 29: true, 30: true, 31: true, 32: true,
  34: true, 36: true, 38: true, 40: true, 42: true, 44: true, 46: true,
  48: true };
// Day, Clock, Weather, Temp(big), Digital(big), Hours(big), Minutes(big),
// Calendar, Humidity, Battery, Calendar+Month, HR, Distance, Max/Min, UV,
// Wind speed, Wind direction, Air quality (big)
var FALLBACK_SMALL = 0;                   // Day of week
var FALLBACK_BIG = 2;                     // Clock

function isBig(v) {
  return !!BIG_BLOCKS[parseInt(v, 10)];
}

// The block selectors that make up one column, top to bottom. A column holds
// exactly one big block; the rest are short. The middle only takes part in the
// rect 6-block layout — the classic layout hides it, and the round 6-block one
// lifts it out into a strip — so elsewhere the rule is on the top/bottom pair.
var COLUMNS = [
  ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT'],
  ['BLOCK_TOP_RIGHT', 'BLOCK_MID_RIGHT', 'BLOCK_BOTTOM_RIGHT']
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
           n === 19 || n === 21 || n === 26 || (n >= 27 && n <= 32) ||
           n === 34 || n === 36 || n === 38 || n === 40 ||
           n === 42 || n === 44 || n === 46 || n === 48;
  }
  var FALLBACK_SMALL = 0;   // Day of week
  var FALLBACK_BIG = 2;     // Clock

  // --- Live preview -------------------------------------------------------
  var PREVIEW = (function() {
  // Screen geometry per platform. `side` mirrors SIDE_MARGIN in the C source
  // (round faces pull in so the panels clear the circle); `gutter` mirrors
  // GUTTER. Set per render from cfg.platform in build().
  var SPECS = {
    aplite:  { w: 144, h: 168, round: false, side: 0,  gutter: 3 },
    basalt:  { w: 144, h: 168, round: false, side: 0,  gutter: 3 },
    diorite: { w: 144, h: 168, round: false, side: 0,  gutter: 3 },
    flint:   { w: 144, h: 168, round: false, side: 0,  gutter: 3 },
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
                 steps: '8.2K', dist: '3.2km', batt: '82%',
                 temp: '22°', humid: '45%', humLabel: 'Hu', humLabel3: 'Hum',
                 battLabel: 'Batt', minmax: '24/12°', tmax: '24°', tmin: '12°',
                 distNum: '3.2', distUnit: 'KM',
                 precip: '2mm', time: '10:09', timeLead: '09:09',
                 hr: '72', uv: '7',
                 wind: '12km/h', windNum: '12', windUnit: 'KM/H',
                 windDir: 'WNW', windDeg: 292, aqi: '34', beat: '642',
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
           v !== 19 && v !== 21 && v !== 26 && !(v >= 27 && v <= 32) &&
           v !== 34 && v !== 36 && v !== 38 && v !== 40 &&
           v !== 42 && v !== 44 && v !== 46 && v !== 48;
  }

  // The wind arrow, approximated to the nearest of 8 glyphs (the watch rotates
  // the real pdc to the exact bearing). 0 deg = north = up. The bearing is where
  // the wind blows from, so the arrow points the opposite way.
  function windArrow(deg) {
    return ['↑', '↗', '→', '↘',
            '↓', '↙', '←', '↖'][Math.round((deg + 180) / 45) % 8];
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
    if (v === 45) { return '@' + SAMPLE.beat; }
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
    var band = indexColor(v);
    if (band) {
      c = { panel: band, text: contrast(band), weekend: c.weekend,
            showSeconds: c.showSeconds };
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
    if (v === 17 || v === 48) {  // digital clock (big): hours over minutes
      // 48 drops the hour's leading zero and keeps its width, so it previews an
      // hour earlier ("09") with the zero hidden — a two-digit hour shows nothing.
      var hh = v === 48 ? nozeroMarkup(SAMPLE.timeLead.slice(0, 2))
                        : (SAMPLE.hour < 10 ? '0' : '') + SAMPLE.hour;
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
      // Caption in a slim band over the big value (mirrors draw_caption_value).
      var calM = Math.round(h * 0.12), calInH = h - 2 * calM;
      var calTop = calM + Math.round(calInH * 0.38);
      var calMX = Math.round(w * 0.10);
      function calBand(t, top, bandH, color, fpx) {
        return '<div style="position:absolute;left:' + px(calMX) + ';right:' +
          px(calMX) + ';top:' + px(top) +
          ';height:' + px(bandH) + ';display:flex;align-items:center;' +
          'justify-content:center;white-space:nowrap;color:' + color +
          ';font-weight:bold;font-size:' + px(fpx) + ';line-height:1;">' + t + '</div>';
      }
      return panelDiv(x, y, w, h, c.panel,
        calBand(SAMPLE.dow, calM, calTop - calM, dowFg, Math.round(h * 0.19)) +
        calBand(SAMPLE.day, calTop, h - calM - calTop, c.text, Math.round(h * 0.46)) +
        seam(w, h));
    }
    // Big two-line blocks (caption + big value). label_top = caption on top.
    // Mirrors draw_caption_value in the C source (same 12%/38% proportions).
    if (v === 27 || v === 28 || v === 29 || v === 30 || v === 31 || v === 34 ||
        v === 36 || v === 38 || v === 40 || v === 46) {
      var cvM = Math.round(h * 0.12), cvInH = h - 2 * cvM;
      var cvSmallH = Math.round(cvInH * 0.38);
      var caption, value, capColor = c.text, labelTop;
      if (v === 27) { caption = SAMPLE.humLabel3; value = SAMPLE.humid; labelTop = true; }
      else if (v === 28) { caption = SAMPLE.battLabel; value = SAMPLE.batt; labelTop = true; }
      else if (v === 29) { caption = SAMPLE.month; value = SAMPLE.day; labelTop = true; }
      else if (v === 30) { caption = 'BPM'; value = SAMPLE.hr; labelTop = false; }
      else if (v === 34) { caption = 'UV Index'; value = SAMPLE.uv; labelTop = false; }
      else if (v === 36) { caption = SAMPLE.windUnit; value = SAMPLE.windNum; labelTop = false; }
      else if (v === 40) { caption = 'AQI'; value = SAMPLE.aqi; labelTop = false; }
      // ".beat" captions in the accent colour, like the "@" on the small block.
      else if (v === 46) { caption = '.beat'; value = SAMPLE.beat; labelTop = false;
                           capColor = accent(c.text); }
      // Wind direction: the arrow takes the big line, the compass word captions it.
      else if (v === 38) { caption = SAMPLE.windDir; value = windArrow(SAMPLE.windDeg); labelTop = false; }
      else { caption = SAMPLE.distUnit; value = SAMPLE.distNum; labelTop = false; }
      var smallY, smallH = cvSmallH, bigY, bigH;
      if (labelTop) { smallY = cvM; bigY = cvM + cvSmallH; bigH = cvInH - cvSmallH; }
      else { bigY = cvM; bigH = cvInH - cvSmallH; smallY = cvM + bigH; }
      var cvMX = Math.round(w * 0.10);   // side padding, keeps text off the border
      function cvBand(t, top, bandH, color, fpx) {
        // Mirror draw_centered's one-pass shrink so a wide caption ("UV Index")
        // stays on one line inside the padding instead of wrapping or clipping.
        var tw = t.length * fpx * 0.62, avail = w - 2 * cvMX;
        if (tw > avail) { fpx = Math.round(fpx * avail / tw); }
        return '<div style="position:absolute;left:' + px(cvMX) + ';right:' +
          px(cvMX) + ';top:' + px(top) +
          ';height:' + px(bandH) + ';display:flex;align-items:center;' +
          'justify-content:center;white-space:nowrap;color:' + color +
          ';font-weight:bold;font-size:' + px(fpx) + ';line-height:1;">' + t + '</div>';
      }
      return panelDiv(x, y, w, h, c.panel,
        cvBand(caption, smallY, smallH, capColor, Math.round(h * 0.19)) +
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
    if (v === 45) { txt = beatMarkup(txt, c.text); }
    if (v === 47) { txt = nozeroMarkup(txt); }
    return panelDiv(x, y, w, h, c.panel,
      textDiv(txt, c.text, font, 'center', 0) + seam(w, h));
  }

  function bandBlock(v, x, y, w, h, c) {
    var band = indexColor(v);
    if (band) {
      c = { panel: band, text: contrast(band), weekend: c.weekend };
      v = BASE_BLOCK[v];
    }
    var txt = valueText(v);
    var font = Math.round(h * 0.62);
    // Width the panel to the text (mirrors draw_band sizing to content), so
    // longer strings like "Jun 26" don't wrap onto a second line.
    var pw = Math.max(Math.round(h * 1.9), Math.round(txt.length * font * 0.62) + 12);
    if (v === 45) { txt = beatMarkup(txt, c.text); }
    if (v === 47) { txt = nozeroMarkup(txt); }   // after the width, so the pill keeps it
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

  // cfg: { platform, layout, yearTop, band, midLeft, midRight,
  //        blocks:[tl,tr,bl,br], face, panels, weekend, showSeconds }.
  // Mirrors layout() in the C source.
  function build(cfg) {
    var spec = SPECS[cfg.platform] || SPECS.basalt;
    W = spec.w; H = spec.h; SIDE = spec.side; ROUND = spec.round;
    GUTTER = spec.gutter;
    SCALE = 200 / W;                     // every face previews ~200px wide
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

    // Per-block panel colors, indexed like BlockPos in the C source:
    // [TL, TR, BL, BR, banner, midLeft, midRight]. Fall back to cfg.panel.
    var panels = cfg.panels || [cfg.panel, cfg.panel, cfg.panel, cfg.panel,
                                cfg.panel, cfg.panel, cfg.panel];
    function mk(panel) {
      return { panel: panel, weekend: cfg.weekend, text: contrast(panel),
               showSeconds: cfg.showSeconds };
    }
    // BlockPos order, so a position indexes blocks[] and panels[] alike.
    var blocks = cfg.blocks.concat([cfg.band, cfg.midLeft, cfg.midRight]);
    var html = '<div style="position:relative;width:' + px(W) + ';height:' +
      px(H) + ';margin:8px auto;background:' + cfg.face + ';border-radius:' +
      (ROUND ? '50%' : px(6)) +
      ';overflow:hidden;font-family:Arial,Helvetica,sans-serif;">';

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
        out += block(topBlk, x, areaY, colW, topH, mk(panels[col]));
        out += block(botBlk, x, areaY + topH + GUTTER, colW, botH, mk(panels[col + 2]));
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
        out += block(blocks[order[i]], x, y, colW, h[i], mk(panels[order[i]]));
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
        html += bandBlock(blocks[first], innerX, y, innerW, yearH, mk(panels[first]));
        y += yearH + GUTTER;
      }
      html += grid(y);
      y += colH + GUTTER;
      if (strips || !cfg.yearTop) {
        var last = strips ? 6 : 4;    // bottom strip = middle right / the banner
        html += bandBlock(blocks[last], innerX, y, innerW, yearH, mk(panels[last]));
      }
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

  // The watch this config page was opened from. Drives the preview's screen
  // shape and which layout rules apply; falls back to basalt when Clay has no
  // watch info (desktop / emulator).
  var watchInfo = (clayConfig.meta && clayConfig.meta.activeWatchInfo) || {};
  var platform = watchInfo.platform || 'basalt';
  var isRound = platform === 'chalk' || platform === 'gabbro';

  function isSixLayout() {
    var it = clayConfig.getItemByMessageKey('LAYOUT');
    return it ? parseInt(it.get(), 10) === 1 : false;
  }

  function refreshPreview() {
    var item = clayConfig.getItemById('PREVIEW');
    if (!item) { return; }
    item.set(PREVIEW.build({
      platform: platform,
      layout: isSixLayout() ? 1 : 0,
      yearTop: clayConfig.getItemByMessageKey('YEAR_TOP').get(),
      lang: blockVal('LANG'),
      units: blockVal('UNITS'),
      band: blockVal('BLOCK_BAND'),
      midLeft: blockVal('BLOCK_MID_LEFT'),
      midRight: blockVal('BLOCK_MID_RIGHT'),
      blocks: [
        blockVal('BLOCK_TOP_LEFT'), blockVal('BLOCK_TOP_RIGHT'),
        blockVal('BLOCK_BOTTOM_LEFT'), blockVal('BLOCK_BOTTOM_RIGHT')
      ],
      face: colorHex('FACE_COLOR'),
      panels: [
        colorHex('PANEL_TL_COLOR'), colorHex('PANEL_TR_COLOR'),
        colorHex('PANEL_BL_COLOR'), colorHex('PANEL_BR_COLOR'),
        colorHex('PANEL_BAND_COLOR'), colorHex('PANEL_ML_COLOR'),
        colorHex('PANEL_MR_COLOR')
      ],
      weekend: colorHex('WEEKEND_COLOR'),
      showSeconds: clayConfig.getItemByMessageKey('SHOW_SECONDS').get(),
      drawSeam: clayConfig.getItemByMessageKey('DRAW_SEAM').get()
    }));
  }

  // --- Presets ------------------------------------------------------------
  // A preset is just a saved face, so each one is stored as the share code the
  // Share Settings box exports (see the code format below): blocks, colors,
  // layout, banner side and seam, all in one string. To change a preset or add
  // one, build the face on this page, copy its code and paste it in here.
  var PRESETS = [
    { name: 'Standard',
      code: '0403800G080G80R7ZYN0000003ZG000000000000000000000000000000000000ZR' },
    { name: 'Digital',
      code: '0401848G000G80R7K9R9J023GW0471R08E3G0GW7011RE023GW0471R08E3G0GW708' },
    { name: 'Flip Clock',
      code: '040304RG2RAG80RA48H25VQEXVZG007EXVQEXVQEXVQEXVQEXVQEXVQEXVQEXVQE8M' },
    { name: 'Weather Station',
      code: '0401830G5C40838G01ARHZZZZZZTM07ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZYC' },
    { name: 'Sport',
      code: '0401048G0G0G818601200000000FY00000000000000000000000000000000000H4' },
    { name: 'Colorful',
      code: '040380GG000G80R7ZZQAPV2WWZZG0071E1APRQ7702W982C4WDP5SSYP60RPRQ7788' },
    { name: 'Six Up',
      code: '0403A1R2000G80R7ZYN0000003ZG000000000000000000000000000000000000YR' },
    { name: 'Six Weather',
      code: '0401A2135482P30701ATNZZZZZZTM07ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ90' }
  ];

  // A code carries the whole face, but a preset is about the look, so tapping
  // one must not reset the wearer's own settings. These four are theirs.
  var PRESET_SKIP = ['LANG', 'UNITS', 'SHOW_SECONDS', 'FLIP_ANIM'];

  function contrastHex(hex) {   // white text on dark bg, black on light
    var n = parseInt(hex, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 30 + g * 59 + b * 11) / 100 < 128 ? '#FFFFFF' : '#000000';
  }

  function applyPreset(p) {
    var values = decodeCode(p.code);
    if (typeof values === 'string') { return; }   // a broken preset code
    setCodeValues(values, PRESET_SKIP);
    applyLayoutVisibility();
    refreshPreview();
    refreshCode();
  }

  // --- Export / import ----------------------------------------------------
  // A face is shared as one alphanumeric code. The settings are packed into a
  // fixed byte layout, a checksum byte is appended (it catches a truncated or
  // mistyped paste, since each field on its own would still look in range), and
  // the whole thing is base32'd:
  //
  //   0        version
  //   1        language
  //   2        flag bits, in CODE_FLAGS order
  //   3..9     the seven block ids, in CODE_BLOCKS order
  //   10..39   ten colors, three bytes each, in CODE_COLORS order
  //   40       checksum
  //
  // The layout is the format. Only ever append to it, and bump CODE_VERSION
  // when you do, so old codes are refused rather than silently misread.
  var CODE_VERSION = 1;
  var CODE_FLAGS = ['LAYOUT', 'UNITS', 'YEAR_TOP', 'SHOW_SECONDS', 'FLIP_ANIM',
    'DRAW_SEAM'];
  var CODE_BLOCKS = ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT',
    'BLOCK_TOP_RIGHT', 'BLOCK_MID_RIGHT', 'BLOCK_BOTTOM_RIGHT', 'BLOCK_BAND'];
  var CODE_COLORS = ['FACE_COLOR', 'PANEL_COLOR', 'WEEKEND_COLOR',
    'PANEL_TL_COLOR', 'PANEL_ML_COLOR', 'PANEL_BL_COLOR',
    'PANEL_TR_COLOR', 'PANEL_MR_COLOR', 'PANEL_BR_COLOR', 'PANEL_BAND_COLOR'];
  // Every key the code carries, in the order a code is applied: the layout
  // first (it decides what the page shows), then the blocks top before bottom
  // so the column rule settles on the imported pair, then the master panel
  // color before the per-block ones it broadcasts to.
  var CODE_KEYS = CODE_FLAGS.concat(['LANG'], CODE_BLOCKS, CODE_COLORS);
  // Of the flag bits, these four are toggles and want a boolean back; LAYOUT
  // and UNITS are selects, whose options are the numbers 0 and 1.
  var CODE_BOOLS = ['YEAR_TOP', 'SHOW_SECONDS', 'FLIP_ANIM', 'DRAW_SEAM'];
  var MAX_BLOCK = 46;   // highest QuadBlock id (see config.js)
  var MAX_LANG = 9;     // LANG_OPTIONS is 10 languages, 0 = English
  var CODE_BYTES = 3 + CODE_BLOCKS.length + 3 * CODE_COLORS.length + 1;
  var CODE_CHARS = Math.ceil(CODE_BYTES * 8 / 5);

  // Crockford's base32: no punctuation, no case, and none of the letters that
  // get misread as digits — so a code survives being read aloud or retyped.
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function b32encode(bytes) {
    var out = '', bits = 0, acc = 0;
    for (var i = 0; i < bytes.length; i++) {
      acc = (acc << 8) | bytes[i];
      for (bits += 8; bits >= 5; bits -= 5) {
        out += B32.charAt((acc >>> (bits - 5)) & 31);
      }
    }
    return bits ? out + B32.charAt((acc << (5 - bits)) & 31) : out;
  }

  // null when the text holds anything that isn't a base32 digit.
  function b32decode(text) {
    var bytes = [], bits = 0, acc = 0;
    for (var i = 0; i < text.length; i++) {
      var digit = B32.indexOf(text.charAt(i));
      if (digit < 0) { return null; }
      acc = (acc << 5) | digit;
      if ((bits += 5) >= 8) {
        bytes.push((acc >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return bytes;
  }

  function itemValue(key) {
    var it = clayConfig.getItemByMessageKey(key);
    var v = it ? it.get() : 0;
    if (typeof v === 'boolean') { return v ? 1 : 0; }
    v = parseInt(v, 10);
    return v > 0 ? v : 0;
  }

  function exportCode() {
    var flags = 0;
    CODE_FLAGS.forEach(function(key, bit) {
      if (itemValue(key)) { flags |= 1 << bit; }
    });
    var bytes = [CODE_VERSION, itemValue('LANG') & 255, flags];
    CODE_BLOCKS.forEach(function(key) { bytes.push(itemValue(key) & 255); });
    CODE_COLORS.forEach(function(key) {
      var c = itemValue(key);
      bytes.push((c >> 16) & 255, (c >> 8) & 255, c & 255);
    });
    bytes.push(bytes.reduce(function(a, b) { return (a + b) & 255; }, 0));
    return b32encode(bytes);
  }

  // Unpack a code into a { messageKey: value } map, or return a string saying
  // why it was rejected.
  function decodeCode(text) {
    // Be generous about what a pasted code may carry: spaces or dashes someone
    // added for readability, and the letters base32 folds onto digits.
    var clean = String(text || '').toUpperCase().replace(/[\s-]/g, '')
      .replace(/[IL]/g, '1').replace(/O/g, '0');
    if (clean.length !== CODE_CHARS) { return 'That code is the wrong length.'; }
    var bytes = b32decode(clean);
    if (!bytes || bytes.length !== CODE_BYTES) {
      return 'That does not look like a code.';
    }
    var sum = bytes.slice(0, -1).reduce(function(a, b) { return (a + b) & 255; }, 0);
    if (sum !== bytes[CODE_BYTES - 1]) {
      return 'That code looks incomplete — check you copied all of it.';
    }
    if (bytes[0] !== CODE_VERSION) {
      return 'That code is from a different version.';
    }

    // Clamp every field to its own range on the way in, so a code that passes
    // the checksum but holds nonsense still can't wedge the page.
    var values = { LANG: Math.min(bytes[1], MAX_LANG) };
    CODE_FLAGS.forEach(function(key, bit) {
      var on = !!(bytes[2] & (1 << bit));
      values[key] = CODE_BOOLS.indexOf(key) > -1 ? on : (on ? 1 : 0);
    });
    var at = 3;
    CODE_BLOCKS.forEach(function(key) {
      values[key] = Math.min(bytes[at], MAX_BLOCK);
      at += 1;
    });
    CODE_COLORS.forEach(function(key) {
      values[key] = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
      at += 3;
    });
    return values;
  }

  // Write a decoded code onto the page, leaving out any key in `skip`.
  function setCodeValues(values, skip) {
    CODE_KEYS.forEach(function(key) {
      if (skip && skip.indexOf(key) > -1) { return; }
      setBlock(key, values[key]);
    });
  }

  // Returns null on success, or a message explaining why the code was rejected.
  function importCode(text) {
    var values = decodeCode(text);
    if (typeof values === 'string') { return values; }
    setCodeValues(values);
    return null;
  }

  function transferEl(name) {
    return document.querySelector('[data-transfer="' + name + '"]');
  }

  function refreshCode() {
    var box = transferEl('code');
    if (box) { box.value = exportCode(); }
  }

  function buildTransferUI() {
    var item = clayConfig.getItemById('TRANSFER');
    if (!item) { return; }
    var btn = 'padding:10px 6px;border:none;border-radius:6px;cursor:pointer;' +
      'font-weight:bold;font-size:14px;';
    var field = 'width:100%;box-sizing:border-box;padding:8px;border-radius:6px;' +
      'border:1px solid #999;font-family:monospace;font-size:12px;';
    item.set(
      '<textarea data-transfer="code" readonly rows="3" style="' + field +
        'resize:none;"></textarea>' +
      '<div style="display:flex;gap:6px;margin:6px 0 12px;">' +
        '<button type="button" data-transfer="copy" style="' + btn +
          'flex:1;background:#444;color:#FFF;">Copy</button></div>' +
      '<input data-transfer="in" placeholder="Paste a code here" style="' +
        field + '">' +
      '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<button type="button" data-transfer="import" style="' + btn +
          'flex:1;background:#444;color:#FFF;">Import</button></div>' +
      '<div data-transfer="msg" style="margin-top:6px;font-size:13px;"></div>');

    var msg = transferEl('msg');
    function say(text, ok) {
      if (msg) {
        msg.textContent = text;
        msg.style.color = ok ? '#2E7D32' : '#C62828';
      }
    }

    var copy = transferEl('copy');
    if (copy) {
      copy.addEventListener('click', function(e) {
        e.preventDefault();
        var box = transferEl('code');
        if (!box) { return; }
        box.select();
        // execCommand is deprecated but is what the older config webviews have;
        // the clipboard API is tried first where it exists.
        try {
          if (navigator.clipboard) { navigator.clipboard.writeText(box.value); }
          else { document.execCommand('copy'); }
          say('Copied.', true);
        } catch (err) { say('Copy it by hand — this browser blocked it.', false); }
      });
    }

    var run = transferEl('import');
    if (run) {
      run.addEventListener('click', function(e) {
        e.preventDefault();
        var input = transferEl('in');
        var error = importCode(input && input.value);
        if (error) { say(error, false); return; }
        if (input) { input.value = ''; }
        applyLayoutVisibility();
        refreshPreview();
        refreshCode();
        say('Imported. Tap Save to send it to the watch.', true);
      });
    }
    refreshCode();
  }

  function buildPresetButtons() {
    var item = clayConfig.getItemById('PRESETS');
    if (!item) { return; }
    // One row that scrolls sideways, so the list stays one line however many
    // presets there are. Each button keeps its own width and never wraps.
    var html = '<div style="display:flex;gap:6px;overflow-x:auto;' +
      'padding-bottom:6px;-webkit-overflow-scrolling:touch;">';
    PRESETS.forEach(function(p, i) {
      // The button wears the preset's own panel color, read back out of its code.
      var values = decodeCode(p.code);
      var panel = typeof values === 'string' ? '000000'
        : ('00000' + values.PANEL_COLOR.toString(16)).slice(-6).toUpperCase();
      html += '<button type="button" data-preset="' + i + '" style="flex:0 0 auto;' +
        'padding:10px 14px;border:none;border-radius:6px;cursor:pointer;' +
        'white-space:nowrap;font-weight:bold;font-size:14px;background:#' + panel +
        ';color:' + contrastHex(panel) + ';">' + p.name + '</button>';
    });
    item.set(html + '</div>');
    PRESETS.forEach(function(p, i) {
      var el = document.querySelector('[data-preset="' + i + '"]');
      if (el) {
        el.addEventListener('click', function(e) { e.preventDefault(); applyPreset(p); });
      }
    });
  }

  // A column holds exactly one big block and the rest short. The middle only
  // belongs to the column in the rect 6-block layout: the classic layout hides
  // it and the round 6-block one draws it as a strip, so there the rule is on
  // the top/bottom pair alone.
  var COLUMN_SLOTS = [
    ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT'],
    ['BLOCK_TOP_RIGHT', 'BLOCK_MID_RIGHT', 'BLOCK_BOTTOM_RIGHT']
  ];
  var GRID_KEYS = ['BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT',
    'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT'];
  var MID_KEYS = ['BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT'];

  // The slots `key` shares its column with, in draw order, under the layout
  // that is active right now. Empty when the key isn't in play.
  function columnOf(key) {
    var col = COLUMN_SLOTS[COLUMN_SLOTS[0].indexOf(key) > -1 ? 0 : 1];
    if (!(isSixLayout() && !isRound)) { col = [col[0], col[2]]; }
    return col.indexOf(key) > -1 ? col : [];
  }

  var linkGuard = false;
  // When `key` moves, put the column back to one big + the rest short: the slot
  // just set keeps the big block if it went big, otherwise the column's other
  // big one does, and a column left without any promotes the slot below `key`.
  function reconcile(key) {
    if (linkGuard) { return; }
    var col = columnOf(key);
    if (!col.length) { return; }
    var big = col.filter(function(k) { return isBig(blockVal(k)); });
    if (big.length === 1) { return; }
    var keep = isBig(blockVal(key)) ? key
      : (big.length ? big[0] : col[(col.indexOf(key) + 1) % col.length]);
    linkGuard = true;   // .set() re-fires change; don't bounce back
    col.forEach(function(k) {
      if (k === keep && !isBig(blockVal(k))) { setBlock(k, FALLBACK_BIG); }
      if (k !== keep && isBig(blockVal(k))) { setBlock(k, FALLBACK_SMALL); }
    });
    linkGuard = false;
  }

  function setBlock(key, value) {
    var it = clayConfig.getItemByMessageKey(key);
    if (it) { it.set(value); }
  }

  // "All panels" master: broadcast its value to every per-block color picker.
  var PANEL_KEYS = ['PANEL_BAND_COLOR', 'PANEL_ML_COLOR', 'PANEL_MR_COLOR',
    'PANEL_TL_COLOR', 'PANEL_TR_COLOR', 'PANEL_BL_COLOR', 'PANEL_BR_COLOR'];
  function syncPanels() {
    var master = clayConfig.getItemByMessageKey('PANEL_COLOR');
    if (!master) { return; }
    var v = master.get();
    PANEL_KEYS.forEach(function(k) {
      var it = clayConfig.getItemByMessageKey(k);
      if (it) { it.set(v); }
    });
  }

  // On round screens the 6-block layout can't stack a full-height column, so
  // the two middles lift out into strips above and below the grid. That moves
  // every block in the column: reading down the face the left column runs
  // strip / top / bottom and the right column runs top / bottom / strip, so
  // "Middle" and "Bottom" end up naming the wrong panels. Clay bakes labels and
  // item order in at build time, so re-title and re-stack them in the DOM to
  // match what the watch actually draws.
  //
  // Each block's color picker follows it, so both move together.
  var COLUMN_ITEMS = {
    left: ['BLOCK_TOP_LEFT', 'PANEL_TL_COLOR', 'BLOCK_MID_LEFT', 'PANEL_ML_COLOR',
           'BLOCK_BOTTOM_LEFT', 'PANEL_BL_COLOR'],
    right: ['BLOCK_TOP_RIGHT', 'PANEL_TR_COLOR', 'BLOCK_MID_RIGHT', 'PANEL_MR_COLOR',
            'BLOCK_BOTTOM_RIGHT', 'PANEL_BR_COLOR']
  };
  // Top-to-bottom order once the middles have become strips: the left column's
  // middle rises above its top block, the right column's sinks below its bottom.
  var ROUND_ITEMS = {
    left: ['BLOCK_MID_LEFT', 'PANEL_ML_COLOR', 'BLOCK_TOP_LEFT', 'PANEL_TL_COLOR',
           'BLOCK_BOTTOM_LEFT', 'PANEL_BL_COLOR'],
    right: ['BLOCK_TOP_RIGHT', 'PANEL_TR_COLOR', 'BLOCK_BOTTOM_RIGHT', 'PANEL_BR_COLOR',
            'BLOCK_MID_RIGHT', 'PANEL_MR_COLOR']
  };
  // Only the positions that shift need a new name; the rest keep their declared
  // label (the left bottom block and the right top one don't move).
  var ROUND_LABELS = {
    BLOCK_MID_LEFT: 'Top strip', PANEL_ML_COLOR: 'Top strip Color',
    BLOCK_TOP_LEFT: 'Middle', PANEL_TL_COLOR: 'Middle Color',
    BLOCK_BOTTOM_RIGHT: 'Middle', PANEL_BR_COLOR: 'Middle Color',
    BLOCK_MID_RIGHT: 'Bottom strip', PANEL_MR_COLOR: 'Bottom strip Color'
  };

  function itemElement(key) {
    var it = clayConfig.getItemByMessageKey(key);
    return it && it.$element && it.$element[0];
  }

  // On round screens the two middles never sit inside their column — they are
  // the top / bottom strips, which draw as pills — so they only take the banner
  // block set. The select is built with the full column list, so trim it here
  // (the ids mirror block_valid_band in the C source).
  var BAND_OK = [4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 16, 24, 25, 33, 35, 37, 39,
    41, 43, 45];
  var FALLBACK_BAND = 16;   // Digital clock

  function trimMidOptions() {
    MID_KEYS.forEach(function(key) {
      var el = itemElement(key);
      var sel = el && el.querySelector && el.querySelector('select');
      if (!sel) { return; }
      var each = function(list, fn) { Array.prototype.slice.call(list).forEach(fn); };
      each(sel.querySelectorAll('option'), function(opt) {
        if (BAND_OK.indexOf(parseInt(opt.value, 10)) < 0) {
          opt.parentNode.removeChild(opt);
        }
      });
      each(sel.querySelectorAll('optgroup'), function(group) {
        if (!group.querySelector('option')) { group.parentNode.removeChild(group); }
      });
      if (BAND_OK.indexOf(blockVal(key)) < 0) { setBlock(key, FALLBACK_BAND); }
    });
  }

  function applyColumnOrder(six) {
    var strips = six && isRound;
    ['left', 'right'].forEach(function(side) {
      var keys = COLUMN_ITEMS[side];
      var parent = itemElement(keys[0]) && itemElement(keys[0]).parentNode;
      if (!parent) { return; }
      // appendChild moves a node it already owns, so walking the wanted order
      // re-stacks the whole column after its heading.
      (strips ? ROUND_ITEMS : COLUMN_ITEMS)[side].forEach(function(key) {
        var node = itemElement(key);
        if (node) { parent.appendChild(node); }
      });
      keys.forEach(function(key) {
        var span = itemElement(key) && itemElement(key).querySelector('.label');
        var it = clayConfig.getItemByMessageKey(key);
        if (span) {
          span.textContent = (strips && ROUND_LABELS[key]) || it.config.label;
        }
      });
    });
  }

  // Show only the section that belongs to the active layout: the banner is
  // classic-only, the two column middles are 6-block-only.
  function applyLayoutVisibility() {
    var six = isSixLayout();
    applyColumnOrder(six);
    // The middle joins / leaves the column with the layout, so a column that
    // was valid under the old one may now hold two bigs or none.
    COLUMN_SLOTS.forEach(function(col) { reconcile(col[0]); });
    var shown = {
      BLOCK_BAND: !six, PANEL_BAND_COLOR: !six, YEAR_TOP: !six,
      BLOCK_MID_LEFT: six, PANEL_ML_COLOR: six,
      BLOCK_MID_RIGHT: six, PANEL_MR_COLOR: six
    };
    Object.keys(shown).forEach(function(key) {
      var it = clayConfig.getItemByMessageKey(key);
      if (it) { shown[key] ? it.show() : it.hide(); }
    });
    var heading = clayConfig.getItemById('BANNER_HEADING');
    if (heading) { six ? heading.hide() : heading.show(); }

    var tip = clayConfig.getItemById('LAYOUT_TIP');
    if (tip) {
      tip.set('Tip: Each column holds one big block' +
        (six && !isRound ? ' and two small ones, in any order'
                         : ' and one small block') +
        '; picking a second big one auto-swaps the other.' + (six
          ? (isRound
              ? ' This screen is round, so each column\'s middle block leaves ' +
                'the column and becomes a strip: the left one above the grid, ' +
                'the right one below it. Strips are always small. Each column ' +
                'is listed in the order it is drawn.'
              : '')
          : ''));
    }
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    if (isRound) { trimMidOptions(); }
    GRID_KEYS.concat(MID_KEYS).forEach(function(key) {
      var it = clayConfig.getItemByMessageKey(key);
      if (it) { it.on('change', function() { reconcile(key); }); }
    });

    var layoutItem = clayConfig.getItemByMessageKey('LAYOUT');
    if (layoutItem) { layoutItem.on('change', applyLayoutVisibility); }

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
    var watched = ['LAYOUT', 'YEAR_TOP', 'LANG', 'UNITS', 'BLOCK_BAND',
      'BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT', 'FACE_COLOR', 'PANEL_COLOR',
      'WEEKEND_COLOR', 'SHOW_SECONDS',
      'DRAW_SEAM'].concat(GRID_KEYS).concat(PANEL_KEYS);
    watched.forEach(function(key) {
      var item = clayConfig.getItemByMessageKey(key);
      if (item) { item.on('change', refreshPreview); }
    });
    // The share code covers settings the preview doesn't draw (the flip
    // animation), so it tracks its own key list.
    CODE_KEYS.forEach(function(key) {
      var item = clayConfig.getItemByMessageKey(key);
      if (item) { item.on('change', refreshCode); }
    });
    applyLayoutVisibility();
    refreshPreview();
    buildPresetButtons();
    buildTransferUI();
  });
}

module.exports = {clayCustomFn, isBig, COLUMNS, FALLBACK_SMALL, FALLBACK_BIG};
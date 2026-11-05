// What the settings page knows about the face: every block, the slots they sit
// in, the settings and their defaults, and the column rule. Shared by the page
// (inlined into it by scripts/inline-config.mjs), index.js and the tests, so
// each fact is written down once.
//
// Block ids are the QuadBlock enum in src/c/flipwall.h; test/test_page.js
// checks this list against the C enum and its BIG_SET / BAND_SET masks.

// [id, label, size, category, fits the banner]. Listed in palette order:
// big before short, then time, date, activity, weather, other.
var LIST = [
  [2, 'Analog clock', 'big', 'time'],
  [17, 'Digital clock', 'big', 'time'],
  [48, 'Digital clock, no leading zero', 'big', 'time'],
  [19, 'Hours', 'big', 'time'],
  [21, 'Minutes', 'big', 'time'],
  [52, 'Second time zone', 'big', 'time'],
  [53, 'Second time zone, abbreviation', 'big', 'time'],
  [56, 'Second time zone, no label', 'big', 'time'],
  [46, '.beat time', 'big', 'time'],
  [1, 'Day of month', 'big', 'date'],
  [26, 'Calendar', 'big', 'date'],
  [29, 'Calendar + Month', 'big', 'date'],
  [28, 'Battery', 'big', 'activity'],
  [31, 'Distance', 'big', 'activity'],
  [30, 'Heart rate', 'big', 'activity'],
  [8, 'Weather icon', 'big', 'weather'],
  [12, 'Temperature', 'big', 'weather'],
  [32, 'Max/Min temp', 'big', 'weather'],
  [27, 'Humidity', 'big', 'weather'],
  [34, 'UV index', 'big', 'weather'],
  [42, 'UV index - color', 'big', 'weather'],
  [40, 'Air quality', 'big', 'weather'],
  [44, 'Air quality - color', 'big', 'weather'],
  [36, 'Wind speed', 'big', 'weather'],
  [38, 'Wind direction', 'big', 'weather'],
  [63, 'Sunrise / sunset', 'big', 'weather'],
  [60, 'Sunrise', 'big', 'weather'],
  [61, 'Sunset', 'big', 'weather'],
  [16, 'Digital clock', 'short', 'time', 1],
  [47, 'Digital clock, no leading zero', 'short', 'time', 1],
  [18, 'Hours', 'short', 'time'],
  [20, 'Minutes', 'short', 'time'],
  [22, 'AM/PM', 'short', 'time'],
  [23, 'AM/PM stacked', 'short', 'time'],
  [50, 'Second time zone', 'short', 'time', 1],
  [51, 'Second time zone, abbreviation', 'short', 'time', 1],
  [55, 'Second time zone, no label', 'short', 'time', 1],
  [45, '.beat time', 'short', 'time', 1],
  [0, 'Day of week', 'short', 'date'],
  [3, 'Month', 'short', 'date'],
  [7, 'Year', 'short', 'date', 1],
  [9, 'Month + Day', 'short', 'date', 1],
  [10, 'Weekday + Day', 'short', 'date', 1],
  [4, 'Steps', 'short', 'activity', 1],
  [49, 'Steps, full count', 'short', 'activity', 1],
  [5, 'Distance', 'short', 'activity', 1],
  [6, 'Battery', 'short', 'activity', 1],
  [24, 'Heart rate', 'short', 'activity', 1],
  [54, 'Utility', 'short', 'activity'],
  [11, 'Temperature', 'short', 'weather', 1],
  [25, 'Temperature + icon', 'short', 'weather', 1],
  [14, 'Max/Min temp', 'short', 'weather', 1],
  [13, 'Humidity', 'short', 'weather', 1],
  [15, 'Precipitation', 'short', 'weather', 1],
  [33, 'UV index', 'short', 'weather', 1],
  [41, 'UV index - color', 'short', 'weather', 1],
  [39, 'Air quality', 'short', 'weather', 1],
  [43, 'Air quality - color', 'short', 'weather', 1],
  [35, 'Wind speed', 'short', 'weather', 1],
  [37, 'Wind direction', 'short', 'weather', 1],
  [62, 'Sunrise / sunset', 'short', 'weather', 1],
  [58, 'Sunrise', 'short', 'weather', 1],
  [59, 'Sunset', 'short', 'weather', 1],
  [57, 'Text', 'short', 'other', 1]
];

var BLOCKS = {};   // id -> { id, label, big, cat, band }
LIST.forEach(function(b) {
  BLOCKS[b[0]] = { id: b[0], label: b[1], big: b[2] === 'big', cat: b[3], band: !!b[4] };
});
var ORDER = LIST.map(function(b) { return b[0]; });
var MAX_BLOCK = Math.max.apply(null, ORDER);

var CATEGORIES = [['all', 'All'], ['time', 'Time'], ['date', 'Date'],
  ['activity', 'Activity'], ['weather', 'Weather'], ['other', 'Other']];

function isBig(v) { var b = BLOCKS[v]; return !!(b && b.big); }
function fitsBand(v) { var b = BLOCKS[v]; return !!(b && b.band); }

// Blocks that differ in one detail share a palette tile (the first id, which is
// what tapping the tile places); the detail is a picker beside the block.
var VARIATIONS = [
  { name: 'Step count', options: [[4, 'Short'], [49, 'Every digit']] },
  { name: 'Leading zero', options: [[16, 'Shown'], [47, 'Hidden']] },
  { name: 'Leading zero', options: [[17, 'Shown'], [48, 'Hidden']] },
  { name: 'Weather icon', options: [[11, 'Hidden'], [25, 'Shown']] },
  { name: 'Second line', options: [[26, 'Weekday'], [29, 'Month']] },
  { name: 'AM/PM layout', options: [[22, 'Side by side'], [23, 'Stacked']] },
  { name: 'Zone label', options: [[50, 'Offset'], [51, 'Abbreviation'], [55, 'None']] },
  { name: 'Zone label', options: [[52, 'Offset'], [53, 'Abbreviation'], [56, 'None']] },
  { name: 'Band color', options: [[33, 'Off'], [41, 'On']] },
  { name: 'Band color', options: [[34, 'Off'], [42, 'On']] },
  { name: 'Band color', options: [[39, 'Off'], [43, 'On']] },
  { name: 'Band color', options: [[40, 'Off'], [44, 'On']] },
  { name: 'Type', options: [[62, 'Auto'], [58, 'Sunrise'], [59, 'Sunset']] },
  { name: 'Type', options: [[63, 'Auto'], [60, 'Sunrise'], [61, 'Sunset']] }
];
var VARIATION_OF = {};
VARIATIONS.forEach(function(g) {
  g.options.forEach(function(o) { VARIATION_OF[o[0]] = g; });
});

// The blocks with a zone to pick, and the one with text to type.
var TZ_BLOCKS = { 50: 1, 51: 1, 52: 1, 53: 1, 55: 1, 56: 1 };
var TEXT_BLOCKS = { 57: 1 };

// The seven slots, in BlockPos order (the order the watch indexes zones and
// texts by, so TZ_ZONE[i] / TEXT[i] belong to SLOTS[i]).
var SLOTS = [
  { key: 'BLOCK_TOP_LEFT', panel: 'PANEL_TL_COLOR', name: 'Left top' },
  { key: 'BLOCK_TOP_RIGHT', panel: 'PANEL_TR_COLOR', name: 'Right top' },
  { key: 'BLOCK_BOTTOM_LEFT', panel: 'PANEL_BL_COLOR', name: 'Left bottom' },
  { key: 'BLOCK_BOTTOM_RIGHT', panel: 'PANEL_BR_COLOR', name: 'Right bottom' },
  { key: 'BLOCK_BAND', panel: 'PANEL_BAND_COLOR', name: 'Banner' },
  { key: 'BLOCK_MID_LEFT', panel: 'PANEL_ML_COLOR', name: 'Left middle' },
  { key: 'BLOCK_MID_RIGHT', panel: 'PANEL_MR_COLOR', name: 'Right middle' }
];
var SLOT_KEYS = SLOTS.map(function(s) { return s.key; });
var PANEL_KEYS = SLOTS.map(function(s) { return s.panel; });

var LANGS = ['English', 'Español', 'Português', 'Français', 'Deutsch',
  'Italiano', 'Nederlands', 'Polski', 'Türkçe', 'Indonesia'];

// Every setting the watch is sent, with the value a fresh install starts on.
// Colors are 0xRRGGBB ints; a slot's panel color starts on PANEL_COLOR.
var DEFAULTS = {
  LAYOUT: 0, LANG: 0, UNITS: 0,
  SHOW_SECONDS: false, FLIP_ANIM: true, DRAW_SEAM: true, YEAR_TOP: true,
  FACE_COLOR: 0xFF5500, PANEL_COLOR: 0x000000, WEEKEND_COLOR: 0xFF0000,
  BLOCK_TOP_LEFT: 0, BLOCK_TOP_RIGHT: 1, BLOCK_BOTTOM_LEFT: 2,
  BLOCK_BOTTOM_RIGHT: 3, BLOCK_BAND: 7, BLOCK_MID_LEFT: 16, BLOCK_MID_RIGHT: 4
};
var BOOLS = ['SHOW_SECONDS', 'FLIP_ANIM', 'DRAW_SEAM', 'YEAR_TOP'];
var COLORS = ['FACE_COLOR', 'PANEL_COLOR', 'WEEKEND_COLOR'];

// A color as saved: an int from this page or Clay, or a hex string ("FF5500").
function toColor(v, fallback) {
  if (typeof v === 'number' && isFinite(v)) { return v & 0xFFFFFF; }
  var s = String(v === undefined || v === null ? '' : v).replace(/^(#|0x)/i, '');
  if (/^[0-9a-f]{6}$/i.test(s)) { return parseInt(s, 16); }
  if (/^\d+$/.test(s)) { return parseInt(s, 10) & 0xFFFFFF; }
  return fallback;
}

// A complete, typed settings object out of whatever was saved: this page's own
// output, an older Clay save ({ KEY: { value } } or { KEY: value }), or nothing.
// Missing or nonsense values fall back to their defaults.
function normalize(saved) {
  saved = saved || {};
  function raw(key) {
    var v = saved[key];
    return v && typeof v === 'object' ? v.value : v;
  }
  function int(key, max) {
    var n = parseInt(raw(key), 10);
    return isNaN(n) || n < 0 || n > max ? DEFAULTS[key] : n;
  }
  var s = {
    LAYOUT: int('LAYOUT', 1), LANG: int('LANG', LANGS.length - 1), UNITS: int('UNITS', 1)
  };
  BOOLS.forEach(function(key) {
    var v = raw(key);
    s[key] = v === undefined || v === null ? DEFAULTS[key] : (v === true || v === 1 || v === '1' || v === 'true');
  });
  COLORS.forEach(function(key) { s[key] = toColor(raw(key), DEFAULTS[key]); });
  SLOTS.forEach(function(slot, i) {
    var b = parseInt(raw(slot.key), 10);
    s[slot.key] = BLOCKS[b] ? b : DEFAULTS[slot.key];
    s[slot.panel] = toColor(raw(slot.panel), s.PANEL_COLOR);
    s['TZ_ZONE[' + i + ']'] = String(raw('TZ_ZONE[' + i + ']') || 'UTC');
    var t = raw('TEXT[' + i + ']');
    s['TEXT[' + i + ']'] = t === undefined || t === null ? 'Text' : String(t).slice(0, 15);
  });
  if (!fitsBand(s.BLOCK_BAND)) { s.BLOCK_BAND = DEFAULTS.BLOCK_BAND; }
  return s;
}

function isRoundPlatform(platform) { return platform === 'chalk' || platform === 'gabbro'; }

// The slots the face draws under this layout: the banner is classic only, the
// two column middles six only.
function liveSlots(s) {
  return s.LAYOUT ? ['BLOCK_MID_LEFT', 'BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT',
    'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT', 'BLOCK_MID_RIGHT']
    : ['BLOCK_BAND', 'BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT', 'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT'];
}

// What a slot may hold: the banner takes the pill blocks; so do the two middles
// on a round face, where they are the strips above and below the grid.
function slotAllows(key, s, platform) {
  var pill = key === 'BLOCK_BAND' ||
    ((key === 'BLOCK_MID_LEFT' || key === 'BLOCK_MID_RIGHT') && isRoundPlatform(platform));
  return function(v) { return pill ? fitsBand(v) : !!BLOCKS[v]; };
}

// A column holds exactly one big block and the rest short. The middle only joins
// the column in the rect six-block layout; elsewhere the rule is on the
// top/bottom pair.
var COLUMNS = [
  ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT'],
  ['BLOCK_TOP_RIGHT', 'BLOCK_MID_RIGHT', 'BLOCK_BOTTOM_RIGHT']
];
var FALLBACK_SHORT = 0;   // Day of week
var FALLBACK_BIG = 2;     // Analog clock

function columnOf(key, s, platform) {
  var col = COLUMNS[COLUMNS[0].indexOf(key) > -1 ? 0 : 1];
  if (!(s.LAYOUT && !isRoundPlatform(platform))) { col = [col[0], col[2]]; }
  return col.indexOf(key) > -1 ? col : [];
}

// After `key` changed, put its column back to one big + the rest short: the
// slot just set keeps the big block if it went big, else the column's other big
// one does, and a column left with none promotes the slot below `key`.
function reconcile(s, key, platform) {
  var col = columnOf(key, s, platform);
  if (!col.length) { return s; }
  var big = col.filter(function(k) { return isBig(s[k]); });
  if (big.length === 1) { return s; }
  var keep = isBig(s[key]) ? key : (big.length ? big[0] : col[(col.indexOf(key) + 1) % col.length]);
  col.forEach(function(k) {
    if (k === keep && !isBig(s[k])) { s[k] = FALLBACK_BIG; }
    if (k !== keep && isBig(s[k])) { s[k] = FALLBACK_SHORT; }
  });
  return s;
}

// Both columns, and the round strips' banner rule: for a layout switch or an
// imported code, where any slot may have moved.
function settle(s, platform) {
  reconcile(s, 'BLOCK_TOP_LEFT', platform);
  reconcile(s, 'BLOCK_TOP_RIGHT', platform);
  if (isRoundPlatform(platform)) {
    ['BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT'].forEach(function(k) {
      if (!fitsBand(s[k])) { s[k] = 16; }   // Digital clock
    });
  }
  return s;
}

module.exports = {
  BLOCKS: BLOCKS, ORDER: ORDER, MAX_BLOCK: MAX_BLOCK, CATEGORIES: CATEGORIES,
  VARIATIONS: VARIATIONS, VARIATION_OF: VARIATION_OF,
  TZ_BLOCKS: TZ_BLOCKS, TEXT_BLOCKS: TEXT_BLOCKS,
  SLOTS: SLOTS, SLOT_KEYS: SLOT_KEYS, PANEL_KEYS: PANEL_KEYS, LANGS: LANGS,
  DEFAULTS: DEFAULTS, isBig: isBig, fitsBand: fitsBand, normalize: normalize,
  isRoundPlatform: isRoundPlatform, liveSlots: liveSlots, slotAllows: slotAllows,
  reconcile: reconcile, settle: settle
};

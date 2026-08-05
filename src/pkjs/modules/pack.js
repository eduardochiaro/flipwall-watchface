// ---------------------------------------------------------------------------
// Wire format. The phone sends the watch three fixed-layout byte blobs instead
// of one AppMessage key per setting: a dict tuple costs 7 bytes of header
// before its payload, so 38 of them (a config save) ran ~425 bytes where the
// packed blob is 89. The point is the inbox buffer, which is malloc'd from the
// app heap and has to fit the largest message — aplite has ~5KB of heap to
// spend, and this is 768 of them back.
//
// Every blob starts with a version byte. The watch drops a blob whose version
// it doesn't know rather than reading it half-right, so a format change is a
// no-op update, not a scrambled face. Both sides ship in the same .pbw, so the
// only way they disagree is a bug in here.
//
// The layouts are the format. Only ever append to one, and bump VERSION when
// you do. The matching readers are settings_apply / apply_tz in
// src/c/flipwall-watchface.c and weather_apply_blob in src/c/modules/weather.c.
// ---------------------------------------------------------------------------
var VERSION = 3;

var TZ_SLOTS = 7;      // BlockPos order: TL, TR, BL, BR, banner, mid L, mid R
var ABBR_LEN = 5;      // abbreviations run to 4 chars ("AEDT"), NUL padded
var TZ_BODY = TZ_SLOTS * (2 + ABBR_LEN);   // int16 offset + abbr, per slot
// The free text of the "Text" blocks: 15 characters (what the config page
// accepts) plus the terminator, per slot.
var TEXT_LEN = 16;
var TEXT_BODY = TZ_SLOTS * TEXT_LEN;

// Flag bits of the config blob, low bit first.
var FLAGS = ['LAYOUT', 'UNITS', 'YEAR_TOP', 'SHOW_SECONDS', 'FLIP_ANIM',
  'DRAW_SEAM'];
// The blocks and the panel colors are in BlockPos order, which is what the
// watch indexes both of its own arrays by.
var BLOCK_KEYS = ['BLOCK_TOP_LEFT', 'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_LEFT',
  'BLOCK_BOTTOM_RIGHT', 'BLOCK_BAND', 'BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT'];
var COLOR_KEYS = ['FACE_COLOR', 'PANEL_COLOR', 'WEEKEND_COLOR',
  'PANEL_TL_COLOR', 'PANEL_TR_COLOR', 'PANEL_BL_COLOR', 'PANEL_BR_COLOR',
  'PANEL_BAND_COLOR', 'PANEL_ML_COLOR', 'PANEL_MR_COLOR'];
// Weather values, in the order of the FIELDS table in src/c/modules/weather.c.
var WEATHER_FIELDS = ['WEATHER_TEMPERATURE', 'WEATHER_CODE', 'WEATHER_HUMIDITY',
  'WEATHER_MIN_TEMP', 'WEATHER_MAX_TEMP', 'WEATHER_PRECIPITATION', 'WEATHER_UV',
  'WEATHER_WIND_SPEED', 'WEATHER_WIND_DIR', 'WEATHER_AQI',
  // The next sunrise / sunset, as minutes since local midnight.
  'WEATHER_SUNRISE', 'WEATHER_SUNSET'];

// What a select falls back to when the phone has never saved one. (0 is a real
// block id — "Day of week" — so a missing value can't just read as 0.)
var DEFAULTS = {
  BLOCK_TOP_LEFT: 0, BLOCK_TOP_RIGHT: 1,        // Day of week, Day of month
  BLOCK_BOTTOM_LEFT: 2, BLOCK_BOTTOM_RIGHT: 3,  // Clock, Month
  BLOCK_BAND: 7,                                // Year
  BLOCK_MID_LEFT: 16, BLOCK_MID_RIGHT: 4,       // Digital clock, Steps
  LANG: 0
};

var CONFIG_LEN =
  3 + BLOCK_KEYS.length + 3 * COLOR_KEYS.length + TZ_BODY + TEXT_BODY;     // 201
var TZ_LEN = 1 + TZ_BODY;                                                  // 50
var WEATHER_LEN = 3 + 2 * WEATHER_FIELDS.length;                           // 27

// Clay hands a value back either bare or wrapped in { value: … }.
function readValue(settings, key) {
  var v = settings[key];
  return v && typeof v === 'object' ? v.value : v;
}

// Toggles come back as booleans, selects as strings, colors as ints.
function num(settings, key) {
  var v = readValue(settings, key);
  if (typeof v === 'boolean') { return v ? 1 : 0; }
  var n = parseInt(v, 10);
  return isNaN(n) ? (DEFAULTS[key] || 0) : n;
}

// Little-endian int16. Negative values (a zone west of UTC) come out as two's
// complement, which is what the watch reads them back as.
function push16(out, v) {
  out.push(v & 255, (v >> 8) & 255);
}

function pushColor(out, v) {
  out.push((v >> 16) & 255, (v >> 8) & 255, v & 255);
}

// Each slot's zone as the watch needs it: its current offset from UTC in
// minutes (DST already in it) and its abbreviation. `zones` is one entry per
// slot; a missing one reads as UTC.
function pushZones(out, zones) {
  for (var i = 0; i < TZ_SLOTS; i++) {
    var z = zones[i] || {};
    push16(out, z.offset || 0);
    var abbr = z.abbr || 'UTC';
    for (var c = 0; c < ABBR_LEN; c++) {
      out.push(c < abbr.length ? abbr.charCodeAt(c) & 127 : 0);
    }
  }
}

// Each slot's free text (TEXT[n] on the config page), NUL padded to TEXT_LEN.
// The watch's font only has ASCII, so anything else is dropped rather than sent
// as a byte it would draw as a blank.
function pushTexts(out, settings) {
  for (var i = 0; i < TZ_SLOTS; i++) {
    var s = String(readValue(settings, 'TEXT[' + i + ']') || '')
      .replace(/[^\x20-\x7E]/g, '').slice(0, TEXT_LEN - 1);
    for (var c = 0; c < TEXT_LEN; c++) {
      out.push(c < s.length ? s.charCodeAt(c) : 0);
    }
  }
}

//   0        version
//   1        flags, in FLAGS order
//   2        language
//   3..9     the seven block ids, in BlockPos order
//   10..39   ten colors, three bytes each, in COLOR_KEYS order
//   40..88   the seven zones (see pushZones)
//   89..200  the seven free-text strings (see pushTexts)
function packConfig(settings, zones) {
  var flags = 0;
  FLAGS.forEach(function(key, bit) {
    if (num(settings, key)) { flags |= 1 << bit; }
  });
  var out = [VERSION, flags, num(settings, 'LANG') & 255];
  BLOCK_KEYS.forEach(function(key) { out.push(num(settings, key) & 255); });
  COLOR_KEYS.forEach(function(key) { pushColor(out, num(settings, key)); });
  pushZones(out, zones);
  pushTexts(out, settings);
  return out;
}

// The zones on their own, the same 49-byte body the config blob ends with. Sent
// every half hour so a DST change lands without the config page being opened.
function packTz(zones) {
  var out = [VERSION];
  pushZones(out, zones);
  return out;
}

//   0     version
//   1..2  present mask, bit per field in WEATHER_FIELDS order
//   3..26 the twelve values, int16 each
//
// The mask is what keeps a partial push partial: the phone only asks the API
// for the fields the blocks on the face actually use, and the watch leaves its
// cached value alone for every field whose bit is clear.
function packWeather(msg) {
  var mask = 0, values = [];
  WEATHER_FIELDS.forEach(function(key, i) {
    var v = msg[key];
    if (v !== undefined && v !== null) { mask |= 1 << i; }
    values.push(Math.round(v || 0));
  });
  var out = [VERSION, mask & 255, (mask >> 8) & 255];
  values.forEach(function(v) { push16(out, v); });
  return out;
}

module.exports = {
  packConfig: packConfig,
  packTz: packTz,
  packWeather: packWeather,
  readValue: readValue,
  BLOCK_KEYS: BLOCK_KEYS,
  TZ_SLOTS: TZ_SLOTS,
  VERSION: VERSION,
  CONFIG_LEN: CONFIG_LEN,
  TZ_LEN: TZ_LEN,
  WEATHER_LEN: WEATHER_LEN
};

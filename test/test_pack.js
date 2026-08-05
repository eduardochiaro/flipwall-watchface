// The wire format the phone packs and the watch reads back. There is no shared
// implementation to check against — the reader is C on the watch — so the check
// is the layout itself: byte offsets, lengths and sign handling, spelled out
// here the way settings_apply / apply_tz (src/c/flipwall-watchface.c) and
// weather_apply_blob (src/c/modules/weather.c) read them. If a field moves on
// one side and not the other, one of these numbers stops matching.
var pack = require('../src/pkjs/modules/pack');
var assert = require('assert');
var checks = 0;

// The offsets the C side spells as CFG_*.
var CFG_FLAGS = 1, CFG_LANG = 2, CFG_BLOCKS = 3;
var POS_COUNT = 7;
var CFG_COLORS = CFG_BLOCKS + POS_COUNT;                 // 10
var CFG_ZONES = CFG_COLORS + 3 * (3 + POS_COUNT);        // 40
var ZONE_LEN = 7;                                        // int16 + 5-byte abbr
var CFG_TEXTS = CFG_ZONES + POS_COUNT * ZONE_LEN;        // 89
var TEXT_LEN = 16;                                       // 15 chars, NUL padded

var SETTINGS = {
  LAYOUT: 1, UNITS: 0, YEAR_TOP: true, SHOW_SECONDS: false,
  FLIP_ANIM: true, DRAW_SEAM: false, LANG: 3,
  BLOCK_TOP_LEFT: 0, BLOCK_TOP_RIGHT: 54, BLOCK_BOTTOM_LEFT: 2,
  BLOCK_BOTTOM_RIGHT: 3, BLOCK_BAND: 7, BLOCK_MID_LEFT: 16, BLOCK_MID_RIGHT: 4,
  FACE_COLOR: 0xFF5500, PANEL_COLOR: 0x000000, WEEKEND_COLOR: 0xFF0000,
  PANEL_TL_COLOR: 0x0055AA, PANEL_TR_COLOR: 1, PANEL_BL_COLOR: 2,
  PANEL_BR_COLOR: 3, PANEL_BAND_COLOR: 4, PANEL_ML_COLOR: 5, PANEL_MR_COLOR: 6,
  // Free text, one per slot: a plain one, one that is over the 15-character
  // limit, and one with a character the watch's font has no glyph for.
  'TEXT[0]': 'Hi', 'TEXT[1]': 'abcdefghijklmnopqrst', 'TEXT[2]': 'café'
};

// Clay hands select values back as strings; a value it has never saved is
// absent altogether. Both have to survive the pack.
var WRAPPED = { BLOCK_TOP_RIGHT: { value: '54' } };

var ZONES = [
  { offset: -480, abbr: 'PST' }, { offset: 60, abbr: 'CEST' },
  { offset: 0, abbr: 'UTC' }, { offset: 330, abbr: 'IST' },
  { offset: 780, abbr: 'NZDT' }
];   // short on purpose: the last two slots fall back to UTC

(function configLayout() {
  var b = pack.packConfig(SETTINGS, ZONES);
  assert.strictEqual(b.length, pack.CONFIG_LEN, 'config blob changed length');
  assert.strictEqual(b.length, 201, 'config blob is not 201 bytes');
  assert.strictEqual(b[0], pack.VERSION, 'no version byte');

  // Flags, low bit first: LAYOUT, UNITS, YEAR_TOP, SHOW_SECONDS, FLIP, SEAM.
  assert.strictEqual(b[CFG_FLAGS], 0x01 | 0x04 | 0x10, 'flag bits moved');
  assert.strictEqual(b[CFG_LANG], 3, 'language byte moved');

  assert.deepStrictEqual(b.slice(CFG_BLOCKS, CFG_BLOCKS + POS_COUNT),
    [0, 54, 2, 3, 7, 16, 4], 'blocks are not in BlockPos order');

  // Colors: face, panel, weekend, then the seven overrides, three bytes each.
  assert.deepStrictEqual(b.slice(CFG_COLORS, CFG_COLORS + 3), [0xFF, 0x55, 0x00],
    'face color is not RGB at CFG_COLORS');
  assert.deepStrictEqual(b.slice(CFG_COLORS + 9, CFG_COLORS + 12),
    [0x00, 0x55, 0xAA], 'the first panel override is not the TL one');

  // Zones: int16 offset then five abbreviation bytes, NUL padded.
  assert.deepStrictEqual(b.slice(CFG_ZONES, CFG_ZONES + ZONE_LEN),
    [0x20, 0xFE, 80, 83, 84, 0, 0], 'zone slot 0 is not -480/"PST"');
  assert.strictEqual((b[CFG_ZONES] | (b[CFG_ZONES + 1] << 8)) - 65536, -480,
    'a negative offset is not two-s complement int16');
  var last = CFG_ZONES + 6 * ZONE_LEN;
  assert.deepStrictEqual(b.slice(last, last + ZONE_LEN), [0, 0, 85, 84, 67, 0, 0],
    'a slot with no zone did not fall back to UTC');

  // Free text: 16 bytes a slot, NUL padded, truncated to 15 characters, and
  // stripped of anything the watch's font can't draw.
  function text(i) {
    var at = CFG_TEXTS + i * TEXT_LEN;
    return b.slice(at, at + TEXT_LEN);
  }
  assert.deepStrictEqual(text(0),
    [72, 105, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'text slot 0 is not "Hi" NUL padded');
  assert.strictEqual(String.fromCharCode.apply(null, text(1)).replace(/\0/g, ''),
    'abcdefghijklmno', 'an over-long text was not cut to 15 characters');
  assert.strictEqual(String.fromCharCode.apply(null, text(2)).replace(/\0/g, ''),
    'caf', 'a non-ASCII character was not dropped');
  assert.deepStrictEqual(text(6), new Array(TEXT_LEN).fill(0),
    'a slot with no text is not all NULs');

  assert.ok(b.every(function(v) { return v >= 0 && v <= 255; }),
    'a byte fell outside 0..255');
  checks++;
})();

(function clayValueShapes() {
  var wrapped = Object.assign({}, SETTINGS, WRAPPED);
  assert.deepStrictEqual(pack.packConfig(wrapped, ZONES),
    pack.packConfig(SETTINGS, ZONES), 'a { value: "54" } item packed differently');

  // Nothing saved at all: the blob still has to be well formed, and the blocks
  // fall back to the defaults rather than all reading as zero.
  var bare = pack.packConfig({}, []);
  assert.strictEqual(bare.length, pack.CONFIG_LEN, 'an empty face changed length');
  assert.deepStrictEqual(bare.slice(CFG_BLOCKS, CFG_BLOCKS + POS_COUNT),
    [0, 1, 2, 3, 7, 16, 4], 'the default face is not the hard-coded one');
  checks++;
})();

(function tzBlob() {
  var tz = pack.packTz(ZONES);
  var cfg = pack.packConfig(SETTINGS, ZONES);
  assert.strictEqual(tz.length, pack.TZ_LEN, 'tz blob changed length');
  assert.strictEqual(tz.length, 50, 'tz blob is not 50 bytes');
  // The watch parses both with one function, so the bodies must be identical.
  assert.deepStrictEqual(tz.slice(1), cfg.slice(CFG_ZONES, CFG_TEXTS),
    'the tz blob body is not the config blob tail');
  checks++;
})();

(function weatherBlob() {
  var b = pack.packWeather({ WEATHER_TEMPERATURE: -7, WEATHER_CODE: 61 });
  assert.strictEqual(b.length, pack.WEATHER_LEN, 'weather blob changed length');
  assert.strictEqual(b.length, 27, 'weather blob is not 27 bytes');
  assert.strictEqual(b[0], pack.VERSION, 'no version byte');
  // Mask: temperature is bit 0, code bit 1; nothing else was requested.
  assert.strictEqual(b[1] | (b[2] << 8), 0x03, 'the present mask is wrong');
  assert.deepStrictEqual(b.slice(3, 5), [0xF9, 0xFF], '-7 is not int16 LE');
  assert.strictEqual(b[5], 61, 'the code is not the second field');

  // A rounded float, and a null reading (either air-quality field can come back
  // null) sent as a real 0 rather than NaN.
  var f = pack.packWeather({ WEATHER_TEMPERATURE: 21.6, WEATHER_AQI: null });
  assert.strictEqual(f[3], 22, 'a float was not rounded');
  assert.strictEqual(f[1] | (f[2] << 8), 0x01, 'a null field set its mask bit');
  checks++;
})();

console.log(checks + ' passed, 0 failed');

// Share codes and presets. A face is shared as one alphanumeric code: the
// settings packed into a fixed byte layout, a checksum byte appended (it catches
// a truncated or mistyped paste, since each field on its own would still look in
// range), and the whole thing base32'd:
//
//   0        version
//   1        language (low nibble) and font (high nibble)
//   2        flag bits, in CODE_FLAGS order
//   3..9     the seven block ids, in CODE_BLOCKS order
//   10..39   ten colors, three bytes each, in CODE_COLORS order
//   40       checksum
//
// The layout is the format. Only ever append to it, and bump CODE_VERSION when
// you do, so old codes are refused rather than silently misread. (The font went
// into the language byte's spare nibble instead: every code made before it, the
// presets included, reads as font 0, Lekton, which is what those faces wore.)
//
// The second time zones and the free text are not in a code: neither is a byte,
// and a shared face is about the look. An imported face keeps this watch's own.
var catalog = require('./catalog');

var CODE_VERSION = 1;
var CODE_FLAGS = ['LAYOUT', 'UNITS', 'YEAR_TOP', 'SHOW_SECONDS', 'FLIP_ANIM', 'DRAW_SEAM'];
var CODE_BLOCKS = ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT',
  'BLOCK_TOP_RIGHT', 'BLOCK_MID_RIGHT', 'BLOCK_BOTTOM_RIGHT', 'BLOCK_BAND'];
var CODE_COLORS = ['FACE_COLOR', 'PANEL_COLOR', 'WEEKEND_COLOR',
  'PANEL_TL_COLOR', 'PANEL_ML_COLOR', 'PANEL_BL_COLOR',
  'PANEL_TR_COLOR', 'PANEL_MR_COLOR', 'PANEL_BR_COLOR', 'PANEL_BAND_COLOR'];
var CODE_BOOLS = ['YEAR_TOP', 'SHOW_SECONDS', 'FLIP_ANIM', 'DRAW_SEAM'];
var CODE_KEYS = CODE_FLAGS.concat(['LANG', 'FONT'], CODE_BLOCKS, CODE_COLORS);
var CODE_BYTES = 3 + CODE_BLOCKS.length + 3 * CODE_COLORS.length + 1;
var CODE_CHARS = Math.ceil(CODE_BYTES * 8 / 5);

// Crockford's base32: no punctuation, no case, and none of the letters that get
// misread as digits, so a code survives being read aloud or retyped.
var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function b32encode(bytes) {
  var out = '', bits = 0, acc = 0;
  for (var i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    for (bits += 8; bits >= 5; bits -= 5) { out += B32.charAt((acc >>> (bits - 5)) & 31); }
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

function byteOf(v) { return typeof v === 'boolean' ? (v ? 1 : 0) : (parseInt(v, 10) || 0); }

function encode(s) {
  var flags = 0;
  CODE_FLAGS.forEach(function(key, bit) { if (byteOf(s[key])) { flags |= 1 << bit; } });
  var bytes = [CODE_VERSION, (byteOf(s.LANG) & 15) | ((byteOf(s.FONT) & 15) << 4), flags];
  CODE_BLOCKS.forEach(function(key) { bytes.push(byteOf(s[key]) & 255); });
  CODE_COLORS.forEach(function(key) {
    var c = byteOf(s[key]);
    bytes.push((c >> 16) & 255, (c >> 8) & 255, c & 255);
  });
  bytes.push(bytes.reduce(function(a, b) { return (a + b) & 255; }, 0));
  return b32encode(bytes);
}

// A code as { KEY: value }, or a string saying why it was rejected.
function decode(text) {
  // Be generous about a pasted code: spaces or dashes added for readability,
  // and the letters base32 folds onto digits.
  var clean = String(text || '').toUpperCase().replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1').replace(/O/g, '0');
  if (clean.length !== CODE_CHARS) { return 'That code is the wrong length.'; }
  var bytes = b32decode(clean);
  if (!bytes || bytes.length !== CODE_BYTES) { return 'That does not look like a code.'; }
  var sum = bytes.slice(0, -1).reduce(function(a, b) { return (a + b) & 255; }, 0);
  if (sum !== bytes[CODE_BYTES - 1]) { return 'That code looks incomplete. Check you copied all of it.'; }
  if (bytes[0] !== CODE_VERSION) { return 'That code is from a different version.'; }

  // Every field is clamped to its own range, so a code that passes the checksum
  // but holds nonsense still can't wedge the page.
  var values = { LANG: Math.min(bytes[1] & 15, catalog.LANGS.length - 1),
                 FONT: Math.min(bytes[1] >> 4, catalog.FONTS.length - 1) };
  CODE_FLAGS.forEach(function(key, bit) {
    var on = !!(bytes[2] & (1 << bit));
    values[key] = CODE_BOOLS.indexOf(key) > -1 ? on : (on ? 1 : 0);
  });
  var at = 3;
  CODE_BLOCKS.forEach(function(key) {
    values[key] = catalog.BLOCKS[bytes[at]] ? bytes[at] : catalog.DEFAULTS[key];
    at += 1;
  });
  CODE_COLORS.forEach(function(key) {
    values[key] = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
    at += 3;
  });
  return values;
}

// `s` with a decoded code written over it, minus the keys in `skip`.
function apply(s, values, skip) {
  var out = {};
  Object.keys(s).forEach(function(k) { out[k] = s[k]; });
  CODE_KEYS.forEach(function(key) {
    if (!(skip && skip.indexOf(key) > -1)) { out[key] = values[key]; }
  });
  return out;
}

// A preset is a saved face, stored as its share code. To change one or add one,
// build the face on the settings page, copy its code and paste it in here.
var PRESETS = [
  { name: 'Standard', code: '0403800G080G80R7ZYN0000003ZG000000000000000000000000000000000000ZR' },
  { name: 'Digital', code: '0401848G000G80R7K9R9J023GW0471R08E3G0GW7011RE023GW0471R08E3G0GW708' },
  { name: 'Flip Clock', code: '040304RG2RAG80RA48H25VQEXVZG007EXVQEXVQEXVQEXVQEXVQEXVQEXVQEXVQE8M' },
  { name: 'Weather Station', code: '0401830G5C40838G01ARHZZZZZZTM07ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZYC' },
  { name: 'Sport', code: '0401048G0G0G818601200000000FY00000000000000000000000000000000000H4' },
  { name: 'Colorful', code: '040380GG000G80R7ZZQAPV2WWZZG0071E1APRQ7702W982C4WDP5SSYP60RPRQ7788' },
  { name: 'Six Up', code: '0403A1R2000G80R7ZYN0000003ZG000000000000000000000000000000000000YR' },
  { name: 'Six Weather', code: '0401A2135482P30701ATNZZZZZZTM07ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ90' }
];

// A preset is about the look, so applying one keeps these settings of the wearer's.
var PRESET_SKIP = ['LANG', 'FONT', 'UNITS', 'SHOW_SECONDS', 'FLIP_ANIM'];

module.exports = { encode: encode, decode: decode, apply: apply,
  PRESETS: PRESETS, PRESET_SKIP: PRESET_SKIP, CODE_CHARS: CODE_CHARS };

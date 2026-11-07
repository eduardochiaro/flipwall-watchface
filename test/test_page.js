// Host test for the settings page's shared modules: the block catalog (against
// the C enum it mirrors), settings migration, the column rule, share codes and
// presets, the face preview, and the inlined page itself.
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var execFileSync = require('child_process').execFileSync;
var root = path.join(__dirname, '..');
var src = path.join(root, 'src', 'pkjs', 'modules');
var catalog = require(src + '/catalog');
var code = require(src + '/code');
var face = require(src + '/face');
var pack = require(src + '/pack');

var checks = 0;
function ok(cond, what) { assert.ok(cond, what); checks++; }

// --- The catalog is the C enum ----------------------------------------------
// QuadBlock in flipwall.h numbers the blocks; the KIND table in blocks.c says
// which are big and which fit the banner. The page must agree on all three,
// or it offers a block the watch draws differently, or one it refuses.
var header = fs.readFileSync(path.join(root, 'src/c/flipwall.h'), 'utf8');
var enumBody = /typedef enum \{([\s\S]*?)\} QuadBlock;/.exec(header)[1];
var names = enumBody.split('\n').map(function(l) { return (/^\s*(BLK_[A-Z0-9_]+)/.exec(l) || [])[1]; })
  .filter(function(n) { return n && n !== 'BLK_COUNT'; });
var idOf = {};
names.forEach(function(n, i) { idOf[n] = i; });
ok(names.length === catalog.ORDER.length, 'the C enum has ' + names.length + ' blocks, the catalog ' + catalog.ORDER.length);
names.forEach(function(n, i) { ok(catalog.BLOCKS[i], n + ' (' + i + ') is missing from the catalog'); });

var blocksC = fs.readFileSync(path.join(root, 'src/c/modules/blocks.c'), 'utf8');
var kindBody = /static const uint8_t KIND\[BLK_COUNT\] = \{([\s\S]*?)\};/.exec(blocksC)[1];
function kindIds(flag) {
  var re = new RegExp('\\[(BLK_[A-Z0-9_]+)\\] = ' + flag + '\\b', 'g'), out = [], m;
  while ((m = re.exec(kindBody))) { ok(m[1] in idOf, m[1] + ' in KIND is not a block'); out.push(idOf[m[1]]); }
  return out;
}
var big = kindIds('BIG'), band = kindIds('BAND');
catalog.ORDER.forEach(function(id) {
  ok(catalog.isBig(id) === (big.indexOf(id) > -1), 'block ' + id + ' size differs from KIND');
  ok(catalog.fitsBand(id) === (band.indexOf(id) > -1), 'block ' + id + ' banner fit differs from KIND');
});

// Every variation member is a real block of one size, so a tile never swaps size.
catalog.VARIATIONS.forEach(function(g) {
  var size = catalog.isBig(g.options[0][0]);
  g.options.forEach(function(o) {
    ok(catalog.BLOCKS[o[0]] && catalog.isBig(o[0]) === size, g.name + ': ' + o[0] + ' mixes sizes');
  });
});

// --- Settings migration --------------------------------------------------------
var d = catalog.normalize(null);
ok(d.BLOCK_BAND === 7 && d.FACE_COLOR === 0xFF5500 && d.FLIP_ANIM === true && d.SHOW_SECONDS === false,
  'a fresh install does not start on the defaults');
ok(d.PANEL_TL_COLOR === d.PANEL_COLOR && d['TZ_ZONE[3]'] === 'UTC' && d['TEXT[6]'] === 'Text',
  'a fresh install is missing slot settings');
var clay = catalog.normalize({ BLOCK_TOP_LEFT: { value: '16' }, FACE_COLOR: { value: 255 },
  PANEL_COLOR: 'AA0000', SHOW_SECONDS: { value: true }, LAYOUT: '1', 'TEXT[2]': { value: 'Hello' } });
ok(clay.BLOCK_TOP_LEFT === 16 && clay.FACE_COLOR === 255 && clay.PANEL_COLOR === 0xAA0000 &&
  clay.SHOW_SECONDS === true && clay.LAYOUT === 1 && clay['TEXT[2]'] === 'Hello', 'an old Clay save does not load');
ok(clay.PANEL_BR_COLOR === 0xAA0000, 'a slot with no panel color does not take the master one');
var junk = catalog.normalize({ BLOCK_TOP_LEFT: 99, BLOCK_BAND: 2, LANG: 40, FACE_COLOR: 'nope' });
ok(junk.BLOCK_TOP_LEFT === 0 && junk.BLOCK_BAND === 7 && junk.LANG === 0 && junk.FACE_COLOR === 0xFF5500,
  'nonsense in a save is not dropped back to the defaults');
ok(pack.packConfig(d, []).length === pack.CONFIG_LEN, 'a normalized save does not pack to the config length');

// --- The column rule ---------------------------------------------------------------
function colOk(s, keys) { return keys.filter(function(k) { return catalog.isBig(s[k]); }).length === 1; }
var s = catalog.normalize({});
s.BLOCK_TOP_LEFT = 17;   // a big block over the clock
catalog.reconcile(s, 'BLOCK_TOP_LEFT', 'basalt');
ok(s.BLOCK_TOP_LEFT === 17 && !catalog.isBig(s.BLOCK_BOTTOM_LEFT), 'a second big block does not push the first out');
s.BLOCK_TOP_LEFT = 3;    // and back to short: the column is left with none
catalog.reconcile(s, 'BLOCK_TOP_LEFT', 'basalt');
ok(colOk(s, ['BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT']), 'a column left with no big block is not given one');
['basalt', 'chalk'].forEach(function(p) {
  var six = catalog.normalize({ LAYOUT: 1, BLOCK_MID_LEFT: 26 });
  catalog.settle(six, p);
  var col = p === 'chalk' ? ['BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT'] : ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT'];
  ok(colOk(six, col), p + ': the six-block column does not settle to one big block');
  if (p === 'chalk') { ok(catalog.fitsBand(six.BLOCK_MID_LEFT), 'a round strip keeps a block that is not a pill'); }
});

// --- Share codes and presets ----------------------------------------------------------
code.PRESETS.forEach(function(p) {
  var v = code.decode(p.code);
  ok(typeof v !== 'string', p.name + ': ' + v);
  ok(code.encode(code.apply(catalog.normalize({}), v)) === p.code, p.name + ' does not round-trip');
});
code.PRESETS.forEach(function(p) {
  ok(code.decode(p.code).FONT === 0, p.name + ' does not read as the default font');
});
var mine = catalog.normalize({ LANG: 9, FONT: 8, UNITS: 1, BLOCK_BAND: 62, PANEL_BR_COLOR: 0x00AAFF });
var back = code.apply(catalog.normalize({}), code.decode(code.encode(mine)));
['LANG', 'FONT', 'UNITS', 'BLOCK_BAND', 'PANEL_BR_COLOR', 'FACE_COLOR'].forEach(function(k) {
  ok(back[k] === mine[k], k + ' is lost in a share code');
});
var kept = code.apply(mine, code.decode(code.PRESETS[0].code), code.PRESET_SKIP);
ok(kept.LANG === 9 && kept.FONT === 8 && kept.UNITS === 1, 'a preset overwrites the wearer\'s language, font or units');

// --- Fonts: one list, in one order, in four places ----------------------------------
// The index is the wire value, so catalog.js, scripts/fonts.py, package.json
// and FONT_RES on the watch have to agree on it.
var pyIds = fs.readFileSync(path.join(root, 'scripts', 'fonts.py'), 'utf8')
  .split('FONTS = [')[1].split('\n]')[0].match(/^\s*\("(\w+)"/gm).map(function(l) { return l.match(/"(\w+)"/)[1]; });
var resIds = require(path.join(root, 'package.json')).pebble.resources.media
  .filter(function(m) { return /^FONT_/.test(m.name); }).map(function(m) { return m.name; });
var cIds = /FONT_RES\[\] = \{([^}]*)\}/.exec(fs.readFileSync(path.join(root, 'src', 'c', 'flipwall-watchface.c'), 'utf8'))[1]
  .match(/RESOURCE_ID_(\w+)/g).map(function(r) { return r.replace('RESOURCE_ID_', ''); });
var want = pyIds.map(function(id) { return 'FONT_' + id.toUpperCase(); });
ok(want.length === catalog.FONTS.length, 'catalog.js FONTS and scripts/fonts.py differ in length');
ok(want.join() === resIds.join(), 'package.json font resources are not in fonts.py order');
ok(want.join() === cIds.join(), 'FONT_RES is not in fonts.py order');
ok(catalog.FONTS.length <= 16, 'a font index no longer fits the share code nibble');
ok(catalog.normalize({ FONT: 40 }).FONT === 0, 'an unknown font is not reset to the default');
ok(typeof code.decode('ABC') === 'string', 'a short code is accepted');
ok(typeof code.decode(code.PRESETS[0].code.slice(0, -1) + '0') === 'string', 'a corrupted code is accepted');

// --- The face preview ------------------------------------------------------------
['aplite', 'basalt', 'chalk', 'diorite', 'emery', 'flint', 'gabbro'].forEach(function(p) {
  [0, 1].forEach(function(layout) {
    var cfg = { platform: p, layout: layout, yearTop: true, band: 62, midLeft: 16, midRight: 4,
      blocks: [0, 63, 2, 3], face: '#FF5500', weekend: '#FF0000', panels: Array(7).fill('#000000') };
    var html = face.build(cfg);
    ok(html.indexOf('<div') === 0 && html.indexOf('undefined') < 0 && html.indexOf('NaN') < 0,
      p + '/' + layout + ': the face does not render cleanly');
    ok(html.indexOf('data-slot') > -1, p + '/' + layout + ': the face has no tap targets');
    cfg.overlays = false;
    ok(face.build(cfg).indexOf('data-slot') < 0, p + '/' + layout + ': a thumbnail has tap targets');
  });
});
catalog.ORDER.forEach(function(id) {
  var html = face.swatch(id, { panel: '#000000', face: '#FF5500', weekend: '#FF0000', box: 48, scale: 1 });
  ok(html.indexOf('undefined') < 0 && html.indexOf('NaN') < 0, 'block ' + id + ' does not draw cleanly');
});

// The captions the preview draws are the watch's own, in every language.
var langC = fs.readFileSync(path.join(root, 'src/c/modules/lang.c'), 'utf8');
[['WEEK', 76], ['DAY', 78], ['ACTIVE', 86], ['SLEEP', 88]].forEach(function(t) {
  var words = new RegExp(t[0] + '\\[LANG_COUNT\\](?:\\[\\d+\\])? = \\{([^}]*)\\}').exec(langC)[1].match(/"[^"]*"/g);
  ok(words.length === catalog.LANGS.length, t[0] + ' in lang.c does not have every language');
  words.forEach(function(w, lang) {
    face.build({ platform: 'basalt', lang: lang, blocks: [0, 1, 2, 3], band: 7, face: '#FF5500',
      weekend: '#FF0000', panels: Array(7).fill('#000000') });
    var html = face.swatch(t[1], { panel: '#000000', face: '#FF5500', weekend: '#FF0000', box: 48, scale: 1 });
    ok(html.indexOf('>' + w.slice(1, -1) + '<') > -1, t[0] + ' differs from lang.c in language ' + lang);
  });
});

// --- The inlined page --------------------------------------------------------------
execFileSync(process.execPath, [path.join(root, 'scripts/inline-config.mjs')]);
var page = require(path.join(root, 'src/pkjs/page.js'));
ok(page.indexOf('var STATE = null; //$$STATE$$') > -1, 'the page lost the line index.js writes its state into');
ok(page.indexOf('%%VERSION%%') < 0, 'the page was not given its version');
var scripts = page.match(/<script>([\s\S]*?)<\/script>/g).map(function(t) { return t.slice(8, -9); });
scripts.forEach(function(js, i) {
  ok((function() { try { new Function(js); return true; } catch (e) { return false; } })(), 'page script ' + i + ' does not parse');
});

console.log(checks + ' passed, 0 failed');

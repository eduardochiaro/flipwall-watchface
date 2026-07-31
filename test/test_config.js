// Headless harness for the Clay config page. clayCustomFn only ever runs inside
// the config webview, so this stubs the bits of it that the function touches,
// runs it for every screen shape x layout, and checks that the preview renders
// and that the block-size rule the active layout enforces actually holds.
//
// Set DUMP=<file> to also write the rendered previews out as an HTML page.
var src = require('path').join(__dirname, '..', 'src', 'pkjs');
var { clayCustomFn, isBig, GRID_PAIRS } = require(src + '/modules/preview');
var configDef = require(src + '/config');
var assert = require('assert');
var fs = require('fs');

// Defaults straight out of the Clay config definition.
function defaults() {
  var out = {};
  (function walk(items) {
    items.forEach(function(it) {
      if (it.items) { walk(it.items); }
      // Clay hands color items to the page as ints, not the "RRGGBB" strings
      // the config declares them with.
      if (it.messageKey) {
        out[it.messageKey] = it.type === 'color'
          ? parseInt(it.defaultValue, 16) : it.defaultValue;
      }
      if (it.id) { out['#' + it.id] = it.defaultValue; }
    });
  })(configDef);
  return out;
}

function makeClay(platform) {
  var vals = defaults();
  var items = {};
  var afterBuild = [];
  function item(key) {
    if (items[key]) { return items[key]; }
    if (!(key in vals)) { return null; }
    var handlers = {};
    items[key] = {
      hidden: false,
      get: function() { return vals[key]; },
      set: function(v) {
        vals[key] = v;
        (handlers.change || []).forEach(function(f) { f(); });
        return this;
      },
      on: function(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
      hide: function() { this.hidden = true; return this; },
      show: function() { this.hidden = false; return this; }
    };
    return items[key];
  }
  return {
    vals: vals,
    items: items,
    meta: { activeWatchInfo: { platform: platform } },
    EVENTS: { AFTER_BUILD: 'AFTER_BUILD' },
    getItemByMessageKey: item,
    getItemById: function(id) { return item('#' + id); },
    on: function(ev, fn) { if (ev === 'AFTER_BUILD') { afterBuild.push(fn); } },
    build: function() { afterBuild.forEach(function(f) { f(); }); }
  };
}

global.document = { querySelector: function() { return null; } };
global.localStorage = { getItem: function() { return null; }, setItem: function() {} };

var PLATFORMS = ['basalt', 'emery', 'chalk', 'gabbro'];
var page = '<body style="background:#222;color:#eee;font-family:sans-serif;display:flex;flex-wrap:wrap;gap:20px">';
var checks = 0;

PLATFORMS.forEach(function(platform) {
  [0, 1].forEach(function(layout) {
    var clay = makeClay(platform);
    clayCustomFn.call(clay);
    clay.build();
    clay.getItemByMessageKey('LAYOUT').set(layout);

    var round = platform === 'chalk' || platform === 'gabbro';
    var html = clay.vals['#PREVIEW'];
    assert.ok(html && html.indexOf('<div') === 0, platform + '/' + layout + ': no preview html');

    // Every block that the layout shows must appear as a positioned panel.
    var panels = (html.match(/position:absolute;left:/g) || []).length;
    assert.ok(panels >= (layout ? 6 : 5),
      platform + '/' + layout + ': only ' + panels + ' panels');

    // The size rule the active layout enforces.
    var pairs = GRID_PAIRS[layout && !round ? 'row' : 'col'];
    pairs.forEach(function(p) {
      assert.notStrictEqual(isBig(clay.vals[p[0]]), isBig(clay.vals[p[1]]),
        platform + '/' + layout + ': ' + p.join(' + ') + ' are the same size');
    });

    // Round faces preview as a circle; the sixth block only shows in layout 1.
    assert.strictEqual(html.indexOf('border-radius:50%') > -1, round,
      platform + ': wrong face shape');
    assert.strictEqual(clay.items.BLOCK_SIXTH.hidden, layout === 0,
      platform + '/' + layout + ': sixth block visibility');
    assert.strictEqual(clay.items.YEAR_TOP.hidden, layout === 1,
      platform + '/' + layout + ': banner position visibility');

    checks++;
    page += '<div><h4>' + platform + ' - layout ' + layout + '</h4>' + html + '</div>';
  });
});

// Presets: each must land on a valid arrangement for the layout it asks for.
var clay = makeClay('basalt');
clayCustomFn.call(clay);
clay.build();
var presets = /var PRESETS = (\[[\s\S]*?\n  \]);/.exec(clayCustomFn.toString());
assert.ok(presets, 'could not read PRESETS');
eval('var P = ' + presets[1] + ';');
P.forEach(function(p) {
  var pairs = GRID_PAIRS[p.layout === 1 ? 'row' : 'col'];
  pairs.forEach(function(pair) {
    var m = { BLOCK_TOP_LEFT: p.tl, BLOCK_TOP_RIGHT: p.tr,
              BLOCK_BOTTOM_LEFT: p.bl, BLOCK_BOTTOM_RIGHT: p.br };
    assert.notStrictEqual(isBig(m[pair[0]]), isBig(m[pair[1]]),
      'preset "' + p.name + '": ' + pair.join(' + ') + ' are the same size');
  });
  checks++;
});

if (process.env.DUMP) { fs.writeFileSync(process.env.DUMP, page + '</body>'); }
console.log(checks + ' passed, 0 failed');

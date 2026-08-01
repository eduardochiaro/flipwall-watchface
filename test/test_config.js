// Headless harness for the Clay config page. clayCustomFn only ever runs inside
// the config webview, so this stubs the bits of it that the function touches,
// runs it for every screen shape x layout, and checks that the preview renders
// and that the block-size rule the active layout enforces actually holds.
//
// Set DUMP=<file> to also write the rendered previews out as an HTML page.
var src = require('path').join(__dirname, '..', 'src', 'pkjs');
var { clayCustomFn } = require(src + '/modules/preview');
var configDef = require(src + '/config');
var assert = require('assert');
var fs = require('fs');

// Block sizes, read out of the config page's own option groups ("Big - …") —
// the same place the page itself gets them from, so this checks the page
// against config.js rather than against a second copy of the same list.
function isBig(v) {
  if (!isBig.set) {
    isBig.set = {};
    declaredItems().forEach(function(it) {
      if (it.key !== 'BLOCK_TOP_LEFT') { return; }
      it.options.forEach(function(group) {
        if (group.label.indexOf('Big') !== 0) { return; }
        group.value.forEach(function(o) { isBig.set[o.value] = true; });
      });
    });
  }
  return !!isBig.set[parseInt(v, 10)];
}

// The three slots of each column, top to bottom. The middle only joins the
// column in the rect 6-block layout.
var COLUMNS = [
  ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT'],
  ['BLOCK_TOP_RIGHT', 'BLOCK_MID_RIGHT', 'BLOCK_BOTTOM_RIGHT']
];

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

// Every item with a message key, in page order.
function declaredItems() {
  var out = [];
  (function walk(items) {
    items.forEach(function(it) {
      if (it.items) { walk(it.items); return; }
      if (it.messageKey) {
        out.push({ key: it.messageKey, label: it.label, options: it.options });
      }
    });
  })(configDef);
  return out;
}

// The <select> behind a block picker. The config page never shows it, but it
// reads the optgroups back to build the palette and trims them on round
// screens, so the stub has to carry the grouping and support removal.
function makeSelect(options) {
  var select = { children: [] };
  // A plain option list (the layout / language pickers) renders as one
  // unnamed group; the block pickers declare their groups.
  var groups = Array.isArray(options[0] && options[0].value)
    ? options : [{ label: null, value: options }];
  groups.forEach(function(g) {
    var group = {
      options: [],
      parentNode: select,
      getAttribute: function(name) { return name === 'label' ? g.label : null; },
      removeChild: function(node) { this.options.splice(this.options.indexOf(node), 1); },
      querySelector: function() { return this.options[0] || null; },
      querySelectorAll: function() { return this.options.slice(); }
    };
    group.options = g.value.map(function(o) {
      return { value: String(o.value), textContent: o.label, parentNode: group };
    });
    select.children.push(group);
  });
  select.removeChild = function(node) {
    this.children.splice(this.children.indexOf(node), 1);
  };
  select.querySelectorAll = function(sel) {
    if (sel === 'optgroup') { return this.children.slice(); }
    return this.children.reduce(function(all, g) {
      return all.concat(g.options);
    }, []);
  };
  return select;
}

function makeClay(platform) {
  var vals = defaults();
  var items = {};
  var afterBuild = [];

  declaredItems().forEach(function(decl) {
    var key = decl.key;
    var handlers = {};
    var span = { textContent: decl.label };
    var select = decl.options ? makeSelect(decl.options) : null;
    var node = {
      querySelector: function(sel) {
        if (sel === '.label') { return span; }
        return sel === 'select' ? select : null;
      }
    };

    items[key] = {
      hidden: false,
      config: { label: decl.label },
      $element: [node],
      labelText: function() { return span.textContent; },
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
  });

  function item(key) {
    if (items[key]) { return items[key]; }
    if (!(key in vals)) { return null; }
    items[key] = { get: function() { return vals[key]; },
                   set: function(v) { vals[key] = v; return this; },
                   on: function() { return this; },
                   hide: function() { this.hidden = true; return this; },
                   show: function() { this.hidden = false; return this; } };
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

// Stand-in for the elements the config page injects and then wires up (the
// preset buttons, the share-code box). Each selector keeps one node, so a test
// can read a value back or fire a click the same way a user would.
function makeDocument() {
  var nodes = {};
  var handlers = {};
  return {
    nodes: nodes,
    // The face editor delegates every tap here, since the preview is redrawn
    // from scratch on each change.
    addEventListener: function(ev, fn) {
      (handlers[ev] = handlers[ev] || []).push(fn);
    },
    tap: function(attr, value) {
      var target = {
        getAttribute: function(name) { return name === attr ? value : null; }
      };
      (handlers.click || []).forEach(function(fn) {
        fn({ target: target, preventDefault: function() {} });
      });
    },
    // The injected variation <select>, picked by a wearer.
    choose: function(value) {
      var target = {
        value: String(value),
        getAttribute: function(name) { return name === 'data-variation' ? '' : null; }
      };
      (handlers.change || []).forEach(function(fn) { fn({ target: target }); });
    },
    querySelector: function(sel) {
      if (!nodes[sel]) {
        nodes[sel] = {
          value: '', textContent: '', style: {}, handlers: {},
          select: function() {},
          addEventListener: function(ev, fn) {
            (this.handlers[ev] = this.handlers[ev] || []).push(fn);
          },
          click: function() {
            (this.handlers.click || []).forEach(function(fn) {
              fn({ preventDefault: function() {} });
            });
          }
        };
      }
      return nodes[sel];
    }
  };
}

global.document = makeDocument();
global.localStorage = { getItem: function() { return null; }, setItem: function() {} };

var PLATFORMS = ['basalt', 'emery', 'chalk', 'gabbro'];
var page = '<body style="background:#222;color:#eee;font-family:sans-serif;display:flex;flex-wrap:wrap;gap:20px">';
var checks = 0;

PLATFORMS.forEach(function(platform) {
  [0, 1].forEach(function(layout) {
    global.document = makeDocument();   // fresh injected elements per run
    var clay = makeClay(platform);
    clayCustomFn.call(clay);
    clay.build();
    clay.getItemByMessageKey('LAYOUT').set(layout);

    var html = clay.vals['#PREVIEW'];
    assert.ok(html && html.indexOf('<div') === 0, platform + '/' + layout + ': no preview html');

    // Every block that the layout shows must appear as a positioned panel.
    var panels = (html.match(/position:absolute;left:/g) || []).length;
    assert.ok(panels >= (layout ? 6 : 5),
      platform + '/' + layout + ': only ' + panels + ' panels');

    // Every column holds exactly one big block. The middle counts only in the
    // rect 6-block layout — elsewhere it is hidden or drawn as a strip.
    var round = platform === 'chalk' || platform === 'gabbro';
    COLUMNS.forEach(function(col) {
      var keys = (layout === 1 && !round) ? col : [col[0], col[2]];
      var bigs = keys.filter(function(k) { return isBig(clay.vals[k]); });
      assert.strictEqual(bigs.length, 1,
        platform + '/' + layout + ': ' + keys.join(' + ') + ' hold ' +
        bigs.length + ' big blocks');
    });

    // Round faces preview as a circle.
    assert.strictEqual(html.indexOf('border-radius:50%') > -1, round,
      platform + ': wrong face shape');

    // Every block the layout draws is tappable, and only those: the banner
    // belongs to the classic layout, the column middles to the 6-block one.
    var slots = (html.match(/data-slot="(\w+)"/g) || []).map(function(m) {
      return m.slice(11, -1);
    }).sort();
    assert.deepStrictEqual(slots, (layout
      ? ['BLOCK_BOTTOM_LEFT', 'BLOCK_BOTTOM_RIGHT', 'BLOCK_MID_LEFT',
         'BLOCK_MID_RIGHT', 'BLOCK_TOP_LEFT', 'BLOCK_TOP_RIGHT']
      : ['BLOCK_BAND', 'BLOCK_BOTTOM_LEFT', 'BLOCK_BOTTOM_RIGHT',
         'BLOCK_TOP_LEFT', 'BLOCK_TOP_RIGHT']).sort(),
      platform + '/' + layout + ': wrong tap targets on the face');

    // The palette replaces the block selects, so they stay hidden, and no
    // color picker shows until a block is selected. "Banner at top" is the one
    // block setting still on the page, and only under the classic layout.
    Object.keys(clay.items).forEach(function(key) {
      if (/^BLOCK_|^PANEL_[TBM]|^PANEL_BAND/.test(key)) {
        assert.ok(clay.items[key].hidden, platform + '/' + layout + ': ' + key +
          ' should be hidden until its block is tapped');
      }
    });
    assert.strictEqual(clay.items.YEAR_TOP.hidden, layout === 1,
      platform + '/' + layout + ': YEAR_TOP visibility');

    // The palette names the block it is editing, so each column slot has to be
    // titled the way the watch draws it. On a round 6-block face the middles
    // become strips: the left one above the grid, the right one below.
    var strip = layout === 1 && round;
    var labels = strip
      ? { BLOCK_MID_LEFT: 'Top strip', BLOCK_TOP_LEFT: 'Middle',
          BLOCK_BOTTOM_LEFT: 'Bottom', BLOCK_TOP_RIGHT: 'Top',
          BLOCK_BOTTOM_RIGHT: 'Middle', BLOCK_MID_RIGHT: 'Bottom strip' }
      : { BLOCK_TOP_LEFT: 'Top', BLOCK_MID_LEFT: 'Middle',
          BLOCK_BOTTOM_LEFT: 'Bottom', BLOCK_TOP_RIGHT: 'Top',
          BLOCK_MID_RIGHT: 'Middle', BLOCK_BOTTOM_RIGHT: 'Bottom' };
    Object.keys(labels).forEach(function(key) {
      assert.strictEqual(clay.items[key].labelText(), labels[key],
        platform + '/' + layout + ': ' + key + ' should read "' +
        labels[key] + '"');
    });
    if (strip) {   // going back to classic must undo the labels
      clay.getItemByMessageKey('LAYOUT').set(0);
      assert.strictEqual(clay.items.BLOCK_MID_LEFT.labelText(), 'Middle',
        platform + ': strip label stuck after leaving the 6-block layout');
      clay.getItemByMessageKey('LAYOUT').set(1);
    }

    checks++;
    page += '<div><h4>' + platform + ' - layout ' + layout + '</h4>' + html + '</div>';
  });
});

// --- Big block in the middle ----------------------------------------------
// A rect 6-block column takes its big block in any slot: picking one for the
// middle must drop the other two to small and hand the square to the middle.
(function bigMiddle() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('LAYOUT').set(1);
  clay.getItemByMessageKey('BLOCK_MID_LEFT').set(2);   // analog clock (big)

  ['BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT'].forEach(function(key) {
    assert.ok(!isBig(clay.vals[key]),
      key + ' stayed big next to a big middle block');
  });

  // Panel rects out of the preview (a height floor drops the hairline seams,
  // which are positioned the same way), left column only, top to bottom. Each
  // block draws twice — once as the panel, once as the tap target on top of it
  // — so identical rects collapse to one.
  var rects = [], seen = {}, m;
  var re = /left:([\d.]+)px;top:([\d.]+)px;width:([\d.]+)px;height:([\d.]+)px/g;
  while ((m = re.exec(clay.vals['#PREVIEW']))) {
    if (+m[4] >= 5 && !seen[m[0]]) {
      seen[m[0]] = true;
      rects.push({ x: +m[1], y: +m[2], h: +m[4] });
    }
  }
  var left = Math.min.apply(null, rects.map(function(r) { return r.x; }));
  var col = rects.filter(function(r) { return r.x === left; })
    .sort(function(a, b) { return a.y - b.y; });
  assert.strictEqual(col.length, 3, 'left column drew ' + col.length + ' blocks');
  assert.ok(col[1].h > col[0].h && col[1].h > col[2].h,
    'the square went to a slot other than the middle');

  // Leaving the layout drops the middle out of the column, so the grid pair has
  // to pick the big block back up — and coming back must not leave two.
  clay.getItemByMessageKey('LAYOUT').set(0);
  assert.notStrictEqual(isBig(clay.vals.BLOCK_TOP_LEFT),
    isBig(clay.vals.BLOCK_BOTTOM_LEFT),
    'classic layout left the column without one big + one small');
  clay.getItemByMessageKey('LAYOUT').set(1);
  assert.strictEqual(COLUMNS[0].filter(function(k) {
    return isBig(clay.vals[k]);
  }).length, 1, 'going back to 6 blocks left the column with two big blocks');
  checks++;
})();

// --- No-zero digital clocks -------------------------------------------------
// 47/48 drop the hour's leading zero but keep its width, so the preview has to
// hide the digit rather than delete it (a plain "9:09" would sit too far left).
(function noZeroClock() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('LAYOUT').set(1);
  clay.getItemByMessageKey('BLOCK_TOP_LEFT').set(48);    // big, no leading zero
  clay.getItemByMessageKey('BLOCK_MID_LEFT').set(47);    // small, no leading zero

  var html = clay.vals['#PREVIEW'];
  var hidden = (html.match(/visibility:hidden">0<\/span>/g) || []).length;
  assert.strictEqual(hidden, 2, 'expected both clocks to hide a leading zero');
  assert.ok(html.indexOf('>9:09<') > -1, 'small clock kept its leading zero');
  checks++;
})();

// --- Steps, full count ------------------------------------------------------
// 49 is the same reading as 4 with no K shorthand, so it draws every digit and
// rides along as a variation of the compact block rather than its own chip.
(function fullSteps() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('BLOCK_TOP_LEFT').set(49);

  assert.ok(clay.vals['#PREVIEW'].indexOf('>8234<') > -1,
    'the full step count is not drawn on the face');
  assert.ok(!isBig(49), 'the full step count should be a small block');

  document.tap('data-slot', 'BLOCK_TOP_LEFT');
  assert.ok(clay.vals['#VARIATION'].indexOf('Step count') > -1,
    'no step-count variation select');
  document.choose(4);
  assert.strictEqual(clay.vals.BLOCK_TOP_LEFT, 4,
    'switching back to the compact step count did not apply');
  checks++;
})();

// --- Tap to place ---------------------------------------------------------
// Blocks are placed on the face: tap a panel, then tap what it should show.
// The palette is scraped out of the hidden select, so it has to offer exactly
// what that slot accepts, and picking still has to go through the column rule.
(function tapToPlace() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();

  document.tap('data-slot', 'BLOCK_TOP_RIGHT');
  var palette = clay.vals['#PALETTE'];
  assert.ok(palette.indexOf('Right Top') > -1, 'palette does not name the block');
  assert.ok(clay.vals['#PREVIEW'].indexOf('inset 0 0 0') > -1,
    'the selected block is not ringed on the face');
  assert.ok(!clay.items.PANEL_TR_COLOR.hidden,
    'the selected block\'s color picker stayed hidden');
  assert.ok(clay.items.PANEL_TL_COLOR.hidden,
    'another block\'s color picker came out with it');

  // Big and small are both listed, each chip drawn as the block itself.
  assert.ok(palette.indexOf('Big - Weather') > -1 &&
    palette.indexOf('Small - Weather') > -1, 'the palette lost a size group');
  assert.ok(palette.indexOf('(big)') < 0 && palette.indexOf('(small)') < 0,
    'a chip still spells out the size its group heading already gives');
  var chips = (palette.match(/data-block="\d+"/g) || []).length;
  var swatches = (palette.match(/position:relative;margin:0 auto;width:/g) || []).length;
  assert.strictEqual(chips, swatches, 'every chip should carry a rendered block');
  assert.ok(palette.indexOf('<svg') > -1, 'no block previews in the palette');

  // Only the blocks that are a variation of another are folded away.
  var offered = (palette.match(/data-block="(\d+)"/g) || []).map(function(m) {
    return parseInt(m.slice(12), 10);
  });
  [16, 17, 11, 26, 22, 33, 34, 39, 40].forEach(function(v) {
    assert.ok(offered.indexOf(v) > -1, 'block ' + v + ' left the palette');
  });
  [47, 48, 49, 25, 29, 23, 41, 42, 43, 44].forEach(function(v) {
    assert.ok(offered.indexOf(v) < 0, 'block ' + v + ' should be a variation');
  });

  // Placing a big block has to drop the other block in that column to small.
  document.tap('data-block', '12');            // temperature (big)
  assert.strictEqual(clay.vals.BLOCK_TOP_RIGHT, 12, 'the tap did not place');
  assert.ok(!isBig(clay.vals.BLOCK_BOTTOM_RIGHT),
    'the column kept two big blocks');
  assert.ok(clay.vals['#PALETTE'].indexOf('#0A84FF') > -1,
    'the placed block is not marked in the palette');
  assert.strictEqual(clay.vals['#VARIATION'], '',
    'a block with nothing to vary got a select anyway');

  // A block that does have a variation gets one, and picking from it swaps to
  // the other member of the group without leaving the chip.
  document.tap('data-block', '17');            // digital clock (big)
  assert.ok(clay.vals['#VARIATION'].indexOf('Leading zero') > -1,
    'no variation select for the digital clock');
  assert.ok(/<option value="17"[^>]*selected/.test(clay.vals['#VARIATION']),
    'the variation select does not show the block that is placed');
  document.choose(48);                         // hide the leading zero
  assert.strictEqual(clay.vals.BLOCK_TOP_RIGHT, 48, 'the variation did not apply');
  assert.ok(clay.vals['#PALETTE'].indexOf('data-block="48"') > -1,
    'the chip should stand for whichever variation is placed');
  assert.ok(clay.vals['#VARIATION'].indexOf('Leading zero') > -1,
    'the variation select closed after being used');

  // Tapping the same block again closes the editor.
  document.tap('data-slot', 'BLOCK_TOP_RIGHT');
  assert.ok(clay.items.PANEL_TR_COLOR.hidden, 'the color picker stayed open');
  assert.strictEqual(clay.vals['#VARIATION'], '', 'the variation select stayed open');
  assert.ok(clay.vals['#PALETTE'].indexOf('data-block') < 0,
    'the palette stayed open');
  checks++;
})();

// The chips are drawn with the slot's panel color on the face color, so a
// color picked while the palette is open has to land on them straight away.
(function liveColors() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  document.tap('data-slot', 'BLOCK_TOP_LEFT');

  clay.getItemByMessageKey('PANEL_TL_COLOR').set(0x00AAFF);
  assert.ok(clay.vals['#PALETTE'].indexOf('#00AAFF') > -1,
    'the panel color did not reach the open chips');

  clay.getItemByMessageKey('FACE_COLOR').set(0x123456);
  assert.ok(clay.vals['#PALETTE'].indexOf('#123456') > -1,
    'the face color did not reach the open chips');
  assert.ok(clay.vals['#PREVIEW'].indexOf('#123456') > -1,
    'the face color did not reach the preview');

  // The master color broadcasts to every block, so it has to land too.
  clay.getItemByMessageKey('PANEL_COLOR').set(0x445566);
  assert.ok(clay.vals['#PALETTE'].indexOf('#445566') > -1,
    'the master panel color did not reach the open chips');
  checks++;
})();

// A round 6-block face draws the two column middles as strips, which only take
// the banner blocks — so their palettes must offer those and nothing else.
(function stripPalette() {
  global.document = makeDocument();
  var clay = makeClay('chalk');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('LAYOUT').set(1);

  document.tap('data-slot', 'BLOCK_MID_LEFT');
  var offered = (clay.vals['#PALETTE'].match(/data-block="(\d+)"/g) || [])
    .map(function(m) { return parseInt(m.slice(12), 10); });
  assert.ok(offered.length, 'the strip palette is empty');
  assert.ok(offered.indexOf(16) > -1, 'the strip cannot take a digital clock');
  assert.ok(offered.every(function(v) { return !isBig(v); }),
    'the strip palette offers a big block');
  assert.ok(clay.vals['#PALETTE'].indexOf('Left Top strip') > -1,
    'the strip is not named the way the watch draws it');
  checks++;
})();

// --- Share code -----------------------------------------------------------
// A code has to carry the whole face there and back: build one from a face that
// differs from the defaults in every kind of field, wipe the page, and check
// that importing it puts every one of them back.
(function shareCodeRoundTrip() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();

  var face = {
    LAYOUT: 1, LANG: 4, UNITS: 1,                        // selects
    YEAR_TOP: false, SHOW_SECONDS: true,                 // toggles, both ways
    FLIP_ANIM: false, DRAW_SEAM: false,
    BLOCK_TOP_LEFT: 8, BLOCK_BOTTOM_LEFT: 33,            // big + small column
    BLOCK_TOP_RIGHT: 12, BLOCK_BOTTOM_RIGHT: 13,
    BLOCK_MID_LEFT: 35, BLOCK_MID_RIGHT: 45, BLOCK_BAND: 10,
    FACE_COLOR: 0x005588, PANEL_COLOR: 0xFFFFFF,         // full-width color
    WEEKEND_COLOR: 0xFFAA00, PANEL_TL_COLOR: 0xE17055,
    PANEL_ML_COLOR: 0x000000, PANEL_BL_COLOR: 0x00B894,  // and a zero one
    PANEL_TR_COLOR: 0x0984E3, PANEL_MR_COLOR: 0xD63031,
    PANEL_BR_COLOR: 0x6C5CE7, PANEL_BAND_COLOR: 0x222222
  };
  Object.keys(face).forEach(function(k) {
    clay.getItemByMessageKey(k).set(face[k]);
  });

  var code = document.querySelector('[data-transfer="code"]').value;
  // One unbroken token: base32 digits only, no punctuation, no separators, and
  // none of the letters that get misread (I, L, O, U).
  assert.ok(/^[0-9A-HJKMNP-TV-Z]+$/.test(code),
    'share code has odd characters: ' + code);
  checks++;
  page += '<div style="width:320px"><h4>share code</h4>' +
    clay.vals['#TRANSFER'].replace('></textarea>', '>' + code + '</textarea>') +
    '</div>';

  // Wipe the page, so a rejected import can't pass by leaving the values a
  // previous one already put there. Every field moves off its face value.
  function wipe() {
    Object.keys(face).forEach(function(k) {
      var blank = typeof face[k] === 'boolean' ? !face[k]
                : (face[k] === 0 ? 1 : 0);
      clay.getItemByMessageKey(k).set(blank);
      assert.notStrictEqual(clay.vals[k], face[k], 'wipe did not clear ' + k);
    });
  }
  wipe();
  document.querySelector('[data-transfer="in"]').value = code;
  document.querySelector('[data-transfer="import"]').click();

  Object.keys(face).forEach(function(k) {
    assert.strictEqual(clay.vals[k], face[k], 'share code lost ' + k);
  });
  assert.strictEqual(document.querySelector('[data-transfer="in"]').value, '',
    'import left the pasted code in the box');
  checks++;

  // Junk must be refused, and must not touch the face.
  // Whitespace and dashes someone added for readability must still import, and
  // the letters base32 folds onto digits must survive a retype. Wipe first, or
  // a rejected code would leave the values from the import above and pass.
  var pretty = code.replace(/(.{8})/g, '$1 ').trim().toLowerCase()
    .replace(/0/g, 'O').replace(/1/g, 'l');
  wipe();
  document.querySelector('[data-transfer="in"]').value = pretty;
  document.querySelector('[data-transfer="import"]').click();
  Object.keys(face).forEach(function(k) {
    assert.strictEqual(clay.vals[k], face[k],
      'a spaced/retyped code lost ' + k);
  });
  checks++;

  var before = JSON.stringify(clay.vals);
  // One digit nudged: right length, right charset, checksum now off.
  var at = 10, next = code.charAt(at) === '0' ? '1' : '0';
  var tampered = code.slice(0, at) + next + code.slice(at + 1);
  ['', 'hello there', code + '0', code.slice(0, -1), tampered
  ].forEach(function(bad) {
    document.querySelector('[data-transfer="in"]').value = bad;
    document.querySelector('[data-transfer="import"]').click();
    var msg = document.querySelector('[data-transfer="msg"]');
    assert.ok(msg.textContent && msg.style.color === '#C62828',
      'bad code "' + bad + '" was not reported as an error');
    assert.strictEqual(JSON.stringify(clay.vals), before,
      'bad code "' + bad + '" changed the face');
    checks++;
  });
})();

// Presets: each is a share code, so tapping one has to land the face it packs —
// unchanged and valid — and leave the wearer's own settings alone.
global.document = makeDocument();
var clay = makeClay('basalt');
clayCustomFn.call(clay);
clay.build();
var presets = /var PRESETS = (\[[\s\S]*?\n  \]);/.exec(clayCustomFn.toString());
assert.ok(presets, 'could not read PRESETS');
eval('var P = ' + presets[1] + ';');
var mine = { LANG: clay.vals.LANG, UNITS: clay.vals.UNITS,
             SHOW_SECONDS: clay.vals.SHOW_SECONDS, FLIP_ANIM: clay.vals.FLIP_ANIM };
P.forEach(function(p, i) {
  document.querySelector('[data-preset="' + i + '"]').click();

  // The page exports what it just took in: a preset code that survives its own
  // round trip is a code the share box could have produced.
  assert.strictEqual(document.querySelector('[data-transfer="code"]').value,
    p.code, 'preset "' + p.name + '": the face it applied is not its code');

  COLUMNS.forEach(function(col) {
    // A 6-block preset has to be valid as a column of three (that is what rect
    // screens draw); a classic one only pairs top with bottom.
    var keys = clay.vals.LAYOUT === 1 ? col : [col[0], col[2]];
    var bigs = keys.filter(function(k) { return isBig(clay.vals[k]); });
    assert.strictEqual(bigs.length, 1,
      'preset "' + p.name + '": ' + keys.join(' + ') + ' hold ' + bigs.length +
      ' big blocks');
  });

  Object.keys(mine).forEach(function(key) {
    assert.strictEqual(clay.vals[key], mine[key],
      'preset "' + p.name + '" overwrote ' + key);
  });
  checks++;
});

if (process.env.DUMP) { fs.writeFileSync(process.env.DUMP, page + '</body>'); }
console.log(checks + ' passed, 0 failed');

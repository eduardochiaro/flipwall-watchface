// Headless harness for the Clay config page. clayCustomFn only ever runs inside
// the config webview, so this stubs the bits of it that the function touches,
// runs it for every screen shape x layout, and checks that the preview renders
// and that the block-size rule the active layout enforces actually holds.
//
// Set DUMP=<file> to also write the rendered previews out as an HTML page.
var src = require('path').join(__dirname, '..', 'src', 'pkjs');
var { clayCustomFn, isBig, COLUMNS } = require(src + '/modules/preview');
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

// Every item with a message key, in page order, tagged with the section it
// renders inside — Clay makes each section one <div> of sibling components, so
// the config page's reordering needs both.
function declaredItems() {
  var out = [];
  (function walk(items, section) {
    items.forEach(function(it) {
      if (it.items) { walk(it.items, it); return; }
      if (it.messageKey) {
        out.push({ key: it.messageKey, label: it.label, section: section });
      }
    });
  })(configDef, null);
  return out;
}

// The smallest DOM the config page needs: a section node whose appendChild
// moves an already-owned child to the end, exactly like the real one.
function makeSection() {
  return {
    children: [],
    appendChild: function(node) {
      var at = this.children.indexOf(node);
      if (at > -1) { this.children.splice(at, 1); }
      this.children.push(node);
      node.parentNode = this;
    }
  };
}

function makeClay(platform) {
  var vals = defaults();
  var items = {};
  var afterBuild = [];
  var sections = new Map();

  // Build every item up front, in page order, so the section children start out
  // in the order the config declares them.
  declaredItems().forEach(function(decl) {
    var key = decl.key;
    var handlers = {};
    var span = { textContent: decl.label };
    var node = {
      querySelector: function(sel) { return sel === '.label' ? span : null; }
    };
    if (!sections.has(decl.section)) { sections.set(decl.section, makeSection()); }
    sections.get(decl.section).appendChild(node);

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

  // The keys rendered in one section, in their current on-page order.
  function sectionOrder(key) {
    var node = items[key].$element[0];
    return node.parentNode.children.map(function(child) {
      return Object.keys(items).filter(function(k) {
        return items[k].$element && items[k].$element[0] === child;
      })[0];
    });
  }

  return {
    vals: vals,
    items: items,
    sectionOrder: sectionOrder,
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
  return {
    nodes: nodes,
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

    // Round faces preview as a circle. The banner section belongs to the
    // classic layout, the column middles to the 6-block one.
    assert.strictEqual(html.indexOf('border-radius:50%') > -1, round,
      platform + ': wrong face shape');
    ['BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT', 'PANEL_ML_COLOR', 'PANEL_MR_COLOR']
      .forEach(function(key) {
        assert.strictEqual(clay.items[key].hidden, layout === 0,
          platform + '/' + layout + ': ' + key + ' visibility');
      });
    ['BLOCK_BAND', 'PANEL_BAND_COLOR', 'YEAR_TOP'].forEach(function(key) {
      assert.strictEqual(clay.items[key].hidden, layout === 1,
        platform + '/' + layout + ': ' + key + ' visibility');
    });

    // Each column's settings must be listed, and named, in the order the watch
    // draws them. On a round 6-block face the middles become strips, so the
    // left column starts with one and the right column ends with one.
    var strip = layout === 1 && round;
    var expect = strip
      ? { left: [['BLOCK_MID_LEFT', 'Top strip'], ['BLOCK_TOP_LEFT', 'Middle'],
                 ['BLOCK_BOTTOM_LEFT', 'Bottom']],
          right: [['BLOCK_TOP_RIGHT', 'Top'], ['BLOCK_BOTTOM_RIGHT', 'Middle'],
                  ['BLOCK_MID_RIGHT', 'Bottom strip']] }
      : { left: [['BLOCK_TOP_LEFT', 'Top'], ['BLOCK_MID_LEFT', 'Middle'],
                 ['BLOCK_BOTTOM_LEFT', 'Bottom']],
          right: [['BLOCK_TOP_RIGHT', 'Top'], ['BLOCK_MID_RIGHT', 'Middle'],
                  ['BLOCK_BOTTOM_RIGHT', 'Bottom']] };
    ['left', 'right'].forEach(function(side) {
      var want = expect[side];
      var got = clay.sectionOrder(want[0][0]).filter(function(k) {
        return k.indexOf('BLOCK_') === 0;
      });
      assert.deepStrictEqual(got, want.map(function(w) { return w[0]; }),
        platform + '/' + layout + ': ' + side + ' column out of draw order');
      want.forEach(function(w) {
        assert.strictEqual(clay.items[w[0]].labelText(), w[1],
          platform + '/' + layout + ': ' + w[0] + ' should read "' + w[1] + '"');
      });
    });
    if (strip) {   // going back to classic must undo the order and the labels
      clay.getItemByMessageKey('LAYOUT').set(0);
      assert.deepStrictEqual(
        clay.sectionOrder('BLOCK_TOP_LEFT').filter(function(k) {
          return k.indexOf('BLOCK_') === 0;
        }),
        ['BLOCK_TOP_LEFT', 'BLOCK_MID_LEFT', 'BLOCK_BOTTOM_LEFT'],
        platform + ': column stayed reordered after leaving the 6-block layout');
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
  // which are positioned the same way), left column only, top to bottom.
  var rects = [], m;
  var re = /left:([\d.]+)px;top:([\d.]+)px;width:([\d.]+)px;height:([\d.]+)px/g;
  while ((m = re.exec(clay.vals['#PREVIEW']))) {
    if (+m[4] >= 5) { rects.push({ x: +m[1], y: +m[2], h: +m[4] }); }
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

// Presets: each must land on a valid arrangement for the layout it asks for.
global.document = makeDocument();
var clay = makeClay('basalt');
clayCustomFn.call(clay);
clay.build();
var presets = /var PRESETS = (\[[\s\S]*?\n  \]);/.exec(clayCustomFn.toString());
assert.ok(presets, 'could not read PRESETS');
eval('var P = ' + presets[1] + ';');
P.forEach(function(p) {
  COLUMNS.forEach(function(col) {
    var m = { BLOCK_TOP_LEFT: p.tl, BLOCK_TOP_RIGHT: p.tr,
              BLOCK_MID_LEFT: p.ml, BLOCK_MID_RIGHT: p.mr,
              BLOCK_BOTTOM_LEFT: p.bl, BLOCK_BOTTOM_RIGHT: p.br };
    // A 6-block preset has to be valid as a column of three too (that is what
    // rect screens draw); a classic one only pairs top with bottom.
    var keys = p.layout === 1 ? col : [col[0], col[2]];
    var bigs = keys.filter(function(k) { return isBig(m[k]); });
    assert.strictEqual(bigs.length, 1,
      'preset "' + p.name + '": ' + keys.join(' + ') + ' hold ' + bigs.length +
      ' big blocks');
  });
  // A 6-block preset fills the column middles; a classic one fills the banner.
  assert.ok(p.layout === 1 ? (p.ml !== undefined && p.mr !== undefined)
                           : p.band !== undefined,
    'preset "' + p.name + '": missing blocks for its layout');
  checks++;
});

if (process.env.DUMP) { fs.writeFileSync(process.env.DUMP, page + '</body>'); }
console.log(checks + ' passed, 0 failed');

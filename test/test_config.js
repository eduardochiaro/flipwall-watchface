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
  var declared = {};
  declaredItems().forEach(function(decl) { declared[decl.key] = decl; });

  // A stand-in for one ClayItem. The page reaches past get/set for the items it
  // rewrites in place (the variation select's options and label), so the stub
  // carries the same handles the real item does: $manipulatorTarget for the
  // form element, $element.select() for the label / value spans.
  function makeItem(key, decl) {
    var handlers = {};
    var props = {};
    var span = { textContent: decl ? decl.label : '' };
    var select = decl && decl.options ? makeSelect(decl.options) : null;
    var node = {
      select: function() {},        // the copy button focuses the code box
      querySelector: function(sel) {
        if (sel === '.label') { return span; }
        return sel === 'select' ? select : null;
      }
    };
    // .label is the same span the page's own querySelector('.label') finds, so
    // a label written through either handle reads back through both.
    var spans = {
      '.label': {
        set: function(name, v) { span.textContent = v; return this; },
        get: function() { return span.textContent; }
      },
      '.value': {
        set: function(name, v) { props.value_text = v; return this; },
        get: function() { return props.value_text; }
      }
    };
    var $element = [node];
    $element.select = function(sel) { return spans[sel]; };

    var target = {
      0: node,
      // The DOM doesn't fire change when a value is assigned, so nor does this.
      set: function(name, v) {
        if (name === 'value') { vals[key] = v; } else { props[name] = v; }
        return this;
      },
      get: function(name) { return name === 'value' ? vals[key] : props[name]; }
    };

    return {
      hidden: false,
      config: { label: decl ? decl.label : '' },
      $element: $element,
      $manipulatorTarget: target,
      labelText: function() { return span.textContent; },
      get: function() { return vals[key]; },
      set: function(v) {
        vals[key] = v;
        return this.trigger('change');
      },
      on: function(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
      trigger: function(ev) {
        (handlers[ev] || []).forEach(function(f) { f(); });
        return this;
      },
      hide: function() { this.hidden = true; return this; },
      show: function() { this.hidden = false; return this; }
    };
  }

  Object.keys(declared).forEach(function(key) {
    items[key] = makeItem(key, declared[key]);
  });

  function item(key) {
    if (items[key]) { return items[key]; }
    if (!(key in vals)) { return null; }
    items[key] = makeItem(key, null);
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

// The variation picker is a Clay select the page refills, so read it the way
// the page writes it: the group name in the label, the placed id as its value.
function variation(clay) {
  var it = clay.getItemById('VARIATION');
  return {
    hidden: !!it.hidden,
    label: it.$element.select('.label').get() || '',
    value: it.get(),
    options: it.$manipulatorTarget.get('innerHTML') || ''
  };
}

// A wearer picking from it: the browser writes the value, then fires change.
function chooseVariation(clay, value) {
  var it = clay.getItemById('VARIATION');
  it.$manipulatorTarget.set('value', String(value));
  it.trigger('change');
}

// The share box, likewise: plain Clay inputs and buttons.
function shareBox(clay) {
  return {
    code: function() { return clay.getItemById('CODE_OUT').get(); },
    paste: function(v) { clay.getItemById('CODE_IN').set(v); },
    pasted: function() { return clay.getItemById('CODE_IN').get(); },
    run: function() { clay.getItemById('CODE_IMPORT').trigger('click'); },
    message: function() { return clay.getItemById('TRANSFER_MSG').get() || ''; }
  };
}

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
      if (/^BLOCK_|^PANEL_[TBM]|^PANEL_BAND|^TZ_ZONE|^TEXT\[/.test(key)) {
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
  assert.strictEqual(variation(clay).label, 'Step count',
    'no step-count variation select');
  chooseVariation(clay, 4);
  assert.strictEqual(clay.vals.BLOCK_TOP_LEFT, 4,
    'switching back to the compact step count did not apply');
  checks++;
})();

// --- Second time zone -------------------------------------------------------
// 50/51 draw the clock in that block's own zone plus its label (offset or
// abbreviation) in the accent colour; 52/53 are the same pair as a big block,
// with the label as the caption. Each slot picks its own zone, so a face can
// carry several at once.
(function secondTimeZone() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('LAYOUT').set(1);
  clay.getItemByMessageKey('BLOCK_MID_LEFT').set(51);   // small, abbreviation
  var MID_LEFT_ZONE = 'TZ_ZONE[5]';                     // BlockPos order

  // The clock, read back out of the face. The label is drawn in its own span,
  // which is what makes it the accent colour on the watch.
  function tzClock(zone, label) {
    clay.getItemByMessageKey(MID_LEFT_ZONE).set(zone);
    var m = new RegExp('(\\d\\d:\\d\\d) <span style="color:[^"]+;">' +
      label + '<').exec(clay.vals['#PREVIEW']);
    assert.ok(m, 'no second-time-zone clock labelled ' + label +
      ' for ' + zone);
    return m[1];
  }

  // Machine independent: whatever this box's own zone is, Tokyo is nine hours
  // ahead of UTC, and both are drawn from the same sample moment.
  function minutes(hhmm) {
    var p = hhmm.split(':');
    return +p[0] * 60 + +p[1];
  }
  var utc = tzClock('UTC', 'UTC');
  var tokyo = tzClock('Asia/Tokyo', 'JST');
  assert.strictEqual(((minutes(tokyo) - minutes(utc)) % 1440 + 1440) % 1440,
    9 * 60, 'Tokyo did not preview nine hours ahead of UTC (' + utc + ' / ' +
    tokyo + ')');

  // The other half of the variation labels the same clock with its offset.
  clay.getItemByMessageKey('BLOCK_MID_LEFT').set(50);
  assert.strictEqual(tzClock('Asia/Tokyo', '\\+9'), tokyo,
    'the offset variant moved the clock');
  assert.strictEqual(tzClock('Asia/Kolkata', '\\+5:30').slice(-2), '39',
    'a half-hour zone did not land on the half hour');

  // Big: the clock over its label, captioned like the other two-line blocks.
  // On its own slot, with its own zone — two zones on one face.
  clay.getItemByMessageKey(MID_LEFT_ZONE).set('Asia/Tokyo');
  clay.getItemByMessageKey('BLOCK_MID_LEFT').set(51);
  clay.getItemByMessageKey('BLOCK_TOP_LEFT').set(53);
  clay.getItemByMessageKey('TZ_ZONE[0]').set('America/New_York');
  var html = clay.vals['#PREVIEW'];
  assert.ok(html.indexOf('>JST<') > -1, 'the small block lost its own zone');
  assert.ok(/>E[SD]T</.test(html), 'the big block lost its zone caption');
  assert.ok(isBig(53) && isBig(52), 'the big time-zone blocks read as small');
  assert.ok(!isBig(50) && !isBig(51), 'the small time-zone blocks read as big');

  // The zone picker belongs to the block: it comes out with a time-zone block
  // and stays away for anything else.
  document.tap('data-slot', 'BLOCK_TOP_LEFT');
  assert.ok(!clay.items['TZ_ZONE[0]'].hidden,
    'the zone picker stayed hidden for a time-zone block');
  assert.ok(clay.items[MID_LEFT_ZONE].hidden,
    'another block\'s zone picker came out with it');

  // One chip per pair, the label picked from the variation select.
  assert.strictEqual(variation(clay).label, 'Zone label',
    'no zone-label variation for the big block');
  chooseVariation(clay, 52);
  assert.strictEqual(clay.vals.BLOCK_TOP_LEFT, 52,
    'switching the big block to the offset label did not apply');

  document.tap('data-block', '2');   // analog clock: no zone to pick
  assert.ok(clay.items['TZ_ZONE[0]'].hidden,
    'the zone picker stayed out after the block stopped being a clock');
  checks++;
})();

// --- Unlabelled second time zone -------------------------------------------
// 55/56 are the third member of the zone-label variation: the same clock with
// no label at all, so nothing is drawn in the accent colour beside it.
(function zoneNoLabel() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('TZ_ZONE[0]').set('Asia/Tokyo');
  clay.getItemByMessageKey('BLOCK_TOP_LEFT').set(51);
  assert.ok(clay.vals['#PREVIEW'].indexOf('>JST<') > -1,
    'the abbreviation variant lost its label');

  document.tap('data-slot', 'BLOCK_TOP_LEFT');
  assert.strictEqual(variation(clay).label, 'Zone label', 'no zone-label select');
  chooseVariation(clay, 55);
  assert.strictEqual(clay.vals.BLOCK_TOP_LEFT, 55, 'the None variant did not apply');
  var html = clay.vals['#PREVIEW'];
  assert.ok(html.indexOf('>JST<') < 0, 'the None variant still draws a label');
  assert.ok(/>\d\d:\d\d</.test(html), 'the None variant lost its clock');
  // It is still a zone block, so the picker stays out; and it is still small.
  assert.ok(!clay.items['TZ_ZONE[0]'].hidden,
    'the zone picker went away for the unlabelled variant');
  assert.ok(!isBig(55) && isBig(56), 'the None variants have the wrong sizes');
  checks++;
})();

// --- Text block -------------------------------------------------------------
// 57 draws whatever the wearer typed for that slot, so the string follows the
// block: its input only comes out for a text block, and each slot has its own.
(function textBlock() {
  global.document = makeDocument();
  var clay = makeClay('basalt');
  clayCustomFn.call(clay);
  clay.build();
  clay.getItemByMessageKey('LAYOUT').set(1);
  clay.getItemByMessageKey('BLOCK_MID_LEFT').set(57);
  clay.getItemByMessageKey('TEXT[5]').set('Hello');       // BlockPos order
  clay.getItemByMessageKey('BLOCK_MID_RIGHT').set(57);
  clay.getItemByMessageKey('TEXT[6]').set('World');

  var html = clay.vals['#PREVIEW'];
  assert.ok(html.indexOf('>Hello<') > -1 && html.indexOf('>World<') > -1,
    'two text blocks did not draw their own strings');
  assert.ok(!isBig(57), 'the text block should be small');

  document.tap('data-slot', 'BLOCK_MID_LEFT');
  assert.ok(!clay.items['TEXT[5]'].hidden,
    'the text input stayed hidden for a text block');
  assert.ok(clay.items['TEXT[6]'].hidden,
    'another block\'s text input came out with it');
  assert.ok(clay.items['TZ_ZONE[5]'].hidden,
    'the zone picker came out for a text block');

  document.tap('data-block', '16');   // digital clock: nothing to type
  assert.ok(clay.items['TEXT[5]'].hidden,
    'the text input stayed out after the block stopped being text');
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
  [16, 17, 11, 26, 22, 33, 34, 39, 40, 50, 52].forEach(function(v) {
    assert.ok(offered.indexOf(v) > -1, 'block ' + v + ' left the palette');
  });
  [47, 48, 49, 25, 29, 23, 41, 42, 43, 44, 51, 53].forEach(function(v) {
    assert.ok(offered.indexOf(v) < 0, 'block ' + v + ' should be a variation');
  });

  // Placing a big block has to drop the other block in that column to small.
  document.tap('data-block', '12');            // temperature (big)
  assert.strictEqual(clay.vals.BLOCK_TOP_RIGHT, 12, 'the tap did not place');
  assert.ok(!isBig(clay.vals.BLOCK_BOTTOM_RIGHT),
    'the column kept two big blocks');
  assert.ok(clay.vals['#PALETTE'].indexOf('#0A84FF') > -1,
    'the placed block is not marked in the palette');
  assert.ok(variation(clay).hidden,
    'a block with nothing to vary got a select anyway');

  // A block that does have a variation gets one, and picking from it swaps to
  // the other member of the group without leaving the chip.
  document.tap('data-block', '17');            // digital clock (big)
  assert.strictEqual(variation(clay).label, 'Leading zero',
    'no variation select for the digital clock');
  assert.ok(!variation(clay).hidden, 'the variation select stayed hidden');
  assert.strictEqual(String(variation(clay).value), '17',
    'the variation select does not show the block that is placed');
  chooseVariation(clay, 48);                   // hide the leading zero
  assert.strictEqual(clay.vals.BLOCK_TOP_RIGHT, 48, 'the variation did not apply');
  assert.ok(clay.vals['#PALETTE'].indexOf('data-block="48"') > -1,
    'the chip should stand for whichever variation is placed');
  assert.strictEqual(variation(clay).label, 'Leading zero',
    'the variation select closed after being used');

  // Tapping the same block again closes the editor.
  document.tap('data-slot', 'BLOCK_TOP_RIGHT');
  assert.ok(clay.items.PANEL_TR_COLOR.hidden, 'the color picker stayed open');
  assert.ok(variation(clay).hidden, 'the variation select stayed open');
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

  var share = shareBox(clay);
  var code = share.code();
  // One unbroken token: base32 digits only, no punctuation, no separators, and
  // none of the letters that get misread (I, L, O, U).
  assert.ok(/^[0-9A-HJKMNP-TV-Z]+$/.test(code),
    'share code has odd characters: ' + code);
  checks++;
  page += '<div style="width:320px"><h4>share code</h4><code>' + code +
    '</code></div>';

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
  share.paste(code);
  share.run();

  Object.keys(face).forEach(function(k) {
    assert.strictEqual(clay.vals[k], face[k], 'share code lost ' + k);
  });
  assert.strictEqual(share.pasted(), '',
    'import left the pasted code in the box');
  checks++;

  // Junk must be refused, and must not touch the face.
  // Whitespace and dashes someone added for readability must still import, and
  // the letters base32 folds onto digits must survive a retype. Wipe first, or
  // a rejected code would leave the values from the import above and pass.
  var pretty = code.replace(/(.{8})/g, '$1 ').trim().toLowerCase()
    .replace(/0/g, 'O').replace(/1/g, 'l');
  wipe();
  share.paste(pretty);
  share.run();
  Object.keys(face).forEach(function(k) {
    assert.strictEqual(clay.vals[k], face[k],
      'a spaced/retyped code lost ' + k);
  });
  checks++;

  // Everything but the share box's own two fields: the pasted code and the
  // message are meant to change on a bad import, the face is not.
  function faceState() {
    var out = {};
    Object.keys(clay.vals).forEach(function(k) {
      if (k !== '#CODE_IN' && k !== '#TRANSFER_MSG') { out[k] = clay.vals[k]; }
    });
    return JSON.stringify(out);
  }
  var before = faceState();
  // One digit nudged: right length, right charset, checksum now off.
  var at = 10, next = code.charAt(at) === '0' ? '1' : '0';
  var tampered = code.slice(0, at) + next + code.slice(at + 1);
  ['', 'hello there', code + '0', code.slice(0, -1), tampered
  ].forEach(function(bad) {
    share.paste(bad);
    share.run();
    assert.ok(share.message().indexOf('#C62828') > -1,
      'bad code "' + bad + '" was not reported as an error');
    assert.strictEqual(faceState(), before,
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
  assert.strictEqual(shareBox(clay).code(), p.code,
    'preset "' + p.name + '": the face it applied is not its code');

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

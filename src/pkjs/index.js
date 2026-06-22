var Clay = require('@rebble/clay');
var clayConfig = require('./config');

// QuadBlock enum (must match flipwall-watchface.c):
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month.
// "Big" blocks fill a square; "small" blocks are half height. Each column must
// pair exactly one of each, so the two columns line up.
var BIG_BLOCKS = { 1: true, 2: true };   // Day of month, Clock
var FALLBACK_SMALL = 0;                   // Day of week
var FALLBACK_BIG = 2;                     // Clock

function isBig(v) {
  return !!BIG_BLOCKS[parseInt(v, 10)];
}

// The two block selectors that make up one column (top + bottom).
var COLUMNS = [
  ['BlockTopLeft', 'BlockBottomLeft'],
  ['BlockTopRight', 'BlockBottomRight']
];

// ---------------------------------------------------------------------------
// Live UI rule (runs inside the Clay config webview): when the user changes one
// block in a column, if it leaves the column with two big or two small blocks,
// flip the *other* selector to a compatible block so the column stays valid.
// ---------------------------------------------------------------------------
function clayCustomFn() {
  var clayConfig = this;

  function link(aKey, bKey) {
    var a = clayConfig.getItemByMessageKey(aKey);
    var b = clayConfig.getItemByMessageKey(bKey);
    if (!a || !b) { return; }
    var guard = false;

    // When `changed` moves, fix `other` if they now share a size category.
    function reconcile(changed, other) {
      if (guard) { return; }
      if (isBig(changed.get()) === isBig(other.get())) {
        guard = true;   // other.set() re-fires change; don't bounce back
        other.set(isBig(changed.get()) ? FALLBACK_SMALL : FALLBACK_BIG);
        guard = false;
      }
    }

    a.on('change', function() { reconcile(a, b); });
    b.on('change', function() { reconcile(b, a); });
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    link('BlockTopLeft', 'BlockBottomLeft');
    link('BlockTopRight', 'BlockBottomRight');
  });
}

var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });

// ---------------------------------------------------------------------------
// Submit-time sanitiser (runs on the phone). Two jobs:
//   1. Coerce select values to integers — Clay serialises <select> values as
//      strings, which the watch would otherwise read as garbage.
//   2. Re-enforce the small+big-per-column rule as a safety net (the live rule
//      above normally keeps it valid; this guards stale/odd responses).
// ---------------------------------------------------------------------------
function readValue(settings, key) {
  var s = settings[key];
  return s && typeof s === 'object' ? s.value : s;
}

function writeValue(settings, key, value) {
  if (settings[key] && typeof settings[key] === 'object') {
    settings[key].value = value;
  } else {
    settings[key] = { value: value };
  }
}

function sanitize(settings) {
  COLUMNS.forEach(function(col) {
    var topKey = col[0];
    var botKey = col[1];
    if (readValue(settings, topKey) === undefined ||
        readValue(settings, botKey) === undefined) {
      return;
    }

    var top = parseInt(readValue(settings, topKey), 10) || 0;
    var bot = parseInt(readValue(settings, botKey), 10) || 0;

    // If the column ended up with two of the same size, fix the bottom block.
    if (isBig(top) === isBig(bot)) {
      bot = isBig(top) ? FALLBACK_SMALL : FALLBACK_BIG;
    }

    writeValue(settings, topKey, top);   // store as numbers so they ship as ints
    writeValue(settings, botKey, bot);
  });
  return settings;
}

Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) { return; }

  var settings = sanitize(clay.getSettings(e.response, false));
  var dict = Clay.prepareSettingsForAppMessage(settings);

  Pebble.sendAppMessage(dict, function() {
    console.log('Sent config data to Pebble');
  }, function(error) {
    console.log('Failed to send config data: ' + JSON.stringify(error));
  });
});

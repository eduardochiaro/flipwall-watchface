var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var getWeather = require('./modules/weather');
var { tzInfo, DEFAULT_ZONE } = require('./modules/timezone');
var { clayCustomFn } = require('./modules/preview');
var pack = require('./modules/pack');

var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });

// ---------------------------------------------------------------------------
// Everything the watch is told goes out as one packed byte blob per message
// (see src/pkjs/modules/pack.js for the layouts). Nothing here sends an
// AppMessage key per setting any more, which is why package.json declares three
// message keys rather than thirty-odd.
//
// The one-big-block-per-column rule is not re-checked here: the config page
// keeps it live (reconcile() in preview.js), and a column that did arrive with
// two big blocks just draws as an equal split on the watch (layout_grid).
// ---------------------------------------------------------------------------

// One zone per block slot, in BlockPos order (the order the watch indexes its
// own array by): TL, TR, BL, BR, banner, middle left, middle right.
//
// The watch is told each slot's current offset and abbreviation, not its zone
// name — it has no tz data. Resolved on every send, so a DST change lands on
// the next update rather than waiting for the config page.
function zonesFrom(settings) {
  var out = [];
  for (var i = 0; i < pack.TZ_SLOTS; i++) {
    var zone = pack.readValue(settings, 'TZ_ZONE[' + i + ']') || DEFAULT_ZONE;
    out.push(tzInfo(zone));
  }
  return out;
}

// Clay persists the saved settings to localStorage before we get them, so the
// refresh below reads the face back from there rather than needing the config
// page to have been opened this run.
function savedSettings() {
  try {
    return JSON.parse(localStorage.getItem('clay-settings')) || {};
  } catch (e) {
    return {};
  }
}

function send(dict, what) {
  Pebble.sendAppMessage(dict, function() {
    console.log('Sent ' + what + ' to Pebble');
  }, function(error) {
    console.log('Failed to send ' + what + ': ' + JSON.stringify(error));
  });
}

// The six second-time-zone blocks (see QuadBlock in src/c/flipwall.h).
var TZ_BLOCK_IDS = { 50: 1, 51: 1, 52: 1, 53: 1, 55: 1, 56: 1 };

function usesTimezone(s) {
  return pack.BLOCK_KEYS.some(function(key) {
    return TZ_BLOCK_IDS[parseInt(pack.readValue(s, key), 10)];
  });
}

// Only sent while a second-time-zone block is actually on the face: every push
// wakes the watch over Bluetooth, and a face without one of these blocks has
// nothing to do with it. A config save carries the zones regardless, so adding
// a block still lights it up straight away.
function sendTimezones() {
  var s = savedSettings();
  if (!usesTimezone(s)) { return; }
  send({ TZ: pack.packTz(zonesFrom(s)) }, 'time zones');
}

// Update weather and the time-zone offsets on app start and every 30 minutes
Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready!');
  getWeather();
  sendTimezones();

  setInterval(function() { getWeather(); sendTimezones(); }, 30 * 60 * 1000);
});

Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) { return; }

  var settings = clay.getSettings(e.response, false);
  Pebble.sendAppMessage({ CONFIG: pack.packConfig(settings, zonesFrom(settings)) },
    function() {
      console.log('Sent config data to Pebble');
      getWeather();   // blocks may have changed, so the field set may have too
    }, function(error) {
      console.log('Failed to send config data: ' + JSON.stringify(error));
    });
});

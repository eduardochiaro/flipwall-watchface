var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var getWeather = require('./modules/weather');
var { tzInfo, DEFAULT_ZONE } = require('./modules/timezone');
var { clayCustomFn } = require('./modules/preview');

var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });

// ---------------------------------------------------------------------------
// Submit-time sanitiser (runs on the phone). One job: coerce every select value
// to an integer — Clay serialises <select> values as strings, which the watch
// would otherwise read as garbage.
//
// The one-big-block-per-column rule is not re-checked here: the config page
// keeps it live (reconcile() in preview.js), and a column that did arrive with
// two big blocks just draws as an equal split on the watch (layout_grid).
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

// Coerce a select to an int, keeping `def` when it is absent or unparseable.
// (0 is a real block id — "Day of week" — so it must not fall back to `def`.)
function toInt(settings, key, def) {
  var raw = readValue(settings, key);
  if (raw === undefined) { return; }
  var n = parseInt(raw, 10);
  writeValue(settings, key, isNaN(n) ? def : n);
}

// Every select the page sends, with the value to fall back on. Toggles and
// colors already arrive as booleans / ints.
var INT_KEYS = {
  BLOCK_TOP_LEFT: 0, BLOCK_TOP_RIGHT: 1,     // Day of week, Day of month
  BLOCK_BOTTOM_LEFT: 2, BLOCK_BOTTOM_RIGHT: 3,  // Clock, Month
  BLOCK_BAND: 7,                             // Year
  BLOCK_MID_LEFT: 16, BLOCK_MID_RIGHT: 4,    // Digital clock, Steps
  LANG: 0,                                   // English
  UNITS: 0,                                  // metric
  LAYOUT: 0                                  // classic 5-block face
};

// One zone per block slot, in BlockPos order (the order the watch indexes its
// own array by): TL, TR, BL, BR, banner, middle left, middle right.
var TZ_SLOTS = 7;

// The watch is told each slot's current offset and abbreviation, not its zone
// name — it has no tz data. Resolved on every send, so a DST change lands on
// the next update rather than waiting for the config page. The names then come
// out of the message: they are the phone's business, and seven of them would
// be a third of the inbox.
function addTimezones(settings) {
  for (var i = 0; i < TZ_SLOTS; i++) {
    var key = 'TZ_ZONE[' + i + ']';
    var info = tzInfo(readValue(settings, key) || DEFAULT_ZONE);
    writeValue(settings, 'TZ_OFFSET[' + i + ']', info.offset);
    writeValue(settings, 'TZ_ABBR[' + i + ']', info.abbr);
    delete settings[key];
  }
  return settings;
}

function sanitize(settings) {
  Object.keys(INT_KEYS).forEach(function(key) {
    toInt(settings, key, INT_KEYS[key]);
  });
  return addTimezones(settings);
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

// The four second-time-zone blocks (see QuadBlock in src/c/flipwall.h).
var TZ_BLOCK_IDS = { 50: 1, 51: 1, 52: 1, 53: 1 };

function usesTimezone(s) {
  return Object.keys(INT_KEYS).some(function(key) {
    return key.indexOf('BLOCK_') === 0 &&
      TZ_BLOCK_IDS[parseInt(readValue(s, key), 10)];
  });
}

// Only sent while a second-time-zone block is actually on the face: every push
// wakes the watch over Bluetooth, and a face without one of these blocks has
// nothing to do with it. A config save carries the zones regardless, so adding
// a block still lights it up straight away.
function sendTimezones() {
  var s = savedSettings();
  if (!usesTimezone(s)) { return; }
  var msg = {};
  for (var i = 0; i < TZ_SLOTS; i++) {
    var info = tzInfo(readValue(s, 'TZ_ZONE[' + i + ']') || DEFAULT_ZONE);
    msg['TZ_OFFSET[' + i + ']'] = info.offset;
    msg['TZ_ABBR[' + i + ']'] = info.abbr;
  }
  Pebble.sendAppMessage(Clay.prepareSettingsForAppMessage(msg),
    function() { console.log('Sent time zones to Pebble'); },
    function(error) {
      console.log('Failed to send time zones: ' + JSON.stringify(error));
    });
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

  var settings = sanitize(clay.getSettings(e.response, false));
  var dict = Clay.prepareSettingsForAppMessage(settings);

  Pebble.sendAppMessage(dict, function() {
    console.log('Sent config data to Pebble');
    getWeather();   // blocks may have changed, so the field set may have too
  }, function(error) {
    console.log('Failed to send config data: ' + JSON.stringify(error));
  });
});

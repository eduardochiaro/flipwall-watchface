var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var getWeather = require('./modules/weather');
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

function sanitize(settings) {
  Object.keys(INT_KEYS).forEach(function(key) {
    toInt(settings, key, INT_KEYS[key]);
  });
  return settings;
}

// Update weather on app start and every 30 minutes
Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready!');
  getWeather();
  
  // Update weather every 30 minutes
  setInterval(getWeather, 30 * 60 * 1000);
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

var PAGE = require('./page');   // src/pkjs/page/, inlined by scripts/inline-config.mjs
var catalog = require('./modules/catalog');
var getWeather = require('./modules/weather');
var { tzInfo, DEFAULT_ZONE } = require('./modules/timezone');
var pack = require('./modules/pack');

// ---------------------------------------------------------------------------
// Everything the watch is told goes out as one packed byte blob per message
// (see src/pkjs/modules/pack.js for the layouts), which is why package.json
// declares three message keys rather than thirty-odd.
//
// The settings live in localStorage as one flat { KEY: value } object, under
// the key the Clay page used, so a face saved before the custom page still
// loads. weather.js reads the same object.
// ---------------------------------------------------------------------------
var SETTINGS_KEY = 'clay-settings';   // ponytail: Clay's old key, kept for existing saves

function savedSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

// One zone per block slot, in BlockPos order (the order the watch indexes its
// own array by): TL, TR, BL, BR, banner, middle left, middle right.
//
// The watch is told each slot's current offset and abbreviation, not its zone
// name: it has no tz data. Resolved on every send, so a DST change lands on
// the next update rather than waiting for the settings page.
function zonesFrom(settings) {
  var out = [];
  for (var i = 0; i < pack.TZ_SLOTS; i++) {
    out.push(tzInfo(pack.readValue(settings, 'TZ_ZONE[' + i + ']') || DEFAULT_ZONE));
  }
  return out;
}

function send(dict, what) {
  Pebble.sendAppMessage(dict, function() {
    console.log('Sent ' + what + ' to Pebble');
  }, function(error) {
    console.log('Failed to send ' + what + ': ' + JSON.stringify(error));
  });
}

// Only sent while a second-time-zone block is actually on the face: every push
// wakes the watch over Bluetooth, and a face without one of these blocks has
// nothing to do with it. A settings save carries the zones regardless, so
// adding a block still lights it up straight away.
function sendTimezones() {
  var s = savedSettings();
  var used = pack.BLOCK_KEYS.some(function(key) {
    return catalog.TZ_BLOCKS[parseInt(pack.readValue(s, key), 10)];
  });
  if (used) { send({ TZ: pack.packTz(zonesFrom(s)) }, 'time zones'); }
}

// Update weather and the time-zone offsets on app start and every 30 minutes
Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready!');
  getWeather();
  sendTimezones();

  setInterval(function() { getWeather(); sendTimezones(); }, 30 * 60 * 1000);
});

// The page is handed over whole, with the saved settings and the watch model
// written into it.
Pebble.addEventListener('showConfiguration', function() {
  var watch = Pebble.getActiveWatchInfo && Pebble.getActiveWatchInfo();
  var state = { settings: savedSettings(), platform: watch && watch.platform };
  var json = JSON.stringify(state).replace(/</g, '\\u003c');
  var page = PAGE.replace('var STATE = null; //$$STATE$$', function() {
    return 'var STATE = ' + json + ';';
  });
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) { return; }   // closed without saving
  var settings;
  try {
    settings = catalog.normalize(JSON.parse(decodeURIComponent(e.response)));
  } catch (err) {
    console.log('Unreadable settings from the page: ' + err);
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  Pebble.sendAppMessage({ CONFIG: pack.packConfig(settings, zonesFrom(settings)) },
    function() {
      console.log('Sent config data to Pebble');
      getWeather();   // blocks may have changed, so the field set may have too
    }, function(error) {
      console.log('Failed to send config data: ' + JSON.stringify(error));
    });
});

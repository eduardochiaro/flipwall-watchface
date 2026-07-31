var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var getWeather = require('./modules/weather');
var { clayCustomFn, isBig, GRID_PAIRS, FALLBACK_SMALL, FALLBACK_BIG } = require('./modules/preview');

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

// Coerce a select to an int, keeping `def` when it is absent or unparseable.
function toInt(settings, key, def) {
  if (readValue(settings, key) === undefined) { return; }
  writeValue(settings, key, parseInt(readValue(settings, key), 10) || def);
}

function isRoundWatch() {
  var info = Pebble.getActiveWatchInfo && Pebble.getActiveWatchInfo();
  var platform = info && info.platform;
  return platform === 'chalk' || platform === 'gabbro';
}

function sanitize(settings) {
  toInt(settings, 'BLOCK_BAND', 7);    // Year
  toInt(settings, 'BLOCK_SIXTH', 4);   // Steps
  toInt(settings, 'LANG', 0);          // English
  toInt(settings, 'UNITS', 0);         // metric
  toInt(settings, 'LAYOUT', 0);        // classic 5-block face

  // Rectangular 6-block faces pair the grid by row; everything else by column.
  var six = parseInt(readValue(settings, 'LAYOUT'), 10) === 1;
  GRID_PAIRS[six && !isRoundWatch() ? 'row' : 'col'].forEach(function(pair) {
    if (readValue(settings, pair[0]) === undefined ||
        readValue(settings, pair[1]) === undefined) {
      return;
    }

    var a = parseInt(readValue(settings, pair[0]), 10) || 0;
    var b = parseInt(readValue(settings, pair[1]), 10) || 0;

    // If the pair ended up with two of the same size, fix the second block.
    if (isBig(a) === isBig(b)) {
      b = isBig(a) ? FALLBACK_SMALL : FALLBACK_BIG;
    }

    writeValue(settings, pair[0], a);   // store as numbers so they ship as ints
    writeValue(settings, pair[1], b);
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

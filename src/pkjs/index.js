var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var getWeather = require('./modules/weather');
var { clayCustomFn, isBig, COLUMNS, FALLBACK_SMALL, FALLBACK_BIG } = require('./modules/preview');

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
  // Banner select also serialises as a string; ship it as an int. Default 7 (Year).
  if (readValue(settings, 'BLOCK_BAND') !== undefined) {
    writeValue(settings, 'BLOCK_BAND',
               parseInt(readValue(settings, 'BLOCK_BAND'), 10) || 7);
  }

  // Language select likewise ships as an int (0 = English).
  if (readValue(settings, 'LANG') !== undefined) {
    writeValue(settings, 'LANG', parseInt(readValue(settings, 'LANG'), 10) || 0);
  }

  // Units select ships as an int (0 = metric, 1 = imperial).
  if (readValue(settings, 'UNITS') !== undefined) {
    writeValue(settings, 'UNITS', parseInt(readValue(settings, 'UNITS'), 10) || 0);
  }

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
    getWeather();   // units may have changed; refresh now instead of waiting
  }, function(error) {
    console.log('Failed to send config data: ' + JSON.stringify(error));
  });
});

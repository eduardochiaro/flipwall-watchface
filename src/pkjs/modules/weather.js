// Clay persists the saved settings to localStorage under 'clay-settings'.
function settings() {
  try {
    return JSON.parse(localStorage.getItem('clay-settings')) || {};
  } catch (e) {
    return {};
  }
}

function readValue(s, key) {
  var v = s[key];
  return v && typeof v === 'object' ? v.value : v;
}

// The five block slots (banner + 2x2 grid), matching the QuadBlock enum on the C
// side. Anything not listed in BLOCK_FIELDS doesn't use weather at all, so a
// layout without a single weather block skips the whole request (and the GPS fix).
var BLOCK_KEYS = ['BLOCK_BAND', 'BLOCK_TOP_LEFT', 'BLOCK_BOTTOM_LEFT',
                  'BLOCK_TOP_RIGHT', 'BLOCK_BOTTOM_RIGHT'];

// Which Open-Meteo fields each weather block needs on top of current
// temperature_2m, which is always requested: weather.c uses
// WEATHER_TEMPERATURE as the marker that an inbox message is a weather push.
var BLOCK_FIELDS = {
  8:  ['weather_code'],                              // Weather icon (big)
  11: [],                                            // Temperature (small)
  12: [],                                            // Temperature (big)
  25: ['weather_code'],                              // Temperature + icon
  13: ['relative_humidity_2m'],                      // Humidity (small)
  27: ['relative_humidity_2m'],                      // Humidity (big)
  15: ['precipitation'],                             // Precipitation
  14: ['temperature_2m_min', 'temperature_2m_max'],  // Max/Min temp (small)
  32: ['temperature_2m_min', 'temperature_2m_max'],  // Max/Min temp (big)
  33: ['uv_index'],                                  // UV index (small)
  34: ['uv_index'],                                  // UV index (big)
  35: ['wind_speed_10m'],                            // Wind speed (small)
  36: ['wind_speed_10m'],                            // Wind speed (big)
  37: ['wind_direction_10m'],                        // Wind direction (small)
  38: ['wind_direction_10m'],                        // Wind direction (big)
  39: ['aqi'],                                       // Air quality (small)
  40: ['aqi']                                        // Air quality (big)
};

// The daily=... fields of the forecast API; AIR fields come from the separate
// air-quality endpoint instead. Everything else is a forecast current=... field.
var DAILY = { temperature_2m_min: 1, temperature_2m_max: 1 };
var AIR = { uv_index: 1, aqi: 1 };

// Union of the fields needed by the blocks currently on screen.
// Returns null when no block uses weather.
function requestedFields(s) {
  var used = false;
  var want = {};

  BLOCK_KEYS.forEach(function(key) {
    var fields = BLOCK_FIELDS[parseInt(readValue(s, key), 10)];
    if (!fields) { return; }
    used = true;
    fields.forEach(function(f) { want[f] = true; });
  });

  if (!used) { return null; }

  var current = ['temperature_2m'];
  var daily = [];
  var air = [];
  Object.keys(want).forEach(function(f) {
    (AIR[f] ? air : DAILY[f] ? daily : current).push(f);
  });
  return { current: current, daily: daily, air: air };
}

// Always metric (Open-Meteo's default): the watch converts to °F / inches at
// render time, so a units change doesn't need a refetch. See src/c/modules/weather.c.
function buildUrl(lat, lon, fields) {
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
            '&longitude=' + lon +
            '&current=' + fields.current.join(',');
  if (fields.daily.length) {
    url += '&daily=' + fields.daily.join(',') + '&forecast_days=1';
  }
  return url + '&timezone=auto';
}

// Air quality lives on its own Open-Meteo host. The two AQI scales are on very
// different ranges (European ~0..100, US ~0..500), and the phone picks one:
// ponytail: imperial units => US scale, rather than a config option nobody asked
// for. Add an AQI_SCALE select if metric users ask for the US number.
function buildAirUrl(lat, lon, air, imperial) {
  var fields = air.map(function(f) {
    return f === 'aqi' ? (imperial ? 'us_aqi' : 'european_aqi') : f;
  });
  return 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat +
         '&longitude=' + lon + '&current=' + fields.join(',') + '&timezone=auto';
}

// AppMessage carries int32s; round so floats don't get mangled. Only the keys
// that were actually requested are sent — weather.c keeps its cached value for
// any key that's absent.
function buildMessage(data) {
  var current = data.current || {};
  var daily = data.daily || {};
  var msg = { WEATHER_TEMPERATURE: Math.round(current.temperature_2m) };

  if (current.weather_code !== undefined) {
    msg.WEATHER_CODE = current.weather_code;
  }
  if (current.relative_humidity_2m !== undefined) {
    msg.WEATHER_HUMIDITY = Math.round(current.relative_humidity_2m);
  }
  if (current.wind_speed_10m !== undefined) {
    msg.WEATHER_WIND_SPEED = Math.round(current.wind_speed_10m);   // km/h
  }
  if (current.wind_direction_10m !== undefined) {
    msg.WEATHER_WIND_DIR = Math.round(current.wind_direction_10m); // deg, from
  }
  if (current.precipitation !== undefined) {
    msg.WEATHER_PRECIPITATION = Math.round(current.precipitation);
  }
  if (daily.temperature_2m_min) {
    msg.WEATHER_MIN_TEMP = Math.round(daily.temperature_2m_min[0]);
  }
  if (daily.temperature_2m_max) {
    msg.WEATHER_MAX_TEMP = Math.round(daily.temperature_2m_max[0]);
  }
  return msg;
}

// Air-quality response -> the same message. Merged into the forecast message so
// the watch gets one push (weather.c keys off WEATHER_TEMPERATURE).
function addAirMessage(msg, data) {
  var current = data.current || {};
  var aqi = current.european_aqi !== undefined ? current.european_aqi
                                               : current.us_aqi;
  // Either field can come back null; send 0 rather than NaN.
  if (current.uv_index !== undefined) { msg.WEATHER_UV = Math.round(current.uv_index || 0); }
  if (aqi !== undefined) { msg.WEATHER_AQI = Math.round(aqi || 0); }
  return msg;
}

function fetchJson(url, successCallback, errorCallback) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.current) {
            successCallback(data);
          } else {
            errorCallback('Invalid weather data received');
          }
        } catch (parseError) {
          errorCallback('JSON parse error: ' + parseError.message);
        }
      } else {
        errorCallback('HTTP error! status: ' + xhr.status);
      }
    }
  };

  xhr.onerror = function() {
    errorCallback('Network error occurred');
  };

  xhr.ontimeout = function() {
    errorCallback('Request timed out');
  };

  xhr.timeout = 10000; // 10 second timeout
  xhr.open('GET', url, true);
  xhr.send();
}

function getWeather() {
  var s = settings();
  var fields = requestedFields(s);
  if (!fields) {
    console.log('No weather block in the layout, skipping weather fetch');
    return;
  }
  var imperial = parseInt(readValue(s, 'UNITS'), 10) === 1;

  function send(msg) {
    Pebble.sendAppMessage(msg, function() {
      console.log('Weather data sent to Pebble successfully');
    }, function(error) {
      console.log('Failed to send weather data to Pebble: ' + JSON.stringify(error));
    });
  }

  navigator.geolocation.getCurrentPosition(function(position) {
    var lat = position.coords.latitude, lon = position.coords.longitude;
    fetchJson(buildUrl(lat, lon, fields), function(data) {
      var msg = buildMessage(data);
      if (!fields.air.length) { return send(msg); }
      // Air quality is a second request; a failure there still ships the rest.
      fetchJson(buildAirUrl(lat, lon, fields.air, imperial), function(air) {
        send(addAirMessage(msg, air));
      }, function(error) {
        console.log('Failed to fetch air quality data: ' + error);
        send(msg);
      });
    }, function(error) {
      console.log('Failed to fetch weather data: ' + error);
    });
  }, function(error) {
    console.log('Failed to get location: ' + error.message);
  }, { timeout: 15000, maximumAge: 1800000 }); // 30 minute cache
}

module.exports = getWeather;
module.exports.requestedFields = requestedFields;
module.exports.buildUrl = buildUrl;
module.exports.buildAirUrl = buildAirUrl;

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
  33: ['uv_index_max'],                              // UV index (small)
  34: ['uv_index_max'],                              // UV index (big)
  35: ['wind_speed_10m'],                            // Wind speed (small)
  36: ['wind_speed_10m'],                            // Wind speed (big)
  37: ['wind_direction_10m'],                        // Wind direction (small)
  38: ['wind_direction_10m']                         // Wind direction (big)
};

// The daily=... fields; everything else in BLOCK_FIELDS is a current=... field.
var DAILY = { temperature_2m_min: 1, temperature_2m_max: 1, uv_index_max: 1 };

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
  Object.keys(want).forEach(function(f) {
    (DAILY[f] ? daily : current).push(f);
  });
  return { current: current, daily: daily };
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
  if (daily.uv_index_max) {
    // uv_index_max is null on some responses -> send 0 rather than NaN
    msg.WEATHER_UV = Math.round(daily.uv_index_max[0] || 0);
  }
  return msg;
}

function fetchWeather(url, successCallback, errorCallback) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.current) {
            successCallback(buildMessage(data));
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
  var fields = requestedFields(settings());
  if (!fields) {
    console.log('No weather block in the layout, skipping weather fetch');
    return;
  }

  navigator.geolocation.getCurrentPosition(function(position) {
    var url = buildUrl(position.coords.latitude, position.coords.longitude, fields);
    fetchWeather(url, function(msg) {
      Pebble.sendAppMessage(msg, function() {
        console.log('Weather data sent to Pebble successfully');
      }, function(error) {
        console.log('Failed to send weather data to Pebble: ' + JSON.stringify(error));
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

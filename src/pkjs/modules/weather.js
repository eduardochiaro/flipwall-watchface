function getLocation(successCallback, errorCallback) {
  navigator.geolocation.getCurrentPosition(
    function(position) {
      successCallback({
        lat: position.coords.latitude,
        lon: position.coords.longitude
      });
    },
    function(error) {
      errorCallback(error);
    },
    { timeout: 15000, maximumAge: 1800000 } // 30 minute cache
  );
}

// Imperial when the user picked it on the config page (UNITS = 1), else metric.
// Clay persists the saved settings to localStorage under 'clay-settings'.
function isImperial() {
  try {
    var s = JSON.parse(localStorage.getItem('clay-settings')) || {};
    var u = s.UNITS;
    if (u && typeof u === 'object') { u = u.value; }
    return parseInt(u, 10) === 1;
  } catch (e) {
    return false;
  }
}

function fetchWeather(lat, lon, successCallback, errorCallback) {
  // Open-Meteo returns the values already in the requested unit, so the module
  // does the metric<->imperial translation here (C just renders the numbers).
  var units = isImperial()
    ? '&temperature_unit=fahrenheit&precipitation_unit=inch'
    : '';
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&daily=temperature_2m_max,temperature_2m_min&current=temperature_2m,weather_code,relative_humidity_2m,precipitation&forecast_days=1&timezone=auto' + units;

  var xhr = new XMLHttpRequest();
  
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.current) {
            var tempCelsius = Math.round(data.current.temperature_2m);
            // Store weather data for caching
            lastWeatherData = {
              tempCelsius: tempCelsius
            };
            
            // AppMessage carries int32s; round so floats don't get mangled.
            successCallback({
              temperature: tempCelsius, // Always send Celsius to C code
              weatherCode: data.current.weather_code,
              humidity: Math.round(data.current.relative_humidity_2m),
              precipitation: Math.round(data.current.precipitation),
              minTemperature: Math.round(data.daily.temperature_2m_min[0]),
              maxTemperature: Math.round(data.daily.temperature_2m_max[0])
            });
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
  getLocation(function(location) {
    fetchWeather(location.lat, location.lon, function(weatherData) {
      // Send weather data to C code
      Pebble.sendAppMessage({
        WEATHER_TEMPERATURE: weatherData.temperature, // already in the user's unit (see isImperial)
        WEATHER_CODE: weatherData.weatherCode, // Weather code for icon selection
        WEATHER_HUMIDITY: weatherData.humidity, // Relative humidity percentage
        WEATHER_PRECIPITATION: weatherData.precipitation, // Precipitation in mm
        WEATHER_MIN_TEMP: weatherData.minTemperature, // Minimum temperature for the day, in celsius
        WEATHER_MAX_TEMP: weatherData.maxTemperature // Maximum temperature for the day, in celsius
      }, function() {
        console.log('Weather data sent to Pebble successfully');
      }, function(error) {
        console.log('Failed to send weather data to Pebble: ' + JSON.stringify(error));
      });
    }, function(error) {
      console.log('Failed to fetch weather data: ' + error);
    });   
  }, function(error) {
    console.log('Failed to get location: ' + error.message);
  });
}

module.exports = getWeather;
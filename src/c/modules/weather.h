#pragma once
#include <pebble.h>
#include "../wire.h"

// Weather comes from the phone (see src/pkjs/modules/weather.js) over AppMessage
// in metric units (Celsius, %, mm). The last reading is cached to persistent
// storage so a block shows real data immediately after the watch reboots,
// instead of "--" until the next 30-minute fetch. UV and AQI come from
// Open-Meteo's air-quality endpoint, merged into the same push.

void weather_init(void);                               // load cached reading
bool weather_handle_message(DictionaryIterator *iter); // true if it held weather
// The reading unpacked from a WEATHER blob (packWeather in pack.js): version,
// a present mask, then one int16 per field. False when the blob is malformed or
// of a version this build doesn't know. Split out from the message handling so
// the parser can be tested on the host.
bool weather_apply_blob(const uint8_t *p, uint16_t len);
void weather_set_units(bool imperial);                 // °C/mm vs °F/in on display

// Formatters write "--" when no reading is available yet, and convert the stored
// metric reading to the configured units (see weather_set_units).
void weather_temp_str(char *buf, size_t n);     // "22°"      / "72°"
void weather_humidity_str(char *buf, size_t n); // "45%"
void weather_minmax_str(char *buf, size_t n);   // "12/24°"   / "54/75°"
void weather_max_str(char *buf, size_t n);      // "24°"      / "75°"
void weather_min_str(char *buf, size_t n);      // "12°"      / "54°"
void weather_precip_str(char *buf, size_t n);   // "5mm"      / "0.2in"
void weather_uv_str(char *buf, size_t n);       // "7" (current UV index)
void weather_aqi_str(char *buf, size_t n);      // "42" (European or US AQI)
void weather_wind_str(char *buf, size_t n);     // "12km/h"   / "7mph"
void weather_wind_dir_str(char *buf, size_t n); // "WNW" (16-point compass)
// The next sunrise / sunset, in the watch's own 12/24h style ("6:12" / "06:12").
// The phone picks which day it is (see buildMessage in weather.js) and sends
// only the minute of the day, so this is pure formatting.
void weather_sun_str(char *buf, size_t n, bool sunset);
// Rotation for the ICON_WIND_DIRECTION_N arrow: the icon points north at 0, and
// the arrow ends up pointing where the wind blows *to* - the opposite of the
// direction named by weather_wind_dir_str (which is the reported "from").
int32_t weather_wind_angle(void);

// Which band of the index scale the current reading falls in, for the coloured
// block variants; -1 when there is no reading yet. UV is the 5-band WHO scale
// (low..extreme); AQI is 6 bands of whichever scale the phone sent (US when the
// units are imperial, European otherwise - the rule buildAirUrl uses).
int weather_uv_band(void);   // 0..4
int weather_aqi_band(void);  // 0..5

uint32_t weather_icon_resource(void);           // large pdc (big weather block)
uint32_t weather_icon_resource_small(void);     // small pdc (small/banner block)

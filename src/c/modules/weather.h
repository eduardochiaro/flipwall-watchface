#pragma once
#include <pebble.h>

// Weather comes from the phone (see src/pkjs/modules/weather.js) over AppMessage
// in metric units (Celsius, %, mm). The last reading is cached to persistent
// storage so a block shows real data immediately after the watch reboots,
// instead of "--" until the next 30-minute fetch.

void weather_init(void);                               // load cached reading
bool weather_handle_message(DictionaryIterator *iter); // true if it held weather
void weather_set_units(bool imperial);                 // °C/mm vs °F/in on display

// Formatters write "--" when no reading is available yet, and convert the stored
// metric reading to the configured units (see weather_set_units).
void weather_temp_str(char *buf, size_t n);     // "22°"      / "72°"
void weather_humidity_str(char *buf, size_t n); // "45%"
void weather_minmax_str(char *buf, size_t n);   // "12/24°"   / "54/75°"
void weather_max_str(char *buf, size_t n);      // "24°"      / "75°"
void weather_min_str(char *buf, size_t n);      // "12°"      / "54°"
void weather_precip_str(char *buf, size_t n);   // "5mm"      / "0.2in"
void weather_uv_str(char *buf, size_t n);       // "7" (today's max UV index)
void weather_wind_str(char *buf, size_t n);     // "12km/h"   / "7mph"
void weather_wind_dir_str(char *buf, size_t n); // "WNW" (16-point compass)
// Rotation for the ICON_WIND_DIRECTION_N arrow: the icon points north at 0, and
// the arrow ends up pointing at the direction named by weather_wind_dir_str
// (i.e. where the wind blows *from*, as reported).
int32_t weather_wind_angle(void);

uint32_t weather_icon_resource(void);           // large pdc (big weather block)
uint32_t weather_icon_resource_small(void);     // small pdc (small/banner block)

#pragma once
#include <pebble.h>

// Weather comes from the phone (see src/pkjs/modules/weather.js) over AppMessage
// in metric units (Celsius, %, mm). The last reading is cached to persistent
// storage so a block shows real data immediately after the watch reboots,
// instead of "--" until the next 30-minute fetch.

void weather_init(void);                               // load cached reading
bool weather_handle_message(DictionaryIterator *iter); // true if it held weather

// Formatters write "--" when no reading is available yet.
void weather_temp_str(char *buf, size_t n);     // "22°"
void weather_humidity_str(char *buf, size_t n); // "45%"
void weather_minmax_str(char *buf, size_t n);   // "12/24°"

uint32_t weather_icon_resource(void);           // pdc resource for the icon block

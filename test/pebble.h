// Minimal host-side stand-in for the Pebble SDK header, enough to compile the
// pure-logic modules (formatters, unit conversion, code->icon lookup) in a
// normal cc build. Not a simulator: anything that draws or talks to the phone
// is out of scope here.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define TRIG_MAX_ANGLE 0x10000

// Persistent storage: the tests set module state directly, so these only need
// to link, and "nothing cached" is the right answer for a fresh host run.
static inline bool persist_exists(uint32_t k)             { (void)k; return false; }
static inline int32_t persist_read_int(uint32_t k)        { (void)k; return 0; }
static inline bool persist_read_bool(uint32_t k)          { (void)k; return false; }
static inline int persist_write_int(uint32_t k, int32_t v)  { (void)k; (void)v; return 0; }
static inline int persist_write_bool(uint32_t k, bool v)    { (void)k; (void)v; return 0; }

// The message is a packed blob (see src/pkjs/modules/pack.js); the tests call
// the blob parser directly, so the dictionary side only needs to link.
typedef struct { int32_t int32; const uint8_t *data; } TupleValue;
typedef struct { TupleValue *value; uint16_t length; } Tuple;
typedef struct DictionaryIterator DictionaryIterator;
static inline Tuple *dict_find(DictionaryIterator *i, uint32_t k) {
  (void)i; (void)k; return NULL;
}

#define MESSAGE_KEY_WEATHER 1

// The watch's 12/24h setting. A plain variable here so a test can check both
// sides of a formatter that reads it (weather_sun_str).
static bool s_host_24h = true;
static inline bool clock_is_24h_style(void) { return s_host_24h; }

// Resource ids are opaque handles on the watch; distinct values are all the
// code->icon test needs.
enum {
  RESOURCE_ID_ICON_SUNNY = 100, RESOURCE_ID_ICON_SUNNY_SMALL,
  RESOURCE_ID_ICON_PARTLY_CLOUDY, RESOURCE_ID_ICON_PARTLY_CLOUDY_SMALL,
  RESOURCE_ID_ICON_CLOUDY, RESOURCE_ID_ICON_CLOUDY_SMALL,
  RESOURCE_ID_ICON_LIGHT_RAIN, RESOURCE_ID_ICON_LIGHT_RAIN_SMALL,
  RESOURCE_ID_ICON_HEAVY_RAIN, RESOURCE_ID_ICON_HEAVY_RAIN_SMALL,
  RESOURCE_ID_ICON_LIGHT_SNOW, RESOURCE_ID_ICON_LIGHT_SNOW_SMALL,
  RESOURCE_ID_ICON_HEAVY_SNOW, RESOURCE_ID_ICON_HEAVY_SNOW_SMALL,
  RESOURCE_ID_ICON_RAIN_SNOW, RESOURCE_ID_ICON_RAIN_SNOW_SMALL,
  RESOURCE_ID_ICON_GENERIC_WEATHER, RESOURCE_ID_ICON_GENERIC_WEATHER_SMALL,
};

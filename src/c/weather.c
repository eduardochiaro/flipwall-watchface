#include "weather.h"

// Persist keys for the cached reading. Kept well clear of the layout/colour keys
// in flipwall-watchface.c (which run 1..12) so the two ranges never collide.
typedef enum {
  PK_W_VALID = 100,
  PK_W_TEMP,
  PK_W_CODE,
  PK_W_HUMIDITY,
  PK_W_MIN,
  PK_W_MAX,
} WeatherPersistKey;

static bool s_have = false;
static int  s_temp, s_code, s_humidity, s_min, s_max;

void weather_init(void) {
  if (!persist_exists(PK_W_VALID)) return;
  s_have     = true;
  s_temp     = persist_read_int(PK_W_TEMP);
  s_code     = persist_read_int(PK_W_CODE);
  s_humidity = persist_read_int(PK_W_HUMIDITY);
  s_min      = persist_read_int(PK_W_MIN);
  s_max      = persist_read_int(PK_W_MAX);
}

// Clay/config saves and weather pushes arrive on the same inbox; this reads the
// weather tuples if present and reports whether it found any.
bool weather_handle_message(DictionaryIterator *iter) {
  Tuple *t = dict_find(iter, MESSAGE_KEY_WEATHER_TEMPERATURE);
  if (!t) return false;
  s_temp = t->value->int32;

  Tuple *c = dict_find(iter, MESSAGE_KEY_WEATHER_CODE);
  if (c) s_code = c->value->int32;
  Tuple *h = dict_find(iter, MESSAGE_KEY_WEATHER_HUMIDITY);
  if (h) s_humidity = h->value->int32;
  Tuple *mn = dict_find(iter, MESSAGE_KEY_WEATHER_MIN_TEMP);
  if (mn) s_min = mn->value->int32;
  Tuple *mx = dict_find(iter, MESSAGE_KEY_WEATHER_MAX_TEMP);
  if (mx) s_max = mx->value->int32;

  s_have = true;
  persist_write_bool(PK_W_VALID, true);
  persist_write_int(PK_W_TEMP, s_temp);
  persist_write_int(PK_W_CODE, s_code);
  persist_write_int(PK_W_HUMIDITY, s_humidity);
  persist_write_int(PK_W_MIN, s_min);
  persist_write_int(PK_W_MAX, s_max);
  return true;
}

void weather_temp_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d°", s_temp);
  else        snprintf(buf, n, "--");
}

void weather_humidity_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d%%", s_humidity);
  else        snprintf(buf, n, "--");
}

void weather_minmax_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d/%d°", s_min, s_max);
  else        snprintf(buf, n, "--");
}

// Open-Meteo WMO weather codes -> bundled pdc icon. Only the sunny icon exists
// today; every code falls back to it. Add cases (and the resources) as new
// icons land — the icon block already redraws from whatever this returns.
uint32_t weather_icon_resource(void) {
  switch (s_code) {
    // case 1: case 2: case 3:   return RESOURCE_ID_ICON_CLOUDY;
    // case 61: case 63: case 65: return RESOURCE_ID_ICON_RAIN;
    default: return RESOURCE_ID_ICON_SUNNY;
  }
}

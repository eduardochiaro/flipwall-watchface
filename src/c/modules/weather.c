#include "weather.h"

// Persist keys for the cached reading. Kept well clear of the layout/colour keys
// in flipwall-watchface.c (which run 1..12) so the two ranges never collide.
// Base moved 100 -> 110 when the wire format became metric-only: a cache written
// by an older build could hold Fahrenheit, and nothing distinguishes it from a
// Celsius one. The old 100..108 keys are simply abandoned.
typedef enum {
  PK_W_VALID = 110,
  PK_W_TEMP,
  PK_W_CODE,
  PK_W_HUMIDITY,
  PK_W_MIN,
  PK_W_MAX,
  PK_W_PRECIP,
  PK_W_UNITS,
  PK_W_UV,
  PK_W_WIND,
  PK_W_WIND_DIR,
} WeatherPersistKey;

static bool s_have = false;
static int  s_temp, s_code, s_humidity, s_min, s_max, s_precip, s_uv;
// Wind speed in km/h (Open-Meteo's default) and the direction it blows from, in
// degrees clockwise from north.
static int  s_wind, s_wind_dir;
// The phone always sends metric (Celsius, mm); the conversion happens here so a
// units change repaints from the cached reading instead of waiting for a fetch.
static bool s_imperial = false;

static int temp_out(int celsius) {
  if (!s_imperial) return celsius;
  int tenths = celsius * 18;   // celsius * 1.8, in tenths
  // C division truncates toward zero, so round away from zero on both signs.
  return (tenths + (tenths < 0 ? -5 : 5)) / 10 + 32;
}

void weather_init(void) {
  if (persist_exists(PK_W_UNITS)) s_imperial = persist_read_bool(PK_W_UNITS);
  if (!persist_exists(PK_W_VALID)) return;
  s_have     = true;
  s_temp     = persist_read_int(PK_W_TEMP);
  s_code     = persist_read_int(PK_W_CODE);
  s_humidity = persist_read_int(PK_W_HUMIDITY);
  s_min      = persist_read_int(PK_W_MIN);
  s_max      = persist_read_int(PK_W_MAX);
  s_precip   = persist_read_int(PK_W_PRECIP);
  s_uv       = persist_read_int(PK_W_UV);   // 0 when cached before UV existed
  s_wind     = persist_read_int(PK_W_WIND);       // 0 when cached before wind
  s_wind_dir = persist_read_int(PK_W_WIND_DIR);   // existed
}

void weather_set_units(bool imperial) {
  s_imperial = imperial;
  persist_write_bool(PK_W_UNITS, imperial);
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
  Tuple *pr = dict_find(iter, MESSAGE_KEY_WEATHER_PRECIPITATION);
  if (pr) s_precip = pr->value->int32;
  Tuple *uv = dict_find(iter, MESSAGE_KEY_WEATHER_UV);
  if (uv) s_uv = uv->value->int32;
  Tuple *ws = dict_find(iter, MESSAGE_KEY_WEATHER_WIND_SPEED);
  if (ws) s_wind = ws->value->int32;
  Tuple *wd = dict_find(iter, MESSAGE_KEY_WEATHER_WIND_DIR);
  if (wd) s_wind_dir = wd->value->int32;

  s_have = true;
  persist_write_bool(PK_W_VALID, true);
  persist_write_int(PK_W_TEMP, s_temp);
  persist_write_int(PK_W_CODE, s_code);
  persist_write_int(PK_W_HUMIDITY, s_humidity);
  persist_write_int(PK_W_MIN, s_min);
  persist_write_int(PK_W_MAX, s_max);
  persist_write_int(PK_W_PRECIP, s_precip);
  persist_write_int(PK_W_UV, s_uv);
  persist_write_int(PK_W_WIND, s_wind);
  persist_write_int(PK_W_WIND_DIR, s_wind_dir);
  return true;
}

void weather_temp_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d°", temp_out(s_temp));
  else        snprintf(buf, n, "--");
}

void weather_humidity_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d%%", s_humidity);
  else        snprintf(buf, n, "--");
}

void weather_minmax_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d/%d°", temp_out(s_max), temp_out(s_min));
  else        snprintf(buf, n, "--");
}

void weather_max_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d°", temp_out(s_max));
  else        snprintf(buf, n, "--");
}

void weather_min_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d°", temp_out(s_min));
  else        snprintf(buf, n, "--");
}

void weather_precip_str(char *buf, size_t n) {
  if (!s_have) { snprintf(buf, n, "--"); return; }
  if (s_imperial) {
    // Whole inches would read "0in" for anything under 13mm, so show tenths.
    int tenths = (s_precip * 3937 + 5000) / 10000;   // mm -> inches * 10, rounded
    snprintf(buf, n, "%d.%din", tenths / 10, tenths % 10);
  } else {
    snprintf(buf, n, "%dmm", s_precip);
  }
}

void weather_uv_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d", s_uv);
  else        snprintf(buf, n, "--");
}

void weather_wind_str(char *buf, size_t n) {
  if (!s_have) { snprintf(buf, n, "--"); return; }
  // km/h -> mph, rounded (1 mile = 1.609344 km).
  if (s_imperial) snprintf(buf, n, "%dmph", (s_wind * 1000 + 805) / 1609);
  else            snprintf(buf, n, "%dkm/h", s_wind);
}

// 16-point compass: each sector is 22.5 degrees wide and centred on its name, so
// N covers 348.75..11.25. The x100/2250 keeps the half-sector offset in ints.
void weather_wind_dir_str(char *buf, size_t n) {
  static const char *const DIRS[16] = {
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
  };
  if (s_have) snprintf(buf, n, "%s", DIRS[((s_wind_dir * 100 + 1125) / 2250) % 16]);
  else        snprintf(buf, n, "--");
}

int32_t weather_wind_angle(void) {
  return TRIG_MAX_ANGLE * (s_wind_dir % 360) / 360;
}

// Open-Meteo WMO weather codes -> bundled pdc icon.
// https://open-meteo.com/en/docs#weathervariables
// Each icon ships in two sizes; `small` picks the small variant (small/banner
// blocks) over the large (the big weather block).
#define ICON(name) (small ? RESOURCE_ID_ICON_##name##_SMALL : RESOURCE_ID_ICON_##name)
static uint32_t icon_res(bool small) {
  switch (s_code) {
    case 0:                            return ICON(SUNNY);
    case 1: case 2:                    return ICON(PARTLY_CLOUDY);
    case 3: case 45: case 48:          return ICON(CLOUDY);
    case 51: case 53: case 55:         // drizzle
    case 56: case 57:                  // freezing drizzle
    case 61: case 80:                  // slight rain
      return ICON(LIGHT_RAIN);
    case 63: case 65:                  // moderate/heavy rain
    case 81: case 82:                  // rain showers
    case 95: case 96: case 99:         // thunderstorm
      return ICON(HEAVY_RAIN);
    case 66: case 67:                  // freezing rain
      return ICON(RAIN_SNOW);
    case 71: case 77: case 85:         // slight snow
      return ICON(LIGHT_SNOW);
    case 73: case 75: case 86:         // moderate/heavy snow
      return ICON(HEAVY_SNOW);
    default:                           return ICON(GENERIC_WEATHER);
  }
}
#undef ICON

uint32_t weather_icon_resource(void)       { return icon_res(false); }
uint32_t weather_icon_resource_small(void) { return icon_res(true); }

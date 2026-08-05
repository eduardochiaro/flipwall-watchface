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
  PK_W_AQI,
  PK_W_SUNRISE,
  PK_W_SUNSET,
} WeatherPersistKey;

static bool s_have = false;
static int  s_temp, s_code, s_humidity, s_min, s_max, s_precip, s_uv, s_aqi;
// The next sunrise / sunset, in minutes since local midnight. Which day that
// is was decided on the phone; 0 means the API had none (polar day or night).
static int  s_sunrise, s_sunset;
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

// The whole reading: one row per value, tying its persist key to its variable.
// Load, receive and cache all just walk this. A field the cache predates simply
// reads back 0. The order is the wire order too: WEATHER_FIELDS in
// src/pkjs/modules/pack.js packs the blob in exactly this sequence.
static const struct { WeatherPersistKey pk; int *dst; } FIELDS[] = {
  { PK_W_TEMP,     &s_temp },
  { PK_W_CODE,     &s_code },
  { PK_W_HUMIDITY, &s_humidity },
  { PK_W_MIN,      &s_min },
  { PK_W_MAX,      &s_max },
  { PK_W_PRECIP,   &s_precip },
  { PK_W_UV,       &s_uv },
  { PK_W_WIND,     &s_wind },
  { PK_W_WIND_DIR, &s_wind_dir },
  { PK_W_AQI,      &s_aqi },
  { PK_W_SUNRISE,  &s_sunrise },
  { PK_W_SUNSET,   &s_sunset },
};
#define FIELD_COUNT (sizeof(FIELDS) / sizeof(FIELDS[0]))

void weather_init(void) {
  if (persist_exists(PK_W_UNITS)) s_imperial = persist_read_bool(PK_W_UNITS);
  if (!persist_exists(PK_W_VALID)) return;
  s_have = true;
  for (unsigned i = 0; i < FIELD_COUNT; i++)
    *FIELDS[i].dst = persist_read_int(FIELDS[i].pk);
}

void weather_set_units(bool imperial) {
  s_imperial = imperial;
  persist_write_bool(PK_W_UNITS, imperial);
}

// The packed reading (see packWeather in src/pkjs/modules/pack.js):
//   0     version
//   1..2  present mask, one bit per FIELDS entry
//   3..   the values, int16 each, in FIELDS order
// A field whose bit is clear was never asked of the API, so its cached value
// stays put — the phone only requests what the blocks on the face use.
#define WEATHER_BLOB_LEN (3 + 2 * (int)FIELD_COUNT)

bool weather_apply_blob(const uint8_t *p, uint16_t len) {
  if (!p || len < WEATHER_BLOB_LEN || p[0] != WIRE_VERSION) return false;
  uint16_t mask = (uint16_t)(p[1] | (p[2] << 8));

  for (unsigned i = 0; i < FIELD_COUNT; i++)
    if (mask & (1 << i)) *FIELDS[i].dst = wire_int16(p + 3 + 2 * i);

  s_have = true;
  persist_write_bool(PK_W_VALID, true);
  for (unsigned i = 0; i < FIELD_COUNT; i++)
    persist_write_int(FIELDS[i].pk, *FIELDS[i].dst);
  return true;
}

// Config saves, zone pushes and weather pushes all arrive on the same inbox;
// this takes the message only if it is a weather one.
bool weather_handle_message(DictionaryIterator *iter) {
  Tuple *t = dict_find(iter, MESSAGE_KEY_WEATHER);
  return t && weather_apply_blob(t->value->data, t->length);
}

// Every readout is its number formatted, or "--" until the first reading lands.
static void num_str(char *buf, size_t n, const char *fmt, int v) {
  if (s_have) snprintf(buf, n, fmt, v);
  else        snprintf(buf, n, "--");
}

void weather_temp_str(char *buf, size_t n) { num_str(buf, n, "%d°", temp_out(s_temp)); }
void weather_max_str(char *buf, size_t n)  { num_str(buf, n, "%d°", temp_out(s_max)); }
void weather_min_str(char *buf, size_t n)  { num_str(buf, n, "%d°", temp_out(s_min)); }
void weather_humidity_str(char *buf, size_t n) { num_str(buf, n, "%d%%", s_humidity); }
void weather_uv_str(char *buf, size_t n)   { num_str(buf, n, "%d", s_uv); }
// The scale (European 0..100+ or US 0..500) is picked on the phone; the watch
// just shows the number it was sent.
void weather_aqi_str(char *buf, size_t n)  { num_str(buf, n, "%d", s_aqi); }

void weather_minmax_str(char *buf, size_t n) {
  if (s_have) snprintf(buf, n, "%d/%d°", temp_out(s_max), temp_out(s_min));
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

// Minutes since midnight -> the wall clock, 12h dropping the hour's leading
// zero like the digital blocks do. The icon (or the big block's caption) says
// which event it is, so no AM/PM marker is drawn. 0 = the API had no such event
// today (polar day/night), which reads as "--" like a missing reading.
void weather_sun_str(char *buf, size_t n, bool sunset) {
  int m = sunset ? s_sunset : s_sunrise;
  if (!s_have || m <= 0 || m >= 24 * 60) { snprintf(buf, n, "--"); return; }
  if (clock_is_24h_style()) { snprintf(buf, n, "%02d:%02d", m / 60, m % 60); return; }
  int h12 = (m / 60) % 12;
  snprintf(buf, n, "%d:%02d", h12 ? h12 : 12, m % 60);
}

int32_t weather_wind_angle(void) {
  // The reported bearing is where the wind blows *from*; the arrow shows where
  // it blows *to*, so it points 180 degrees the other way.
  return TRIG_MAX_ANGLE * ((s_wind_dir + 180) % 360) / 360;
}

// Thresholds are the first value of each band, so the loop counts how many the
// reading has passed.
static int band_of(int v, const int *edges, int n) {
  int b = 0;
  while (b < n && v >= edges[b]) b++;
  return b;
}

int weather_uv_band(void) {
  static const int WHO[4] = { 3, 6, 8, 11 };   // moderate / high / very high / extreme
  return s_have ? band_of(s_uv, WHO, 4) : -1;
}

int weather_aqi_band(void) {
  static const int EU[5] = { 20, 40, 60, 80, 100 };     // fair..extremely poor
  static const int US[5] = { 51, 101, 151, 201, 301 };  // moderate..hazardous
  return s_have ? band_of(s_aqi, s_imperial ? US : EU, 5) : -1;
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

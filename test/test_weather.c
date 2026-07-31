// Host test for the weather module's pure logic. Run: test/run.sh
//
// The module is #included (not linked) so the test can set its file-static
// reading directly instead of faking an AppMessage dictionary.
#include <string.h>
#include "../src/c/modules/weather.c"

static int s_pass, s_fail;

static void group(const char *name) { printf("\n%s\n", name); }

// One check: prints the expression under test and what it produced, so a run
// reads as a description of the module's behaviour rather than a bare "ok".
static void check(bool ok, const char *what, const char *got, const char *want) {
  if (ok) { s_pass++; printf("  PASS %-44s %s\n", what, got); }
  else    { s_fail++; printf("  FAIL %-44s got %s, want %s\n", what, got, want); }
}

// `setup` is the input, run first and printed with the call, so each line reads
// "s_wind_dir = 292 -> weather_wind_dir_str  WNW".
#define EQ(setup, fn, want) do {                                   \
    setup;                                                         \
    char b[16], label[64];                                         \
    fn(b, sizeof b);                                               \
    snprintf(label, sizeof label, "%s -> %s", #setup, #fn);        \
    check(strcmp(b, want) == 0, label, b, want);                   \
  } while (0)

// Same, for an integer-valued expression.
#define EQ_INT(setup, expr, want) do {                             \
    setup;                                                         \
    char g[16], w[16], label[64];                                  \
    long v = (long)(expr), e = (long)(want);                       \
    snprintf(g, sizeof g, "%ld", v);                               \
    snprintf(w, sizeof w, "%ld", e);                               \
    snprintf(label, sizeof label, "%s -> %s", #setup, #expr);      \
    check(v == e, label, g, w);                                    \
  } while (0)

int main(void) {
  s_have = true;
  s_wind = 12; s_temp = 20; s_precip = 5; s_imperial = false;

  // The arrow points where the wind blows *to*, 180 from the reported bearing.
  group("wind arrow angle (bearing is where the wind blows FROM)");
  EQ_INT(s_wind_dir = 0,   weather_wind_angle(), TRIG_MAX_ANGLE / 2);      // -> S
  EQ_INT(s_wind_dir = 270, weather_wind_angle(), TRIG_MAX_ANGLE / 4);      // -> E
  EQ_INT(s_wind_dir = 180, weather_wind_angle(), 0);                       // -> N
  EQ_INT(s_wind_dir = 90,  weather_wind_angle(), TRIG_MAX_ANGLE * 3 / 4);  // -> W

  // ...while the compass word stays the direction the wind comes from.
  group("compass word (16-point, sectors centred on their name)");
  EQ(s_wind_dir = 0,   weather_wind_dir_str, "N");
  EQ(s_wind_dir = 349, weather_wind_dir_str, "N");     // sector wraps past 360
  EQ(s_wind_dir = 348, weather_wind_dir_str, "NNW");   // last degree below it
  EQ(s_wind_dir = 11,  weather_wind_dir_str, "N");
  EQ(s_wind_dir = 12,  weather_wind_dir_str, "NNE");
  EQ(s_wind_dir = 292, weather_wind_dir_str, "WNW");
  EQ(s_wind_dir = 180, weather_wind_dir_str, "S");

  group("air quality (scale chosen on the phone, watch shows the number)");
  EQ(s_aqi = 34,  weather_aqi_str, "34");
  EQ(s_aqi = 152, weather_aqi_str, "152");   // US scale runs to 500

  // Band index feeds the colour ramps in blocks.c (green -> purple / maroon).
  group("index bands");
  s_imperial = false;
  EQ_INT(s_uv = 0,   weather_uv_band(),  0);   // low       -> green
  EQ_INT(s_uv = 5,   weather_uv_band(),  1);   // moderate  -> yellow
  EQ_INT(s_uv = 11,  weather_uv_band(),  4);   // extreme   -> purple
  EQ_INT(s_aqi = 19, weather_aqi_band(), 0);   // European good
  EQ_INT(s_aqi = 20, weather_aqi_band(), 1);   // first fair value
  EQ_INT(s_aqi = 120, weather_aqi_band(), 5);  // extremely poor -> maroon
  s_imperial = true;
  EQ_INT(s_aqi = 50,  weather_aqi_band(), 0);  // US good (0..50)
  EQ_INT(s_aqi = 120, weather_aqi_band(), 2);  // unhealthy for sensitive groups
  EQ_INT(s_aqi = 400, weather_aqi_band(), 5);  // hazardous -> maroon
  s_imperial = false;
  EQ_INT(s_have = false, weather_uv_band(),  -1);   // no reading -> no colour
  EQ_INT((void)0,        weather_aqi_band(), -1);
  s_have = true;

  group("metric display");
  EQ(s_wind = 12,  weather_wind_str,   "12km/h");
  EQ(s_temp = 20,  weather_temp_str,   "20°");
  EQ(s_precip = 5, weather_precip_str, "5mm");

  group("imperial display");
  s_imperial = true;
  EQ(s_wind = 12,   weather_wind_str,   "7mph");    // 12 km/h = 7.46 mph
  EQ(s_temp = 20,   weather_temp_str,   "68°");
  EQ(s_precip = 5,  weather_precip_str, "0.2in");   // 5 mm = 0.197 in
  EQ(s_temp = -10,  weather_temp_str,   "14°");     // rounds away from zero

  group("no reading yet");
  EQ(s_have = false, weather_temp_str,     "--");
  EQ((void)0,        weather_wind_str,     "--");
  EQ((void)0,        weather_wind_dir_str, "--");
  EQ((void)0,        weather_precip_str,   "--");
  EQ((void)0,        weather_aqi_str,      "--");

  group("WMO code -> icon");
  EQ_INT(s_code = 0,  weather_icon_resource(),       RESOURCE_ID_ICON_SUNNY);
  EQ_INT(s_code = 0,  weather_icon_resource_small(), RESOURCE_ID_ICON_SUNNY_SMALL);
  EQ_INT(s_code = 95, weather_icon_resource(),       RESOURCE_ID_ICON_HEAVY_RAIN);
  EQ_INT(s_code = 7,  weather_icon_resource(),       RESOURCE_ID_ICON_GENERIC_WEATHER);

  printf("\n%d passed, %d failed\n", s_pass, s_fail);
  return s_fail != 0;
}

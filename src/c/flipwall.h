#pragma once
#include <pebble.h>
#include <pebble-fctx/fctx.h>
#include <pebble-fctx/ffont.h>

// ---------------------------------------------------------------------------
// Shared contract for the flip-wall-clock watchface modules.
//
//   colors.c   - pure colour helpers
//   lang.c     - localised month / weekday names
//   weather.c  - weather state (from the phone) + formatting + icon mapping
//   blocks.c   - drawing of every block + block-kind metadata
//   flipwall-watchface.c - app state, layout, settings, window, main()
//
// The shared mutable state (colours, fonts, current time, language) is defined
// once in flipwall-watchface.c and declared `extern` here so the drawing module
// can read it without it being passed through every call.
// ---------------------------------------------------------------------------

typedef enum {
  BLK_DOW,        // day of week (with AM/PM strip)
  BLK_DAY,        // day of month (big number)
  BLK_CLOCK,      // analog clock
  BLK_MONTH,      // month name
  BLK_STEPS,      // step count (Health)
  BLK_KM,         // distance walked (Health)
  BLK_BATTERY,    // battery level %
  BLK_YEAR,       // year (banner-only block)
  BLK_WEATHER,    // weather icon (big block)
  BLK_MONTH_DAY,  // "Jun 28" (banner-only)
  BLK_DOW_DAY,    // "Sat 28" (banner-only)
  // Weather data blocks. Appended last so persisted ints stay stable.
  BLK_TEMP,       // current temperature (small / banner)
  BLK_TEMP_BIG,   // current temperature (big)
  BLK_HUMIDITY,   // relative humidity % (small / banner)
  BLK_MINMAX,     // today's min/max temp (small / banner)
  BLK_PRECIP,     // precipitation mm (small / banner)
  BLK_DIGITAL,    // digital clock HH:MM (small / banner)
  BLK_DIGITAL_BIG,// digital clock, hours over minutes (big)
  BLK_HOURS,      // hours only, 2-digit (small)
  BLK_HOURS_BIG,  // hours only, 2-digit (big)
  BLK_MINUTES,    // minutes only, 2-digit (small)
  BLK_MINUTES_BIG,// minutes only, 2-digit (big)
  BLK_AMPM,       // AM (left) / PM (right), active bright, other dim (small)
  BLK_AMPM_STACK, // AM (top) / PM (bottom), active bright, other dim (small)
  BLK_HR,         // heart rate BPM (Health)
  BLK_TEMP_ICON,  // current temperature + weather icon (small / banner)
  BLK_CALENDAR,   // weekday over day-of-month, calendar style (big)
  // More big two-line blocks (caption over big value). Appended last so
  // persisted ints stay stable.
  BLK_HUMIDITY_BIG, // "Hum" over "47%" (big)
  BLK_BATTERY_BIG,  // "Batt" over "82%" (big)
  BLK_MONTH_CAL,    // month name over day-of-month, calendar style (big)
  BLK_HR_BIG,       // heart rate number over "BPM" (big)
  BLK_KM_BIG,       // distance number over unit (KM/M/MI) (big)
  BLK_MINMAX_BIG,   // today's max over min temp (big, min in accent)
  BLK_UV,           // UV icon + "7" - today's max UV index (small / banner)
  BLK_UV_BIG,       // UV index number over a "UV I" caption (big)
  BLK_WIND,         // wind speed + unit, "12km/h" (small / banner)
  BLK_WIND_BIG,     // wind speed number over its unit (big)
  BLK_WIND_DIR,     // wind arrow + compass word, "-> WNW" (small / banner)
  BLK_WIND_DIR_BIG, // big wind arrow over the compass word (big)
  BLK_AQI,          // air quality index, "AQI 42" (small / banner)
  BLK_AQI_BIG,      // air quality number over an "AQI" caption (big)
  // "- colour" variants: same drawing, but the panel is painted with the
  // index's own band colour (green -> purple for UV, green -> maroon for AQI)
  // instead of the configured panel colour. See block_panel_color in blocks.c.
  BLK_UV_COLOR,
  BLK_UV_BIG_COLOR,
  BLK_AQI_COLOR,
  BLK_AQI_BIG_COLOR,
  BLK_BEAT,       // Swatch Internet Time, "@642" (small / banner)
  BLK_BEAT_BIG,   // beat number over a ".beat" caption (big)
  BLK_DIGITAL_NOZERO, // digital clock, no leading zero but its width kept (small)
  BLK_DIGITAL_BIG_NOZERO, // hours over minutes, hour's leading zero dropped (big)
  BLK_STEPS_FULL, // step count, every digit ("8234") (small / banner)
  // Second time zone: the clock in this block's own zone, labelled with its UTC
  // offset ("+1") or its abbreviation ("PST"). Each slot carries its own zone
  // (see TZ_ZONE[n] in the config page), so a face can show several at once.
  BLK_TZ,           // "10:09 +1" (small / banner)
  BLK_TZ_ABBR,      // "10:09 PST" (small / banner)
  BLK_TZ_BIG,       // the time over a "+1" caption (big)
  BLK_TZ_BIG_ABBR,  // the time over a "PST" caption (big)
  // Three watch-status icons in a row: quiet time, charging, bluetooth. Each is
  // lit in the text colour when its status is on, ghosted in the panel's own
  // accent when off (see draw_utility in blocks.c).
  BLK_UTILITY,      // status icons (small)
  // The same second-zone clock with no label at all, just the time.
  BLK_TZ_NONE,      // "10:09" (small / banner)
  BLK_TZ_BIG_NONE,  // "10:09" (big)
  // A fixed string the wearer types on the config page, one per slot (TEXT[n]),
  // so a face can carry several different labels.
  BLK_TEXT,         // free text (small / banner)
  // Sunrise / sunset. The phone sends the *next* one of each (past 11am the
  // sunrise block already reads tomorrow's), so the watch only formats it.
  BLK_SUNRISE,      // sunrise icon + time (small / banner)
  BLK_SUNSET,       // time + sunset icon, mirrored (small / banner)
  BLK_SUNRISE_BIG,  // the time over a "Sunrise" caption (big)
  BLK_SUNSET_BIG,   // the time over a "Sunset" caption (big)
  BLK_COUNT,      // sentinel: how many block kinds there are
} QuadBlock;

// --- Localisation ----------------------------------------------------------
#define LANG_COUNT 10
const char *month_name(void);     // localised %b for s_now / s_lang
const char *wday_name(void);      // localised %a for s_now / s_lang
const char *humidity_label(void); // localised 2-letter humidity prefix ("Hu")
const char *humidity_label3(void);// localised 3-letter humidity caption ("Hum")
const char *battery_label(void);  // localised battery caption ("Batt")

// --- Colours ---------------------------------------------------------------
GColor get_closest_accent_color(GColor c);   // lighten dark / darken light
GColor contrast_color(GColor bg);            // black on light, white on dark

// --- Blocks ----------------------------------------------------------------
void draw_block(GContext *ctx, QuadBlock blk, GRect r);
// A banner panel: the block drawn as a pill hugging its text, centred in `band`.
void draw_band(GContext *ctx, GRect band, QuadBlock blk);
bool block_is_short(QuadBlock b);     // false = "big" (square) block
bool block_valid_grid(int v);         // may sit in the 2x2 grid
bool block_valid_band(int v);         // may sit in the banner

// --- Flip animation --------------------------------------------------------
// A grid block flips (collapses about its seam, then re-grows with the new
// value) only when its drawn text actually changes. Each grid layer carries a
// BlockState; blocks.c renders it flip-aware, watchface.c drives the countdown.
#define FLIP_STEPS 8           // frames per flip (~FLIP_STEPS * 40ms total)
#define TZ_ABBR_LEN 8          // "AEDT" and friends, with room to spare
typedef struct {
  QuadBlock blk;               // which block this layer shows (was the layer data)
  GColor    panel;             // this position's resolved panel colour
  uint8_t   pos;               // which BlockPos this layer is, for the zone tables
  bool      pill;              // draws as a text-hugging banner pill, not a block
  uint8_t   anim;              // 0 = idle, else countdown FLIP_STEPS..1
  char      shown[16];         // text currently on screen (empty = first paint)
  char      old[16];           // pre-flip text, shown during the collapse half
} BlockState;
void draw_block_layer(GContext *ctx, Layer *layer);  // flip-aware grid render
void flip_request(void);       // blocks.c -> watchface.c: start/keep flip timer

// --- Shared state (defined in flipwall-watchface.c) ------------------------
extern GColor s_face_bg, s_panel_bg, s_weekend_bg, s_text_fg;
extern FFont *s_ffont;   // single scalable vector font (fctx)
extern bool   is_large_screen;
// Absolute origin of the block layer currently drawing. fctx writes straight to
// the framebuffer and ignores the per-layer drawing offset, so the fctx text
// backend adds this; the graphics-API draws (panels, clock, icon) don't need it.
extern GPoint s_draw_origin;
extern bool   s_show_seconds;
extern bool   s_flip_enabled;   // config: animate blocks on value change
extern bool   s_seam_enabled;   // config: draw the seam line across blocks
extern int    s_lang;
// The second time zone of the block being drawn, pointed at that block's entry
// before its update_proc runs (like s_panel_bg). Minutes east of UTC with DST
// already applied, and the abbreviation, both resolved by the phone.
#define TZ_MAX_OFFSET (14 * 60)   // the furthest any real zone is from UTC
extern int         s_tz_offset;
extern const char *s_tz_abbr;
// The free text of the block being drawn, pointed at that block's entry the same
// way. 15 characters plus the terminator, which is what the config page allows.
#define TEXT_LEN 16
extern const char *s_text;
extern struct tm s_now;

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
  BLK_MINMAX,     // today's min/max temp (banner-only)
  BLK_PRECIP,     // precipitation mm (small / banner)
} QuadBlock;

// --- Localisation ----------------------------------------------------------
#define LANG_COUNT 10
const char *month_name(void);     // localised %b for s_now / s_lang
const char *wday_name(void);      // localised %a for s_now / s_lang
const char *humidity_label(void); // localised 2-letter humidity prefix ("Hu")

// --- Colours ---------------------------------------------------------------
GColor get_closest_accent_color(GColor c);   // lighten dark / darken light
GColor contrast_color(GColor bg);            // black on light, white on dark

// --- Blocks ----------------------------------------------------------------
void draw_block(GContext *ctx, QuadBlock blk, GRect r);
void draw_band(GContext *ctx, GRect band);   // the banner panel
bool block_is_short(QuadBlock b);     // false = "big" (square) block
bool block_valid_grid(int v);         // may sit in the 2x2 grid
bool block_valid_band(int v);         // may sit in the banner

// --- Shared state (defined in flipwall-watchface.c) ------------------------
extern GColor s_face_bg, s_panel_bg, s_weekend_bg, s_text_fg;
extern FFont *s_ffont;   // single scalable vector font (fctx)
extern bool   is_large_screen;
// Absolute origin of the block layer currently drawing. fctx writes straight to
// the framebuffer and ignores the per-layer drawing offset, so the fctx text
// backend adds this; the graphics-API draws (panels, clock, icon) don't need it.
extern GPoint s_draw_origin;
extern bool   s_show_seconds;
extern int    s_lang;
extern QuadBlock s_band_block;
extern struct tm s_now;

#include "flipwall.h"
#include "weather.h"

// ---------------------------------------------------------------------------
// Flip-wall-clock watchface
//
// Layout is data driven so blocks are easy to rearrange / swap:
//   - The banner block is full-width, placed at the top or bottom (s_year_top).
//   - The remaining four blocks fill a 2x2 grid (s_grid). Quadrants come in two
//     sizes (big square + short half), so any pair of same-size blocks swaps by
//     editing the grid.
//
// Drawing lives in blocks.c, colour helpers in colors.c, localisation in
// lang.c and weather state in weather.c. This file owns the shared state, the
// layout, the settings, and the app lifecycle.
// ---------------------------------------------------------------------------

// --- Configuration ---------------------------------------------------------
// Seeded from the defaults below and then overwritten by anything the companion
// (Clay) settings page has persisted. See settings_load().
static bool s_year_top = true;
QuadBlock   s_band_block = BLK_YEAR;   // banner content (year by default)
static QuadBlock s_grid[2][2] = {
  { BLK_DOW,   BLK_DAY   },   // top row
  { BLK_CLOCK, BLK_MONTH },   // bottom row
};
bool s_show_seconds = false;   // off by default (battery friendly)
int  s_lang = 0;               // 0 = English (see lang.c)

// --- Color defaults (used until the user overrides them) ------------------
#define FACE_BG      PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite)
#define PANEL_BG     GColorBlack
#define WEEKEND_BG   PBL_IF_COLOR_ELSE(GColorRed, GColorBlack)

// User-configurable colors (the three above-listed defaults at startup); text
// is derived from the panel background.
GColor s_face_bg, s_panel_bg, s_weekend_bg, s_text_fg;

bool is_large_screen = false;   // Pebble Time / Time 2 / Round screens

struct tm s_now;

// One scalable Montserrat Bold vector font (fctx); every block sizes it by
// cap height, so there are no per-screen font tiers to load.
FFont *s_ffont;

// Persistent-storage keys (independent of the AppMessage message keys).
typedef enum {
  PK_YEAR_TOP = 1,
  PK_BLOCK_TL,
  PK_BLOCK_TR,
  PK_BLOCK_BL,
  PK_BLOCK_BR,
  PK_FACE_COLOR,
  PK_PANEL_COLOR,
  PK_WEEKEND_COLOR,
  PK_TEXT_COLOR,  // reserved (text color now derived); keeps later keys stable
  PK_SHOW_SECONDS,
  PK_BAND_BLOCK,
  PK_LANG,
} PersistKey;

#if defined(PBL_PLATFORM_EMERY)
#define GUTTER 6   // emery is bigger; wider gap reads better
#else
#define GUTTER 3   // gap between panels (shows the face background)
#endif
#define MARGIN 3   // gap around the whole face

// Round faces (chalk / gabbro) clip the corners of the rectangular grid, so
// pull the whole layout in from the sides until the panels clear the circle.
#if defined(PBL_PLATFORM_GABBRO)
#define SIDE_MARGIN 30
#elif defined(PBL_PLATFORM_CHALK)
#define SIDE_MARGIN 22
#elif defined(PBL_PLATFORM_EMERY)
#define SIDE_MARGIN 4
#else
#define SIDE_MARGIN 0
#endif

static Window *s_window;
static Layer  *s_band_layer;          // the banner
static Layer  *s_grid_layer[2][2];    // the 2x2 grid; each holds a QuadBlock
static int     s_prev_yday = -1;      // for day-rollover detection
GPoint s_draw_origin;                 // abs origin of the block being drawn (for fctx)

// ---------------------------------------------------------------------------
// Per-block layers
//
// Each block is its own Layer so it repaints in isolation: the clock every
// minute (or second), the date blocks once a day, weather on a phone push,
// battery/steps on their service events. Frames don't overlap, so marking one
// block dirty skips every other block's (fctx) update_proc -- the point, for
// battery. The face colour is the window background, shown in the gutters and
// rounded corners, and never repainted.
// ---------------------------------------------------------------------------

static void band_layer_update(Layer *layer, GContext *ctx) {
  s_draw_origin = layer_get_frame(layer).origin;
  draw_band(ctx, layer_get_bounds(layer));
}

static void grid_layer_update(Layer *layer, GContext *ctx) {
  s_draw_origin = layer_get_frame(layer).origin;
  QuadBlock blk = *(QuadBlock *)layer_get_data(layer);
  draw_block(ctx, blk, layer_get_bounds(layer));
}

// Position every block layer and tag each grid layer with the block it shows.
// Runs once on load and again on a settings change -- never per tick.
static void layout(void) {
  GRect b = layer_get_bounds(window_get_root_layer(s_window));
  GRect inner = grect_inset(b, GEdgeInsets(MARGIN, MARGIN + SIDE_MARGIN));

  // The two columns fill the width. Tall blocks are square; short blocks are
  // half their height.
  int col_w   = (inner.size.w - GUTTER) / 2;
  int square  = col_w;
  int short_h = square / 2;
  int col_h   = square + GUTTER + short_h;
  int year_h  = square * 45 / 100;   // banner height

  // Centre the whole group (banner + grid) vertically in the face.
  int group_h = year_h + GUTTER + col_h;
  int top = inner.origin.y + (inner.size.h - group_h) / 2;
  // Round faces nudge the group up (banner top) / down (banner bottom) so the
  // full-width grid edge clears the bezel.
  // ponytail: round-bezel clearance knob. The up-nudge was clipping the top
  // banner, so it's reduced; raise the magnitude again if the grid edge clips.
#if defined(PBL_PLATFORM_GABBRO)
  top += s_year_top ? -10 : 20;
#elif defined(PBL_PLATFORM_CHALK)
  top += s_year_top ? -5 : 10;
#endif

  GRect band, area;
  if (s_year_top) {
    band = GRect(inner.origin.x, top, inner.size.w, year_h);
    area = GRect(inner.origin.x, top + year_h + GUTTER, inner.size.w, col_h);
  } else {
    area = GRect(inner.origin.x, top, inner.size.w, col_h);
    band = GRect(inner.origin.x, top + col_h + GUTTER, inner.size.w, year_h);
  }
  layer_set_frame(s_band_layer, band);

  // Each column pairs a square block with a short block; s_grid decides which
  // sits on top. Both columns total the same height, so they align.
  for (int col = 0; col < 2; col++) {
    QuadBlock top_blk = s_grid[0][col];
    QuadBlock bot_blk = s_grid[1][col];
    int top_h, bot_h;
    if (block_is_short(top_blk) == block_is_short(bot_blk)) {
      top_h = (col_h - GUTTER) / 2;          // fallback: equal split
      bot_h = col_h - GUTTER - top_h;
    } else if (block_is_short(top_blk)) {
      top_h = short_h; bot_h = square;       // short on top, square below
    } else {
      top_h = square;  bot_h = short_h;      // square on top, short below
    }
    int x = area.origin.x + col * (col_w + GUTTER);
    layer_set_frame(s_grid_layer[0][col], GRect(x, area.origin.y, col_w, top_h));
    layer_set_frame(s_grid_layer[1][col],
                    GRect(x, area.origin.y + top_h + GUTTER, col_w, bot_h));
    *(QuadBlock *)layer_get_data(s_grid_layer[0][col]) = top_blk;
    *(QuadBlock *)layer_get_data(s_grid_layer[1][col]) = bot_blk;
  }

  // Reframing marks frames dirty; force the kinds/colours to repaint too.
  layer_mark_dirty(s_band_layer);
  for (int r = 0; r < 2; r++)
    for (int c = 0; c < 2; c++) layer_mark_dirty(s_grid_layer[r][c]);
}

// What real-world change forces a given block to repaint.
typedef enum { TRG_DATE, TRG_CLOCK, TRG_HEALTH, TRG_BATTERY, TRG_WEATHER } Trigger;

static Trigger block_trigger(QuadBlock b) {
  switch (b) {
    case BLK_CLOCK:
    case BLK_DIGITAL:
    case BLK_DIGITAL_BIG: return TRG_CLOCK;
    case BLK_STEPS:
    case BLK_KM:       return TRG_HEALTH;
    case BLK_BATTERY:  return TRG_BATTERY;
    case BLK_WEATHER:
    case BLK_TEMP:
    case BLK_TEMP_BIG:
    case BLK_HUMIDITY:
    case BLK_MINMAX:
    case BLK_PRECIP:   return TRG_WEATHER;
    default:           return TRG_DATE;   // dow / day / month / year / *_day
  }
}

// Repaint only the placed blocks driven by `t`.
static void mark_blocks(Trigger t) {
  if (block_trigger(s_band_block) == t) layer_mark_dirty(s_band_layer);
  for (int r = 0; r < 2; r++)
    for (int c = 0; c < 2; c++)
      if (block_trigger(s_grid[r][c]) == t) layer_mark_dirty(s_grid_layer[r][c]);
}

static bool clock_present(void) {
  for (int r = 0; r < 2; r++)
    for (int c = 0; c < 2; c++)
      if (s_grid[r][c] == BLK_CLOCK) return true;
  return false;
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  s_now = *tick_time;
  mark_blocks(TRG_CLOCK);
  if (s_now.tm_yday != s_prev_yday) {   // crossed midnight
    s_prev_yday = s_now.tm_yday;
    mark_blocks(TRG_DATE);
  }
}

static void battery_handler(BatteryChargeState state) { mark_blocks(TRG_BATTERY); }

#if defined(PBL_HEALTH)
static void health_handler(HealthEventType event, void *ctx) {
  if (event == HealthEventMovementUpdate || event == HealthEventSignificantUpdate)
    mark_blocks(TRG_HEALTH);
}
#endif

// ---------------------------------------------------------------------------
// Settings (Clay config page <-> persistent storage)
// ---------------------------------------------------------------------------

// Second ticks only when the seconds hand is shown AND a clock is actually
// placed; minute ticks otherwise (which also catch the day rollover).
static void apply_tick_interval(void) {
  bool secs = s_show_seconds && clock_present();
  tick_timer_service_subscribe(secs ? SECOND_UNIT : MINUTE_UNIT, tick_handler);
}

static QuadBlock read_block(PersistKey key, QuadBlock def) {
  if (!persist_exists(key)) return def;
  int v = persist_read_int(key);
  return block_valid_grid(v) ? (QuadBlock)v : def;
}

// Seed runtime config from persisted values, falling back to the compile-time
// defaults on first run.
static void settings_load(void) {
  s_year_top     = persist_exists(PK_YEAR_TOP)     ? persist_read_bool(PK_YEAR_TOP) : true;
  s_show_seconds = persist_exists(PK_SHOW_SECONDS) ? persist_read_bool(PK_SHOW_SECONDS) : false;

  s_lang = persist_exists(PK_LANG) ? persist_read_int(PK_LANG) : 0;
  if (s_lang < 0 || s_lang >= LANG_COUNT) s_lang = 0;

  s_band_block = (persist_exists(PK_BAND_BLOCK) &&
                  block_valid_band(persist_read_int(PK_BAND_BLOCK)))
                     ? (QuadBlock)persist_read_int(PK_BAND_BLOCK)
                     : BLK_YEAR;

  s_grid[0][0] = read_block(PK_BLOCK_TL, BLK_DOW);
  s_grid[0][1] = read_block(PK_BLOCK_TR, BLK_DAY);
  s_grid[1][0] = read_block(PK_BLOCK_BL, BLK_CLOCK);
  s_grid[1][1] = read_block(PK_BLOCK_BR, BLK_MONTH);

  s_face_bg    = persist_exists(PK_FACE_COLOR)    ? GColorFromHEX(persist_read_int(PK_FACE_COLOR))    : (GColor)FACE_BG;
  s_panel_bg   = persist_exists(PK_PANEL_COLOR)   ? GColorFromHEX(persist_read_int(PK_PANEL_COLOR))   : (GColor)PANEL_BG;
  s_weekend_bg = persist_exists(PK_WEEKEND_COLOR) ? GColorFromHEX(persist_read_int(PK_WEEKEND_COLOR)) : (GColor)WEEKEND_BG;
  // ponytail: text contrast is derived from the panel bg, not configurable.
  // Weekend dow text reuses it; only wrong if panel/weekend differ in luminance.
  s_text_fg    = contrast_color(s_panel_bg);
}

static void apply_bool(DictionaryIterator *iter, uint32_t msg_key,
                       PersistKey pk, bool *out) {
  Tuple *t = dict_find(iter, msg_key);
  if (!t) return;
  *out = t->value->int32 != 0;
  persist_write_bool(pk, *out);
}

static void apply_block(DictionaryIterator *iter, uint32_t msg_key,
                        PersistKey pk, QuadBlock *out) {
  Tuple *t = dict_find(iter, msg_key);
  if (!t) return;
  int v = t->value->int32;
  if (!block_valid_grid(v)) return;
  *out = (QuadBlock)v;
  persist_write_int(pk, v);
}

static void apply_band(DictionaryIterator *iter, uint32_t msg_key,
                       PersistKey pk, QuadBlock *out) {
  Tuple *t = dict_find(iter, msg_key);
  if (!t) return;
  int v = t->value->int32;
  if (!block_valid_band(v)) return;
  *out = (QuadBlock)v;
  persist_write_int(pk, v);
}

static void apply_color(DictionaryIterator *iter, uint32_t msg_key,
                        PersistKey pk, GColor *out) {
  Tuple *t = dict_find(iter, msg_key);
  if (!t) return;
  int hex = t->value->int32;
  *out = GColorFromHEX(hex);
  persist_write_int(pk, hex);
}

// Both Clay config saves and weather pushes arrive on this inbox.
static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  if (weather_handle_message(iter)) {
    mark_blocks(TRG_WEATHER);   // repaint only the weather blocks
    return;   // a weather push carries no config keys
  }

  apply_bool(iter, MESSAGE_KEY_YEAR_TOP, PK_YEAR_TOP, &s_year_top);
  apply_band(iter, MESSAGE_KEY_BLOCK_BAND, PK_BAND_BLOCK, &s_band_block);

  Tuple *lang_t = dict_find(iter, MESSAGE_KEY_LANG);
  if (lang_t) {
    int v = lang_t->value->int32;
    if (v >= 0 && v < LANG_COUNT) { s_lang = v; persist_write_int(PK_LANG, v); }
  }

  apply_block(iter, MESSAGE_KEY_BLOCK_TOP_LEFT,     PK_BLOCK_TL, &s_grid[0][0]);
  apply_block(iter, MESSAGE_KEY_BLOCK_TOP_RIGHT,    PK_BLOCK_TR, &s_grid[0][1]);
  apply_block(iter, MESSAGE_KEY_BLOCK_BOTTOM_LEFT,  PK_BLOCK_BL, &s_grid[1][0]);
  apply_block(iter, MESSAGE_KEY_BLOCK_BOTTOM_RIGHT, PK_BLOCK_BR, &s_grid[1][1]);

  apply_color(iter, MESSAGE_KEY_FACE_COLOR,    PK_FACE_COLOR,    &s_face_bg);
  apply_color(iter, MESSAGE_KEY_PANEL_COLOR,   PK_PANEL_COLOR,   &s_panel_bg);
  apply_color(iter, MESSAGE_KEY_WEEKEND_COLOR, PK_WEEKEND_COLOR, &s_weekend_bg);
  s_text_fg = contrast_color(s_panel_bg);

  apply_bool(iter, MESSAGE_KEY_SHOW_SECONDS, PK_SHOW_SECONDS, &s_show_seconds);

  Tuple *units_t = dict_find(iter, MESSAGE_KEY_UNITS);
  if (units_t) weather_set_units(units_t->value->int32 != 0);

  // Layout, block kinds, seconds and clock placement may all have changed.
  window_set_background_color(s_window, s_face_bg);
  apply_tick_interval();
  layout();   // reframes + retags + repaints every block
}

static void prv_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  is_large_screen = (layer_get_bounds(root).size.w >= 200);

  // aplite is too small for the vector font; it uses system fonts (see blocks.c).
#if !PBL_PLATFORM_APLITE
  s_ffont = ffont_create_from_resource(RESOURCE_ID_FONT_MONTSERRAT_FFONT);
#endif

  time_t now = time(NULL);
  s_now = *localtime(&now);
  s_prev_yday = s_now.tm_yday;

  // One Layer per block (frames assigned by layout()). Grid layers carry the
  // QuadBlock they render so each repaints independently.
  s_band_layer = layer_create(GRect(0, 0, 2, 2));
  layer_set_update_proc(s_band_layer, band_layer_update);
  layer_add_child(root, s_band_layer);
  for (int r = 0; r < 2; r++) {
    for (int c = 0; c < 2; c++) {
      s_grid_layer[r][c] =
          layer_create_with_data(GRect(0, 0, 2, 2), sizeof(QuadBlock));
      layer_set_update_proc(s_grid_layer[r][c], grid_layer_update);
      layer_add_child(root, s_grid_layer[r][c]);
    }
  }

  layout();

  battery_state_service_subscribe(battery_handler);
#if defined(PBL_HEALTH)
  health_service_events_subscribe(health_handler, NULL);
#endif
}

static void prv_window_unload(Window *window) {
  battery_state_service_unsubscribe();
#if defined(PBL_HEALTH)
  health_service_events_unsubscribe();
#endif
#if !PBL_PLATFORM_APLITE
  ffont_destroy(s_ffont);
#endif
  layer_destroy(s_band_layer);
  for (int r = 0; r < 2; r++)
    for (int c = 0; c < 2; c++) layer_destroy(s_grid_layer[r][c]);
}

static void prv_init(void) {
  settings_load();
  weather_init();

  s_window = window_create();
  window_set_background_color(s_window, s_face_bg);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  window_stack_push(s_window, true);
  apply_tick_interval();

  app_message_register_inbox_received(inbox_received_handler);
  // We only receive (Clay config ~18 small keys, or a 6-int weather push) and
  // never send, so a right-sized inbox frees heap that the vector font needs
  // (critical on aplite's ~12KB heap). Outbox is minimal.
  app_message_open(1024, 64);
}

static void prv_deinit(void) {
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}

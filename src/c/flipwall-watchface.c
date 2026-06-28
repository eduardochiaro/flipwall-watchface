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

// All text uses bundled Montserrat Bold so the design is consistent across
// platforms; sizes are picked per screen tier in prv_window_load().
GFont s_font_num;     // big day number
GFont s_font_txt;     // month
GFont s_font_txt_sm;  // year, day-of-week
GFont s_font_sml;     // AM/PM indicator

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
static Layer  *s_main_layer;

// ---------------------------------------------------------------------------
// Layout + main update
// ---------------------------------------------------------------------------

static void main_layer_update(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);

  // Face background.
  graphics_context_set_fill_color(ctx, s_face_bg);
  graphics_fill_rect(ctx, b, 0, GCornerNone);

  GRect inner = grect_inset(b, GEdgeInsets(MARGIN, MARGIN + SIDE_MARGIN));

  // The two columns fill the width. The tall blocks are square; the short
  // blocks are half their height.
  int col_w   = (inner.size.w - GUTTER) / 2;
  int square  = col_w;
  int short_h = square / 2;
  int col_h   = square + GUTTER + short_h;

  // Year band height comes from the year text itself (plus a little padding).
  char yb[8];
  strftime(yb, sizeof(yb), "%Y", &s_now);
  GSize ys = graphics_text_layout_get_content_size(
      yb, s_font_txt, inner,
      GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter);
  int year_h = ys.h + 6;

  // Centre the whole group (year band + grid) vertically in the face.
  int group_h = year_h + GUTTER + col_h;
  int top = inner.origin.y + (inner.size.h - group_h) / 2;

  // Round faces nudge the whole group up when the banner is on top (and down
  // when it's at the bottom) so the full-width grid edge clears the bezel.
#if defined(PBL_PLATFORM_GABBRO)
  top += s_year_top ? -20 : 20;
#elif defined(PBL_PLATFORM_CHALK)
  top += s_year_top ? -10 : 10;
#endif

  GRect band, area;
  if (s_year_top) {
    band = GRect(inner.origin.x, top, inner.size.w, year_h);
    area = GRect(inner.origin.x, top + year_h + GUTTER, inner.size.w, col_h);
  } else {
    area = GRect(inner.origin.x, top, inner.size.w, col_h);
    band = GRect(inner.origin.x, top + col_h + GUTTER, inner.size.w, year_h);
  }

  draw_band(ctx, band);

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
    draw_block(ctx, top_blk, GRect(x, area.origin.y, col_w, top_h));
    draw_block(ctx, bot_blk,
               GRect(x, area.origin.y + top_h + GUTTER, col_w, bot_h));
  }
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  s_now = *tick_time;
  layer_mark_dirty(s_main_layer);
}

// ---------------------------------------------------------------------------
// Settings (Clay config page <-> persistent storage)
// ---------------------------------------------------------------------------

// Ticking every second is only needed when the seconds hand is shown; fall
// back to minute ticks otherwise to save battery.
static void apply_tick_interval(void) {
  tick_timer_service_subscribe(s_show_seconds ? SECOND_UNIT : MINUTE_UNIT,
                               tick_handler);
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
    layer_mark_dirty(s_main_layer);
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

  bool was_seconds = s_show_seconds;
  apply_bool(iter, MESSAGE_KEY_SHOW_SECONDS, PK_SHOW_SECONDS, &s_show_seconds);
  if (s_show_seconds != was_seconds) {
    apply_tick_interval();
  }

  window_set_background_color(s_window, s_face_bg);
  layer_mark_dirty(s_main_layer);
}

static void prv_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_main_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_main_layer, main_layer_update);
  layer_add_child(root, s_main_layer);

  is_large_screen = (layer_get_bounds(root).size.w > 144);

#if defined(PBL_PLATFORM_EMERY)
  s_font_num = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_NUM_64));
  s_font_txt = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_36));
  s_font_txt_sm = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_26));
  s_font_sml = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_SML_10));
#elif defined(PBL_PLATFORM_GABBRO)
  // 260x260 round: blocks are ~95px, so the fonts are bumped above even emery's.
  s_font_num = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_NUM_64));
  s_font_txt = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_38));
  s_font_txt_sm = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_26));
  s_font_sml = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_SML_12));
#elif defined(PBL_PLATFORM_CHALK)
  // 180x180 round with a wide side margin: blocks are ~55px, smaller than
  // basalt's, so the fonts step down a tier.
  s_font_num = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_NUM_40));
  s_font_txt = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_24));
  s_font_txt_sm = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_17));
  s_font_sml = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_SML_8));
#else
  s_font_num = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_NUM_44));
  s_font_txt = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_26));
  s_font_txt_sm = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TXT_18));
  s_font_sml = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_SML_8));
#endif

  time_t now = time(NULL);
  s_now = *localtime(&now);
}

static void prv_window_unload(Window *window) {
  fonts_unload_custom_font(s_font_num);
  fonts_unload_custom_font(s_font_txt);
  fonts_unload_custom_font(s_font_sml);
  fonts_unload_custom_font(s_font_txt_sm);
  layer_destroy(s_main_layer);
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
  app_message_open(app_message_inbox_size_maximum(), 0);
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

#include <pebble.h>

// ---------------------------------------------------------------------------
// Flip-wall-clock watchface
//
// Layout is data driven so blocks are easy to rearrange / swap:
//   - The Year block is a full-width banner, placed at the top or bottom
//     (s_year_top).
//   - The remaining four blocks fill a 2x2 grid (s_grid). Every quadrant is
//     the same size, so Day <-> Clock and Month <-> DoW (or any other pair)
//     can be swapped just by editing the grid.
// ---------------------------------------------------------------------------

typedef enum {
  BLK_DOW,    // day of week (with AM/PM strip)
  BLK_DAY,    // day of month (big number)
  BLK_CLOCK,  // analog clock
  BLK_MONTH,  // month name
} QuadBlock;

// --- Configuration ---------------------------------------------------------
// These are seeded from the defaults below and then overwritten by anything
// the companion (Clay) settings page has persisted. See settings_load().
static bool s_year_top = true;
static QuadBlock s_grid[2][2] = {
  { BLK_DOW,   BLK_DAY   },   // top row
  { BLK_CLOCK, BLK_MONTH },   // bottom row
};
static bool s_show_seconds = false;   // off by default (battery friendly)

// --- Colour defaults (used until the user overrides them) ------------------
#define FACE_BG      PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite)
#define PANEL_BG     GColorBlack
#define WEEKEND_BG   PBL_IF_COLOR_ELSE(GColorRed, GColorBlack)
#define TEXT_FG      GColorWhite
#define SEAM_COLOR   GColorDarkGray
#define SECOND_FG    PBL_IF_COLOR_ELSE(GColorRed, GColorWhite)
#define DIM_FG       GColorDarkGray

// User-configurable colours (the four above-listed defaults at startup).
static GColor s_face_bg;
static GColor s_panel_bg;
static GColor s_weekend_bg;
static GColor s_text_fg;

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
  PK_TEXT_COLOR,
  PK_SHOW_SECONDS,
} PersistKey;

#if defined(PBL_PLATFORM_EMERY)
#define GUTTER 6   // emery is bigger; wider gap reads better
#else
#define GUTTER 3   // gap between panels (shows the face background)
#endif
#define MARGIN 3   // gap around the whole face

// Round faces (chalk / gabbro) clip the corners of the rectangular grid, so
// pull the whole layout in from the sides until the panels clear the circle.
// Emery (Pebble Time 2) is physically wider; give it a smaller nudge so the
// panels don't run to the very edge.
// Chalk gets a smaller side margin than gabbro because the vertical nudge in
// main_layer_update (year-top group shifted up) pulls the full-width grid edge
// back toward the centre, freeing up corner room for wider blocks.
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
static struct tm s_now;

// All text uses bundled Montserrat Bold so the design is consistent across
// platforms; sizes are picked per screen tier in prv_window_load().
static GFont s_font_num;   // big day number
static GFont s_font_txt;   // month
static GFont s_font_txt_sm; // year, day-of-week
static GFont s_font_sml;   // AM/PM indicator

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// Draw text optically centred inside a rect. Pebble fonts carry internal
// leading (padding above the caps), so a plain box-centre leaves the glyphs
// sitting low; nudge up by a fraction of the line height to compensate.
static void draw_centered(GContext *ctx, GRect r, const char *txt, GFont font,
                          GColor color, GTextAlignment align) {
  graphics_context_set_text_color(ctx, color);
  GSize sz = graphics_text_layout_get_content_size(
      txt, font, r, GTextOverflowModeTrailingEllipsis, align);
  GRect tr = r;
  tr.origin.y += (r.size.h - sz.h) / 2 - sz.h / 6;
  tr.size.h = sz.h + 4;
  graphics_draw_text(ctx, txt, font, tr, GTextOverflowModeTrailingEllipsis,
                     align, NULL);
}

// The thin dark line across the middle that sells the "flip display" look.
static void draw_seam(GContext *ctx, GRect r) {
  int mid = r.origin.y + r.size.h / 2;
  graphics_context_set_fill_color(ctx, SEAM_COLOR);
  graphics_fill_rect(ctx, GRect(r.origin.x + 2, mid, r.size.w - 4, 1), 0,
                     GCornerNone);
}

static void draw_panel(GContext *ctx, GRect r, GColor bg) {
  graphics_context_set_fill_color(ctx, bg);
  graphics_fill_rect(ctx, r, 4, GCornersAll);
}

// Small AM/PM label tucked into a top or bottom corner of the DoW block, in
// the empty row above/below the vertically-centred word (so it never collides).
static void draw_ampm(GContext *ctx, GRect r, const char *txt, bool top,
                      GColor color) {
  const int h = 14;
  // On the taller gabbro block the bottom (PM) label sits a touch low; lift it.
#if defined(PBL_PLATFORM_GABBRO)
  const int bottom_lift = 6;
#else
  const int bottom_lift = 0;
#endif
  int y = top ? r.origin.y + 2
              : r.origin.y + r.size.h - h + 1 - bottom_lift;
  graphics_context_set_text_color(ctx, color);
  graphics_draw_text(ctx, txt, s_font_sml,
                     GRect(r.origin.x, y, r.size.w - 3, h),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
}

// ---------------------------------------------------------------------------
// Individual blocks
// ---------------------------------------------------------------------------

// The year sits in a horizontal band but the panel itself is only a little
// wider than the "2020" text (not full width), centred in that band. The
// panel fills the band's height (which the caller sizes to the text).
static void draw_year(GContext *ctx, GRect band) {
  char buf[8];
  strftime(buf, sizeof(buf), "%Y", &s_now);
  GFont font = s_font_txt_sm;
  GSize sz = graphics_text_layout_get_content_size(
      buf, font, band, GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter);

  const int pad_x = 6;
  GRect r;
  r.size.w = sz.w + pad_x * 2;
  r.size.h = band.size.h;
  r.origin.x = band.origin.x + (band.size.w - r.size.w) / 2;
  r.origin.y = band.origin.y;

  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, font, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

static void draw_day(GContext *ctx, GRect r) {
  char buf[4];
  snprintf(buf, sizeof(buf), "%d", s_now.tm_mday);
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, s_font_num, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

static void draw_month(GContext *ctx, GRect r) {
  char buf[8];
  strftime(buf, sizeof(buf), "%b", &s_now);
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, s_font_txt, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

static void draw_dow(GContext *ctx, GRect r) {
  char buf[8];
  strftime(buf, sizeof(buf), "%a", &s_now);     // title case "Mon" (matches "Jun")
  bool weekend = (s_now.tm_wday == 0 || s_now.tm_wday == 6);
  draw_panel(ctx, r, weekend ? s_weekend_bg : s_panel_bg);

  // Day-of-week uses the full block width. add a little padding to the left so the AM/PM label doesn't collide with the text.
  GRect newr = r;
  newr.origin.x += 4;
  newr.size.w -= 4;
  draw_centered(ctx, newr, buf, s_font_txt_sm, s_text_fg, GTextAlignmentLeft);

  // AM top-right, PM bottom-right; the active one is bright.
  bool is_pm = s_now.tm_hour >= 12;
  draw_ampm(ctx, r, "AM", true,  is_pm ? DIM_FG : s_text_fg);
  draw_ampm(ctx, r, "PM", false, is_pm ? s_text_fg : DIM_FG);

  draw_seam(ctx, r);
}

static GPoint hand_point(GPoint c, int32_t angle, int length) {
  return GPoint(c.x + length * sin_lookup(angle) / TRIG_MAX_RATIO,
                c.y - length * cos_lookup(angle) / TRIG_MAX_RATIO);
}

static void draw_clock(GContext *ctx, GRect r) {
  GPoint c = grect_center_point(&r);
  int radius = (r.size.w < r.size.h ? r.size.w : r.size.h) / 2 - 1;

  // Round panel background (no seam, unlike the flip blocks).
  graphics_context_set_fill_color(ctx, s_panel_bg);
  graphics_fill_circle(ctx, c, radius);
  radius -= 4;  // keep ticks/hands inside the dial

  // tick marks
  graphics_context_set_stroke_color(ctx, s_text_fg);
  graphics_context_set_stroke_width(ctx, 1);
  for (int i = 0; i < 12; i++) {
    int32_t a = TRIG_MAX_ANGLE * i / 12;
    int inner = radius - ((i % 3 == 0) ? 5 : 3);
    graphics_draw_line(ctx, hand_point(c, a, inner), hand_point(c, a, radius));
  }

  int32_t min_a  = TRIG_MAX_ANGLE * s_now.tm_min / 60;
  int32_t hour_a = TRIG_MAX_ANGLE * ((s_now.tm_hour % 12) * 60 + s_now.tm_min) /
                   (12 * 60);

  // hour + minute hands
  graphics_context_set_stroke_color(ctx, s_text_fg);
  graphics_context_set_stroke_width(ctx, 3);
  graphics_draw_line(ctx, c, hand_point(c, hour_a, radius * 1 / 2));
  graphics_draw_line(ctx, c, hand_point(c, min_a, radius * 4 / 5));

  // second hand (optional)
  if (s_show_seconds) {
    int32_t sec_a = TRIG_MAX_ANGLE * s_now.tm_sec / 60;
    graphics_context_set_stroke_color(ctx, SECOND_FG);
    graphics_context_set_stroke_width(ctx, 1);
    graphics_draw_line(ctx, c, hand_point(c, sec_a, radius * 9 / 10));
  }

  // hub
  graphics_context_set_fill_color(ctx, SECOND_FG);
  graphics_fill_circle(ctx, c, 2);
}

static void draw_block(GContext *ctx, QuadBlock blk, GRect r) {
  switch (blk) {
    case BLK_DOW:   draw_dow(ctx, r);   break;
    case BLK_DAY:   draw_day(ctx, r);   break;
    case BLK_CLOCK: draw_clock(ctx, r); break;
    case BLK_MONTH: draw_month(ctx, r); break;
  }
}

// ---------------------------------------------------------------------------
// Layout + main update
// ---------------------------------------------------------------------------

// Day and Clock are "tall" blocks; Month and DoW are "short" (half height).
static bool block_is_short(QuadBlock b) {
  return b == BLK_DOW || b == BLK_MONTH;
}

static void main_layer_update(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);

  // Face background.
  graphics_context_set_fill_color(ctx, s_face_bg);
  graphics_fill_rect(ctx, b, 0, GCornerNone);

  GRect inner = grect_inset(b, GEdgeInsets(MARGIN, MARGIN + SIDE_MARGIN));

  // The two columns fill the width. The tall blocks (Day, Clock) are square;
  // the short blocks (Month, DoW) are half their height.
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

  // Round faces nudge the whole group up when the year banner is on top (and
  // down when it's at the bottom) so the full-width grid edge sits closer to
  // the centre and clears the circular bezel.
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

  draw_year(ctx, band);

  // Each column pairs a square block (Day/Clock) with a short block
  // (Month/DoW); s_grid decides which sits on top. Both columns total the
  // same height, so they align.
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
  return (v >= BLK_DOW && v <= BLK_MONTH) ? (QuadBlock)v : def;
}

// Seed runtime config from persisted values, falling back to the compile-time
// defaults on first run.
static void settings_load(void) {
  s_year_top     = persist_exists(PK_YEAR_TOP)     ? persist_read_bool(PK_YEAR_TOP) : true;
  s_show_seconds = persist_exists(PK_SHOW_SECONDS) ? persist_read_bool(PK_SHOW_SECONDS) : false;

  s_grid[0][0] = read_block(PK_BLOCK_TL, BLK_DOW);
  s_grid[0][1] = read_block(PK_BLOCK_TR, BLK_DAY);
  s_grid[1][0] = read_block(PK_BLOCK_BL, BLK_CLOCK);
  s_grid[1][1] = read_block(PK_BLOCK_BR, BLK_MONTH);

  s_face_bg    = persist_exists(PK_FACE_COLOR)    ? GColorFromHEX(persist_read_int(PK_FACE_COLOR))    : (GColor)FACE_BG;
  s_panel_bg   = persist_exists(PK_PANEL_COLOR)   ? GColorFromHEX(persist_read_int(PK_PANEL_COLOR))   : (GColor)PANEL_BG;
  s_weekend_bg = persist_exists(PK_WEEKEND_COLOR) ? GColorFromHEX(persist_read_int(PK_WEEKEND_COLOR)) : (GColor)WEEKEND_BG;
  s_text_fg    = persist_exists(PK_TEXT_COLOR)    ? GColorFromHEX(persist_read_int(PK_TEXT_COLOR))    : (GColor)TEXT_FG;
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
  if (v < BLK_DOW || v > BLK_MONTH) return;
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

// Clay forwards every messageKey when the config page is saved.
static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  apply_bool(iter, MESSAGE_KEY_YEAR_TOP, PK_YEAR_TOP, &s_year_top);

  apply_block(iter, MESSAGE_KEY_BLOCK_TOP_LEFT,     PK_BLOCK_TL, &s_grid[0][0]);
  apply_block(iter, MESSAGE_KEY_BLOCK_TOP_RIGHT,    PK_BLOCK_TR, &s_grid[0][1]);
  apply_block(iter, MESSAGE_KEY_BLOCK_BOTTOM_LEFT,  PK_BLOCK_BL, &s_grid[1][0]);
  apply_block(iter, MESSAGE_KEY_BLOCK_BOTTOM_RIGHT, PK_BLOCK_BR, &s_grid[1][1]);

  apply_color(iter, MESSAGE_KEY_FACE_COLOR,    PK_FACE_COLOR,    &s_face_bg);
  apply_color(iter, MESSAGE_KEY_PANEL_COLOR,   PK_PANEL_COLOR,   &s_panel_bg);
  apply_color(iter, MESSAGE_KEY_WEEKEND_COLOR, PK_WEEKEND_COLOR, &s_weekend_bg);
  apply_color(iter, MESSAGE_KEY_TEXT_COLOR,    PK_TEXT_COLOR,    &s_text_fg);

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

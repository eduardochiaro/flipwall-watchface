#include "flipwall.h"
#include "modules/weather.h"

// ---------------------------------------------------------------------------
// Flip-wall-clock watchface
//
// Layout is data driven so blocks are easy to rearrange / swap. There are two
// layouts, picked in the config page (s_layout):
//
//   LAYOUT_CLASSIC (5 blocks) - a text-hugging banner pill at the top or bottom
//     (s_year_top) plus a 2x2 grid. Each grid column pairs one big (square)
//     block with one short (half-height) one, so both columns line up.
//
//   LAYOUT_SIX (6 blocks) - the banner becomes a real block and a sixth block
//     joins it. On rectangular screens the face is two square-tall rows, each
//     holding one big block beside two stacked short ones. Round screens can't
//     take a full-width row, so there the extra row splits: one short block in a
//     strip above the 2x2 grid and one below, which keeps the circular shape.
//
// Both layouts address the same six positions (see BlockPos), so switching
// keeps every block choice and colour.
//
// Drawing lives in blocks.c, colour helpers in colors.c, localisation in
// lang.c and weather state in weather.c. This file owns the shared state, the
// layout, the settings, and the app lifecycle.
// ---------------------------------------------------------------------------

// Where a block sits. The first four are the 2x2 grid; POS_BAND is the banner
// (classic) / top strip (round six) / first row's extra short block (rect six),
// POS_SIXTH the block that only the six-block layout shows.
typedef enum {
  POS_TL, POS_TR, POS_BL, POS_BR, POS_BAND, POS_SIXTH, POS_COUNT
} BlockPos;

#define LAYOUT_CLASSIC 0
#define LAYOUT_SIX     1

// --- Configuration ---------------------------------------------------------
// Seeded from the defaults below and then overwritten by anything the companion
// (Clay) settings page has persisted. See settings_load().
static bool s_year_top = true;
static int  s_layout = LAYOUT_CLASSIC;
static QuadBlock s_blocks[POS_COUNT] = {
  BLK_DOW, BLK_DAY,      // TL, TR
  BLK_CLOCK, BLK_MONTH,  // BL, BR
  BLK_YEAR, BLK_STEPS,   // banner, sixth
};
bool s_show_seconds = false;   // off by default (battery friendly)
bool s_flip_enabled = true;    // flip animation on value change (on by default)
bool s_seam_enabled = true;    // thin seam line across each block (on by default)
int  s_lang = 0;               // 0 = English (see lang.c)

// --- Color defaults (used until the user overrides them) ------------------
#define FACE_BG      PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite)
#define PANEL_BG     GColorBlack
#define WEEKEND_BG   PBL_IF_COLOR_ELSE(GColorRed, GColorBlack)

// User-configurable colors (the three above-listed defaults at startup); text
// is derived from the panel background.
GColor s_face_bg, s_panel_bg, s_weekend_bg, s_text_fg;

// Resolved panel color per position (indexed by BlockPos). Each layer's
// update_proc points s_panel_bg/s_text_fg at its entry before it draws, so
// every block in blocks.c keeps reading the same two globals.
static GColor s_panel_colors[POS_COUNT];

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
  PK_FLIP_ANIM,
  PK_DRAW_SEAM,
  // Per-block panel color overrides (banner + 4 grid quadrants). Appended last
  // so existing persisted keys stay stable; absent = fall back to s_panel_bg.
  PK_PANEL_BAND,
  PK_PANEL_TL,
  PK_PANEL_TR,
  PK_PANEL_BL,
  PK_PANEL_BR,
  // Six-block layout (v3): the layout switch plus the sixth block and its color.
  PK_LAYOUT,
  PK_BLOCK_SIXTH,
  PK_PANEL_SIXTH,
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
static Layer  *s_layer[POS_COUNT];    // one per position; each holds a BlockState
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

// Which position a layer holds.
static BlockPos layer_pos(Layer *layer) {
  for (int i = 0; i < POS_COUNT; i++)
    if (s_layer[i] == layer) return (BlockPos)i;
  return POS_TL;
}

// True when the banner positions draw as a text-hugging pill rather than as a
// full-width block: always in the classic layout, and on round screens, where
// the six-block layout puts them in the top / bottom strips.
static bool bands_are_pills(void) {
  return PBL_IF_ROUND_ELSE(true, s_layout == LAYOUT_CLASSIC);
}

static void block_layer_update(Layer *layer, GContext *ctx) {
  BlockPos pos = layer_pos(layer);
  s_draw_origin = layer_get_frame(layer).origin;
  // Point the shared panel/text globals at this position's resolved color, so
  // the block draws (which read s_panel_bg / s_text_fg) pick up its override.
  s_panel_bg = s_panel_colors[pos];
  s_text_fg  = contrast_color(s_panel_bg);
  if ((pos == POS_BAND || pos == POS_SIXTH) && bands_are_pills())
    draw_band(ctx, layer_get_bounds(layer), s_blocks[pos]);
  else
    draw_block_layer(ctx, layer);   // flip-aware (see blocks.c)
}

// One shared timer advances every in-flight flip and stops itself once none are
// left. blocks.c sets a layer's countdown and calls flip_request() to start it.
static AppTimer *s_flip_timer;
#define FLIP_MS 40

static void flip_tick(void *context) {
  s_flip_timer = NULL;
  bool any = false;
  for (int i = 0; i < POS_COUNT; i++) {
    BlockState *st = layer_get_data(s_layer[i]);
    if (st->anim) {
      st->anim--;
      layer_mark_dirty(s_layer[i]);   // draws this flip frame
      if (st->anim) any = true;
    }
  }
  if (any) s_flip_timer = app_timer_register(FLIP_MS, flip_tick, NULL);
}

void flip_request(void) {
  if (!s_flip_timer) s_flip_timer = app_timer_register(FLIP_MS, flip_tick, NULL);
}

// Lay the 2x2 grid into `area`: each column pairs a square block with a short
// one, so both columns total the same height and line up.
static void layout_grid(GRect area, int col_w, int square, int short_h) {
  int col_h = area.size.h;
  for (int col = 0; col < 2; col++) {
    BlockPos top_pos = col ? POS_TR : POS_TL;
    BlockPos bot_pos = col ? POS_BR : POS_BL;
    int top_h, bot_h;
    if (block_is_short(s_blocks[top_pos]) == block_is_short(s_blocks[bot_pos])) {
      top_h = (col_h - GUTTER) / 2;          // fallback: equal split
      bot_h = col_h - GUTTER - top_h;
    } else if (block_is_short(s_blocks[top_pos])) {
      top_h = short_h; bot_h = square;       // short on top, square below
    } else {
      top_h = square;  bot_h = short_h;      // square on top, short below
    }
    int x = area.origin.x + col * (col_w + GUTTER);
    layer_set_frame(s_layer[top_pos], GRect(x, area.origin.y, col_w, top_h));
    layer_set_frame(s_layer[bot_pos],
                    GRect(x, area.origin.y + top_h + GUTTER, col_w, bot_h));
  }
}

// One row of the six-block layout: a square block on the side whose block is
// big, and the other two blocks stacked as shorts beside it. Both blocks being
// the same size can't be laid out as asked, so the left one takes the square.
static void layout_row(GRect row, int col_w,
                       BlockPos left, BlockPos right, BlockPos extra) {
  bool big_left = !block_is_short(s_blocks[left]) || block_is_short(s_blocks[right]);
  BlockPos big   = big_left ? left  : right;
  BlockPos stack = big_left ? right : left;
  int big_x   = row.origin.x + (big_left ? 0 : col_w + GUTTER);
  int stack_x = row.origin.x + (big_left ? col_w + GUTTER : 0);
  int half    = (row.size.h - GUTTER) / 2;

  layer_set_frame(s_layer[big], GRect(big_x, row.origin.y, col_w, row.size.h));
  layer_set_frame(s_layer[stack], GRect(stack_x, row.origin.y, col_w, half));
  layer_set_frame(s_layer[extra],
                  GRect(stack_x, row.origin.y + half + GUTTER, col_w,
                        row.size.h - half - GUTTER));
}

// Position every block layer and tag each layer with the block it shows.
// Runs once on load and again on a settings change -- never per tick.
static void layout(void) {
  // Unobstructed bounds so the layout shrinks/recentres under Timeline Quick
  // View (the bottom banner overlay); falls back to full bounds when clear.
  Layer *root = window_get_root_layer(s_window);
  GRect b = layer_get_unobstructed_bounds(root);
  // Obstructed (Timeline Quick View): drop the banner strips and let the 2x2
  // grid have the reduced area to itself, so it still centres cleanly.
  bool obstructed = b.size.h < layer_get_bounds(root).size.h;
  GRect inner = grect_inset(b, GEdgeInsets(MARGIN, MARGIN + SIDE_MARGIN));

  // The two columns fill the width. Tall blocks are square; short blocks are
  // half their height.
  int col_w   = (inner.size.w - GUTTER) / 2;
  int square  = col_w;
  int short_h = square / 2;
  int col_h   = square + GUTTER + short_h;
  int year_h  = square * 45 / 100;   // banner height

  // Which positions this layout shows at all.
  bool six    = s_layout == LAYOUT_SIX;
  bool strips = six && PBL_IF_ROUND_ELSE(true, false);   // round: top + bottom
  bool rows   = six && !strips;                          // rect: two full rows
  layer_set_hidden(s_layer[POS_BAND], obstructed && !rows);
  layer_set_hidden(s_layer[POS_SIXTH], !six || (obstructed && !rows));

  if (rows) {
    // Two square-tall rows, each one big block beside two stacked shorts.
    // Squeeze the rows if the (possibly obstructed) height can't take both.
    int row_h = square;
    if (2 * row_h + GUTTER > inner.size.h) row_h = (inner.size.h - GUTTER) / 2;
    int top = inner.origin.y + (inner.size.h - (2 * row_h + GUTTER)) / 2;
    layout_row(GRect(inner.origin.x, top, inner.size.w, row_h), col_w,
               POS_TL, POS_TR, POS_BAND);
    layout_row(GRect(inner.origin.x, top + row_h + GUTTER, inner.size.w, row_h),
               col_w, POS_BL, POS_BR, POS_SIXTH);
  } else {
    // Centre the whole group (banner(s) + grid) vertically in the face. When
    // the banners are hidden the grid alone is centred.
    int band_count = obstructed ? 0 : (strips ? 2 : 1);
    int group_h = col_h + band_count * (year_h + GUTTER);
    int top = inner.origin.y + (inner.size.h - group_h) / 2;
    // Round faces nudge the group up (banner top) / down (banner bottom) so the
    // full-width grid edge clears the bezel. The strips layout is symmetric, so
    // it needs no nudge.
    // ponytail: round-bezel clearance knob. The up-nudge was clipping the top
    // banner, so it's reduced; raise the magnitude again if the grid edge clips.
#if defined(PBL_PLATFORM_GABBRO)
    if (!obstructed && !strips) top += s_year_top ? -10 : 20;
#elif defined(PBL_PLATFORM_CHALK)
    if (!obstructed && !strips) top += s_year_top ? -5 : 10;
#endif

    // Stack: [band] grid [band]. Classic puts its single banner on whichever
    // side s_year_top asks for; the round six-block layout uses both.
    bool band_first = strips || s_year_top;
    int y = top;
    if (!obstructed && band_first) {
      layer_set_frame(s_layer[POS_BAND],
                      GRect(inner.origin.x, y, inner.size.w, year_h));
      y += year_h + GUTTER;
    }
    layout_grid(GRect(inner.origin.x, y, inner.size.w, col_h), col_w, square,
                short_h);
    y += col_h + GUTTER;
    if (!obstructed) {
      BlockPos last = strips ? POS_SIXTH : POS_BAND;
      if (strips || !s_year_top)
        layer_set_frame(s_layer[last],
                        GRect(inner.origin.x, y, inner.size.w, year_h));
    }
  }

  // Retag every layer with its block and clear the flip state, so re-layout
  // (load or a settings change) adopts the new value silently, not as a flip.
  // Reframing marks frames dirty; this forces the kinds/colours to repaint too.
  for (int i = 0; i < POS_COUNT; i++) {
    BlockState *st = layer_get_data(s_layer[i]);
    st->blk = s_blocks[i];
    st->anim = 0;
    st->shown[0] = '\0';
    layer_mark_dirty(s_layer[i]);
  }
}

// What real-world change forces a given block to repaint.
typedef enum { TRG_DATE, TRG_CLOCK, TRG_HEALTH, TRG_BATTERY, TRG_WEATHER } Trigger;

static Trigger block_trigger(QuadBlock b) {
  switch (b) {
    case BLK_CLOCK:
    case BLK_DIGITAL:
    case BLK_DIGITAL_BIG:
    case BLK_HOURS:
    case BLK_HOURS_BIG:
    case BLK_MINUTES:
    case BLK_MINUTES_BIG:
    case BLK_AMPM:
    case BLK_AMPM_STACK:
    case BLK_BEAT:
    case BLK_BEAT_BIG:    return TRG_CLOCK;
    case BLK_STEPS:
    case BLK_KM:
    case BLK_KM_BIG:
    case BLK_HR:
    case BLK_HR_BIG:   return TRG_HEALTH;
    case BLK_BATTERY:
    case BLK_BATTERY_BIG: return TRG_BATTERY;
    case BLK_WEATHER:
    case BLK_TEMP:
    case BLK_TEMP_BIG:
    case BLK_TEMP_ICON:
    case BLK_HUMIDITY:
    case BLK_HUMIDITY_BIG:
    case BLK_MINMAX:
    case BLK_MINMAX_BIG:
    case BLK_PRECIP:
    case BLK_UV:
    case BLK_UV_BIG:
    case BLK_WIND:
    case BLK_WIND_BIG:
    case BLK_WIND_DIR:
    case BLK_WIND_DIR_BIG:
    case BLK_AQI:
    case BLK_AQI_BIG:
    case BLK_UV_COLOR:
    case BLK_UV_BIG_COLOR:
    case BLK_AQI_COLOR:
    case BLK_AQI_BIG_COLOR: return TRG_WEATHER;
    default:           return TRG_DATE;   // dow / day / month / year / *_day
  }
}

// Repaint only the placed blocks driven by `t`.
static void mark_blocks(Trigger t) {
  for (int i = 0; i < POS_COUNT; i++)
    if (block_trigger(s_blocks[i]) == t) layer_mark_dirty(s_layer[i]);
}

static bool clock_present(void) {
  for (int i = 0; i < POS_COUNT; i++)
    if (s_blocks[i] == BLK_CLOCK) return true;
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

// Timeline Quick View (or any system overlay) resized the drawable area:
// re-layout so the blocks recentre in the space that's left, and again once
// it clears. did_change fires after the slide, so blocks snap into place.
// (aplite has no such overlay, so the service -- and this handler -- are absent.)
#if !PBL_PLATFORM_APLITE
static void unobstructed_did_change(void *context) { layout(); }
#endif

#if defined(PBL_HEALTH)
static void health_handler(HealthEventType event, void *ctx) {
  if (event == HealthEventMovementUpdate || event == HealthEventSignificantUpdate ||
      event == HealthEventHeartRateUpdate)
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

static QuadBlock read_block(PersistKey key, QuadBlock def, bool (*valid)(int)) {
  if (!persist_exists(key)) return def;
  int v = persist_read_int(key);
  return valid(v) ? (QuadBlock)v : def;
}

// Seed runtime config from persisted values, falling back to the compile-time
// defaults on first run.
static void settings_load(void) {
  s_year_top     = persist_exists(PK_YEAR_TOP)     ? persist_read_bool(PK_YEAR_TOP) : true;
  s_show_seconds = persist_exists(PK_SHOW_SECONDS) ? persist_read_bool(PK_SHOW_SECONDS) : false;
  s_flip_enabled = persist_exists(PK_FLIP_ANIM)    ? persist_read_bool(PK_FLIP_ANIM)    : true;
  s_seam_enabled = persist_exists(PK_DRAW_SEAM)    ? persist_read_bool(PK_DRAW_SEAM)    : true;

  s_lang = persist_exists(PK_LANG) ? persist_read_int(PK_LANG) : 0;
  if (s_lang < 0 || s_lang >= LANG_COUNT) s_lang = 0;

  s_layout = persist_exists(PK_LAYOUT) ? persist_read_int(PK_LAYOUT) : LAYOUT_CLASSIC;
  if (s_layout != LAYOUT_SIX) s_layout = LAYOUT_CLASSIC;

  s_blocks[POS_TL]    = read_block(PK_BLOCK_TL, BLK_DOW,     block_valid_grid);
  s_blocks[POS_TR]    = read_block(PK_BLOCK_TR, BLK_DAY,     block_valid_grid);
  s_blocks[POS_BL]    = read_block(PK_BLOCK_BL, BLK_CLOCK,   block_valid_grid);
  s_blocks[POS_BR]    = read_block(PK_BLOCK_BR, BLK_MONTH,   block_valid_grid);
  // The banner positions are always short blocks, so both take the banner set.
  s_blocks[POS_BAND]  = read_block(PK_BAND_BLOCK,   BLK_YEAR,  block_valid_band);
  s_blocks[POS_SIXTH] = read_block(PK_BLOCK_SIXTH,  BLK_STEPS, block_valid_band);

  s_face_bg    = persist_exists(PK_FACE_COLOR)    ? GColorFromHEX(persist_read_int(PK_FACE_COLOR))    : (GColor)FACE_BG;
  s_panel_bg   = persist_exists(PK_PANEL_COLOR)   ? GColorFromHEX(persist_read_int(PK_PANEL_COLOR))   : (GColor)PANEL_BG;
  s_weekend_bg = persist_exists(PK_WEEKEND_COLOR) ? GColorFromHEX(persist_read_int(PK_WEEKEND_COLOR)) : (GColor)WEEKEND_BG;
  // ponytail: text contrast is derived from the panel bg, not configurable.
  // Weekend dow text reuses it; only wrong if panel/weekend differ in luminance.
  s_text_fg    = contrast_color(s_panel_bg);

  // Per-block panel overrides fall back to the main panel color when unset.
  static const PersistKey panel_pk[POS_COUNT] =
      { PK_PANEL_TL, PK_PANEL_TR, PK_PANEL_BL, PK_PANEL_BR,
        PK_PANEL_BAND, PK_PANEL_SIXTH };
  for (int i = 0; i < POS_COUNT; i++)
    s_panel_colors[i] = persist_exists(panel_pk[i])
                            ? GColorFromHEX(persist_read_int(panel_pk[i]))
                            : s_panel_bg;
}

static void apply_bool(DictionaryIterator *iter, uint32_t msg_key,
                       PersistKey pk, bool *out) {
  Tuple *t = dict_find(iter, msg_key);
  if (!t) return;
  *out = t->value->int32 != 0;
  persist_write_bool(pk, *out);
}

static void apply_block(DictionaryIterator *iter, uint32_t msg_key,
                        PersistKey pk, QuadBlock *out, bool (*valid)(int)) {
  Tuple *t = dict_find(iter, msg_key);
  if (!t) return;
  int v = t->value->int32;
  if (!valid(v)) return;
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

  Tuple *lang_t = dict_find(iter, MESSAGE_KEY_LANG);
  if (lang_t) {
    int v = lang_t->value->int32;
    if (v >= 0 && v < LANG_COUNT) { s_lang = v; persist_write_int(PK_LANG, v); }
  }

  Tuple *layout_t = dict_find(iter, MESSAGE_KEY_LAYOUT);
  if (layout_t) {
    s_layout = layout_t->value->int32 == LAYOUT_SIX ? LAYOUT_SIX : LAYOUT_CLASSIC;
    persist_write_int(PK_LAYOUT, s_layout);
  }

  apply_block(iter, MESSAGE_KEY_BLOCK_TOP_LEFT,     PK_BLOCK_TL, &s_blocks[POS_TL], block_valid_grid);
  apply_block(iter, MESSAGE_KEY_BLOCK_TOP_RIGHT,    PK_BLOCK_TR, &s_blocks[POS_TR], block_valid_grid);
  apply_block(iter, MESSAGE_KEY_BLOCK_BOTTOM_LEFT,  PK_BLOCK_BL, &s_blocks[POS_BL], block_valid_grid);
  apply_block(iter, MESSAGE_KEY_BLOCK_BOTTOM_RIGHT, PK_BLOCK_BR, &s_blocks[POS_BR], block_valid_grid);
  apply_block(iter, MESSAGE_KEY_BLOCK_BAND,  PK_BAND_BLOCK,  &s_blocks[POS_BAND],  block_valid_band);
  apply_block(iter, MESSAGE_KEY_BLOCK_SIXTH, PK_BLOCK_SIXTH, &s_blocks[POS_SIXTH], block_valid_band);

  apply_color(iter, MESSAGE_KEY_FACE_COLOR,    PK_FACE_COLOR,    &s_face_bg);
  apply_color(iter, MESSAGE_KEY_PANEL_COLOR,   PK_PANEL_COLOR,   &s_panel_bg);
  apply_color(iter, MESSAGE_KEY_WEEKEND_COLOR, PK_WEEKEND_COLOR, &s_weekend_bg);
  s_text_fg = contrast_color(s_panel_bg);

  // Per-block panel overrides (the config page seeds these from PANEL_COLOR).
  apply_color(iter, MESSAGE_KEY_PANEL_TL_COLOR,    PK_PANEL_TL,    &s_panel_colors[POS_TL]);
  apply_color(iter, MESSAGE_KEY_PANEL_TR_COLOR,    PK_PANEL_TR,    &s_panel_colors[POS_TR]);
  apply_color(iter, MESSAGE_KEY_PANEL_BL_COLOR,    PK_PANEL_BL,    &s_panel_colors[POS_BL]);
  apply_color(iter, MESSAGE_KEY_PANEL_BR_COLOR,    PK_PANEL_BR,    &s_panel_colors[POS_BR]);
  apply_color(iter, MESSAGE_KEY_PANEL_BAND_COLOR,  PK_PANEL_BAND,  &s_panel_colors[POS_BAND]);
  apply_color(iter, MESSAGE_KEY_PANEL_SIXTH_COLOR, PK_PANEL_SIXTH, &s_panel_colors[POS_SIXTH]);

  apply_bool(iter, MESSAGE_KEY_SHOW_SECONDS, PK_SHOW_SECONDS, &s_show_seconds);
  apply_bool(iter, MESSAGE_KEY_FLIP_ANIM, PK_FLIP_ANIM, &s_flip_enabled);
  apply_bool(iter, MESSAGE_KEY_DRAW_SEAM, PK_DRAW_SEAM, &s_seam_enabled);

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
  s_ffont = ffont_create_from_resource(RESOURCE_ID_FONT_MONO);
#endif

  time_t now = time(NULL);
  s_now = *localtime(&now);
  s_prev_yday = s_now.tm_yday;

  // One Layer per block (frames assigned by layout()). Each carries the
  // QuadBlock it renders so each repaints independently.
  for (int i = 0; i < POS_COUNT; i++) {
    s_layer[i] = layer_create_with_data(GRect(0, 0, 2, 2), sizeof(BlockState));
    layer_set_update_proc(s_layer[i], block_layer_update);
    layer_add_child(root, s_layer[i]);
  }

  layout();

  battery_state_service_subscribe(battery_handler);
#if !PBL_PLATFORM_APLITE
  unobstructed_area_service_subscribe(
      (UnobstructedAreaHandlers){ .did_change = unobstructed_did_change }, NULL);
#endif
#if defined(PBL_HEALTH)
  health_service_events_subscribe(health_handler, NULL);
#endif
}

static void prv_window_unload(Window *window) {
  if (s_flip_timer) { app_timer_cancel(s_flip_timer); s_flip_timer = NULL; }
  battery_state_service_unsubscribe();
#if !PBL_PLATFORM_APLITE
  unobstructed_area_service_unsubscribe();
#endif
#if defined(PBL_HEALTH)
  health_service_events_unsubscribe();
#endif
#if !PBL_PLATFORM_APLITE
  ffont_destroy(s_ffont);
#endif
  for (int i = 0; i < POS_COUNT; i++) layer_destroy(s_layer[i]);
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

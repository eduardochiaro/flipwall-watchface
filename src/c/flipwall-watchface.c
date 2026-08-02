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
//   LAYOUT_SIX (6 blocks) - the banner is dropped and each column grows a third
//     block in its middle, so the face is two columns of three: one big block
//     and two short ones, with the big one in any of the three slots. Round
//     screens can't take a full-height column, so there the two middles lift
//     out into strips above and below the 2x2 grid, which keeps the circular
//     shape - and, being strips, they are always short.
//
// Both layouts share the four grid positions (see BlockPos), so switching keeps
// those block choices and colours.
//
// Drawing lives in blocks.c, colour helpers in colors.c, localisation in
// lang.c and weather state in weather.c. This file owns the shared state, the
// layout, the settings, and the app lifecycle.
// ---------------------------------------------------------------------------

// Where a block sits. The first four are the 2x2 grid, which both layouts use;
// POS_BAND is the classic layout's banner and POS_MID_L / POS_MID_R the
// six-block layout's column middles (the top / bottom strips on round screens).
typedef enum {
  POS_TL, POS_TR, POS_BL, POS_BR, POS_BAND, POS_MID_L, POS_MID_R, POS_COUNT
} BlockPos;

#define LAYOUT_CLASSIC 0
#define LAYOUT_SIX     1

// --- Configuration ---------------------------------------------------------
// Seeded from the defaults below and then overwritten by anything the companion
// (Clay) settings page has persisted. See settings_load().
static bool s_year_top = true;
static int  s_layout = LAYOUT_CLASSIC;
static QuadBlock s_blocks[POS_COUNT] = {
  BLK_DOW, BLK_DAY,          // TL, TR
  BLK_CLOCK, BLK_MONTH,      // BL, BR
  BLK_YEAR,                  // banner
  BLK_DIGITAL, BLK_STEPS,    // middle left, middle right
};
bool s_show_seconds = false;   // off by default (battery friendly)
bool s_flip_enabled = true;    // flip animation on value change (on by default)
bool s_seam_enabled = true;    // thin seam line across each block (on by default)
int  s_lang = 0;               // 0 = English (see lang.c)
// Second time zones, one per position (BlockPos order). The watch has no tz
// data: the phone resolves each slot's zone to its current offset and
// abbreviation and pushes both — on a config save and on every weather refresh,
// so a DST change lands without the wearer opening the settings. The two
// globals point at the entry of the block currently drawing, like s_panel_bg.
static int  s_tz_offsets[POS_COUNT];
static char s_tz_abbrs[POS_COUNT][TZ_ABBR_LEN];
int         s_tz_offset = 0;
const char *s_tz_abbr = "UTC";

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
  // Six-block layout (v3): the layout switch plus the two column middles.
  PK_LAYOUT,
  PK_BLOCK_MID_L,
  PK_PANEL_MID_L,
  PK_BLOCK_MID_R,
  PK_PANEL_MID_R,
  // The per-position second time zones as resolved by the phone, cached as two
  // blobs rather than a key per slot. Appended last, as ever.
  PK_TZ_OFFSETS,
  PK_TZ_ABBRS,
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

// True when a position draws as a text-hugging pill rather than a full-width
// block: the classic banner always, and the six-block middles on round screens,
// where they sit in the top / bottom strips.
static bool draws_as_pill(BlockPos pos) {
  if (pos == POS_BAND) return true;
  return PBL_IF_ROUND_ELSE(pos == POS_MID_L || pos == POS_MID_R, false);
}

// Everything the layer needs is in its own BlockState, tagged by layout().
static void block_layer_update(Layer *layer, GContext *ctx) {
  BlockState *st = layer_get_data(layer);
  s_draw_origin = layer_get_frame(layer).origin;
  // Point the shared panel/text globals at this position's resolved color, so
  // the block draws (which read s_panel_bg / s_text_fg) pick up its override.
  s_panel_bg = st->panel;
  s_text_fg  = contrast_color(s_panel_bg);
  // Same idea for the second time zone: this position's, read live off the
  // tables so a zone push doesn't have to re-tag every layer.
  s_tz_offset = s_tz_offsets[st->pos];
  s_tz_abbr   = s_tz_abbrs[st->pos];
  if (st->pill)
    draw_band(ctx, layer_get_bounds(layer), st->blk);
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

// One column of the six-block layout: three stacked blocks, one big + two
// short, with the square going to whichever slot holds the big block. A column
// with no big block (or more than one) can't be laid out as asked, so the first
// slot takes the square.
static void layout_column(GRect col, int big_h,
                          BlockPos top, BlockPos mid, BlockPos bot) {
  BlockPos order[3] = { top, mid, bot };
  int big_i = 0;
  for (int i = 0; i < 3; i++)
    if (!block_is_short(s_blocks[order[i]])) { big_i = i; break; }
  int short_h = (col.size.h - big_h - 2 * GUTTER) / 2;

  int h[3];
  for (int i = 0; i < 3; i++) h[i] = (i == big_i) ? big_h : short_h;
  h[2] = col.size.h - h[0] - h[1] - 2 * GUTTER;   // absorbs the rounding

  int y = col.origin.y;
  for (int i = 0; i < 3; i++) {
    layer_set_frame(s_layer[order[i]], GRect(col.origin.x, y, col.size.w, h[i]));
    y += h[i] + GUTTER;
  }
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

  // Which positions this layout shows at all. The banner belongs to the classic
  // layout, the two middles to the six-block one; on round screens the middles
  // become strips above and below the grid, so they hide under an obstruction
  // exactly like the banner does.
  bool six    = s_layout == LAYOUT_SIX;
  bool strips = six && PBL_IF_ROUND_ELSE(true, false);
  bool cols   = six && !strips;   // rect: two full-height columns of three
  layer_set_hidden(s_layer[POS_BAND], six || obstructed);
  layer_set_hidden(s_layer[POS_MID_L], !six || (obstructed && !cols));
  layer_set_hidden(s_layer[POS_MID_R], !six || (obstructed && !cols));

  if (cols) {
    // Two columns of three: a square block plus two shorts, stacked. Squeeze
    // the square if the (possibly obstructed) height can't take the full pair.
    int big_h = square, col_full = 2 * square + GUTTER;
    if (col_full > inner.size.h) {
      col_full = inner.size.h;
      big_h = (col_full - 2 * GUTTER) / 2;   // still half the column
    }
    int top = inner.origin.y + (inner.size.h - col_full) / 2;
    layout_column(GRect(inner.origin.x, top, col_w, col_full), big_h,
                  POS_TL, POS_MID_L, POS_BL);
    layout_column(GRect(inner.origin.x + col_w + GUTTER, top, col_w, col_full),
                  big_h, POS_TR, POS_MID_R, POS_BR);
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

    // Stack: [strip] grid [strip]. Classic puts its single banner on whichever
    // side s_year_top asks for; the round six-block layout uses both middles.
    int y = top;
    if (!obstructed && (strips || s_year_top)) {
      layer_set_frame(s_layer[strips ? POS_MID_L : POS_BAND],
                      GRect(inner.origin.x, y, inner.size.w, year_h));
      y += year_h + GUTTER;
    }
    layout_grid(GRect(inner.origin.x, y, inner.size.w, col_h), col_w, square,
                short_h);
    y += col_h + GUTTER;
    if (!obstructed && (strips || !s_year_top))
      layer_set_frame(s_layer[strips ? POS_MID_R : POS_BAND],
                      GRect(inner.origin.x, y, inner.size.w, year_h));
  }

  // Retag every layer with its block, colour and shape, and clear the flip
  // state, so re-layout (load or a settings change) adopts the new value
  // silently, not as a flip. Reframing marks frames dirty; this forces the
  // kinds/colours to repaint too.
  for (int i = 0; i < POS_COUNT; i++) {
    BlockState *st = layer_get_data(s_layer[i]);
    st->blk = s_blocks[i];
    st->panel = s_panel_colors[i];
    st->pos = (uint8_t)i;
    st->pill = draws_as_pill((BlockPos)i);
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
    case BLK_DIGITAL_NOZERO:
    case BLK_DIGITAL_BIG:
    case BLK_DIGITAL_BIG_NOZERO:
    case BLK_HOURS:
    case BLK_HOURS_BIG:
    case BLK_MINUTES:
    case BLK_MINUTES_BIG:
    case BLK_AMPM:
    case BLK_AMPM_STACK:
    case BLK_BEAT:
    case BLK_BEAT_BIG:
    case BLK_TZ:
    case BLK_TZ_ABBR:
    case BLK_TZ_BIG:
    case BLK_TZ_BIG_ABBR: return TRG_CLOCK;
    case BLK_STEPS:
    case BLK_STEPS_FULL:
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

// True when at least one placed block is driven by `t`.
static bool blocks_need(Trigger t) {
  for (int i = 0; i < POS_COUNT; i++)
    if (block_trigger(s_blocks[i]) == t) return true;
  return false;
}

static bool clock_present(void) {
  for (int i = 0; i < POS_COUNT; i++)
    if (s_blocks[i] == BLK_CLOCK) return true;
  return false;
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  s_now = *tick_time;
  // Between minutes there is exactly one thing to redraw: the analog dial's
  // second hand. Every other clock block still reads the same, so repainting
  // the lot 60 times a minute is 60x the vector rendering for nothing.
  if (units_changed & MINUTE_UNIT) {
    mark_blocks(TRG_CLOCK);
    // Steps / distance / heart rate ride on the minute tick rather than on the
    // health service's own events: those fire every few seconds while the
    // wearer walks, and waking the app that often to redraw a step count that
    // is about to change again is the most expensive thing this face could do.
    // The cost is that a step count can be up to a minute stale.
    mark_blocks(TRG_HEALTH);
  } else {
    for (int i = 0; i < POS_COUNT; i++)
      if (s_blocks[i] == BLK_CLOCK) layer_mark_dirty(s_layer[i]);
    return;   // a second tick can't cross midnight on its own
  }
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

// ---------------------------------------------------------------------------
// Settings (Clay config page <-> persistent storage)
// ---------------------------------------------------------------------------

// Second ticks only when the seconds hand is shown AND a clock is actually
// placed; minute ticks otherwise (which also catch the day rollover).
static void apply_tick_interval(void) {
  bool secs = s_show_seconds && clock_present();
  tick_timer_service_subscribe(secs ? SECOND_UNIT : MINUTE_UNIT, tick_handler);
}

// The battery service is subscribed only while a block on the face shows the
// battery, so a face without one never wakes for a charge event. Re-run on a
// settings change, so the subscription follows the blocks.
// (There is no health subscription: those blocks refresh on the minute tick,
// see tick_handler.)
static bool s_battery_subscribed;

static void apply_services(void) {
  bool want_battery = blocks_need(TRG_BATTERY);
  if (want_battery == s_battery_subscribed) { return; }
  want_battery ? battery_state_service_subscribe(battery_handler)
               : battery_state_service_unsubscribe();
  s_battery_subscribed = want_battery;
}

// The six-block middles are full column blocks on rect screens, so they take
// any grid block (big or short). On round they lift out into the top / bottom
// strips, which only draw pills, so there they take the banner set instead.
static bool block_valid_mid(int v) {
  return PBL_IF_ROUND_ELSE(block_valid_band(v), block_valid_grid(v));
}

// Everything that differs per position: the persist keys its block and panel
// color are cached under, the block shown on first run, and which block set the
// slot accepts. Indexed by BlockPos. (The AppMessage keys can't join it — the
// SDK's MESSAGE_KEY_* are runtime symbols, not compile-time constants — so
// inbox_received_handler carries them in its own arrays.)
static const struct {
  PersistKey block_pk, panel_pk;
  QuadBlock  def;
  bool     (*valid)(int);
} POS_CFG[POS_COUNT] = {
  { PK_BLOCK_TL,    PK_PANEL_TL,    BLK_DOW,     block_valid_grid },
  { PK_BLOCK_TR,    PK_PANEL_TR,    BLK_DAY,     block_valid_grid },
  { PK_BLOCK_BL,    PK_PANEL_BL,    BLK_CLOCK,   block_valid_grid },
  { PK_BLOCK_BR,    PK_PANEL_BR,    BLK_MONTH,   block_valid_grid },
  { PK_BAND_BLOCK,  PK_PANEL_BAND,  BLK_YEAR,    block_valid_band },
  { PK_BLOCK_MID_L, PK_PANEL_MID_L, BLK_DIGITAL, block_valid_mid },
  { PK_BLOCK_MID_R, PK_PANEL_MID_R, BLK_STEPS,   block_valid_mid },
};

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

  // Zones: UTC everywhere until the phone says otherwise.
  for (int i = 0; i < POS_COUNT; i++) strcpy(s_tz_abbrs[i], "UTC");
  if (persist_exists(PK_TZ_OFFSETS))
    persist_read_data(PK_TZ_OFFSETS, s_tz_offsets, sizeof s_tz_offsets);
  if (persist_exists(PK_TZ_ABBRS))
    persist_read_data(PK_TZ_ABBRS, s_tz_abbrs, sizeof s_tz_abbrs);

  s_layout = persist_exists(PK_LAYOUT) ? persist_read_int(PK_LAYOUT) : LAYOUT_CLASSIC;
  if (s_layout != LAYOUT_SIX) s_layout = LAYOUT_CLASSIC;

  s_face_bg    = persist_exists(PK_FACE_COLOR)    ? GColorFromHEX(persist_read_int(PK_FACE_COLOR))    : (GColor)FACE_BG;
  s_panel_bg   = persist_exists(PK_PANEL_COLOR)   ? GColorFromHEX(persist_read_int(PK_PANEL_COLOR))   : (GColor)PANEL_BG;
  s_weekend_bg = persist_exists(PK_WEEKEND_COLOR) ? GColorFromHEX(persist_read_int(PK_WEEKEND_COLOR)) : (GColor)WEEKEND_BG;
  // ponytail: text contrast is derived from the panel bg, not configurable.
  // Weekend dow text reuses it; only wrong if panel/weekend differ in luminance.
  s_text_fg    = contrast_color(s_panel_bg);

  // Per-block panel overrides fall back to the main panel color when unset.
  for (int i = 0; i < POS_COUNT; i++) {
    s_blocks[i] = read_block(POS_CFG[i].block_pk, POS_CFG[i].def, POS_CFG[i].valid);
    s_panel_colors[i] = persist_exists(POS_CFG[i].panel_pk)
                            ? GColorFromHEX(persist_read_int(POS_CFG[i].panel_pk))
                            : s_panel_bg;
  }
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

// Each position's second time zone, if this message carries them: the phone
// sends both arrays whole, keyed MESSAGE_KEY_TZ_* + BlockPos. Sets *changed
// when a value actually moved; returns true when the keys were present at all.
//
// The phone re-sends these every half hour so a DST change lands on its own,
// and almost every one of those is identical to what is already here. Writing
// them back would be a flash write and a repaint every 30 minutes for nothing,
// so an unchanged push is dropped on the floor.
static bool apply_tz(DictionaryIterator *iter, bool *changed) {
  bool present = false;
  for (int i = 0; i < POS_COUNT; i++) {
    Tuple *off = dict_find(iter, MESSAGE_KEY_TZ_OFFSET + i);
    if (off) {
      present = true;
      if (s_tz_offsets[i] != off->value->int32) {
        s_tz_offsets[i] = off->value->int32;
        *changed = true;
      }
    }
    Tuple *abbr = dict_find(iter, MESSAGE_KEY_TZ_ABBR + i);
    if (abbr) {
      present = true;
      if (strncmp(s_tz_abbrs[i], abbr->value->cstring, TZ_ABBR_LEN) != 0) {
        strncpy(s_tz_abbrs[i], abbr->value->cstring, TZ_ABBR_LEN - 1);
        s_tz_abbrs[i][TZ_ABBR_LEN - 1] = '\0';
        *changed = true;
      }
    }
  }
  if (*changed) {
    persist_write_data(PK_TZ_OFFSETS, s_tz_offsets, sizeof s_tz_offsets);
    persist_write_data(PK_TZ_ABBRS, s_tz_abbrs, sizeof s_tz_abbrs);
  }
  return present;
}

// Both Clay config saves and weather pushes arrive on this inbox.
static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  if (weather_handle_message(iter)) {
    mark_blocks(TRG_WEATHER);   // repaint only the weather blocks
    return;   // a weather push carries no config keys
  }

  // The phone also refreshes the second zones on its own (DST), with no config
  // keys alongside it: take them and repaint the clocks, nothing else — and
  // only when something moved. A config save always carries LAYOUT, so it is
  // the marker for the full path.
  bool tz_changed = false;
  if (apply_tz(iter, &tz_changed) && !dict_find(iter, MESSAGE_KEY_LAYOUT)) {
    if (tz_changed) mark_blocks(TRG_CLOCK);
    return;
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

  apply_color(iter, MESSAGE_KEY_FACE_COLOR,    PK_FACE_COLOR,    &s_face_bg);
  apply_color(iter, MESSAGE_KEY_PANEL_COLOR,   PK_PANEL_COLOR,   &s_panel_bg);
  apply_color(iter, MESSAGE_KEY_WEEKEND_COLOR, PK_WEEKEND_COLOR, &s_weekend_bg);
  s_text_fg = contrast_color(s_panel_bg);

  // Each position's block and its panel color override, in BlockPos order (the
  // config page seeds the overrides from PANEL_COLOR, so they come after it).
  const uint32_t block_msg[POS_COUNT] = {
    MESSAGE_KEY_BLOCK_TOP_LEFT, MESSAGE_KEY_BLOCK_TOP_RIGHT,
    MESSAGE_KEY_BLOCK_BOTTOM_LEFT, MESSAGE_KEY_BLOCK_BOTTOM_RIGHT,
    MESSAGE_KEY_BLOCK_BAND, MESSAGE_KEY_BLOCK_MID_LEFT, MESSAGE_KEY_BLOCK_MID_RIGHT };
  const uint32_t panel_msg[POS_COUNT] = {
    MESSAGE_KEY_PANEL_TL_COLOR, MESSAGE_KEY_PANEL_TR_COLOR,
    MESSAGE_KEY_PANEL_BL_COLOR, MESSAGE_KEY_PANEL_BR_COLOR,
    MESSAGE_KEY_PANEL_BAND_COLOR, MESSAGE_KEY_PANEL_ML_COLOR,
    MESSAGE_KEY_PANEL_MR_COLOR };
  for (int i = 0; i < POS_COUNT; i++) {
    apply_block(iter, block_msg[i], POS_CFG[i].block_pk, &s_blocks[i], POS_CFG[i].valid);
    apply_color(iter, panel_msg[i], POS_CFG[i].panel_pk, &s_panel_colors[i]);
  }

  apply_bool(iter, MESSAGE_KEY_SHOW_SECONDS, PK_SHOW_SECONDS, &s_show_seconds);
  apply_bool(iter, MESSAGE_KEY_FLIP_ANIM, PK_FLIP_ANIM, &s_flip_enabled);
  apply_bool(iter, MESSAGE_KEY_DRAW_SEAM, PK_DRAW_SEAM, &s_seam_enabled);

  Tuple *units_t = dict_find(iter, MESSAGE_KEY_UNITS);
  if (units_t) weather_set_units(units_t->value->int32 != 0);

  // Layout, block kinds, seconds and clock placement may all have changed.
  window_set_background_color(s_window, s_face_bg);
  apply_tick_interval();
  apply_services();   // a block that needs health / battery may have come or gone
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

  apply_services();   // the battery service, only if a block on the face wants it
#if !PBL_PLATFORM_APLITE
  unobstructed_area_service_subscribe(
      (UnobstructedAreaHandlers){ .did_change = unobstructed_did_change }, NULL);
#endif
}

static void prv_window_unload(Window *window) {
  if (s_flip_timer) { app_timer_cancel(s_flip_timer); s_flip_timer = NULL; }
  if (s_battery_subscribed) { battery_state_service_unsubscribe(); s_battery_subscribed = false; }
#if !PBL_PLATFORM_APLITE
  unobstructed_area_service_unsubscribe();
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

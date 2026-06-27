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
  BLK_DOW,      // day of week (with AM/PM strip)
  BLK_DAY,      // day of month (big number)
  BLK_CLOCK,    // analog clock
  BLK_MONTH,    // month name
  BLK_STEPS,    // step count (Health)
  BLK_KM,       // distance walked (Health)
  BLK_BATTERY,  // battery level %
  BLK_YEAR,     // year (banner-only block)
  BLK_WEATHER,  // weather icon (big block); appended last so persisted ints stay stable
  BLK_MONTH_DAY, // "Jun 28" (banner-only); appended to keep persisted ints stable
  BLK_DOW_DAY,   // "Sat 28" (banner-only)
} QuadBlock;

// Grid blocks span BLK_DOW..BLK_BATTERY; the banner adds BLK_YEAR. Only Day and
// Clock are "big" (square); everything else is a "short" half-height block.
static bool block_valid_grid(int v) {
  return (v >= BLK_DOW && v <= BLK_BATTERY) || v == BLK_WEATHER;
}
static bool block_valid_band(int v) {
  return v == BLK_YEAR || (v >= BLK_STEPS && v <= BLK_BATTERY) ||
         v == BLK_MONTH_DAY || v == BLK_DOW_DAY;
}

// --- Configuration ---------------------------------------------------------
// These are seeded from the defaults below and then overwritten by anything
// the companion (Clay) settings page has persisted. See settings_load().
static bool s_year_top = true;
static QuadBlock s_band_block = BLK_YEAR;   // banner content (year by default)
static QuadBlock s_grid[2][2] = {
  { BLK_DOW,   BLK_DAY   },   // top row
  { BLK_CLOCK, BLK_MONTH },   // bottom row
};
static bool s_show_seconds = false;   // off by default (battery friendly)
static int  s_lang = 0;               // 0 = English (see LANGS below)

// --- Localisation ----------------------------------------------------------
// Month (%b) and weekday (%a) short names, ASCII-folded to 3 letters so they
// render with the Latin-only bundled font. Numbers (day/year) and the data
// readouts (steps/km/%) are language-neutral; AM/PM is left untranslated.
// Order must match LANG_OPTIONS in config.js (0 = English default).
#define LANG_COUNT 10
// tm_mon 0..11 (Jan..Dec).
static const char *const MONTHS[LANG_COUNT][12] = {
  {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"}, // en
  {"Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"}, // es
  {"Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"}, // pt
  {"Jan","Fev","Mar","Avr","Mai","Jui","Jul","Aou","Sep","Oct","Nov","Dec"}, // fr
  {"Jan","Feb","Mar","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"}, // de
  {"Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"}, // it
  {"Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"}, // nl
  {"Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paz","Lis","Gru"}, // pl
  {"Oca","Sub","Mar","Nis","May","Haz","Tem","Agu","Eyl","Eki","Kas","Ara"}, // tr
  {"Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"}, // id
};
// tm_wday 0..6 (Sun..Sat).
static const char *const WDAYS[LANG_COUNT][7] = {
  {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"}, // en
  {"Dom","Lun","Mar","Mie","Jue","Vie","Sab"}, // es
  {"Dom","Seg","Ter","Qua","Qui","Sex","Sab"}, // pt
  {"Dim","Lun","Mar","Mer","Jeu","Ven","Sam"}, // fr
  {"Son","Mon","Die","Mit","Don","Fre","Sam"}, // de
  {"Dom","Lun","Mar","Mer","Gio","Ven","Sab"}, // it
  {"Zon","Maa","Din","Woe","Don","Vri","Zat"}, // nl
  {"Nie","Pon","Wto","Sro","Czw","Pia","Sob"}, // pl
  {"Paz","Pzt","Sal","Car","Per","Cum","Cmt"}, // tr
  {"Min","Sen","Sel","Rab","Kam","Jum","Sab"}, // id
};

// --- Color defaults (used until the user overrides them) ------------------
#define FACE_BG      PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite)
#define PANEL_BG     GColorBlack
#define WEEKEND_BG   PBL_IF_COLOR_ELSE(GColorRed, GColorBlack)
#define SEAM_COLOR   GColorDarkGray
#define SECOND_FG    PBL_IF_COLOR_ELSE(GColorRed, GColorWhite)
#define DIM_FG       GColorLightGray

// User-configurable colors (the four above-listed defaults at startup).
static GColor s_face_bg;
static GColor s_panel_bg;
static GColor s_weekend_bg;
static GColor s_text_fg;

static bool is_large_screen = false;   // Pebble Time / Time 2 / Round have 144x168 or 180x180 screens

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

// Localised month/weekday short names for the current time + language.
static const char *month_name(void) { return MONTHS[s_lang][s_now.tm_mon]; }
static const char *wday_name(void)  { return WDAYS[s_lang][s_now.tm_wday]; }

// All text uses bundled Montserrat Bold so the design is consistent across
// platforms; sizes are picked per screen tier in prv_window_load().
static GFont s_font_num;   // big day number
static GFont s_font_txt;   // month
static GFont s_font_txt_sm; // year, day-of-week
static GFont s_font_sml;   // AM/PM indicator

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------

static uint32_t GColorToRGB8(GColor c) {
  return (uint8_t)(c.r * 255) << 16 | (uint8_t)(c.g * 255) << 8 | (uint8_t)(c.b * 255);
}

static GColor get_closest_accent_color(GColor c) {
  uint8_t r = (uint8_t)(GColorToRGB8(c) >> 16);
  uint8_t g = (uint8_t)(GColorToRGB8(c) >> 8);
  uint8_t b = (uint8_t)(GColorToRGB8(c));
  // Perceived luminance: lighten dark colors, darken light ones.
  uint16_t lum = (uint16_t)(r * 30 + g * 59 + b * 11) / 100;
  if (lum < 128) {
    r = (uint8_t)(r + (255 - r) * 0.3);
    g = (uint8_t)(g + (255 - g) * 0.3);
    b = (uint8_t)(b + (255 - b) * 0.3);
  } else {
    r = (uint8_t)(r * 0.7);
    g = (uint8_t)(g * 0.7);
    b = (uint8_t)(b * 0.7);
  }
  return GColorFromRGB(r, g, b);
}

// Black on light backgrounds, white on dark ones (perceived luminance).
static GColor contrast_color(GColor bg) {
  uint8_t r = (uint8_t)(GColorToRGB8(bg) >> 16);
  uint8_t g = (uint8_t)(GColorToRGB8(bg) >> 8);
  uint8_t b = (uint8_t)(GColorToRGB8(bg));
  uint16_t lum = (uint16_t)(r * 30 + g * 59 + b * 11) / 100;
  return lum < 128 ? GColorWhite : GColorBlack;
}

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

// Compact value text for the data blocks (year / steps / km / battery). Health
// metrics fall back to "--" on platforms without Health (e.g. aplite).
static void block_text(QuadBlock blk, char *buf, size_t n) {
  switch (blk) {
    case BLK_YEAR:
      strftime(buf, n, "%Y", &s_now);
      break;
    case BLK_STEPS: {
#if defined(PBL_HEALTH)
      int s = (int)health_service_sum_today(HealthMetricStepCount);
      // 2 digits then K past 1000 so the short block never overflows.
      if (s < 1000)       snprintf(buf, n, "%d", s);
      else if (s < 10000) snprintf(buf, n, "%d.%dK", s / 1000, (s % 1000) / 100);
      else                snprintf(buf, n, "%dK", s / 1000);
#else
      snprintf(buf, n, "--");
#endif
      break;
    }
    case BLK_KM: {
#if defined(PBL_HEALTH)
      int m = (int)health_service_sum_today(HealthMetricWalkedDistanceMeters);
      const char *type = "m";
      int t = (m + 50);     
      if (m >= 1000) {
        type = "km";
        t = (m + 50) / 100;     
      }     // km * 10, rounded
      if (health_service_get_measurement_system_for_display(
              HealthMetricWalkedDistanceMeters) == MeasurementSystemImperial) {
        t = (m * 10 + 804) / 1609;   // miles * 10, rounded
        type = "mi";
      } 
      if (t > 99) {
        snprintf(buf, n, "%d%s", t / 10, type);
      } else {
        snprintf(buf, n, "%d.%d%s", t / 10, t % 10, type);
      }
#else
      snprintf(buf, n, "--");
#endif
      break;
    }
    case BLK_BATTERY:
      snprintf(buf, n, "%d%%", battery_state_service_peek().charge_percent);
      break;
    case BLK_MONTH_DAY:
      snprintf(buf, n, "%s %d", month_name(), s_now.tm_mday);
      break;
    case BLK_DOW_DAY:
      snprintf(buf, n, "%s %d", wday_name(), s_now.tm_mday);
      break;
    default:
      buf[0] = '\0';
      break;
  }
}

// A plain centred short block (steps / km / battery), same look as the month.
static void draw_value_block(GContext *ctx, GRect r, QuadBlock blk) {
  char buf[12];
  block_text(blk, buf, sizeof(buf));
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, s_font_txt_sm, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

// The banner sits in a horizontal band but the panel itself is only a little
// wider than the text (not full width), centred in that band. The panel fills
// the band's height (which the caller sizes to the text).
static void draw_band(GContext *ctx, GRect band) {
  char buf[12];
  block_text(s_band_block, buf, sizeof(buf));
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
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, month_name(), s_font_txt, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

static void draw_dow(GContext *ctx, GRect r) {
  const char *buf = wday_name();     // title case "Mon" (matches "Jun")
  bool weekend = (s_now.tm_wday == 0 || s_now.tm_wday == 6);
  draw_panel(ctx, r, weekend ? s_weekend_bg : s_panel_bg);
  GColor s_override_text_fg = contrast_color(weekend ? s_weekend_bg : s_panel_bg);

  // Day-of-week uses the full block width. add a little padding to the left so the AM/PM label doesn't collide with the text.
  GRect newr = r;
  newr.origin.x += 4;
  newr.size.w -= 4;
  draw_centered(ctx, newr, buf, s_font_txt_sm, s_override_text_fg, GTextAlignmentLeft);

  // AM top-right, PM bottom-right; the active one is bright.
  bool is_pm = s_now.tm_hour >= 12;
  GColor dim = get_closest_accent_color(s_weekend_bg);
  draw_ampm(ctx, r, "AM", true,  is_pm ? dim : s_override_text_fg);
  draw_ampm(ctx, r, "PM", false, is_pm ? s_override_text_fg : dim);

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

// A big block holding a PDC (vector) icon. PDC has no scale API, so the icon is
// recreated each redraw and its points are multiplied up to fill the block (less
// a small padding). Stroke takes the text colour, fill the panel background, so
// the icon reads as an outline on the panel. Cheap: only redrawn on minute ticks.
static void draw_icon_block(GContext *ctx, GRect r, uint32_t res_id) {
  draw_panel(ctx, r, s_panel_bg);

  GDrawCommandImage *img = gdraw_command_image_create_with_resource(res_id);
  if (!img) return;
  GSize native = gdraw_command_image_get_bounds_size(img);
  if (native.w <= 0 || native.h <= 0) { gdraw_command_image_destroy(img); return; }

  const int pad = 8;
  int side = (r.size.w < r.size.h ? r.size.w : r.size.h) - pad * 2;
  if (side < 1) side = 1;

  GDrawCommandList *list = gdraw_command_image_get_command_list(img);
  uint32_t n = gdraw_command_list_get_num_commands(list);
  for (uint32_t i = 0; i < n; i++) {
    GDrawCommand *cmd = gdraw_command_list_get_command(list, i);
    gdraw_command_set_stroke_color(cmd, s_text_fg);
    gdraw_command_set_fill_color(cmd, s_panel_bg);
    if (gdraw_command_get_stroke_width(cmd) > 0) {
      // if small screen use 3, if large use 6
      if (is_large_screen) {
        gdraw_command_set_stroke_width(cmd, 6);  // large screen
      } else {
        gdraw_command_set_stroke_width(cmd, 3);  // small screen
      }
    }
    uint16_t np = gdraw_command_get_num_points(cmd);
    for (uint16_t p = 0; p < np; p++) {
      GPoint pt = gdraw_command_get_point(cmd, p);
      pt.x = pt.x * side / native.w;
      pt.y = pt.y * side / native.h;
      gdraw_command_set_point(cmd, p, pt);
    }
  }

  GPoint offset = GPoint(r.origin.x + (r.size.w - side) / 2,
                         r.origin.y + (r.size.h - side) / 2);
  gdraw_command_image_draw(ctx, img, offset);
  gdraw_command_image_destroy(img);
}

static void draw_block(GContext *ctx, QuadBlock blk, GRect r) {
  switch (blk) {
    case BLK_DOW:     draw_dow(ctx, r);   break;
    case BLK_DAY:     draw_day(ctx, r);   break;
    case BLK_CLOCK:   draw_clock(ctx, r); break;
    case BLK_MONTH:   draw_month(ctx, r); break;
    case BLK_WEATHER: draw_icon_block(ctx, r, RESOURCE_ID_ICON_SUNNY); break;
    default:          draw_value_block(ctx, r, blk); break;  // steps / km / battery
  }
}

// ---------------------------------------------------------------------------
// Layout + main update
// ---------------------------------------------------------------------------

// Day and Clock are "tall" blocks; everything else is "short" (half height).
static bool block_is_short(QuadBlock b) {
  return !(b == BLK_DAY || b == BLK_CLOCK || b == BLK_WEATHER);
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

  draw_band(ctx, band);

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

// Clay forwards every messageKey when the config page is saved.
static void inbox_received_handler(DictionaryIterator *iter, void *context) {
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

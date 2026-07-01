#include "flipwall.h"
#include "weather.h"

#define SEAM_COLOR   GColorDarkGray
#define SECOND_FG    PBL_IF_COLOR_ELSE(GColorRed, GColorWhite)

// ---------------------------------------------------------------------------
// Block-kind metadata
// ---------------------------------------------------------------------------

// Grid blocks span BLK_DOW..BLK_BATTERY plus the weather blocks. Day, Clock,
// Weather and the big temperature are "big" (square); everything else is a
// "short" half-height block.
bool block_valid_grid(int v) {
  return (v >= BLK_DOW && v <= BLK_BATTERY) || v == BLK_WEATHER ||
         v == BLK_TEMP || v == BLK_TEMP_BIG || v == BLK_HUMIDITY ||
         v == BLK_PRECIP || v == BLK_DIGITAL || v == BLK_DIGITAL_BIG ||
         v == BLK_HOURS || v == BLK_HOURS_BIG ||
         v == BLK_MINUTES || v == BLK_MINUTES_BIG ||
         v == BLK_AMPM || v == BLK_AMPM_STACK;
}
bool block_valid_band(int v) {
  return v == BLK_YEAR || (v >= BLK_STEPS && v <= BLK_BATTERY) ||
         v == BLK_MONTH_DAY || v == BLK_DOW_DAY ||
         v == BLK_TEMP || v == BLK_HUMIDITY || v == BLK_MINMAX ||
         v == BLK_PRECIP || v == BLK_DIGITAL;
}
bool block_is_short(QuadBlock b) {
  return !(b == BLK_DAY || b == BLK_CLOCK || b == BLK_WEATHER ||
           b == BLK_TEMP_BIG || b == BLK_DIGITAL_BIG ||
           b == BLK_HOURS_BIG || b == BLK_MINUTES_BIG);
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// Text is drawn through three helpers so the blocks don't care how glyphs are
// produced. There are two backends, picked at compile time:
//
//   * the 6 roomy platforms use the fctx vector font (one scalable .ffont,
//     sized per block by cap height);
//   * aplite (12KB heap, too small for the vector font + fctx buffers) falls
//     back to Pebble's built-in system fonts: zero resource cost, near-zero
//     heap. cap_h is mapped to the nearest system font size.
//
//   text_in_rect : horizontal text, vertically centred, align left/center/right
//   text_width   : pixel width of a string (to size the banner panel to text)
//   text_corner  : a small AM/PM marker pinned to a top/bottom-right corner

#if PBL_PLATFORM_APLITE

static GFont sysfont(int cap_h) {
  if (cap_h >= 30) return fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
  if (cap_h >= 22) return fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
  if (cap_h >= 16) return fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
  if (cap_h >= 12) return fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  return fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
}

static void text_in_rect(GContext *ctx, GRect r, const char *txt, int cap_h,
                         GColor color, GTextAlignment align) {
  GFont font = sysfont(cap_h);
  graphics_context_set_text_color(ctx, color);
  GSize sz = graphics_text_layout_get_content_size(
      txt, font, r, GTextOverflowModeTrailingEllipsis, align);
  GRect tr = r;
  // System fonts pad above the caps, so the content box centres lower than the
  // glyphs. Nudge up by ~1/6 of the line height to centre the caps instead.
  // ponytail: empirical knob; tweak the /6 if a size still looks off-centre.
  tr.origin.y += (r.size.h - sz.h) / 2 - sz.h / 6;
  tr.size.h = sz.h + 4;
  graphics_draw_text(ctx, txt, font, tr, GTextOverflowModeTrailingEllipsis,
                     align, NULL);
}

static int text_width(GContext *ctx, const char *txt, int cap_h) {
  return graphics_text_layout_get_content_size(
      txt, sysfont(cap_h), GRect(0, 0, 200, 60),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft).w;
}

static void text_corner(GContext *ctx, GRect r, const char *txt, int cap_h,
                        bool top, GColor color) {
  GFont font = sysfont(cap_h);
  // sysfont() snaps cap_h to a real font that may be taller than cap_h, so size
  // the box from the actual rendered text, not cap_h, or the glyph clips.
  GSize sz = graphics_text_layout_get_content_size(
      txt, font, GRect(0, 0, r.size.w, 40), GTextOverflowModeTrailingEllipsis,
      GTextAlignmentRight);
  // Align the text box to the block's top/bottom edge; the font's own padding
  // (leading above, descent below) insets each label symmetrically.
  // ponytail: tweak the +/-1 if a label still kisses or clips its edge.
  int y = top ? r.origin.y + 1
              : r.origin.y + r.size.h - sz.h - 1;
  graphics_context_set_text_color(ctx, color);
  graphics_draw_text(ctx, txt, font, GRect(r.origin.x, y, r.size.w - 3, sz.h + 4),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
}

#else  // fctx vector font

static void fctx_text(GContext *ctx, GPoint anchor, const char *txt, int cap_h,
                      GColor color, GTextAlignment align, FTextAnchor vanchor) {
  if (!s_ffont) return;   // font failed to load -> draw nothing (no crash)
  FContext f;
  fctx_init_context(&f, ctx);
  // fctx draws in absolute framebuffer coords; shift by the layer's origin.
  fctx_set_offset(&f, FPointI(anchor.x + s_draw_origin.x,
                              anchor.y + s_draw_origin.y));
  fctx_set_fill_color(&f, color);
  fctx_set_text_cap_height(&f, s_ffont, cap_h);
  fctx_begin_fill(&f);
  fctx_draw_string(&f, txt, s_ffont, align, vanchor);
  fctx_end_fill(&f);
  fctx_deinit_context(&f);
}

static void text_in_rect(GContext *ctx, GRect r, const char *txt, int cap_h,
                         GColor color, GTextAlignment align) {
  int x = (align == GTextAlignmentLeft)  ? r.origin.x
        : (align == GTextAlignmentRight) ? r.origin.x + r.size.w
        :                                  r.origin.x + r.size.w / 2;
  GPoint anchor = GPoint(x, r.origin.y + r.size.h / 2);
  fctx_text(ctx, anchor, txt, cap_h, color, align, FTextAnchorCapMiddle);
}

static int text_width(GContext *ctx, const char *txt, int cap_h) {
  if (!s_ffont) return 0;
  FContext f;
  fctx_init_context(&f, ctx);
  fctx_set_text_cap_height(&f, s_ffont, cap_h);
  int w = FIXED_TO_INT(fctx_string_width(&f, txt, s_ffont));
  fctx_deinit_context(&f);
  return w;
}

static void text_corner(GContext *ctx, GRect r, const char *txt, int cap_h,
                        bool top, GColor color) {
  const int pad = 3;
  // Pin to the block's top/bottom edge (cap-top grows down, bottom grows up)
  // so the two labels stay clear of each other and the centred day name.
  // ponytail: bottom needs extra lift so the baseline-anchored label clears the
  // border; raise the +5 if PM still kisses the edge.
  int y = top ? r.origin.y + pad : r.origin.y + r.size.h - pad;
  GPoint anchor = GPoint(r.origin.x + r.size.w - pad, y);
  // Bottom label uses Baseline, not Bottom: AM/PM have no descenders, so the
  // font's descent gap under Bottom would float the glyph up off the edge.
  fctx_text(ctx, anchor, txt, cap_h, color, GTextAlignmentRight,
            top ? FTextAnchorCapTop : FTextAnchorBaseline);
}

#endif

// Centre text in a rect (most blocks). cap_h is a fraction of the rect height,
// but shrink it if the string is too wide (e.g. 3-digit temps like "100°" or a
// long "54/75°") so it never spills past the panel. Width scales ~linearly with
// cap height, so one ratio pass is enough.
static void draw_centered(GContext *ctx, GRect r, const char *txt, int cap_h,
                          GColor color) {
  int avail = r.size.w - 6;
  int w = text_width(ctx, txt, cap_h);
  if (w > avail && avail > 0) cap_h = cap_h * avail / w;
  text_in_rect(ctx, r, txt, cap_h, color, GTextAlignmentCenter);
}

// The thin dark line across the middle that sells the "flip display" look.
static void draw_seam(GContext *ctx, GRect r) {
  if (!s_seam_enabled) return;
  int mid = r.origin.y + r.size.h / 2;
  graphics_context_set_fill_color(ctx, SEAM_COLOR);
  graphics_fill_rect(ctx, GRect(r.origin.x + 2, mid, r.size.w - 4, 1), 0,
                     GCornerNone);
}

static void draw_panel(GContext *ctx, GRect r, GColor bg) {
  graphics_context_set_fill_color(ctx, bg);
  graphics_fill_rect(ctx, r, 4, GCornersAll);
}

// ---------------------------------------------------------------------------
// Individual blocks
// ---------------------------------------------------------------------------

// Hours and minutes as separate strings, respecting the watch's 12/24h setting.
// 12h drops the leading zero on the hour ("9" not "09"); minutes always 2 digits.
static void digital_parts(char *hh, size_t hn, char *mm, size_t mn) {
  bool h24 = clock_is_24h_style();
  strftime(hh, hn, h24 ? "%H" : "%I", &s_now);
  if (!h24 && hh[0] == '0') memmove(hh, hh + 1, strlen(hh));
  strftime(mm, mn, "%M", &s_now);
}

// Hours / minutes as standalone 2-digit strings (leading zero kept). Hours honour
// the watch's 12/24h setting; %I/%H/%M all pad to two digits.
static void hours_str(char *buf, size_t n) {
  strftime(buf, n, clock_is_24h_style() ? "%H" : "%I", &s_now);
}
static void minutes_str(char *buf, size_t n) {
  strftime(buf, n, "%M", &s_now);
}

// Compact value text for the data blocks (year / steps / km / battery / weather).
// Health metrics fall back to "--" on platforms without Health (e.g. aplite).
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
    case BLK_TEMP:
    case BLK_TEMP_BIG:
      weather_temp_str(buf, n);
      break;
    case BLK_HUMIDITY: {
      char v[8];
      weather_humidity_str(v, sizeof(v));
      snprintf(buf, n, "%s%s", humidity_label(), v);   // localised "Hu45%"
      break;
    }
    case BLK_MINMAX:
      weather_minmax_str(buf, n);
      break;
    case BLK_PRECIP:
      weather_precip_str(buf, n);
      break;
    case BLK_DIGITAL: {
      char hh[4], mm[4];
      digital_parts(hh, sizeof(hh), mm, sizeof(mm));
      snprintf(buf, n, "%s:%s", hh, mm);
      break;
    }
    case BLK_HOURS:
    case BLK_HOURS_BIG:
      hours_str(buf, n);
      break;
    case BLK_MINUTES:
    case BLK_MINUTES_BIG:
      minutes_str(buf, n);
      break;
    default:
      buf[0] = '\0';
      break;
  }
}

// A plain centred short block (steps / km / battery / temp / humidity), same
// look as the month.
static void draw_value_block(GContext *ctx, GRect r, QuadBlock blk) {
  char buf[16];
  block_text(blk, buf, sizeof(buf));
  draw_panel(ctx, r, s_panel_bg);
  // Big cap (matches the month block); draw_centered shrinks it to fit width if
  // the string (a wide "°"/prefix value) would overflow.
  draw_centered(ctx, r, buf, r.size.h * 52 / 100, s_text_fg);
  draw_seam(ctx, r);
}

static void draw_day(GContext *ctx, GRect r) {
  char buf[4];
  snprintf(buf, sizeof(buf), "%d", s_now.tm_mday);
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, r.size.h * 50 / 100, s_text_fg);
  draw_seam(ctx, r);
}

// Big hours / minutes block: one big centred 2-digit number, like the day.
static void draw_big_number(GContext *ctx, GRect r, const char *txt) {
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, txt, r.size.h * 50 / 100, s_text_fg);
  draw_seam(ctx, r);
}

// Big temperature block: same big number treatment as the day-of-month.
static void draw_temp_big(GContext *ctx, GRect r) {
  char buf[16];
  weather_temp_str(buf, sizeof(buf));
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, r.size.h * 40 / 100, s_text_fg);   // "°" widens it
  draw_seam(ctx, r);
}

// Big digital clock: hours in the top half, minutes in the bottom half, split by
// the seam. (The small/banner variant is just "HH:MM" via draw_value_block.)
static void draw_digital_big(GContext *ctx, GRect r) {
  char hh[4], mm[4];
  digital_parts(hh, sizeof(hh), mm, sizeof(mm));
  draw_panel(ctx, r, s_panel_bg);
  int half = r.size.h / 2;
  GRect top = GRect(r.origin.x, r.origin.y, r.size.w, half);
  GRect bot = GRect(r.origin.x, r.origin.y + half, r.size.w, r.size.h - half);
  draw_centered(ctx, top, hh, half * 75 / 100, s_text_fg);
  draw_centered(ctx, bot, mm, half * 75 / 100, s_text_fg);
  draw_seam(ctx, r);
}

static void draw_month(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, month_name(), r.size.h * 52 / 100, s_text_fg);
  draw_seam(ctx, r);
}

static void draw_dow(GContext *ctx, GRect r) {
  const char *buf = wday_name();     // title case "Mon" (matches "Jun")
  bool weekend = (s_now.tm_wday == 0 || s_now.tm_wday == 6);
  GColor bg_panel = weekend ? s_weekend_bg : s_panel_bg;
  draw_panel(ctx, r, bg_panel);
  GColor s_override_text_fg = contrast_color(bg_panel);

  // Day-of-week is left-aligned with a little left padding so the AM/PM label
  // in the right corners never collides with it.
  GRect lr = r;
  lr.origin.x += 6;
  lr.size.w -= 6;
  text_in_rect(ctx, lr, buf, r.size.h * 42 / 100, s_override_text_fg,
               GTextAlignmentLeft);

  // AM top-right, PM bottom-right; the active one is bright.
  int ampm_cap = PBL_IF_ROUND_ELSE(is_large_screen ? 9 : 5, is_large_screen ? 8 : 6);
  bool is_pm = s_now.tm_hour >= 12;
  GColor dim = get_closest_accent_color(bg_panel);
  text_corner(ctx, r, "AM", ampm_cap, true,  is_pm ? dim : s_override_text_fg);
  text_corner(ctx, r, "PM", ampm_cap, false, is_pm ? s_override_text_fg : dim);

  draw_seam(ctx, r);
}

// AM/PM as a short block: AM pinned left, PM pinned right, the active side in the
// text colour and the other dimmed (same colours as the weekday block's markers).
static void draw_ampm(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  bool is_pm = s_now.tm_hour >= 12;
  GColor dim = get_closest_accent_color(s_panel_bg);
  int cap = r.size.h * 29 / 100;
  GRect ir = r;
  ir.origin.x += 6;
  ir.size.w -= 12;
  text_in_rect(ctx, ir, "AM", cap, is_pm ? dim : s_text_fg, GTextAlignmentLeft);
  text_in_rect(ctx, ir, "PM", cap, is_pm ? s_text_fg : dim, GTextAlignmentRight);
  draw_seam(ctx, r);
}

// AM/PM variant: AM in the top-left, PM in the bottom-right (diagonal).
static void draw_ampm_stack(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  bool is_pm = s_now.tm_hour >= 12;
  GColor dim = get_closest_accent_color(s_panel_bg);
  int cap = r.size.h * 29 / 100;
  int half = r.size.h / 2;
  GRect top = GRect(r.origin.x + 6, r.origin.y, r.size.w - 12, half);
  GRect bot = GRect(r.origin.x + 6, r.origin.y + half, r.size.w - 12, r.size.h - half);
  text_in_rect(ctx, top, "AM", cap, is_pm ? dim : s_text_fg, GTextAlignmentLeft);
  text_in_rect(ctx, bot, "PM", cap, is_pm ? s_text_fg : dim, GTextAlignmentRight);
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
    gdraw_command_set_fill_color(cmd, get_closest_accent_color(s_panel_bg));
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


  draw_seam(ctx, r);
}

// The banner sits in a horizontal band but the panel itself is only a little
// wider than the text (not full width), centred in that band. The panel fills
// the band's height (which the caller sizes to the text).
void draw_band(GContext *ctx, GRect band) {
  char buf[16];
  block_text(s_band_block, buf, sizeof(buf));
  int cap_h = band.size.h * 60 / 100;

  // Measure the string so the panel hugs the text.
  int text_w = text_width(ctx, buf, cap_h);

  const int pad_x = 8;
  GRect r;
  r.size.w = text_w + pad_x * 2;
  r.size.h = band.size.h;
  r.origin.x = band.origin.x + (band.size.w - r.size.w) / 2;
  r.origin.y = band.origin.y;

  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, cap_h, s_text_fg);
  draw_seam(ctx, r);
}

void draw_block(GContext *ctx, QuadBlock blk, GRect r) {
  switch (blk) {
    case BLK_DOW:      draw_dow(ctx, r);      break;
    case BLK_DAY:      draw_day(ctx, r);      break;
    case BLK_CLOCK:    draw_clock(ctx, r);    break;
    case BLK_MONTH:    draw_month(ctx, r);    break;
    case BLK_TEMP_BIG: draw_temp_big(ctx, r); break;
    case BLK_DIGITAL_BIG: draw_digital_big(ctx, r); break;
    case BLK_HOURS_BIG: { char b[4]; hours_str(b, sizeof b); draw_big_number(ctx, r, b); break; }
    case BLK_MINUTES_BIG: { char b[4]; minutes_str(b, sizeof b); draw_big_number(ctx, r, b); break; }
    case BLK_AMPM:     draw_ampm(ctx, r);     break;
    case BLK_AMPM_STACK: draw_ampm_stack(ctx, r); break;
    case BLK_WEATHER:  draw_icon_block(ctx, r, weather_icon_resource()); break;
    default:           draw_value_block(ctx, r, blk); break;  // steps / km / battery / temp / humidity
  }
}

// ---------------------------------------------------------------------------
// Flip animation (centred single-string grid blocks only)
// ---------------------------------------------------------------------------

// The string a flippable block shows, plus whether it's flippable at all. The
// analog clock, weather icon, two-half big digital and the am/pm dow block draw
// their own way, so they don't flip -> return false.
static bool block_centered_text(QuadBlock b, char *buf, size_t n) {
  switch (b) {
    case BLK_DAY:   snprintf(buf, n, "%d", s_now.tm_mday); return true;
    case BLK_MONTH: snprintf(buf, n, "%s", month_name());  return true;
    case BLK_STEPS: case BLK_KM:  case BLK_BATTERY:
    case BLK_TEMP:  case BLK_TEMP_BIG: case BLK_HUMIDITY:
    case BLK_PRECIP: case BLK_DIGITAL:
    case BLK_HOURS: case BLK_HOURS_BIG:
    case BLK_MINUTES: case BLK_MINUTES_BIG:
      block_text(b, buf, n); return true;
    default: return false;
  }
}

// Cap height each flippable block uses (mirrors its draw_* function), so the
// flip's text matches the block's resting size.
static int block_cap_h(QuadBlock b, GRect r) {
  if (b == BLK_DAY || b == BLK_HOURS_BIG || b == BLK_MINUTES_BIG)
    return r.size.h * 50 / 100;
  if (b == BLK_TEMP_BIG) return r.size.h * 40 / 100;
  return r.size.h * 52 / 100;   // month + all value blocks
}

// One flip frame: the value, masked down to a centred band of height `hv` so it
// looks foreshortened toward the seam. Gaps are filled with the panel colour
// (rounded at the outer corners so the panel keeps its shape); the seam is drawn
// last so the centre line stays put. hv == r.h is a no-op (full value).
static void draw_flip(GContext *ctx, GRect r, const char *txt, int cap_h,
                      GColor color, int hv) {
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, txt, cap_h, color);

  int seam = r.origin.y + r.size.h / 2;
  int half = hv / 2;
  int top_h = (seam - half) - r.origin.y;
  int bot_y = seam + half;
  int bot_h = r.origin.y + r.size.h - bot_y;
  graphics_context_set_fill_color(ctx, s_panel_bg);
  if (top_h > 0)
    graphics_fill_rect(ctx, GRect(r.origin.x, r.origin.y, r.size.w, top_h), 4,
                       GCornersTop);
  if (bot_h > 0)
    graphics_fill_rect(ctx, GRect(r.origin.x, bot_y, r.size.w, bot_h), 4,
                       GCornersBottom);
  draw_seam(ctx, r);
}

// Flip-aware render for a grid layer (called from the layer's update_proc).
// Detects a value change, kicks off the flip, and draws the right frame; blocks
// that aren't flippable just fall through to draw_block.
void draw_block_layer(GContext *ctx, Layer *layer) {
  BlockState *st = (BlockState *)layer_get_data(layer);
  GRect r = layer_get_bounds(layer);

  char now[16];
  if (!block_centered_text(st->blk, now, sizeof now)) {
    draw_block(ctx, st->blk, r);
    return;
  }

  // Start a flip on a real change (shown[0] == 0 means first paint -> silent).
  if (s_flip_enabled && !st->anim && st->shown[0] && strcmp(now, st->shown) != 0) {
    strncpy(st->old, st->shown, sizeof st->old);
    st->anim = FLIP_STEPS;
    flip_request();
  }
  strncpy(st->shown, now, sizeof st->shown);   // shown tracks the live value

  if (!st->anim) {
    draw_block(ctx, st->blk, r);
    return;
  }

  // anim counts FLIP_STEPS..1; p_num 0..STEPS-1 walks the flip. First half the
  // old value collapses to the seam, second half the new value grows back out.
  int p_num = FLIP_STEPS - st->anim;
  const char *active;
  int hv;
  if (2 * p_num <= FLIP_STEPS) {
    active = st->old;
    hv = r.size.h * (FLIP_STEPS - 2 * p_num) / FLIP_STEPS;
  } else {
    active = now;
    hv = r.size.h * (2 * p_num - FLIP_STEPS) / FLIP_STEPS;
  }
  draw_flip(ctx, r, active, block_cap_h(st->blk, r), s_text_fg, hv);
}

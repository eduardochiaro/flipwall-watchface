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
         v == BLK_TEMP || v == BLK_TEMP_BIG || v == BLK_HUMIDITY;
}
bool block_valid_band(int v) {
  return v == BLK_YEAR || (v >= BLK_STEPS && v <= BLK_BATTERY) ||
         v == BLK_MONTH_DAY || v == BLK_DOW_DAY ||
         v == BLK_TEMP || v == BLK_HUMIDITY || v == BLK_MINMAX;
}
bool block_is_short(QuadBlock b) {
  return !(b == BLK_DAY || b == BLK_CLOCK || b == BLK_WEATHER || b == BLK_TEMP_BIG);
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
    case BLK_HUMIDITY:
      weather_humidity_str(buf, n);
      break;
    case BLK_MINMAX:
      weather_minmax_str(buf, n);
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
  draw_centered(ctx, r, buf, s_font_txt_sm, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

static void draw_day(GContext *ctx, GRect r) {
  char buf[4];
  snprintf(buf, sizeof(buf), "%d", s_now.tm_mday);
  draw_panel(ctx, r, s_panel_bg);
  draw_centered(ctx, r, buf, s_font_num, s_text_fg, GTextAlignmentCenter);
  draw_seam(ctx, r);
}

// Big temperature block: same big number treatment as the day-of-month.
static void draw_temp_big(GContext *ctx, GRect r) {
  char buf[16];
  weather_temp_str(buf, sizeof(buf));
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
}

// The banner sits in a horizontal band but the panel itself is only a little
// wider than the text (not full width), centred in that band. The panel fills
// the band's height (which the caller sizes to the text).
void draw_band(GContext *ctx, GRect band) {
  char buf[16];
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

void draw_block(GContext *ctx, QuadBlock blk, GRect r) {
  switch (blk) {
    case BLK_DOW:      draw_dow(ctx, r);      break;
    case BLK_DAY:      draw_day(ctx, r);      break;
    case BLK_CLOCK:    draw_clock(ctx, r);    break;
    case BLK_MONTH:    draw_month(ctx, r);    break;
    case BLK_TEMP_BIG: draw_temp_big(ctx, r); break;
    case BLK_WEATHER:  draw_icon_block(ctx, r, weather_icon_resource()); break;
    default:           draw_value_block(ctx, r, blk); break;  // steps / km / battery / temp / humidity
  }
}

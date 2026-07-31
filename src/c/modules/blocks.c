#include "../flipwall.h"
#include "weather.h"

#define SEAM_COLOR   GColorDarkGray
// Not localised: the UV index is labelled the same way everywhere. Only the big
// block is captioned; the short block uses the UV icon instead.
#define UV_LABEL_BIG "UV Index"
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
         v == BLK_AMPM || v == BLK_AMPM_STACK || v == BLK_MINMAX ||
         v == BLK_HR || v == BLK_TEMP_ICON || v == BLK_CALENDAR ||
         v == BLK_MONTH_DAY || v == BLK_DOW_DAY ||
         v == BLK_HUMIDITY_BIG || v == BLK_BATTERY_BIG ||
         v == BLK_MONTH_CAL || v == BLK_HR_BIG ||
         v == BLK_KM_BIG || v == BLK_MINMAX_BIG ||
         v == BLK_UV || v == BLK_UV_BIG ||
         v == BLK_WIND || v == BLK_WIND_BIG ||
         v == BLK_WIND_DIR || v == BLK_WIND_DIR_BIG ||
         v == BLK_AQI || v == BLK_AQI_BIG ||
         (v >= BLK_UV_COLOR && v <= BLK_AQI_BIG_COLOR) ||
         v == BLK_BEAT || v == BLK_BEAT_BIG;
}
bool block_valid_band(int v) {
  return v == BLK_YEAR || (v >= BLK_STEPS && v <= BLK_BATTERY) ||
         v == BLK_MONTH_DAY || v == BLK_DOW_DAY ||
         v == BLK_TEMP || v == BLK_HUMIDITY || v == BLK_MINMAX ||
         v == BLK_PRECIP || v == BLK_DIGITAL || v == BLK_HR ||
         v == BLK_TEMP_ICON || v == BLK_UV ||
         v == BLK_WIND || v == BLK_WIND_DIR || v == BLK_AQI ||
         v == BLK_UV_COLOR || v == BLK_AQI_COLOR || v == BLK_BEAT;
}
bool block_is_short(QuadBlock b) {
  return !(b == BLK_DAY || b == BLK_CLOCK || b == BLK_WEATHER ||
           b == BLK_TEMP_BIG || b == BLK_DIGITAL_BIG ||
           b == BLK_HOURS_BIG || b == BLK_MINUTES_BIG ||
           b == BLK_CALENDAR || b == BLK_HUMIDITY_BIG ||
           b == BLK_BATTERY_BIG || b == BLK_MONTH_CAL ||
           b == BLK_HR_BIG || b == BLK_KM_BIG || b == BLK_MINMAX_BIG ||
           b == BLK_UV_BIG || b == BLK_WIND_BIG || b == BLK_WIND_DIR_BIG ||
           b == BLK_AQI_BIG || b == BLK_UV_BIG_COLOR ||
           b == BLK_AQI_BIG_COLOR || b == BLK_BEAT_BIG);
}

// A "- colour" variant draws exactly like the block it mirrors; only the panel
// colour differs (see block_panel_color).
static QuadBlock base_block(QuadBlock b) {
  switch (b) {
    case BLK_UV_COLOR:      return BLK_UV;
    case BLK_UV_BIG_COLOR:  return BLK_UV_BIG;
    case BLK_AQI_COLOR:     return BLK_AQI;
    case BLK_AQI_BIG_COLOR: return BLK_AQI_BIG;
    default:                return b;
  }
}

#ifdef PBL_COLOR
// The index ramps: WHO UV bands run green -> purple, AQI green -> maroon. Index
// with weather_uv_band() / weather_aqi_band().
static const uint8_t UV_BAND_ARGB[5] = {
  GColorGreenARGB8, GColorYellowARGB8, GColorOrangeARGB8, GColorRedARGB8,
  GColorPurpleARGB8
};
static const uint8_t AQI_BAND_ARGB[6] = {
  GColorGreenARGB8, GColorYellowARGB8, GColorOrangeARGB8, GColorRedARGB8,
  GColorPurpleARGB8, GColorBulgarianRoseARGB8
};
#endif

// The panel colour a block draws on: the reading's band colour for the "- colour"
// variants, otherwise the configured panel colour (which is also the fallback
// before the first reading, and on the black-and-white platforms).
static GColor block_panel_color(QuadBlock b) {
#ifdef PBL_COLOR
  int band;
  switch (b) {
    case BLK_UV_COLOR:
    case BLK_UV_BIG_COLOR:
      band = weather_uv_band();
      if (band >= 0) return (GColor){ .argb = UV_BAND_ARGB[band] };
      break;
    case BLK_AQI_COLOR:
    case BLK_AQI_BIG_COLOR:
      band = weather_aqi_band();
      if (band >= 0) return (GColor){ .argb = AQI_BAND_ARGB[band] };
      break;
    default: break;
  }
#else
  (void)b;
#endif
  return s_panel_bg;
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

// Swatch Internet Time: the day split into 1000 beats, counted from midnight in
// Biel (UTC+1) with no timezones and no DST, so it is the same number worldwide.
static int beat_time(void) {
  return (int)(((time(NULL) + 3600) % 86400) * 1000 / 86400);
}

// Compact value text for the data blocks (year / steps / km / battery / weather).
// Health metrics fall back to "--" on platforms without Health (e.g. aplite).
static void block_text(QuadBlock blk, char *buf, size_t n) {
  switch (base_block(blk)) {
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
    case BLK_TEMP_ICON:
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
    case BLK_UV:
      weather_uv_str(buf, n);   // icon carries the meaning, so just the number
      break;
    case BLK_WIND:
      weather_wind_str(buf, n);
      break;
    case BLK_AQI: {
      char v[8];
      weather_aqi_str(v, sizeof(v));
      snprintf(buf, n, "AQI %s", v);   // no icon for AQI, so the value is labelled
      break;
    }
    case BLK_WIND_DIR:
      weather_wind_dir_str(buf, n);   // the arrow icon carries the angle
      break;
    case BLK_BEAT:
      snprintf(buf, n, "@%03d", beat_time());
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
    case BLK_HR: {
#if defined(PBL_HEALTH)
      int bpm = (int)health_service_peek_current_value(HealthMetricHeartRateBPM);
      if (bpm > 0) snprintf(buf, n, "%d", bpm);   // averaged over the last minute
      else         snprintf(buf, n, "--");        // no reading yet
#else
      snprintf(buf, n, "--");
#endif
      break;
    }
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

// "@642" with the "@" in the panel's accent colour (the dim shade the icons and
// the inactive AM/PM use), so the marker reads as a prefix and not a digit.
// Shrinks to fit like draw_centered, then lays the two pieces out side by side
// about the block's centre.
static void draw_beat_text(GContext *ctx, GRect r, const char *txt, int cap_h) {
  int avail = r.size.w - 6;
  int w = text_width(ctx, txt, cap_h);
  if (w > avail && avail > 0) {
    cap_h = cap_h * avail / w;
    w = text_width(ctx, txt, cap_h);
  }
  int w_at = text_width(ctx, "@", cap_h);
  int x = r.origin.x + (r.size.w - w) / 2;
  // Both pieces run to the block's right edge so neither layout box clips.
  GRect at = GRect(x, r.origin.y, r.origin.x + r.size.w - x, r.size.h);
  GRect num = GRect(x + w_at, r.origin.y, r.origin.x + r.size.w - x - w_at, r.size.h);
  text_in_rect(ctx, at, "@", cap_h, get_closest_accent_color(s_panel_bg),
               GTextAlignmentLeft);
  text_in_rect(ctx, num, txt + 1, cap_h, s_text_fg, GTextAlignmentLeft);
}

static void draw_beat(GContext *ctx, GRect r) {
  char buf[8];
  block_text(BLK_BEAT, buf, sizeof(buf));
  draw_panel(ctx, r, s_panel_bg);
  draw_beat_text(ctx, r, buf, r.size.h * 52 / 100);   // same cap as draw_value_block
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
  hours_str(hh, sizeof(hh));     // keep the leading zero (2 digits)
  minutes_str(mm, sizeof(mm));
  draw_panel(ctx, r, s_panel_bg);
  int half = r.size.h / 2;
  GRect top = GRect(r.origin.x, r.origin.y, r.size.w, half);
  GRect bot = GRect(r.origin.x, r.origin.y + half, r.size.w, r.size.h - half);
  draw_centered(ctx, top, hh, half * 75 / 100, s_text_fg);
  draw_centered(ctx, bot, mm, half * 75 / 100, get_closest_accent_color(s_text_fg));
  draw_seam(ctx, r);
}

// Big two-line block: a small caption and a big value stacked, split by the
// seam. label_top puts the caption above the value (calendar/humidity/battery);
// otherwise the value sits on top (HR/distance). caption_fg lets the calendar
// tint its weekday on weekends; everything else passes s_text_fg. Caller draws
// the panel and seam.
static void draw_caption_value(GContext *ctx, GRect r, const char *caption,
                               GColor caption_fg, const char *value,
                               bool label_top) {
  // Inset the content vertically for extra top/bottom margin; the caption sits in
  // a slim band, the value fills the rest at a big cap (so it crosses the seam,
  // like the other big-number blocks). `mx` keeps both lines clear of the side
  // borders — a wide caption is shrunk to that inner width by draw_centered.
  int m  = r.size.h * 12 / 100;
  int mx = r.size.w * 10 / 100;
  GRect in = GRect(r.origin.x + mx, r.origin.y + m, r.size.w - 2 * mx,
                   r.size.h - 2 * m);
  int small_h = in.size.h * 38 / 100;
  GRect small_r, big_r;
  if (label_top) {
    small_r = GRect(in.origin.x, in.origin.y, in.size.w, small_h);
    big_r   = GRect(in.origin.x, in.origin.y + small_h, in.size.w, in.size.h - small_h);
  } else {
    big_r   = GRect(in.origin.x, in.origin.y, in.size.w, in.size.h - small_h);
    small_r = GRect(in.origin.x, in.origin.y + in.size.h - small_h, in.size.w, small_h);
  }
  draw_centered(ctx, small_r, caption, r.size.h * 19 / 100, caption_fg);   // small
  draw_centered(ctx, big_r, value, r.size.h * 46 / 100, s_text_fg);        // big
}

// Calendar block: weekday name (small) over the day-of-month (big), split by the
// seam. On weekends the weekday name is drawn in the accent/weekend colour.
static void draw_calendar(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  bool weekend = (s_now.tm_wday == 0 || s_now.tm_wday == 6);
  GColor dow_fg = weekend ? s_weekend_bg : s_text_fg;
  char day[4];
  snprintf(day, sizeof(day), "%d", s_now.tm_mday);
  draw_caption_value(ctx, r, wday_name(), dow_fg, day, true);
  draw_seam(ctx, r);
}

// Calendar variant: month name (small) over the day-of-month (big). No accent.
static void draw_month_cal(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char day[4];
  snprintf(day, sizeof(day), "%d", s_now.tm_mday);
  draw_caption_value(ctx, r, month_name(), s_text_fg, day, true);
  draw_seam(ctx, r);
}

// Big humidity: localised "Hum" caption over the "47%" value.
static void draw_humidity_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char v[8];
  weather_humidity_str(v, sizeof(v));
  draw_caption_value(ctx, r, humidity_label3(), s_text_fg, v, true);
  draw_seam(ctx, r);
}

// Big battery: localised "Batt" caption over the "82%" value.
static void draw_battery_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char v[8];
  snprintf(v, sizeof(v), "%d%%", battery_state_service_peek().charge_percent);
  draw_caption_value(ctx, r, battery_label(), s_text_fg, v, true);
  draw_seam(ctx, r);
}

// Big heart rate: the BPM number over a "BPM" caption.
static void draw_hr_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char v[8];
  block_text(BLK_HR, v, sizeof(v));
  draw_caption_value(ctx, r, "BPM", s_text_fg, v, false);
  draw_seam(ctx, r);
}

// Big UV index: the big number over a "UV I" caption (same as the HR block).
static void draw_uv_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char v[8];
  weather_uv_str(v, sizeof(v));
  draw_caption_value(ctx, r, UV_LABEL_BIG, s_text_fg, v, false);
  draw_seam(ctx, r);
}

// Big .beat time: the beat count over a ".beat" caption (like the HR block).
static void draw_beat_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char v[8];
  snprintf(v, sizeof(v), "%03d", beat_time());
  draw_caption_value(ctx, r, ".beat", s_text_fg, v, false);
  draw_seam(ctx, r);
}

// Big air quality: the index over an "AQI" caption (same shape as the UV block).
static void draw_aqi_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char v[8];
  weather_aqi_str(v, sizeof(v));
  draw_caption_value(ctx, r, "AQI", s_text_fg, v, false);
  draw_seam(ctx, r);
}

// Split a short block's value ("3.2km", "12km/h") into its numeric part and an
// upper-cased unit, so a big block can stack the two. "--" yields an empty unit.
static void split_num_unit(const char *src, char *num, size_t nn,
                           char *unit, size_t un) {
  size_t i = 0;
  while (src[i] && (src[i] == '.' || (src[i] >= '0' && src[i] <= '9'))) i++;
  size_t ni = i < nn - 1 ? i : nn - 1;
  memcpy(num, src, ni);
  num[ni] = '\0';
  size_t u = 0;
  for (; src[i] && u < un - 1; i++, u++)
    unit[u] = (src[i] >= 'a' && src[i] <= 'z') ? src[i] - 32 : src[i];
  unit[u] = '\0';
}

// Big distance: the number over its unit (KM/M/MI). Reuses the short block's
// value formatting (same rounding / imperial handling).
static void draw_km_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char buf[16], num[8], unit[8];
  block_text(BLK_KM, buf, sizeof(buf));   // e.g. "3.2km" or "--"
  split_num_unit(buf, num, sizeof(num), unit, sizeof(unit));
  draw_caption_value(ctx, r, unit, s_text_fg, num, false);
  draw_seam(ctx, r);
}

// Big wind speed: the number over its unit (KM/H or MPH), like the distance block.
static void draw_wind_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char buf[16], num[8], unit[8];
  weather_wind_str(buf, sizeof(buf));     // e.g. "12km/h" or "--"
  split_num_unit(buf, num, sizeof(num), unit, sizeof(unit));
  draw_caption_value(ctx, r, unit, s_text_fg, num, false);
  draw_seam(ctx, r);
}

// Big max/min temp: max in the top half, min in the bottom half (in the accent
// colour), split by the seam — same two-half treatment as the big digital clock.
static void draw_minmax_big(GContext *ctx, GRect r) {
  char mx[8], mn[8];
  weather_max_str(mx, sizeof(mx));
  weather_min_str(mn, sizeof(mn));
  draw_panel(ctx, r, s_panel_bg);
  int half = r.size.h / 2;
  GRect top = GRect(r.origin.x, r.origin.y, r.size.w, half);
  GRect bot = GRect(r.origin.x, r.origin.y + half, r.size.w, r.size.h - half);
  draw_centered(ctx, top, mx, half * 75 / 100, s_text_fg);
  draw_centered(ctx, bot, mn, half * 75 / 100, get_closest_accent_color(s_text_fg));
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
  int ampm_cap = is_large_screen ? 10 : 8;
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

// Draw a PDC (vector) icon scaled to fit `box` (square, centred in it), stroked
// in `stroke` and filled in `fill`, optionally rotated clockwise by `angle` (a
// TRIG_MAX_ANGLE value; 0 = upright) about the icon's centre. PDC has no scale or
// rotate API, so the icon is recreated each redraw and its points transformed.
// Shared by the weather icon block, the HR block and the wind arrow.
static void draw_pdc_in(GContext *ctx, uint32_t res_id, GRect box,
                        GColor stroke, GColor fill, int32_t angle) {
  GDrawCommandImage *img = gdraw_command_image_create_with_resource(res_id);
  if (!img) return;
  GSize native = gdraw_command_image_get_bounds_size(img);
  if (native.w <= 0 || native.h <= 0) { gdraw_command_image_destroy(img); return; }

  int side = (box.size.w < box.size.h ? box.size.w : box.size.h);
  if (side < 1) side = 1;

  // Rotation is about the scaled icon's centre, so every point stays within
  // `side` of it -> the icon can't spill out of the (square) box at any angle.
  // Precise-path commands store their points in 1/8 pixel, so their centre sits
  // at 8x the pixel one (side/2 * 8); plain paths/circles are whole pixels.
  int32_t sn = angle ? sin_lookup(angle) : 0;
  int32_t cs = angle ? cos_lookup(angle) : 0;

  GDrawCommandList *list = gdraw_command_image_get_command_list(img);
  uint32_t n = gdraw_command_list_get_num_commands(list);
  for (uint32_t i = 0; i < n; i++) {
    GDrawCommand *cmd = gdraw_command_list_get_command(list, i);
    gdraw_command_set_stroke_color(cmd, stroke);
    gdraw_command_set_fill_color(cmd, fill);
    int32_t half = gdraw_command_get_type(cmd) == GDrawCommandTypePrecisePath
                       ? side * 4 : side / 2;
    uint16_t np = gdraw_command_get_num_points(cmd);
    for (uint16_t p = 0; p < np; p++) {
      GPoint pt = gdraw_command_get_point(cmd, p);
      pt.x = pt.x * side / native.w;
      pt.y = pt.y * side / native.h;
      if (angle) {
        // Screen y grows downward, so this matrix turns the icon clockwise.
        int32_t dx = pt.x - half, dy = pt.y - half;
        pt.x = half + (dx * cs - dy * sn) / TRIG_MAX_RATIO;
        pt.y = half + (dx * sn + dy * cs) / TRIG_MAX_RATIO;
      }
      gdraw_command_set_point(cmd, p, pt);
    }
  }
  GPoint offset = GPoint(box.origin.x + (box.size.w - side) / 2,
                         box.origin.y + (box.size.h - side) / 2);
  gdraw_command_image_draw(ctx, img, offset);
  gdraw_command_image_destroy(img);
}

// A big block holding a PDC icon, filling the block less a small padding.
// Cheap: only redrawn on minute ticks.
static void draw_icon_block(GContext *ctx, GRect r, uint32_t res_id) {
  draw_panel(ctx, r, s_panel_bg);
  draw_pdc_in(ctx, res_id, grect_inset(r, GEdgeInsets(8)), s_text_fg,
              get_closest_accent_color(s_panel_bg), 0);
  draw_seam(ctx, r);
}

// A short block: a small PDC icon on the left, the value string filling the
// rest. The number is what changes, so it (not the icon) carries the value.
// Shared by the HR block (heart), the temperature-with-icon block and the wind
// direction block (whose icon is rotated by `angle`).
static void draw_icon_value(GContext *ctx, GRect r, uint32_t res_id,
                            const char *txt, int32_t angle) {
  draw_panel(ctx, r, s_panel_bg);

  int icon = r.size.h * 55 / 100;
  GRect ibox = GRect(r.origin.x + 6, r.origin.y + (r.size.h - icon) / 2, icon, icon);
  draw_pdc_in(ctx, res_id, ibox, s_text_fg, get_closest_accent_color(s_panel_bg),
              angle);

  // Value centred in the space to the right of the icon.
  GRect nr = r;
  nr.origin.x = ibox.origin.x + icon;
  nr.size.w   = r.origin.x + r.size.w - nr.origin.x - 4;
  draw_centered(ctx, nr, txt, r.size.h * 52 / 100, s_text_fg);
  draw_seam(ctx, r);
}

// Big wind direction: the arrow (rotated to the wind's bearing) over the compass
// word. Same 12% margin / 19%-cap caption as draw_caption_value, but the big
// line is an icon instead of text.
static void draw_wind_dir_big(GContext *ctx, GRect r) {
  draw_panel(ctx, r, s_panel_bg);
  char dir[8];
  weather_wind_dir_str(dir, sizeof(dir));
  int m    = r.size.h * 12 / 100;
  int band = r.size.h * 30 / 100;         // bottom caption band
  GRect ibox = GRect(r.origin.x, r.origin.y + m, r.size.w,
                     r.size.h - m - band);
  draw_pdc_in(ctx, RESOURCE_ID_ICON_WIND_DIRECTION_N, ibox, s_text_fg,
              get_closest_accent_color(s_panel_bg), weather_wind_angle());
  GRect cr = GRect(r.origin.x, r.origin.y + r.size.h - band, r.size.w, band - m);
  draw_centered(ctx, cr, dir, r.size.h * 19 / 100, s_text_fg);
  draw_seam(ctx, r);
}

// The banner sits in a horizontal band but the panel itself is only a little
// wider than the text (not full width), centred in that band. The panel fills
// the band's height (which the caller sizes to the text).
void draw_band(GContext *ctx, GRect band) {
  // Same colour override as draw_block for the "- colour" variants, restored
  // before returning; blk is the block the banner actually draws.
  GColor save_bg = s_panel_bg, save_fg = s_text_fg;
  s_panel_bg = block_panel_color(s_band_block);
  if (!gcolor_equal(s_panel_bg, save_bg)) s_text_fg = contrast_color(s_panel_bg);
  QuadBlock blk = base_block(s_band_block);

  char buf[16];
  block_text(blk, buf, sizeof(buf));
  int cap_h = band.size.h * 60 / 100;

  // Measure the string so the panel hugs the text.
  int text_w = text_width(ctx, buf, cap_h);

  const int pad_x = 8;
  // Some banner blocks carry a PDC icon left of the value, like their grid form.
  uint32_t icon_res = blk == BLK_HR        ? RESOURCE_ID_ICON_HEART
                    : blk == BLK_UV        ? RESOURCE_ID_ICON_UV
                    : blk == BLK_WIND_DIR  ? RESOURCE_ID_ICON_WIND_DIRECTION_N
                    : blk == BLK_TEMP_ICON ? weather_icon_resource_small()
                    : 0;
  // Only the wind arrow turns; every other banner icon is drawn upright.
  int32_t icon_angle = blk == BLK_WIND_DIR ? weather_wind_angle() : 0;
  int icon = icon_res ? band.size.h * 60 / 100 : 0;
  int gap  = icon_res ? 4 : 0;

  GRect r;
  r.size.w = text_w + pad_x * 2 + icon + gap;
  r.size.h = band.size.h;
  r.origin.x = band.origin.x + (band.size.w - r.size.w) / 2;
  r.origin.y = band.origin.y;

  draw_panel(ctx, r, s_panel_bg);
  if (icon_res) {
    GRect ibox = GRect(r.origin.x + pad_x, r.origin.y + (r.size.h - icon) / 2,
                       icon, icon);
    draw_pdc_in(ctx, icon_res, ibox, s_text_fg, get_closest_accent_color(s_panel_bg),
                icon_angle);
    GRect nr = r;
    nr.origin.x = ibox.origin.x + icon + gap;
    nr.size.w   = r.origin.x + r.size.w - nr.origin.x - pad_x;
    draw_centered(ctx, nr, buf, cap_h, s_text_fg);
  } else if (blk == BLK_BEAT) {
    draw_beat_text(ctx, r, buf, cap_h);
  } else {
    draw_centered(ctx, r, buf, cap_h, s_text_fg);
  }
  draw_seam(ctx, r);

  s_panel_bg = save_bg;
  s_text_fg  = save_fg;
}

void draw_block(GContext *ctx, QuadBlock blk, GRect r) {
  // Paint on the index colour for the "- colour" variants (a no-op otherwise);
  // the text and icon accent follow from s_panel_bg, so both are restored after.
  GColor save_bg = s_panel_bg, save_fg = s_text_fg;
  s_panel_bg = block_panel_color(blk);
  if (!gcolor_equal(s_panel_bg, save_bg)) s_text_fg = contrast_color(s_panel_bg);

  switch (base_block(blk)) {
    case BLK_DOW:      draw_dow(ctx, r);      break;
    case BLK_DAY:      draw_day(ctx, r);      break;
    case BLK_CLOCK:    draw_clock(ctx, r);    break;
    case BLK_MONTH:    draw_month(ctx, r);    break;
    case BLK_TEMP_BIG: draw_temp_big(ctx, r); break;
    case BLK_DIGITAL_BIG: draw_digital_big(ctx, r); break;
    case BLK_CALENDAR: draw_calendar(ctx, r); break;
    case BLK_MONTH_CAL: draw_month_cal(ctx, r); break;
    case BLK_HUMIDITY_BIG: draw_humidity_big(ctx, r); break;
    case BLK_BATTERY_BIG: draw_battery_big(ctx, r); break;
    case BLK_HR_BIG:   draw_hr_big(ctx, r);   break;
    case BLK_KM_BIG:   draw_km_big(ctx, r);   break;
    case BLK_MINMAX_BIG: draw_minmax_big(ctx, r); break;
    case BLK_UV_BIG:   draw_uv_big(ctx, r);   break;
    case BLK_WIND_BIG: draw_wind_big(ctx, r); break;
    case BLK_WIND_DIR_BIG: draw_wind_dir_big(ctx, r); break;
    case BLK_AQI_BIG:  draw_aqi_big(ctx, r);  break;
    case BLK_BEAT_BIG: draw_beat_big(ctx, r); break;
    case BLK_BEAT:     draw_beat(ctx, r);     break;
    case BLK_HOURS_BIG: { char b[4]; hours_str(b, sizeof b); draw_big_number(ctx, r, b); break; }
    case BLK_MINUTES_BIG: { char b[4]; minutes_str(b, sizeof b); draw_big_number(ctx, r, b); break; }
    case BLK_AMPM:     draw_ampm(ctx, r);     break;
    case BLK_AMPM_STACK: draw_ampm_stack(ctx, r); break;
    case BLK_WEATHER:  draw_icon_block(ctx, r, weather_icon_resource()); break;
    case BLK_HR: {
      char b[8]; block_text(BLK_HR, b, sizeof b);
      draw_icon_value(ctx, r, RESOURCE_ID_ICON_HEART, b, 0); break;
    }
    case BLK_TEMP_ICON: {
      char b[16]; block_text(BLK_TEMP_ICON, b, sizeof b);
      draw_icon_value(ctx, r, weather_icon_resource_small(), b, 0); break;
    }
    case BLK_UV: {
      char b[8]; block_text(BLK_UV, b, sizeof b);
      draw_icon_value(ctx, r, RESOURCE_ID_ICON_UV, b, 0); break;
    }
    case BLK_WIND_DIR: {
      char b[8]; block_text(BLK_WIND_DIR, b, sizeof b);
      draw_icon_value(ctx, r, RESOURCE_ID_ICON_WIND_DIRECTION_N, b,
                      weather_wind_angle()); break;
    }
    default:           draw_value_block(ctx, r, base_block(blk)); break;  // steps / km / battery / temp / humidity
  }

  s_panel_bg = save_bg;
  s_text_fg  = save_fg;
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
    case BLK_PRECIP: case BLK_DIGITAL: case BLK_WIND: case BLK_AQI:
    case BLK_HOURS: case BLK_HOURS_BIG:
    case BLK_MINUTES: case BLK_MINUTES_BIG: case BLK_MINMAX:
    case BLK_MONTH_DAY: case BLK_DOW_DAY:
      block_text(b, buf, n); return true;
    // BLK_HR draws its own icon+number (draw_hr), so it isn't a flippable
    // single-string block -> fall through to draw_block.
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

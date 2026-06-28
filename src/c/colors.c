#include "flipwall.h"

static uint32_t GColorToRGB8(GColor c) {
  return (uint8_t)(c.r * 255) << 16 | (uint8_t)(c.g * 255) << 8 | (uint8_t)(c.b * 255);
}

GColor get_closest_accent_color(GColor c) {
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
GColor contrast_color(GColor bg) {
  uint8_t r = (uint8_t)(GColorToRGB8(bg) >> 16);
  uint8_t g = (uint8_t)(GColorToRGB8(bg) >> 8);
  uint8_t b = (uint8_t)(GColorToRGB8(bg));
  uint16_t lum = (uint16_t)(r * 30 + g * 59 + b * 11) / 100;
  return lum < 128 ? GColorWhite : GColorBlack;
}

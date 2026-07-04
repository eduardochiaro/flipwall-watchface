#include "../flipwall.h"

// Perceived luminance (0..255) of a GColor. Channels are 2-bit (0..3), so each
// scales by 85 to reach 0..255 (1 -> 85 dark gray, 3 -> 255 full).
static uint16_t luminance(GColor c) {
  uint8_t r = (uint8_t)(c.r * 85), g = (uint8_t)(c.g * 85), b = (uint8_t)(c.b * 85);
  return (uint16_t)(r * 30 + g * 59 + b * 11) / 100;
}

GColor get_closest_accent_color(GColor c) {
  uint8_t r = (uint8_t)(c.r * 85), g = (uint8_t)(c.g * 85), b = (uint8_t)(c.b * 85);
  // Lighten dark colors, darken light ones.
  if (luminance(c) < 128) {
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
  return luminance(bg) < 128 ? GColorWhite : GColorBlack;
}

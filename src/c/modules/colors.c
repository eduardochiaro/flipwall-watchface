#include "../flipwall.h"

// Perceived luminance (0..255) of a GColor. Channels are 2-bit (0..3), so each
// scales by 85 to reach 0..255 (1 -> 85 dark gray, 3 -> 255 full).
static uint16_t luminance(GColor c) {
  uint8_t r = (uint8_t)(c.r * 85), g = (uint8_t)(c.g * 85), b = (uint8_t)(c.b * 85);
  return (uint16_t)(r * 30 + g * 59 + b * 11) / 100;
}

GColor get_closest_accent_color(GColor c) {
  uint8_t r = (uint8_t)(c.r * 85), g = (uint8_t)(c.g * 85), b = (uint8_t)(c.b * 85);
  // Lighten dark colors 30% toward white, darken light ones 30% toward black.
  // Integer math: a double here links ~1.4KB of soft-float code, and the code
  // shares the 64KB with the heap fctx draws from (see fctx_open).
  if (luminance(c) < 128) {
    r = r + (255 - r) * 3 / 10;
    g = g + (255 - g) * 3 / 10;
    b = b + (255 - b) * 3 / 10;
  } else {
    r = r * 7 / 10;
    g = g * 7 / 10;
    b = b * 7 / 10;
  }
  return GColorFromRGB(r, g, b);
}

// Black on light backgrounds, white on dark ones (perceived luminance).
GColor contrast_color(GColor bg) {
  return luminance(bg) < 128 ? GColorWhite : GColorBlack;
}

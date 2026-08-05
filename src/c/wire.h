#pragma once
#include <stdint.h>

// The phone sends the watch packed byte blobs, not a key per setting. The
// layouts, and why, are written down once in src/pkjs/modules/pack.js; the
// readers are settings_apply / apply_tz (flipwall-watchface.c) and
// weather_apply_blob (modules/weather.c).
//
// Every blob opens with this version byte. A blob that doesn't carry it is
// dropped whole, so a future format change leaves the face on its last good
// settings instead of reading a new layout with old offsets.
#define WIRE_VERSION 3

// The second zones a blob carries: an int16 offset (minutes east of UTC, DST
// already applied) and a NUL-padded abbreviation, per block position.
#define WIRE_ABBR_LEN 5
#define WIRE_ZONE_LEN (2 + WIRE_ABBR_LEN)

// The free text of the BLK_TEXT blocks: 15 characters, NUL padded, per block
// position (the config page caps the input at the same 15).
#define WIRE_TEXT_LEN 16

// Little-endian int16 out of a blob; the values are signed (a zone west of UTC,
// a temperature below zero), so the cast is what carries the sign.
static inline int wire_int16(const uint8_t *p) {
  return (int16_t)(p[0] | (p[1] << 8));
}

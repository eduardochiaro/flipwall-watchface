# Changelog

Versions follow `package.json`. Dates are the commit that bumped the version.

## 3.4.0 — unreleased

- **New settings page:** Clay is gone; the page is custom, in the face's own look, with Face, Style and Presets tabs and a Save button that stays in view. Tap a block on the live preview to tune it and pick from a catalog of every block drawn as itself, filterable by type. Colors come from a honeycomb of the watch's 64 colors with a preview beside it. Presets show as real face thumbnails. Saved faces carry over as they are.
- **New blocks:** Moon phase (drawn as it looks tonight, with how much is lit), Progress of the year, month, week or day, a Week strip lit up to today, Week number, Day of year, Numeric date (day or month first), Calories (total or active only), Active minutes and Sleep. Small, banner and big, except the Week strip and Numeric date, which are small only.
- **Sunrise / sunset in one block:** the sunrise and sunset blocks share one palette entry, with a Type picker: Auto, Sunrise or Sunset. Auto shows whichever comes next and switches the minute the shown one goes by. Small, banner and big. Faces already using a sunrise or sunset block keep it.
- **Fix:** in the big time zone and sunrise / sunset blocks, the time is centred above the seam instead of crowding it.
- **Fix:** in the settings preview, long values (sunrise / sunset, wind direction, time zones) shrink to fit their block instead of spilling out of it.
- **Battery:** only the blocks that changed are redrawn. Before, every minute tick and every flip frame redrew the whole face, because the watch redraws every block on each render. Now the minute tick redraws only the clock, and a flip redraws only the flipping block. Blocks whose value hasn't changed (a step count while you sit, a weather update with nothing new) aren't redrawn either. With seconds on, only the analog clock redraws each second.

## 3.3.0 — 2026-08-01

- **Sunrise and sunset:** new blocks with the time and a sunrise or sunset icon, small, banner and big ("Sunrise" / "Sunset" caption).
- **Utility block:** status icons for Bluetooth, charging and Quiet Time.
- **Free text:** a new block that shows your own short text, per position.
- **Plain zone clocks:** second time zone blocks without the offset or abbreviation caption ("10:09"), small and big.
- **Fewer wakeups:** step, distance and heart rate blocks update on the minute instead of on every health event. The battery and Bluetooth services run only when a block on the face needs them. Time zones are sent only when a zone block is placed, and an unchanged zone push is ignored.
- **Smaller messages:** settings, weather and time zones each go to the watch as one packed message, so the watch needs less memory to receive them.
- **Time zones without Intl:** zone offsets and abbreviations come from a built-in table of DST rules, because the phone's JS runtime can crash on `Intl`.
- **Smaller download:** the app package is repacked without the JS source map.

## 3.2.0 — 2026-08-01

- **Second time zone:** new blocks with the time in another zone, with its offset ("10:09 +1") or abbreviation ("10:09 PST"), small, banner and big. Each position picks its own zone, and DST changes are picked up on the next refresh.
- **Settings page:** the custom fields are now regular Clay fields.
- **Fix:** UV icon.

## 3.1.0 — 2026-08-01

- **Fix:** weather for the six-block layout's middle blocks and the colour UV / AQI blocks. Forecast and air-quality fields are requested from the right endpoint.

## 3.0.0 — 2026-07-31

- **Six-block layout:** a new layout drops the banner and gives each column a third block: one big block and two short ones, with the big one in any slot. On round watches the two extra blocks become strips above and below the grid.
- **No-zero digital clock:** digital clock variants without the leading zero ("9:41"). Their width stays the same, so nothing moves at 9 → 10.
- **Full step count:** a steps variant that shows every digit ("8234").
- **New settings page:** reworked configuration page and live preview.
- **Smaller download:** the JS source map is stripped from the app package.

## 2.8.0 — 2026-07-31

- **Air quality:** AQI blocks, small, banner and big.
- **Colour UV and AQI:** variants of the UV and AQI blocks whose panel colour follows the reading.
- **Swatch .beat time:** Internet Time blocks ("@642"), small, banner and big.

## 2.7.0 — 2026-07-30

- **Fix:** wind direction icon.

## 2.6.0 — 2026-07-30

- **UV index:** today's max UV, with icon, small, banner and big.
- **Wind:** wind speed blocks ("12km/h") and wind direction blocks with a turning arrow and compass point ("WNW"), small, banner and big.

## 2.5.0 — 2026-07-04

- **Per-block colours:** each block can override the panel colour.
- **Big two-line blocks:** humidity, battery, heart rate, distance and max/min temperature get big variants with a caption ("Hum" over "47%"), plus a month-over-day calendar block.
- **Presets:** updated preset styles and seam behaviour.
- **Fixes:** period glyph spacing in the mono font, AM/PM text size on the Pebble Time 2.

## 2.4.0 — 2026-07-04

- **Heart rate:** a new Health block with the BPM.
- **Temperature with icon:** current temperature beside the weather icon, small and banner.
- **Calendar block:** weekday over day of month, big.
- **Accent minutes:** the digital clock's minutes in the accent colour.
- **New font:** Lekton mono.

## 2.2.0 — 2026-07-03

- **Presets:** ready-made styles in the settings page.
- **Max/min temperature:** now fits small blocks too, not only the banner.

## 2.1.0 — 2026-07-01

- **Hours and minutes:** blocks with only the hours or only the minutes, small and big.
- **AM/PM:** blocks with AM and PM side by side or stacked, the current one bright.

## 2.0.0 — 2026-06-28

- **Weather:** weather icon, temperature (small and big), humidity, max/min temperature and precipitation blocks, with metric or imperial units.
- **Languages:** the face in several languages.
- **Date banners:** "Jun 28" and "Sat 28" banner blocks.
- **Digital clock:** HH:MM, small and banner, and hours over minutes, big.
- **Vector font:** text is drawn with a scalable vector font (fctx) on every watch but the original Pebble.
- **Flip animation:** blocks flip when their value changes, with a seam line across each block. Both can be turned off.
- **Settings page:** refreshed configuration and preview.

## 1.4.0 — 2026-06-26

- **New blocks:** steps, distance and battery. The banner became a block slot of its own, showing the year by default.
- **Automatic text colour:** text is black or white depending on the panel colour.
- **Pebble Time 2:** layout adjustments.

## 1.2.0 — 2026-06-25

- **Round watches:** reworked layout and fonts for the Pebble Time Round and Round 2.

## 1.1.0 — 2026-06-25

- Version bump.

## 1.0.0 — 2026-06-22

- **First release:** flip-clock style face with day of week (with AM/PM), day of month, analog clock and month blocks, a menu icon and a config page with preview.

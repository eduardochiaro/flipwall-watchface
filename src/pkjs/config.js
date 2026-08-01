// Clay configuration for the flip-wall watchface.
//
// Block selector values map to the QuadBlock enum on the C side:
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month,
//   4 = Steps, 5 = Distance, 6 = Battery, 7 = Year (small / banner),
//   8 = Weather icon (big), 9 = Month + Day (small / banner),
//   10 = Weekday + Day (small / banner), 11 = Temperature (small),
//   12 = Temperature (big), 13 = Humidity (small), 14 = Max/Min (small / banner),
//   15 = Precipitation (small), 16 = Digital clock (small / banner),
//   17 = Digital clock (big), 18 = Hours (small), 19 = Hours (big),
//   20 = Minutes (small), 21 = Minutes (big), 22 = AM/PM (small),
//   23 = AM/PM stacked (small), 24 = Heart rate (small),
//   25 = Temperature + icon (small / banner), 26 = Calendar (big),
//   27 = Humidity (big), 28 = Battery (big), 29 = Calendar + Month (big),
//   30 = Heart rate (big), 31 = Distance (big), 32 = Max/Min temp (big),
//   33 = UV index (small / banner), 34 = UV index (big),
//   35 = Wind speed (small / banner), 36 = Wind speed (big),
//   37 = Wind direction (small / banner), 38 = Wind direction (big),
//   39 = Air quality (small / banner), 40 = Air quality (big),
//   41/42 = UV index - color (small / big), 43/44 = Air quality - color,
//   45 = .beat time (small / banner), 46 = .beat time (big),
//   47 = Digital clock, no leading zero (small / banner),
//   48 = Digital clock, no leading zero (big),
//   49 = Steps, full count (small / banner).
// The "- color" variants draw like their plain counterpart but paint the panel
// with the index's own band color (see block_panel_color in blocks.c).
// Defaults mirror the hard-coded layout/colors in flipwall-watchface.c.
// Day of month / Clock / Weather icon / Temperature (big) are "big".

// Selector contents. Blocks are grouped the way the config page reads them:
// size first (the column rule pairs one big with one small, so that is the
// choice that matters), then by what the block shows - time, date, activity,
// weather - and in the same order everywhere. Values are the QuadBlock enum.
var BIG_TIME = [
  { label: "Analog clock (big)", value: 2 },
  { label: "Digital clock (big)", value: 17 },
  { label: "Digital clock, no leading zero (big)", value: 48 },
  { label: "Hours (big)", value: 19 },
  { label: "Minutes (big)", value: 21 },
  { label: ".beat time (big)", value: 46 }
];

var BIG_DATE = [
  { label: "Day of month (big)", value: 1 },
  { label: "Calendar (big)", value: 26 },
  { label: "Calendar + Month (big)", value: 29 }
];

var BIG_ACTIVITY = [
  { label: "Battery (big)", value: 28 },
  { label: "Distance (big)", value: 31 },
  { label: "Heart rate (big)", value: 30 }
];

var BIG_WEATHER = [
  { label: "Weather icon (big)", value: 8 },
  { label: "Temperature (big)", value: 12 },
  { label: "Max/Min temp (big)", value: 32 },
  { label: "Humidity (big)", value: 27 },
  { label: "UV index (big)", value: 34 },
  { label: "UV index - color (big)", value: 42 },
  { label: "Air quality (big)", value: 40 },
  { label: "Air quality - color (big)", value: 44 },
  { label: "Wind speed (big)", value: 36 },
  { label: "Wind direction (big)", value: 38 }
];

var SMALL_TIME = [
  { label: "Digital clock (small)", value: 16 },
  { label: "Digital clock, no leading zero (small)", value: 47 },
  { label: "Hours (small)", value: 18 },
  { label: "Minutes (small)", value: 20 },
  { label: "AM/PM (small)", value: 22 },
  { label: "AM/PM stacked (small)", value: 23 },
  { label: ".beat time (small)", value: 45 }
];

var SMALL_DATE = [
  { label: "Day of week (small)", value: 0 },
  { label: "Month (small)", value: 3 },
  { label: "Year (small)", value: 7 },
  { label: "Month + Day (small)", value: 9 },
  { label: "Weekday + Day (small)", value: 10 }
];

var SMALL_ACTIVITY = [
  { label: "Steps (small)", value: 4 },
  { label: "Steps, full count (small)", value: 49 },
  { label: "Distance (small)", value: 5 },
  { label: "Battery (small)", value: 6 },
  { label: "Heart rate (small)", value: 24 }
];

var SMALL_WEATHER = [
  { label: "Temperature (small)", value: 11 },
  { label: "Temperature + icon (small)", value: 25 },
  { label: "Max/Min temp (small)", value: 14 },
  { label: "Humidity (small)", value: 13 },
  { label: "Precipitation (small)", value: 15 },
  { label: "UV index (small)", value: 33 },
  { label: "UV index - color (small)", value: 41 },
  { label: "Air quality (small)", value: 39 },
  { label: "Air quality - color (small)", value: 43 },
  { label: "Wind speed (small)", value: 35 },
  { label: "Wind direction (small)", value: 37 }
];

var BLOCK_OPTIONS_GROUPS = [
  { label: "Big - Time", value: BIG_TIME },
  { label: "Big - Date", value: BIG_DATE },
  { label: "Big - Activity", value: BIG_ACTIVITY },
  { label: "Big - Weather", value: BIG_WEATHER },
  { label: "Small - Time", value: SMALL_TIME },
  { label: "Small - Date", value: SMALL_DATE },
  { label: "Small - Activity", value: SMALL_ACTIVITY },
  { label: "Small - Weather", value: SMALL_WEATHER }
];

// The banner is a single short block, so it only needs the content grouping.
// Every entry mirrors its small-block counterpart.
var BAND_OPTIONS = [
  { label: "Date & time", value: [
    { label: "Year", value: 7 },
    { label: "Digital clock", value: 16 },
    { label: "Digital clock, no leading zero", value: 47 },
    { label: "Month + Day", value: 9 },
    { label: "Weekday + Day", value: 10 },
    { label: ".beat time", value: 45 }
  ] },
  { label: "Activity", value: [
    { label: "Steps", value: 4 },
    { label: "Steps, full count", value: 49 },
    { label: "Distance", value: 5 },
    { label: "Battery", value: 6 },
    { label: "Heart rate", value: 24 }
  ] },
  { label: "Weather", value: [
    { label: "Temperature", value: 11 },
    { label: "Temperature + icon", value: 25 },
    { label: "Max/Min temp", value: 14 },
    { label: "Humidity", value: 13 },
    { label: "Precipitation", value: 15 },
    { label: "UV index", value: 33 },
    { label: "UV index - color", value: 41 },
    { label: "Air quality", value: 39 },
    { label: "Air quality - color", value: 43 },
    { label: "Wind speed", value: 35 },
    { label: "Wind direction", value: 37 }
  ] }
];

// Month/weekday names are translated to these 10 Latin-script languages
// (values match the LANGS tables in flipwall-watchface.c; 0 = English).
// Measurement system. Metric = °C / mm, Imperial = °F / in. The JS weather
// module fetches in the chosen unit; the watch only renders the precip suffix.
var UNITS_OPTIONS = [
  { label: "Metric (°C, mm)", value: 0 },
  { label: "Imperial (°F, in)", value: 1 }
];

// Face layout. Classic is the 5-block face (banner pill + 2x2 grid); the
// 6-block layout drops the banner and gives each column a third block in its
// middle. See the layout comment in flipwall-watchface.c for the arrangement.
var LAYOUT_OPTIONS = [
  { label: "Classic (5 blocks)", value: 0 },
  { label: "Columns (6 blocks)", value: 1 }
];

var LANG_OPTIONS = [
  { label: "English", value: 0 },
  { label: "Espanol", value: 1 },
  { label: "Portugues", value: 2 },
  { label: "Francais", value: 3 },
  { label: "Deutsch", value: 4 },
  { label: "Italiano", value: 5 },
  { label: "Nederlands", value: 6 },
  { label: "Polski", value: 7 },
  { label: "Turkce", value: 8 },
  { label: "Indonesia", value: 9 }
];

module.exports = [
  {
    type: "heading",
    defaultValue: "Wall Flip Settings"
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "General" },
      {
        type: "select",
        messageKey: "LAYOUT",
        label: "Layout",
        defaultValue: 0,
        options: LAYOUT_OPTIONS
      },
      {
        type: "select",
        messageKey: "LANG",
        label: "Language",
        defaultValue: 0,
        options: LANG_OPTIONS
      },
      {
        type: "select",
        messageKey: "UNITS",
        label: "Units",
        defaultValue: 0,
        options: UNITS_OPTIONS,
        description: "Metric = °C / mm, Imperial = °F / in. Used for weather blocks."
      },
      {
        type: "toggle",
        messageKey: "SHOW_SECONDS",
        label: "Show seconds hand",
        defaultValue: false,
        description: "Only on analog clock block."
      },
      {
        type: "toggle",
        messageKey: "FLIP_ANIM",
        label: "Flip animation",
        defaultValue: true,
        description: "Animate blocks like a flap when their value changes."
      },
      {
        type: "toggle",
        messageKey: "DRAW_SEAM",
        label: "Seam line",
        defaultValue: true,
        description: "Thin line across each block's middle (the flip-display look)."
      },
      // Banner-only, so clayCustomFn hides it under the 6-block layout.
      {
        type: "toggle",
        messageKey: "YEAR_TOP",
        label: "Banner at top",
        defaultValue: true
      }
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Colors" },
      {
        type: "color",
        messageKey: "FACE_COLOR",
        label: "Face background",
        defaultValue: "FF5500",
        sunlight: false
      },
      {
        type: "color",
        messageKey: "PANEL_COLOR",
        label: "All panels",
        defaultValue: "000000",
        sunlight: false,
        description: "Sets every block/banner below. Override any one after."
      },
      {
        type: "color",
        messageKey: "WEEKEND_COLOR",
        label: "Weekend / accent",
        defaultValue: "FF0000",
        sunlight: false,
        description: "Used for weekend days on weekday block."
      }
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Presets" },
      { type: "text", defaultValue: "Swipe the row for more. Tap a preset to fill in blocks and colors. Tweak anything after." },
      // Buttons + click handlers are injected by clayCustomFn (needs the webview DOM).
      { type: "text", id: "PRESETS", label: "", defaultValue: "" },
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Share Settings" },
      { type: "text", defaultValue: "The code below is this whole face — every block, color and toggle. Copy it to back the face up or share it. Paste a code in and tap Import to load it." },
      // Code box, copy/import buttons and their handlers are injected by
      // clayCustomFn (they need the webview DOM), same as the presets above.
      { type: "text", id: "TRANSFER", label: "", defaultValue: "" },
    ]
  },

  // The face is the editor: clayCustomFn draws it into PREVIEW with a tap
  // target over every block, and fills PALETTE with the blocks the tapped one
  // can be swapped for. Both are injected, since they need the webview DOM.
  {
    type: "section",
    items: [
      { type: "text", id: "PREVIEW", label: "", defaultValue: "" },
      { type: "text", id: "PALETTE", label: "", defaultValue: "" },
      { type: "text", id: "LAYOUT_TIP", defaultValue: "" },
    ]
  },

  // What the block on the tapped slot can be tuned to: its panel color, and a
  // select for whichever detail it has a choice about (VARIATION, injected by
  // clayCustomFn). The seven block selects live here too but stay hidden —
  // they carry the message keys Save sends to the watch, and their labels are
  // what the palette header reads, via applyColumnLabels().
  {
    type: "section",
    items: [
      { type: "heading", id: "BLOCKS_HEADING", defaultValue: "Selected Block" },
      { type: "text", id: "VARIATION", label: "", defaultValue: "" },
      {
        type: "select",
        messageKey: "BLOCK_TOP_LEFT",
        label: "Top",
        defaultValue: 0,
        options: BLOCK_OPTIONS_GROUPS
      },
      { type: "color", messageKey: "PANEL_TL_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
      {
        type: "select",
        messageKey: "BLOCK_MID_LEFT",
        label: "Middle",
        defaultValue: 16,
        options: BLOCK_OPTIONS_GROUPS
      },
      { type: "color", messageKey: "PANEL_ML_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
      {
        type: "select",
        messageKey: "BLOCK_BOTTOM_LEFT",
        label: "Bottom",
        defaultValue: 2,
        options: BLOCK_OPTIONS_GROUPS
      },
      { type: "color", messageKey: "PANEL_BL_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
      {
        type: "select",
        messageKey: "BLOCK_TOP_RIGHT",
        label: "Top",
        defaultValue: 1,
        options: BLOCK_OPTIONS_GROUPS
      },
      { type: "color", messageKey: "PANEL_TR_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
      {
        type: "select",
        messageKey: "BLOCK_MID_RIGHT",
        label: "Middle",
        defaultValue: 4,
        options: BLOCK_OPTIONS_GROUPS
      },
      { type: "color", messageKey: "PANEL_MR_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
      {
        type: "select",
        messageKey: "BLOCK_BOTTOM_RIGHT",
        label: "Bottom",
        defaultValue: 3,
        options: BLOCK_OPTIONS_GROUPS
      },
      { type: "color", messageKey: "PANEL_BR_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
      {
        type: "select",
        messageKey: "BLOCK_BAND",
        label: "Banner",
        defaultValue: 7,
        options: BAND_OPTIONS
      },
      { type: "color", messageKey: "PANEL_BAND_COLOR", label: "Color", defaultValue: "000000", sunlight: false },
    ]
  },

  {
    type: "submit",
    defaultValue: "Save"
  }
];

// Clay configuration for the flip-wall watchface.
//
// Block selector values map to the QuadBlock enum on the C side:
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month,
//   4 = Steps, 5 = Distance, 6 = Battery, 7 = Year (banner only),
//   8 = Weather icon (big), 9 = Month + Day (banner only),
//   10 = Weekday + Day (banner only), 11 = Temperature (small),
//   12 = Temperature (big), 13 = Humidity (small), 14 = Min/Max (banner only),
//   15 = Precipitation (small), 16 = Digital clock (small / banner),
//   17 = Digital clock (big).
// Defaults mirror the hard-coded layout/colors in flipwall-watchface.c.
// Day of month / Clock / Weather icon / Temperature (big) are "big".

var BLOCK_OPTIONS_SMALL = [
  { label: "Digital clock (small)", value: 16 },
  { label: "Month (small)", value: 3 },
  { label: "Day of week (small)", value: 0 },
  { label: "Steps (small)", value: 4 },
  { label: "Distance (small)", value: 5 },
  { label: "Battery (small)", value: 6 },
  { label: "Temperature (small)", value: 11 },
  { label: "Humidity (small)", value: 13 },
  { label: "Precipitation (small)", value: 15 }
];

var BLOCK_OPTIONS_BIG = [
  { label: "Analog Clock (big)", value: 2 },
  { label: "Digital clock (big)", value: 17 },
  { label: "Day of month (big)", value: 1 },
  { label: "Weather icon (big)", value: 8 },
  { label: "Temperature (big)", value: 12 },
];

var BLOCK_OPTIONS_GROUPS = [
  { label: "Big blocks", value: BLOCK_OPTIONS_BIG },
  { label: "Small blocks", value: BLOCK_OPTIONS_SMALL }
];

// The banner is a single short block: year or one of the data readouts.
var BAND_OPTIONS = [
  { label: "Year", value: 7 },
  { label: "Digital clock", value: 16 },
  { label: "Month + Day", value: 9 },
  { label: "Weekday + Day", value: 10 },
  { label: "Steps", value: 4 },
  { label: "Distance", value: 5 },
  { label: "Battery", value: 6 },
  { label: "Temperature", value: 11 },
  { label: "Humidity", value: 13 },
  { label: "Min/Max temp", value: 14 },
  { label: "Precipitation", value: 15 }
];

// Month/weekday names are translated to these 10 Latin-script languages
// (values match the LANGS tables in flipwall-watchface.c; 0 = English).
// Measurement system. Metric = °C / mm, Imperial = °F / in. The JS weather
// module fetches in the chosen unit; the watch only renders the precip suffix.
var UNITS_OPTIONS = [
  { label: "Metric (°C, mm)", value: 0 },
  { label: "Imperial (°F, in)", value: 1 }
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
        label: "Panel background",
        defaultValue: "000000",
        sunlight: false
      },
      {
        type: "color",
        messageKey: "WEEKEND_COLOR",
        label: "Weekend / accent",
        defaultValue: "FF0000",
        sunlight: false
      }
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Preview" },
      { type: "text", id: "PREVIEW", label: "", defaultValue: "" },
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Banner Block" },
      {
        type: "select",
        messageKey: "BLOCK_BAND",
        label: "Type",
        defaultValue: 7,
        options: BAND_OPTIONS
      },
      {
        type: "toggle",
        messageKey: "YEAR_TOP",
        label: "Show at top",
        defaultValue: true
      },
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Left Column" },
      {
        type: "select",
        messageKey: "BLOCK_TOP_LEFT",
        label: "Top Left",
        defaultValue: 0,
        options: BLOCK_OPTIONS_GROUPS
      },
      {
        type: "select",
        messageKey: "BLOCK_BOTTOM_LEFT",
        label: "Bottom Left",
        defaultValue: 2,
        options: BLOCK_OPTIONS_GROUPS
      },
    ]
  },
  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Right Column" },
      {
        type: "select",
        messageKey: "BLOCK_TOP_RIGHT",
        label: "Top Right",
        defaultValue: 1,
        options: BLOCK_OPTIONS_GROUPS
      },
      {
        type: "select",
        messageKey: "BLOCK_BOTTOM_RIGHT",
        label: "Bottom Right",
        defaultValue: 3,
        options: BLOCK_OPTIONS_GROUPS
      },
    ]
  },
  {
    type: "text",
    defaultValue:
      "Tip: Each column pairs one big block and one small block. Picking two of the same size auto-swaps the other."
  },

  {
    type: "submit",
    defaultValue: "Save"
  }
];

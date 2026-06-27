// Clay configuration for the flip-wall watchface.
//
// Block selector values map to the QuadBlock enum on the C side:
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month,
//   4 = Steps, 5 = Distance, 6 = Battery, 7 = Year (banner only),
//   8 = Weather (big), 9 = Month + Day (banner only),
//   10 = Weekday + Day (banner only).
// Defaults mirror the hard-coded layout/colors in flipwall-watchface.c.
// Only Day of month and Clock are "big"; everything else is "small".

var BLOCK_OPTIONS = [
  { label: "Day of week (small)", value: 0 },
  { label: "Day of month (big)", value: 1 },
  { label: "Clock (big)", value: 2 },
  { label: "Month (small)", value: 3 },
  { label: "Steps (small)", value: 4 },
  { label: "Distance (small)", value: 5 },
  { label: "Battery (small)", value: 6 },
  { label: "Weather (big)", value: 8 }
];

// The banner is a single short block: year or one of the data readouts.
var BAND_OPTIONS = [
  { label: "Year", value: 7 },
  { label: "Month + Day", value: 9 },
  { label: "Weekday + Day", value: 10 },
  { label: "Steps", value: 4 },
  { label: "Distance", value: 5 },
  { label: "Battery", value: 6 }
];

// Month/weekday names are translated to these 10 Latin-script languages
// (values match the LANGS tables in flipwall-watchface.c; 0 = English).
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
      { type: "heading", defaultValue: "Preview" },
      { type: "text", id: "PREVIEW", label: "", defaultValue: "" },
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Layout" },
      {
        type: "select",
        messageKey: "LANG",
        label: "Language",
        defaultValue: 0,
        options: LANG_OPTIONS
      },
      {
        type: "select",
        messageKey: "BLOCK_BAND",
        label: "Banner block",
        defaultValue: 7,
        options: BAND_OPTIONS
      },
      {
        type: "toggle",
        messageKey: "YEAR_TOP",
        label: "Banner at top",
        defaultValue: true
      },
      {
        type: "select",
        messageKey: "BLOCK_TOP_LEFT",
        label: "Top-left block (big or small)",
        defaultValue: 0,
        options: BLOCK_OPTIONS
      },
      {
        type: "select",
        messageKey: "BLOCK_TOP_RIGHT",
        label: "Top-right block (big or small)",
        defaultValue: 1,
        options: BLOCK_OPTIONS
      },
      {
        type: "select",
        messageKey: "BLOCK_BOTTOM_LEFT",
        label: "Bottom-left block (big or small)",
        defaultValue: 2,
        options: BLOCK_OPTIONS
      },
      {
        type: "select",
        messageKey: "BLOCK_BOTTOM_RIGHT",
        label: "Bottom-right block (big or small)",
        defaultValue: 3,
        options: BLOCK_OPTIONS
      },
      {
        type: "text",
        defaultValue:
          "Tip: each column pairs one big block (Clock / Day of month) " +
          "with one small block (Day of week / Month / Steps / Distance / " +
          "Battery). Picking two of the same size auto-swaps the other."
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
      { type: "heading", defaultValue: "Clock" },
      {
        type: "toggle",
        messageKey: "SHOW_SECONDS",
        label: "Show seconds hand",
        defaultValue: false
      }
    ]
  },

  {
    type: "submit",
    defaultValue: "Save"
  }
];

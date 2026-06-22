// Clay configuration for the flip-wall watchface.
//
// Block selector values map to the QuadBlock enum on the C side:
//   0 = Day of week, 1 = Day of month, 2 = Clock, 3 = Month.
// Defaults mirror the hard-coded layout/colours in flipwall-watchface.c.

var BLOCK_OPTIONS = [
  { label: "Day of week", value: 0 },
  { label: "Day of month", value: 1 },
  { label: "Clock", value: 2 },
  { label: "Month", value: 3 }
];

module.exports = [
  {
    type: "heading",
    defaultValue: "Flip-Wall Settings"
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Layout" },
      {
        type: "toggle",
        messageKey: "YearTop",
        label: "Year band at top",
        defaultValue: true
      },
      {
        type: "select",
        messageKey: "BlockTopLeft",
        label: "Top-left block",
        defaultValue: 0,
        options: BLOCK_OPTIONS
      },
      {
        type: "select",
        messageKey: "BlockTopRight",
        label: "Top-right block",
        defaultValue: 1,
        options: BLOCK_OPTIONS
      },
      {
        type: "select",
        messageKey: "BlockBottomLeft",
        label: "Bottom-left block",
        defaultValue: 2,
        options: BLOCK_OPTIONS
      },
      {
        type: "select",
        messageKey: "BlockBottomRight",
        label: "Bottom-right block",
        defaultValue: 3,
        options: BLOCK_OPTIONS
      },
      {
        type: "text",
        defaultValue:
          "Tip: each block should be used once. Pair a tall block " +
          "(Clock / Day of month) with a short one (Day of week / Month) " +
          "in each column for the intended look."
      }
    ]
  },

  {
    type: "section",
    items: [
      { type: "heading", defaultValue: "Colours" },
      {
        type: "color",
        messageKey: "FaceColor",
        label: "Face background",
        defaultValue: "FF5500",
        sunlight: false
      },
      {
        type: "color",
        messageKey: "PanelColor",
        label: "Panel background",
        defaultValue: "000000",
        sunlight: false
      },
      {
        type: "color",
        messageKey: "WeekendColor",
        label: "Weekend / accent",
        defaultValue: "FF0000",
        sunlight: false
      },
      {
        type: "color",
        messageKey: "TextColor",
        label: "Text",
        defaultValue: "FFFFFF",
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
        messageKey: "ShowSeconds",
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

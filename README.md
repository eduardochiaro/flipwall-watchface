# Wall Flip

A digital watchface for Pebble smartwatches based on flip clock design.

## Screenshots
### Pebble Classic/Steel
![Aplite 1](assets/aplite_1.png)
![Aplite 2](assets/aplite_2.png)
![Aplite 3](assets/aplite_3.png)
![Aplite 4](assets/aplite_4.png)

### Pebble 2/Duo
![Flint 1](assets/flint_1.png)
![Flint 2](assets/flint_2.png)
![Flint 3](assets/flint_3.png)
![Flint 4](assets/flint_4.png)

### Pebble Time/Time Steel
![Basalt](assets/basalt_0.gif)
![Basalt 1](assets/basalt_1.png)
![Basalt 2](assets/basalt_2.png)
![Basalt 3](assets/basalt_3.png)
![Basalt 5](assets/basalt_4.png)

### Pebble Time Round
![Chalk 1](assets/chalk_1.png)
![Chalk 2](assets/chalk_2.png)
![Chalk 3](assets/chalk_3.png)
![Chalk 4](assets/chalk_4.png)

### Pebble Time 2
![Emery](assets/emery_0.gif)
![Emery 1](assets/emery_1.png)
![Emery 2](assets/emery_2.png)
![Emery 3](assets/emery_3.png)
![Emery 4](assets/emery_4.png)

### Pebble Time Round 2
![Gabbro 1](assets/gabbro_1.png)
![Gabbro 2](assets/gabbro_2.png)
![Gabbro 3](assets/gabbro_3.png)
![Gabbro 4](assets/gabbro_4.png)

## Store
[Rebble App Store](https://apps.rebble.io/en_US/application/6a3d4248cd52370009862b05)
[Pebble App Store](https://apps.repebble.com/6a3d4248cd52370009862b05)

## Configuration options

Configure via the Pebble app settings page.

### General
- **Language** — translates month and weekday names. 10 Latin-script languages: English, Espanol, Portugues, Francais, Deutsch, Italiano, Nederlands, Polski, Turkce, Indonesia.
- **Units** — Metric (°C, mm) or Imperial (°F, in). Applies to the weather blocks.
- **Show seconds hand** — adds a seconds hand to the analog clock block (off by default to save battery).
- **Flip animation** — blocks flip like a split-flap when their value changes (on by default).
- **Seam line** — thin line across each block's middle for the flip-display look (on by default).

### Layout
Each grid quadrant and the banner is assigned a block. Blocks come in two sizes — **big** (fills a square quadrant) and **small** (half height). Each column pairs one big block with one small block; picking two of the same size auto-swaps the other.

- **Banner block** — full-width banner content: Year, Digital clock, Month + Day, Weekday + Day, Steps, Distance, Battery, Heart rate, Temperature, Temperature + icon, Humidity, Max/Min temp, or Precipitation.
- **Banner at top** — banner above the grid (on) or below it (off).
- **Top-left / Top-right / Bottom-left / Bottom-right block** — fill each quadrant with:
  - **Date/time:** Day of week, Day of month, Calendar (weekday over day), Calendar + Month (month over day), Analog clock, Digital clock (big or small), Hours (big or small), Minutes (big or small), AM/PM (side-by-side or stacked diagonal), Month
  - **Activity:** Steps, Distance (small or big), Battery (small or big), Heart rate (small or big)
  - **Weather:** Weather icon, Temperature (big or small), Temperature + icon, Humidity (small or big), Max/Min temp (small or big), Precipitation

  Big two-line blocks stack a caption over a large value: Calendar, Calendar + Month, Humidity (`Hum` / `47%`), Battery (`Batt` / `82%`), Heart rate (number / `BPM`), Distance (number / `KM`·`M`·`MI`). Max/Min temp (big) stacks the max over the min, with the min drawn in the accent color like the big digital clock. Captions (`Hum`, `Batt`) are translated with the language setting.

  Hours and Minutes are shown as standalone two-digit blocks (leading zero kept). AM/PM highlights the active half in the text color and dims the other, like the weekday block.

### Weather
Weather blocks (icon, temperature, humidity, precipitation, max/min) pull current conditions from Open-Meteo using the phone's location. The icon maps WMO weather codes to condition glyphs, and ships in two sizes: a large icon for the big weather block and a small one for the banner and the **Temperature + icon** block. Values render in the selected unit system.

### Colors
- **Face background** — color behind the panels.
- **All panels** — master panel color; sets every block and the banner at once. Override any individual one afterward.
- **Per-block panel colors** — each quadrant (Top/Bottom × Left/Right) and the banner has its own color picker, so blocks can differ. Changing **All panels** (or applying a preset) refills them.
- **Weekend / accent** — day-of-week panel color on weekends, also used for the inactive AM/PM label.

Text color is automatic: black on light backgrounds, white on dark ones. On the big digital clock (minutes) and the big Max/Min temp (min), the secondary value is drawn in an auto-derived accent shade of the text color (lighter on dark panels, darker on light ones).

## Support
For issues, questions, or suggestions, please open an issue on GitHub.

## License
MIT License - feel free to modify and share!
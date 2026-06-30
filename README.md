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
Each grid quadrant and the banner is assigned a block. Blocks come in two sizes — **big** (Day of month, Analog clock, Digital clock, Weather icon, Temperature) and **small** (everything else). Each column pairs one big block with one small block; picking two of the same size auto-swaps the other.

- **Banner block** — full-width banner content: Year, Digital clock, Month + Day, Weekday + Day, Steps, Distance, Battery, Temperature, Humidity, Min/Max temp, or Precipitation.
- **Banner at top** — banner above the grid (on) or below it (off).
- **Top-left / Top-right / Bottom-left / Bottom-right block** — fill each quadrant with:
  - **Date/time:** Day of week, Day of month, Analog clock, Digital clock (big or small), Month
  - **Activity:** Steps, Distance, Battery
  - **Weather:** Weather icon, Temperature (big or small), Humidity, Precipitation

### Weather
Weather blocks (icon, temperature, humidity, precipitation, min/max) pull current conditions from Open-Meteo using the phone's location. The icon maps WMO weather codes to condition glyphs. Values render in the selected unit system.

### Colors
- **Face background** — color behind the panels.
- **Panel background** — color of the flip panels.
- **Weekend / accent** — day-of-week panel color on weekends, also used for the inactive AM/PM label.

Text color is automatic: black on light backgrounds, white on dark ones.

## Support
For issues, questions, or suggestions, please open an issue on GitHub.

## License
MIT License - feel free to modify and share!
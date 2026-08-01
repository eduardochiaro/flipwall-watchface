// Second time zone: the list the config page offers, and the resolution of a
// zone to what the watch actually needs (its current UTC offset in minutes and
// its abbreviation).
//
// Zones are IANA names, so the offset comes from the platform's own tz data
// (Intl) rather than a table of DST rules kept here — the offset is resolved
// fresh on every send (config save, and the weather refresh), so the watch
// follows a DST change on the next update.
//
// `abbr` / `dst` are the zone's standard and summer abbreviations, and `off`
// its standard offset. Intl only spells out letter abbreviations for the US
// zones ("PDT"); everywhere else it formats as "GMT+9", so the abbreviation
// comes from here, picked by whether the zone is currently on DST. `off` is
// also the offset fallback for a JS runtime with no usable Intl (older
// PebbleKit JS) — standard time, so such a phone reads an hour off in summer
// until the config page, always Intl-capable, saves again.
var ZONES = [
  { zone: 'Pacific/Honolulu', city: 'Honolulu', abbr: 'HST', off: -600 },
  { zone: 'America/Anchorage', city: 'Anchorage', abbr: 'AKST', dst: 'AKDT', off: -540 },
  { zone: 'America/Los_Angeles', city: 'Los Angeles', abbr: 'PST', dst: 'PDT', off: -480 },
  { zone: 'America/Denver', city: 'Denver', abbr: 'MST', dst: 'MDT', off: -420 },
  { zone: 'America/Chicago', city: 'Chicago', abbr: 'CST', dst: 'CDT', off: -360 },
  { zone: 'America/Mexico_City', city: 'Mexico City', abbr: 'CST', off: -360 },
  { zone: 'America/New_York', city: 'New York', abbr: 'EST', dst: 'EDT', off: -300 },
  { zone: 'America/Halifax', city: 'Halifax', abbr: 'AST', dst: 'ADT', off: -240 },
  { zone: 'America/Sao_Paulo', city: 'Sao Paulo', abbr: 'BRT', off: -180 },
  { zone: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', abbr: 'ART', off: -180 },
  { zone: 'UTC', city: 'UTC', abbr: 'UTC', off: 0 },
  { zone: 'Europe/London', city: 'London', abbr: 'GMT', dst: 'BST', off: 0 },
  { zone: 'Europe/Lisbon', city: 'Lisbon', abbr: 'WET', dst: 'WEST', off: 0 },
  { zone: 'Europe/Madrid', city: 'Madrid', abbr: 'CET', dst: 'CEST', off: 60 },
  { zone: 'Europe/Paris', city: 'Paris', abbr: 'CET', dst: 'CEST', off: 60 },
  { zone: 'Europe/Berlin', city: 'Berlin', abbr: 'CET', dst: 'CEST', off: 60 },
  { zone: 'Europe/Rome', city: 'Rome', abbr: 'CET', dst: 'CEST', off: 60 },
  { zone: 'Europe/Warsaw', city: 'Warsaw', abbr: 'CET', dst: 'CEST', off: 60 },
  { zone: 'Europe/Athens', city: 'Athens', abbr: 'EET', dst: 'EEST', off: 120 },
  { zone: 'Africa/Cairo', city: 'Cairo', abbr: 'EET', dst: 'EEST', off: 120 },
  { zone: 'Africa/Johannesburg', city: 'Johannesburg', abbr: 'SAST', off: 120 },
  { zone: 'Europe/Istanbul', city: 'Istanbul', abbr: 'TRT', off: 180 },
  { zone: 'Europe/Moscow', city: 'Moscow', abbr: 'MSK', off: 180 },
  { zone: 'Asia/Dubai', city: 'Dubai', abbr: 'GST', off: 240 },
  { zone: 'Asia/Karachi', city: 'Karachi', abbr: 'PKT', off: 300 },
  { zone: 'Asia/Kolkata', city: 'Kolkata', abbr: 'IST', off: 330 },
  { zone: 'Asia/Bangkok', city: 'Bangkok', abbr: 'ICT', off: 420 },
  { zone: 'Asia/Jakarta', city: 'Jakarta', abbr: 'WIB', off: 420 },
  { zone: 'Asia/Shanghai', city: 'Shanghai', abbr: 'CST', off: 480 },
  { zone: 'Asia/Hong_Kong', city: 'Hong Kong', abbr: 'HKT', off: 480 },
  { zone: 'Asia/Singapore', city: 'Singapore', abbr: 'SGT', off: 480 },
  { zone: 'Australia/Perth', city: 'Perth', abbr: 'AWST', off: 480 },
  { zone: 'Asia/Tokyo', city: 'Tokyo', abbr: 'JST', off: 540 },
  { zone: 'Asia/Seoul', city: 'Seoul', abbr: 'KST', off: 540 },
  { zone: 'Australia/Sydney', city: 'Sydney', abbr: 'AEST', dst: 'AEDT', off: 600 },
  { zone: 'Pacific/Auckland', city: 'Auckland', abbr: 'NZST', dst: 'NZDT', off: 720 }
];

var DEFAULT_ZONE = 'UTC';

function entry(zone) {
  for (var i = 0; i < ZONES.length; i++) {
    if (ZONES[i].zone === zone) { return ZONES[i]; }
  }
  return null;
}

// True when this runtime can actually format for another zone. A runtime that
// ignores the timeZone option would silently hand back local time, so check a
// zone it can be held to rather than trusting `typeof Intl`.
function hasIntl() {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })
      .resolvedOptions().timeZone === 'UTC';
  } catch (e) {
    return false;
  }
}

// Minutes east of UTC for `zone` at `d`: format the instant as wall time there,
// read it back as if it were UTC, and diff. Covers DST and half-hour zones.
function offsetOf(zone, d) {
  var f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  var p = {};
  f.formatToParts(d).forEach(function(part) { p[part.type] = part.value; });
  // Some engines render midnight as hour 24.
  var wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute,
                      +p.second);
  return Math.round((wall - d.getTime()) / 60000);
}

// "PST" / "AEDT", for the zones Intl spells out (the US ones). Everywhere else
// it formats as "GMT+9" and this returns nothing, so the list's own pair is used.
function abbrOf(zone, d) {
  var s = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'short'
  }).format(d);
  var m = /[A-Z]{2,5}$/.exec(s.replace(/\s+$/, ''));
  return m ? m[0] : null;
}

// DST only ever adds to a zone's standard offset, so the smaller of its January
// and July offsets is the standard one — north or south of the equator.
function onDst(zone, d, off) {
  var y = d.getUTCFullYear();
  var jan = offsetOf(zone, new Date(Date.UTC(y, 0, 15)));
  var jul = offsetOf(zone, new Date(Date.UTC(y, 6, 15)));
  return off > (jan < jul ? jan : jul);
}

// What the watch is told: { offset: minutes east of UTC, abbr: "PST" }.
function tzInfo(zone, now) {
  var e = entry(zone) || entry(DEFAULT_ZONE);
  var info = { offset: e.off, abbr: e.abbr };
  if (!hasIntl()) { return info; }
  var d = now || new Date();
  try {
    info.offset = offsetOf(e.zone, d);
    info.abbr = abbrOf(e.zone, d) ||
      (e.dst && onDst(e.zone, d, info.offset) ? e.dst : e.abbr);
  } catch (err) {
    console.log('Timezone lookup failed for ' + e.zone + ': ' + err.message);
  }
  return info;
}

module.exports = { ZONES: ZONES, DEFAULT_ZONE: DEFAULT_ZONE, tzInfo: tzInfo };

// Second time zone: the list the config page offers, and the resolution of a
// zone to what the watch actually needs (its current UTC offset in minutes and
// its abbreviation), re-resolved on every send so a DST change lands on the
// next update.
//
// This runs in PebbleKit JS, which rules out Intl: the emulator's runtime
// (pypkjs / STPyV8) hard-aborts the whole JS process on the first
// Intl.DateTimeFormat — "Fatal process out of memory:
// DateTimePatternGeneratorCache::CreateGenerator" — and it is a fatal abort, so
// a try/catch around it buys nothing. Hence the small table below: standard
// offset, the two abbreviations, and which DST rule the zone follows.
//
// ponytail: the rules are the current ones, applied to every year. They shift
// the clock a few hours early or late in the days around a transition on a zone
// whose government has since moved its dates. The config page's preview does
// use Intl — it runs in a real browser — so that is where an exact answer is.
var ZONES = [
  { zone: 'Pacific/Honolulu', city: 'Honolulu', abbr: 'HST', off: -600 },
  { zone: 'America/Anchorage', city: 'Anchorage', abbr: 'AKST', dst: 'AKDT', rule: 'US', off: -540 },
  { zone: 'America/Los_Angeles', city: 'Los Angeles', abbr: 'PST', dst: 'PDT', rule: 'US', off: -480 },
  { zone: 'America/Denver', city: 'Denver', abbr: 'MST', dst: 'MDT', rule: 'US', off: -420 },
  { zone: 'America/Chicago', city: 'Chicago', abbr: 'CST', dst: 'CDT', rule: 'US', off: -360 },
  { zone: 'America/Mexico_City', city: 'Mexico City', abbr: 'CST', off: -360 },
  { zone: 'America/New_York', city: 'New York', abbr: 'EST', dst: 'EDT', rule: 'US', off: -300 },
  { zone: 'America/Halifax', city: 'Halifax', abbr: 'AST', dst: 'ADT', rule: 'US', off: -240 },
  { zone: 'America/Sao_Paulo', city: 'Sao Paulo', abbr: 'BRT', off: -180 },
  { zone: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', abbr: 'ART', off: -180 },
  { zone: 'UTC', city: 'UTC', abbr: 'UTC', off: 0 },
  { zone: 'Europe/London', city: 'London', abbr: 'GMT', dst: 'BST', rule: 'EU', off: 0 },
  { zone: 'Europe/Lisbon', city: 'Lisbon', abbr: 'WET', dst: 'WEST', rule: 'EU', off: 0 },
  { zone: 'Europe/Madrid', city: 'Madrid', abbr: 'CET', dst: 'CEST', rule: 'EU', off: 60 },
  { zone: 'Europe/Paris', city: 'Paris', abbr: 'CET', dst: 'CEST', rule: 'EU', off: 60 },
  { zone: 'Europe/Berlin', city: 'Berlin', abbr: 'CET', dst: 'CEST', rule: 'EU', off: 60 },
  { zone: 'Europe/Rome', city: 'Rome', abbr: 'CET', dst: 'CEST', rule: 'EU', off: 60 },
  { zone: 'Europe/Warsaw', city: 'Warsaw', abbr: 'CET', dst: 'CEST', rule: 'EU', off: 60 },
  { zone: 'Europe/Athens', city: 'Athens', abbr: 'EET', dst: 'EEST', rule: 'EU', off: 120 },
  { zone: 'Africa/Cairo', city: 'Cairo', abbr: 'EET', dst: 'EEST', rule: 'EG', off: 120 },
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
  { zone: 'Australia/Sydney', city: 'Sydney', abbr: 'AEST', dst: 'AEDT', rule: 'AU', off: 600 },
  { zone: 'Pacific/Auckland', city: 'Auckland', abbr: 'NZST', dst: 'NZDT', rule: 'NZ', off: 720 }
];

var DEFAULT_ZONE = 'UTC';

function entry(zone) {
  for (var i = 0; i < ZONES.length; i++) {
    if (ZONES[i].zone === zone) { return ZONES[i]; }
  }
  return null;
}

// The instant of the `nth` `wday` (0 = Sunday) of a month, at `hour` UTC. nth
// counts from 1, or -1 for the last one in the month. `hour` may fall outside
// 0..23 — Date.UTC rolls it into the neighbouring day, which is how a local
// transition time is expressed in UTC.
function nthWeekday(year, month, wday, nth, hour) {
  var day;
  if (nth > 0) {
    var first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    day = 1 + ((wday - first + 7) % 7) + (nth - 1) * 7;
  } else {
    var lastDate = new Date(Date.UTC(year, month + 1, 0));
    day = lastDate.getUTCDate() - ((lastDate.getUTCDay() - wday + 7) % 7);
  }
  return Date.UTC(year, month, day, hour);
}

// When each rule's summer time starts and ends, as UTC instants in `year`.
// Hours are given in the zone's *standard* local time and converted with its
// standard offset `std` — so an end time quoted in daylight time (as they all
// are: "02:00, clocks go back") is written here as the hour before.
function dstWindow(rule, std, year) {
  var h = std / 60;
  switch (rule) {
    // EU: last Sunday of March to last Sunday of October, 01:00 UTC — the one
    // rule written in UTC rather than local time, so `h` doesn't come into it.
    case 'EU': return [nthWeekday(year, 2, 0, -1, 1),
                       nthWeekday(year, 9, 0, -1, 1)];
    // US / Canada: 2nd Sunday of March, 02:00 -> 1st Sunday of November, 02:00
    // daylight (01:00 standard).
    case 'US': return [nthWeekday(year, 2, 0, 2, 2 - h),
                       nthWeekday(year, 10, 0, 1, 1 - h)];
    // Egypt: last Friday of April, midnight -> last Thursday of October,
    // midnight daylight (23:00 standard).
    case 'EG': return [nthWeekday(year, 3, 5, -1, -h),
                       nthWeekday(year, 9, 4, -1, 23 - h)];
    // Southern hemisphere, so the window wraps the new year.
    // Australia: 1st Sunday of October, 02:00 -> 1st Sunday of April, 03:00
    // daylight (02:00 standard).
    case 'AU': return [nthWeekday(year, 9, 0, 1, 2 - h),
                       nthWeekday(year, 3, 0, 1, 2 - h)];
    // New Zealand: last Sunday of September, 02:00 -> 1st Sunday of April,
    // 03:00 daylight (02:00 standard).
    case 'NZ': return [nthWeekday(year, 8, 0, -1, 2 - h),
                       nthWeekday(year, 3, 0, 1, 2 - h)];
    default:   return null;
  }
}

function onDst(rule, std, d) {
  var w = dstWindow(rule, std, d.getUTCFullYear());
  if (!w) { return false; }
  var t = d.getTime();
  // A southern-hemisphere window starts after it ends: summer spans January.
  return w[0] < w[1] ? (t >= w[0] && t < w[1]) : (t >= w[0] || t < w[1]);
}

// What the watch is told: { offset: minutes east of UTC, abbr: "PST" }. Every
// zone in the list that observes DST shifts by exactly an hour.
function tzInfo(zone, now) {
  var e = entry(zone) || entry(DEFAULT_ZONE);
  var summer = !!e.dst && onDst(e.rule, e.off, now || new Date());
  return {
    offset: e.off + (summer ? 60 : 0),
    abbr: summer ? e.dst : e.abbr
  };
}

module.exports = { ZONES: ZONES, DEFAULT_ZONE: DEFAULT_ZONE, tzInfo: tzInfo };

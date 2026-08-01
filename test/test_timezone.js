// The second time zone, as the watch is told it: an offset in minutes and an
// abbreviation. This is the one piece of tz knowledge in the project — the
// watch has none — so it is checked at both ends of the year, on both sides of
// the equator, and with the Intl fallback the older phone runtimes hit.
var tz = require('../src/pkjs/modules/timezone');
var assert = require('assert');

var JULY = new Date('2026-07-15T12:00:00Z');
var JAN = new Date('2026-01-15T12:00:00Z');
var checks = 0;

function check(zone, when, offset, abbr) {
  var got = tz.tzInfo(zone, when);
  assert.deepStrictEqual(got, { offset: offset, abbr: abbr },
    zone + ' on ' + when.toISOString().slice(0, 10) + ': got ' +
    JSON.stringify(got));
  checks++;
}

// No DST anywhere in these, north or south of the equator.
check('UTC', JULY, 0, 'UTC');
check('Asia/Tokyo', JULY, 540, 'JST');
check('Asia/Tokyo', JAN, 540, 'JST');
check('Asia/Kolkata', JULY, 330, 'IST');          // half-hour offset

// DST moves both the offset and the abbreviation. Intl spells the US ones out;
// the rest come from the list's own standard / summer pair.
check('America/Los_Angeles', JULY, -420, 'PDT');
check('America/Los_Angeles', JAN, -480, 'PST');
check('Europe/Paris', JULY, 120, 'CEST');
check('Europe/Paris', JAN, 60, 'CET');
// Southern hemisphere: summer time is the January one.
check('Australia/Sydney', JULY, 600, 'AEST');
check('Australia/Sydney', JAN, 660, 'AEDT');

// An unknown zone falls back to the default rather than sending nothing.
check('Mars/Olympus_Mons', JULY, 0, 'UTC');

// A runtime without a usable Intl (older PebbleKit JS) keeps working on the
// list's standard offsets — an hour off in a zone's summer, never adrift.
(function noIntl() {
  var real = global.Intl;
  global.Intl = undefined;
  try {
    check('Europe/Paris', JULY, 60, 'CET');
    check('America/Los_Angeles', JULY, -480, 'PST');
  } finally {
    global.Intl = real;
  }
})();

// Every zone the config page offers has to resolve, or its option is dead.
tz.ZONES.forEach(function(z) {
  var info = tz.tzInfo(z.zone, JULY);
  assert.ok(Math.abs(info.offset) <= 14 * 60,
    z.zone + ' resolved to a nonsense offset: ' + info.offset);
  assert.ok(/^[A-Za-z]{2,5}$/.test(info.abbr),
    z.zone + ' resolved to a nonsense abbreviation: ' + info.abbr);
  checks++;
});

console.log(checks + ' passed, 0 failed');

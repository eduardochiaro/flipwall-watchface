// The second time zone, as the watch is told it: an offset in minutes and an
// abbreviation. This is the one piece of tz knowledge in the project — the
// watch has none — so it is checked at both ends of the year and on both sides
// of the equator.
//
// Intl is deleted for the whole file, and must stay deleted: this module runs
// in PebbleKit JS, whose emulator (pypkjs / STPyV8) does not throw on
// Intl.DateTimeFormat — it aborts the JS process outright, so the watchface's
// JS never starts. Any Intl that creeps back in here fails this file instead.
global.Intl = undefined;

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

// DST moves both the offset and the abbreviation.
check('America/Los_Angeles', JULY, -420, 'PDT');
check('America/Los_Angeles', JAN, -480, 'PST');
check('Europe/Paris', JULY, 120, 'CEST');
check('Europe/Paris', JAN, 60, 'CET');
check('Africa/Cairo', JULY, 180, 'EEST');
check('Africa/Cairo', JAN, 120, 'EET');
// Southern hemisphere: summer time is the January one, so the window wraps.
check('Australia/Sydney', JULY, 600, 'AEST');
check('Australia/Sydney', JAN, 660, 'AEDT');
check('Pacific/Auckland', JULY, 720, 'NZST');
check('Pacific/Auckland', JAN, 780, 'NZDT');

// The transitions themselves. 2026: EU turns over on 29 March / 25 October at
// 01:00 UTC, the US on 8 March / 1 November at 02:00 local.
check('Europe/Paris', new Date('2026-03-29T00:59:00Z'), 60, 'CET');
check('Europe/Paris', new Date('2026-03-29T01:01:00Z'), 120, 'CEST');
check('Europe/Paris', new Date('2026-10-25T00:59:00Z'), 120, 'CEST');
check('Europe/Paris', new Date('2026-10-25T01:01:00Z'), 60, 'CET');
check('America/New_York', new Date('2026-03-08T06:59:00Z'), -300, 'EST');
check('America/New_York', new Date('2026-03-08T07:01:00Z'), -240, 'EDT');
check('America/New_York', new Date('2026-11-01T05:59:00Z'), -240, 'EDT');
check('America/New_York', new Date('2026-11-01T06:01:00Z'), -300, 'EST');

// An unknown zone falls back to the default rather than sending nothing.
check('Mars/Olympus_Mons', JULY, 0, 'UTC');

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

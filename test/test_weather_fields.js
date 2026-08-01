// Host test for which Open-Meteo fields a face asks for. The whole weather
// fetch hangs off requestedFields(): return null and the watch gets no reading
// at all, which is how a weather block on the face ends up blank.
var path = require('path');
var assert = require('assert');
var src = path.join(__dirname, '..', 'src', 'pkjs');
var configDef = require(src + '/config');

global.localStorage = { getItem: function() { return null; } };
var weather = require(src + '/modules/weather');
var requestedFields = weather.requestedFields;

var checks = 0;
function ok(cond, what) {
  assert.ok(cond, what);
  checks++;
}

// A saved-settings blob: every slot set, with `blocks` overriding some of them.
function face(blocks) {
  var s = { BLOCK_TOP_LEFT: 0, BLOCK_TOP_RIGHT: 1, BLOCK_BOTTOM_LEFT: 2,
            BLOCK_BOTTOM_RIGHT: 3, BLOCK_BAND: 7,
            BLOCK_MID_LEFT: 16, BLOCK_MID_RIGHT: 4 };
  Object.keys(blocks || {}).forEach(function(k) { s[k] = blocks[k]; });
  return s;
}

// A face with no weather block anywhere skips the fetch (and the GPS fix).
ok(requestedFields(face()) === null, 'a weather-free face still fetches');

// Every weather block the config page offers has to pull its own field, in any
// slot that can hold it — including the 6-block column middles, which are the
// two slots the block list used to leave out.
var slots = ['BLOCK_TOP_LEFT', 'BLOCK_BAND', 'BLOCK_MID_LEFT', 'BLOCK_MID_RIGHT'];
function weatherIds() {
  var ids = [];
  (function walk(items) {
    items.forEach(function(it) {
      if (it.items) { return walk(it.items); }
      if (!it.options || String(it.messageKey).indexOf('BLOCK_') !== 0) { return; }
      it.options.forEach(function(group) {
        if (String(group.label).indexOf('Weather') < 0) { return; }
        group.value.forEach(function(o) {
          if (ids.indexOf(o.value) < 0) { ids.push(o.value); }
        });
      });
    });
  })(configDef);
  return ids;
}

weatherIds().forEach(function(id) {
  slots.forEach(function(slot) {
    var blocks = {};
    blocks[slot] = id;
    var f = requestedFields(face(blocks));
    ok(f !== null, 'block ' + id + ' in ' + slot + ' asks for no weather');
  });
});

// The color variants read the same values as their plain counterparts, so they
// have to request the same fields (they were missing, and drew "--" forever).
ok(JSON.stringify(requestedFields(face({ BLOCK_TOP_LEFT: 41 }))) ===
   JSON.stringify(requestedFields(face({ BLOCK_TOP_LEFT: 33 }))),
   'UV - color asks for different fields than plain UV');
ok(JSON.stringify(requestedFields(face({ BLOCK_TOP_LEFT: 43 }))) ===
   JSON.stringify(requestedFields(face({ BLOCK_TOP_LEFT: 39 }))),
   'Air quality - color asks for different fields than plain AQI');

// Nothing saved on this phone (fresh install from the store): the watch keeps
// its own blocks, so fetch everything rather than assume there is no weather.
var fresh = requestedFields({});
ok(fresh !== null, 'a phone with no saved settings never fetches weather');
ok(fresh.air.length && fresh.daily.length,
   'the fallback fetch leaves out a whole endpoint');

console.log(checks + ' passed, 0 failed');

#!/bin/sh
# Repack the built .pbw.
#
# The SDK writes it with every entry *stored* — no compression at all — and
# leaves the 280KB JS source map inside. A .pbw is a plain zip that the phone
# app unpacks, so dropping the map and deflating the rest is the same bundle at
# half the size (~534KB -> ~260KB), which is what gets pushed over Bluetooth.
#
# ponytail: no minifier. Deflate already squeezes the comments out of the JS —
# terser on top saved another 8%, not worth a build dependency.
set -e
cd "$(dirname "$0")/.."

pbw=$(ls build/*.pbw)
work=build/.repack

rm -rf "$work"
mkdir -p "$work"
unzip -q "$pbw" -d "$work"
rm -f "$work/pebble-js-app.js.map"
# -D: no directory entries, so the repacked archive holds exactly the files the
# SDK put there and nothing else.
(cd "$work" && zip -qr -9 -D ../repacked.pbw .)
mv build/repacked.pbw "$pbw"
rm -rf "$work"

ls -l "$pbw"

#!/bin/sh
# Build a release .pbw into dist/<version>/.
#
# The SDK writes build/*.pbw with every entry *stored* — no compression at all —
# and leaves the 280KB JS source map inside. build/ keeps all of that for
# debugging; the release copy drops the map and deflates the rest, which is the
# same bundle at half the size (~534KB -> ~260KB) over Bluetooth. Nothing
# references the map: the per-platform manifest.json lists only pebble-app.bin
# and app_resources.pbpack.
#
# ponytail: no minifier. Deflate already squeezes the comments out of the JS —
# terser on top saved another 8%, not worth a build dependency.
set -e
cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').version")
name=$(node -p "require('./package.json').name")

pebble clean
pebble build

src=$(ls build/*.pbw)
work=build/.repack
out=dist/$version
pbw=$out/$name-$version.pbw

rm -rf "$work"
mkdir -p "$work" "$out"
unzip -q "$src" -d "$work"
rm -f "$work/pebble-js-app.js.map"
# -D: no directory entries, so the release archive holds exactly the files the
# SDK put there and nothing else. zip appends, so drop any previous build of the
# same version first.
rm -f "$pbw"
(cd "$work" && zip -qr -9 -D "../../$pbw" .)
rm -rf "$work"

ls -l "$pbw"

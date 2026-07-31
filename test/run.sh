#!/bin/sh
# Host tests. No SDK, no emulator - test/pebble.h stubs the few SDK symbols the
# C modules touch, and the JS tests stub the Clay config webview.
set -e
cd "$(dirname "$0")"
for t in test_*.c; do
  cc -std=c11 -Wall -Wextra -I. -o "/tmp/${t%.c}" "$t"
  "/tmp/${t%.c}"
done
for t in test_*.js; do
  node "$t"
done

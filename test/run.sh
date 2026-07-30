#!/bin/sh
# Host tests for the pure-logic C modules. No SDK, no emulator - test/pebble.h
# stubs the few SDK symbols they touch.
set -e
cd "$(dirname "$0")"
for t in test_*.c; do
  cc -std=c11 -Wall -Wextra -I. -o "/tmp/${t%.c}" "$t"
  "/tmp/${t%.c}"
done

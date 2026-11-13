#!/bin/sh
# Makes sure that dictation works, without a microphone. The script speaks a short answer with `say`,
# plays it through the app's own Dictation code, and checks that the words come out.
# Run it after a change to Dictation.swift or after a macOS update.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
say -v Samantha -o "$work/answer.aiff" "So I would partition the users table by user ID with consistent hashing. Writes go to Kafka first, and the database serves the reads."
swiftc -O -swift-version 5 -o "$work/check" "$here/Dictation.swift" "$here/dictation-check.swift"
"$work/check" "$work/answer.aiff" "user ID" "consistent hashing" "Kafka" "database"

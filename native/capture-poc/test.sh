#!/bin/sh
set -eu

# Command Line Tools ship Swift Testing but SwiftPM does not add its framework
# paths to the test bundle automatically. Xcode provides them on machines that
# have the full IDE; this script keeps the PoC testable with CLT alone.
SWIFT_TESTING_FRAMEWORKS="/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
SWIFT_TESTING_LIBRARIES="/Library/Developer/CommandLineTools/Library/Developer/usr/lib"

if [ -d "$SWIFT_TESTING_FRAMEWORKS" ] && [ -d "$SWIFT_TESTING_LIBRARIES" ]; then
  export DYLD_FRAMEWORK_PATH="$SWIFT_TESTING_FRAMEWORKS${DYLD_FRAMEWORK_PATH:+:$DYLD_FRAMEWORK_PATH}"
  export DYLD_LIBRARY_PATH="$SWIFT_TESTING_LIBRARIES${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  exec swift test --package-path "$(dirname "$0")" \
    -Xlinker -rpath -Xlinker "$SWIFT_TESTING_FRAMEWORKS" \
    -Xlinker -rpath -Xlinker "$SWIFT_TESTING_LIBRARIES" \
    "$@"
fi

exec swift test --package-path "$(dirname "$0")" "$@"

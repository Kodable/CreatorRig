#!/usr/bin/env bash
# Makes the 6 KTX files the textures scenario looks for, from the PNGs in public/.
# Needs PVRTexTool CLI (free, https://developer.imaginationtech.com/pvrtextool/). Run from the repo root.
set -euo pipefail

CLI="${PVRTEXTOOL:-$(command -v PVRTexToolCLI || true)}"
if [ -z "$CLI" ]; then
  CLI="$(find /Applications -type f -name PVRTexToolCLI 2>/dev/null | head -1 || true)"
fi
if [ -z "$CLI" ]; then
  echo "PVRTexToolCLI not found. Install PVRTexTool, or set PVRTEXTOOL=/path/to/PVRTexToolCLI" >&2
  exit 1
fi
echo "using $CLI"

make() { # <png> <out-base>
  "$CLI" -i "$1" -o "$2-astc.ktx" -f ASTC_6x6,UBN,lRGB -q astcmedium
  "$CLI" -i "$1" -o "$2-etc2.ktx" -f ETC2_RGBA,UBN,lRGB -q etcfast
  "$CLI" -i "$1" -o "$2-s3tc.ktx" -f BC3,UBN,lRGB
}
make public/textures/backdrop.png public/textures/backdrop
make public/atlas/creator-items.png public/atlas/creator-items
ls -la public/textures/*.ktx public/atlas/*.ktx

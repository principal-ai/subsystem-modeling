#!/usr/bin/env bash
# Rebuild icon.iconset from the brand export.
#
# Pipeline:
#   1. icon.png          — pristine FileCity "P" export from logo-component
#   2. badge-icon.py     — composites the bottom "LIGHT" ribbon -> icon-light.png
#   3. sips              — expands icon-light.png into the 10 .iconset sizes
#
# electrobun.config.ts points `mac.icons` at icon.iconset, so `electrobun build`
# / `electrobun dev` convert it to AppIcon.icns via iconutil. Re-run this after
# re-exporting icon.png:  bash scripts/make-iconset.sh
set -euo pipefail
cd "$(dirname "$0")/.."

python3 scripts/badge-icon.py "${1:-LIGHT}"

ISET="icon.iconset"
rm -rf "$ISET" && mkdir -p "$ISET"
gen() { sips -z "$1" "$1" icon-light.png --out "$ISET/$2" >/dev/null; }
gen 16  icon_16x16.png
gen 32  icon_16x16@2x.png
gen 32  icon_32x32.png
gen 64  icon_32x32@2x.png
gen 128 icon_128x128.png
gen 256 icon_128x128@2x.png
gen 256 icon_256x256.png
gen 512 icon_256x256@2x.png
gen 512 icon_512x512.png
cp icon-light.png "$ISET/icon_512x512@2x.png"

# Sanity check: make sure iconutil accepts the set.
iconutil -c icns "$ISET" -o /tmp/_iconset_check.icns
rm -f /tmp/_iconset_check.icns
echo "make-iconset: rebuilt $ISET"

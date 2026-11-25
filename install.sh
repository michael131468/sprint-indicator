#!/usr/bin/env bash
# Installs the Sprint Indicator extension for the current user.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
UUID="sprint-indicator@micho"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$DEST/schemas"
cp "$SRC/extension.js" "$SRC/prefs.js" "$SRC/metadata.json" "$DEST/"
cp "$SRC/schemas/org.gnome.shell.extensions.sprint-indicator.gschema.xml" "$DEST/schemas/"
glib-compile-schemas --strict "$DEST/schemas/"

echo "Installed to: $DEST"
echo "Now restart GNOME Shell (log out and back in on Wayland, or Alt-F2 'r' on X11)"
echo "and enable it with:  gnome-extensions enable $UUID"

#!/usr/bin/env bash
# Render a PNG screenshot of a tmux pane's exact current screen, colours and all.
# Seeking a GIF-derived MP4 lands on stale frames, so grab the real terminal
# state instead: capture-pane -e -> synthetic asciicast -> agg -> PNG.
#
#   shot.sh <pane-id> <output.png>
set -euo pipefail
PANE="${1:?pane id}"
OUT="${2:?output png}"
COLS=$(tmux display-message -p -t "$PANE" '#{pane_width}')
ROWS=$(tmux display-message -p -t "$PANE" '#{pane_height}')
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

tmux capture-pane -t "$PANE" -p -e -N > "$TMP/screen.ansi"

python3 - "$TMP/screen.ansi" "$TMP/shot.cast" "$COLS" "$ROWS" <<'PY'
import json, sys
src, dst, cols, rows = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
screen = open(src).read().rstrip("\n")
payload = "\x1b[H\x1b[2J" + screen.replace("\n", "\r\n")
with open(dst, "w") as fh:
    fh.write(json.dumps({"version": 2, "width": cols, "height": rows}) + "\n")
    fh.write(json.dumps([0.0, "o", payload]) + "\n")
    fh.write(json.dumps([1.0, "o", ""]) + "\n")
PY

agg "$TMP/shot.cast" "$TMP/shot.gif" --theme dracula --font-size 18 --renderer fontdue >/dev/null 2>&1
ffmpeg -y -loglevel error -i "$TMP/shot.gif" -frames:v 1 "$OUT"
echo "$OUT"

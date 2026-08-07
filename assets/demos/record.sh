#!/usr/bin/env bash
# Repeatable demo harness: boots an isolated pi (own PI_CODING_AGENT_DIR, only
# this extension loaded), replays a pre-seeded session so no model calls happen
# on camera, records the TUI with asciinema, and renders GIF + MP4 + stills.
#
#   ./assets/demos/record.sh
#
# Requires: tmux, asciinema, agg, ffmpeg, and a pi install.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO="${DEMO_DIR:-/tmp/sticky-demo}"
SESSION="$DEMO/demo-session.jsonl"
AGENT_DIR="$DEMO/agent"
TMUX_SESSION="stickyrec"
COLS=100
ROWS=30

CAST="$REPO/assets/sticky-demo.cast"
GIF="$REPO/assets/sticky-demo.gif"
MP4="$REPO/assets/sticky-demo.mp4"

[ -f "$SESSION" ] || { echo "missing seeded session: $SESSION" >&2; exit 1; }

mkdir -p "$AGENT_DIR"
printf '{"tuiMode":"fullscreen"}\n' > "$AGENT_DIR/settings.json"

tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
# Capture the pane id: once asciinema attaches a read-only client, targeting the
# session makes tmux resolve to that client and refuse with "client is read-only".
PANE=$(tmux new-session -d -P -F '#{pane_id}' -s "$TMUX_SESSION" -x "$COLS" -y "$ROWS" -c "$DEMO" \
	"PI_CODING_AGENT_DIR=$AGENT_DIR pi --session $SESSION")
tmux set-option -t "$TMUX_SESSION" status off # keep tmux out of frame
sleep 8
tmux send-keys -t "$PANE" End
sleep 1

asciinema rec --overwrite --window-size "${COLS}x${ROWS}" --idle-time-limit 2 \
	--command "tmux attach -t $TMUX_SESSION" "$CAST" &
REC_PID=$!
sleep 0.8

# Never let a driver hiccup abort the run before the recorder is stopped,
# otherwise asciinema keeps recording an idle screen forever.
# stdin is detached: asciinema owns the terminal while it records in the
# background, and a foreground child sharing that tty gets stopped by SIGTTIN.
"$REPO/assets/demos/drive.sh" "$PANE" </dev/null >"$DEMO/drive.log" 2>&1 ||
	echo "warning: driver exited $? (see $DEMO/drive.log)" >&2

# Detach (not kill) so the recording ends on the demo's last frame instead of
# tmux's "[exited]" screen. A writable client releases cleanly; a read-only one
# does not, which is also why the attach above omits -r.
tmux detach-client -s "$TMUX_SESSION" 2>/dev/null || true
wait "$REC_PID" || true
tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true

# Detaching prints "[detached (from session ...)]" and then tears the terminal
# down - clear screen, leave alt screen - which renders as a blank final frame.
# Drop that whole tail so the video ends on the demo itself and loops cleanly.
python3 - "$CAST" <<'PY'
import sys

# Scoped to the last few events on purpose: pi emits ESC[2J on every full
# redraw, so an unscoped match would eat the whole recording.
TEARDOWN = ("detached", r"[?1049l", r"[2J")
WINDOW = 6
path = sys.argv[1]
lines = open(path).read().splitlines()
start = max(1, len(lines) - WINDOW)
cut = next(
    (i for i, l in enumerate(lines) if i >= start and any(m in l for m in TEARDOWN)),
    None,
)
if cut:
    open(path, "w").write("\n".join(lines[:cut]) + "\n")
    print(f"trimmed {len(lines) - cut} teardown event(s) from the cast")
PY

agg "$CAST" "$GIF" --theme dracula --font-size 18 --renderer fontdue \
	--speed 1.0 --idle-time-limit 1.5 --last-frame-duration 2
ffmpeg -y -loglevel error -i "$GIF" -movflags faststart \
	-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
	-c:v libx264 -preset slow -crf 24 -tune animation -pix_fmt yuv420p "$MP4"

echo "cast: $CAST"
echo "gif:  $GIF  ($(du -h "$GIF" | cut -f1))"
echo "mp4:  $MP4  ($(du -h "$MP4" | cut -f1))"

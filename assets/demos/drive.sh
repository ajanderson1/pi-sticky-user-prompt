#!/usr/bin/env bash
# Drives the demo tmux session: scrolls the transcript so the sticky header can
# be seen pinning, then handing over between turns as you walk back.
# Deliberately short - the README stills cover the options and help panels.
# Usage: drive.sh <tmux-pane-id>
set -euo pipefail
S="${1:?tmux pane id (e.g. %12) or session required}"

# SGR mouse wheel events, sent as raw bytes. `send-keys -l` re-parses the string
# as key presses and mangles the escape sequence; -H writes the bytes verbatim.
# ESC [ < 64 ; 20 ; 10 M  (wheel up) / 65 (wheel down)
wheel_up() { tmux send-keys -t "$S" -H 1b 5b 3c 36 34 3b 32 30 3b 31 30 4d; }
wheel_down() { tmux send-keys -t "$S" -H 1b 5b 3c 36 35 3b 32 30 3b 31 30 4d; }

scroll_up() { for _ in $(seq 1 "$1"); do wheel_up; sleep "${2:-0.10}"; done; }
scroll_down() { for _ in $(seq 1 "$1"); do wheel_down; sleep "${2:-0.05}"; done; }

sleep 1.1

# 1. The newest prompt ("cutlery") slides up and STOPS at the top edge,
#    staying put while its list scrolls underneath.
scroll_up 9 0.14
sleep 1.3

# 2. Cross into the previous turn - "vegetables" pushes "cutlery" up and out.
scroll_up 8 0.13
sleep 1.3

# 3. And again, back to "fruits", the first question of the session.
scroll_up 8 0.13
sleep 1.4

# 4. Walk forward again: the header tracks whichever section you are reading.
scroll_down 20 0.06
sleep 1.6

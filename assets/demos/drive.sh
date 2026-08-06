#!/usr/bin/env bash
# Drives the demo tmux session: scrolls the transcript so the sticky header can
# be seen pinning, handing over between turns, and then the options UI.
# Usage: drive.sh <tmux-session>
set -euo pipefail
S="${1:?tmux pane id (e.g. %12) or session required}"

# Typing a slash command opens pi's autocomplete; Escape closes the popup so the
# following Enter submits the command instead of accepting a completion.
submit() {
	tmux send-keys -t "$S" -l "$1"
	sleep 0.9
	tmux send-keys -t "$S" Escape
	sleep 0.4
	tmux send-keys -t "$S" Enter
}

# SGR mouse wheel events, sent as raw bytes. `send-keys -l` re-parses the string
# as key presses and mangles the escape sequence; -H writes the bytes verbatim.
# ESC [ < 64 ; 20 ; 10 M  (wheel up) / 65 (wheel down)
wheel_up() { tmux send-keys -t "$S" -H 1b 5b 3c 36 34 3b 32 30 3b 31 30 4d; }
wheel_down() { tmux send-keys -t "$S" -H 1b 5b 3c 36 35 3b 32 30 3b 31 30 4d; }

scroll_up() { for _ in $(seq 1 "$1"); do wheel_up; sleep "${2:-0.10}"; done; }
scroll_down() { for _ in $(seq 1 "$1"); do wheel_down; sleep "${2:-0.06}"; done; }

sleep 2.0

# 1. The newest prompt slides up and STOPS at the top edge.
scroll_up 14 0.13
sleep 1.6

# 2. Keep going: it stays pinned while its answer scrolls underneath.
scroll_up 16 0.09
sleep 1.4

# 3. Cross into the previous turn - the older prompt pushes the newer one off.
scroll_up 22 0.11
sleep 1.8

# 4. And again, back to the first question of the session.
scroll_up 26 0.10
sleep 1.8

# 5. Walk forward again; the header tracks the section you are reading.
scroll_down 40 0.05
sleep 1.2
tmux send-keys -t "$S" End
sleep 1.5

# 6. Native discoverability: bare /sticky opens the options menu.
submit "/sticky"
sleep 3.0
tmux send-keys -t "$S" Escape
sleep 0.8

# 7. And /sticky help explains the behaviour.
submit "/sticky help"
sleep 4.5
tmux send-keys -t "$S" Escape
sleep 1.2

# 8. Finish on the hero view: prompt pinned, answer scrolling underneath.
scroll_up 8 0.12
sleep 2.5

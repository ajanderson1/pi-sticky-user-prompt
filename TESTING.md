# Testing

## Supported rung

| Rung | Command | Covers |
| --- | --- | --- |
| R0 — unit | `npm test` | Tail-following scroll normalization and prompt-boundary stability |

The test suite uses Node's built-in test runner and has no service dependencies.

## Fixtures

`test/scroll-position.test.mjs` models the boundary where a four-row sticky block changes the raw
viewport position from 16 to 20. Without compensation, ownership alternates between adjacent user
prompts; the expected behavior keeps ownership and header height stable across repeated redraws.

## Visual surface

The extension is a fullscreen terminal UI. For visual acceptance, run pi with
`--tui-mode fullscreen`, trigger a response so `Working...` animates, and inspect prompt handover
at the top edge. The committed demo harness in `assets/demos/` exercises the same fullscreen
surface with a seeded session.

## Escalation

There are no R1–R3 rungs. Escalate only when `npm test` passes but a supported terminal renders a
visible discontinuity; include terminal name, dimensions, pi version, `/sticky status`, and a
screen recording.

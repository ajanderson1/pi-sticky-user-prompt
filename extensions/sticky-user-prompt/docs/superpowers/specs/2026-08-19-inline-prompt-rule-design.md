# Inline prompt-rule design

## Goal

Give every submitted user prompt a permanent underline so that, when the prompt reaches the transcript top, it becomes the underline beneath the sticky prompt without a visual handoff.

## Scope

All implementation changes remain under `extensions/sticky-user-prompt/`. Pi itself, its installed packages, and the extension's public installation layout are unchanged.

## Design

- Register Pi's display-only Markdown transformer and affect only `messageType: "user"`.
- When the extension's rule setting is enabled, append a Markdown horizontal rule to the rendered prompt. The session entry and model context retain the original prompt text.
- Render the sticky rule using the same theme foreground/background treatment as the inline horizontal rule.
- Keep the current progressive sticky reveal and row cap. For a capped prompt, retain the underline as the final sticky row so the boundary remains visible.
- Make `/sticky rule` toggle both the inline and sticky underline. Rebuild discovered `UserMessageComponent` instances and invalidate measurement when the setting changes.

## Rejected alternatives

- Keep the existing sticky-only rule: it cannot create the requested seamless inline-to-sticky transition.
- Patch Pi's `UserMessageComponent`: it relies on private internals more deeply than the supported Markdown-transformer API.

## Verification

- Extend the extension-local unit tests for user-only decoration and rule toggling.
- Run `npm test`.
- Run the existing fullscreen demo harness or an isolated interactive Pi session to confirm that an immediately submitted prompt is underlined and that its sticky header preserves the same boundary while scrolling.

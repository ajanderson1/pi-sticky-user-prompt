# Inline Prompt Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently underline each displayed user prompt so its inline boundary becomes the sticky prompt's boundary as it reaches the top of the fullscreen transcript.

**Architecture:** A small display-only helper decorates only Pi user-message Markdown with a horizontal rule. `index.ts` registers that helper through Pi's public Markdown-transformer API, refreshes rendered user-message components when the rule setting changes, and renders the sticky rule with matching theme colors. The original session entry and model context remain unchanged.

**Tech Stack:** TypeScript extension loaded by Pi through jiti; Node.js built-in test runner; Pi Markdown-transformer and TUI APIs.

## Global Constraints

- All changed and created files, including tests and documentation, live under `extensions/sticky-user-prompt/`.
- Do not modify Pi itself, installed packages, extension installation paths, or session/model content.
- `/sticky rule` controls the rule in both inline and sticky presentations.
- Preserve the existing sticky ownership, progressive reveal, row cap, and fullscreen fallback behavior.

---

## File structure

- `extensions/sticky-user-prompt/prompt-rule.js` — pure display-only Markdown decoration helper.
- `extensions/sticky-user-prompt/test/prompt-rule.test.mjs` — Node tests for user-only and enabled-only decoration.
- `extensions/sticky-user-prompt/index.ts` — extension registration, component refresh, and visually matched sticky boundary.
- `extensions/sticky-user-prompt/docs/superpowers/specs/2026-08-19-inline-prompt-rule-design.md` — approved design.
- `extensions/sticky-user-prompt/docs/superpowers/plans/2026-08-19-inline-prompt-rule.md` — this plan.

### Task 1: Add and test the display-only decorator

**Files:**
- Create: `extensions/sticky-user-prompt/test/prompt-rule.test.mjs`
- Create: `extensions/sticky-user-prompt/prompt-rule.js`

**Interfaces:**
- Consumes: Pi Markdown-transformer context `{ messageType: "user" | "assistant" | "assistant-thinking" }` and the current `ruleEnabled` boolean.
- Produces: `decorateUserPrompt(markdown: string, messageType: string, ruleEnabled: boolean): string`.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { decorateUserPrompt } from "../prompt-rule.js";

test("adds a Markdown rule only to enabled user prompts", () => {
  assert.equal(decorateUserPrompt("Explain this", "user", true), "Explain this\n\n---");
});

test("leaves non-user messages and a disabled rule unchanged", () => {
  assert.equal(decorateUserPrompt("Reply", "assistant", true), "Reply");
  assert.equal(decorateUserPrompt("Prompt", "user", false), "Prompt");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test extensions/sticky-user-prompt/test/prompt-rule.test.mjs`

Expected: FAIL because `../prompt-rule.js` does not yet exist.

- [ ] **Step 3: Implement the minimal decorator**

```js
const HORIZONTAL_RULE = "\n\n---";

export function decorateUserPrompt(markdown, messageType, ruleEnabled) {
  if (messageType !== "user" || !ruleEnabled) return markdown;
  return `${markdown}${HORIZONTAL_RULE}`;
}
```

The helper must not mutate or persist the input; Pi invokes it only while rendering.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test extensions/sticky-user-prompt/test/prompt-rule.test.mjs`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the tested helper**

```bash
git add extensions/sticky-user-prompt/prompt-rule.js extensions/sticky-user-prompt/test/prompt-rule.test.mjs
git commit -m "feat(sticky): decorate submitted prompts with rules" -m "Device: $(hostname -s)"
```

### Task 2: Wire the decorator into the extension and synchronize the sticky boundary

**Files:**
- Modify: `extensions/sticky-user-prompt/index.ts`
- Test: `extensions/sticky-user-prompt/test/prompt-rule.test.mjs`

**Interfaces:**
- Consumes: `decorateUserPrompt(markdown, messageType, config.rule)`.
- Produces: permanently rendered inline rules for user messages and matching sticky header rules; `/sticky rule` refreshes both views.

- [ ] **Step 1: Extend the existing tests with an authored-rule case**

```js
test("does not duplicate an authored final horizontal rule", () => {
  assert.equal(decorateUserPrompt("Prompt\n\n---", "user", true), "Prompt\n\n---");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test extensions/sticky-user-prompt/test/prompt-rule.test.mjs`

Expected: FAIL because the initial helper appends a second horizontal rule.

- [ ] **Step 3: Update the helper to make decoration idempotent**

Keep the same function signature. After confirming the message is an enabled user prompt, return it unchanged when it already ends with `"\n\n---"`; otherwise append the horizontal rule. Preserve all disabled/non-user cases.

- [ ] **Step 4: Register the helper and refresh rendered components**

In `index.ts`:

```ts
import { decorateUserPrompt } from "./prompt-rule.js";

pi.registerMarkdownTransformer((markdown, { messageType }) =>
  decorateUserPrompt(markdown, messageType, config.rule),
);
```

Add a guarded transcript walk that calls `rebuild()` on every discovered `UserMessageComponent`, invalidates the document/scroll view, resets `measureKey`, and requests a render. Invoke it when `/sticky rule` changes `config.rule` so earlier prompts update immediately.

Update `ruleLine()` to use the Markdown horizontal-rule foreground (`mdHr`) inside `userMessageBg`. Retain the existing capped-message replacement behavior so the final sticky row remains the same visual divider when the full inline rule is below the cap.

- [ ] **Step 5: Run focused and existing regression tests**

Run:

```bash
node --test extensions/sticky-user-prompt/test/prompt-rule.test.mjs
npm test
```

Expected: all prompt-rule and scroll-position tests PASS.

- [ ] **Step 6: Commit the integration**

```bash
git add extensions/sticky-user-prompt/index.ts extensions/sticky-user-prompt/prompt-rule.js extensions/sticky-user-prompt/test/prompt-rule.test.mjs
git commit -m "feat(sticky): carry prompt rules into headers" -m "Device: $(hostname -s)"
```

### Task 3: Verify visually in an isolated Herdr pane

**Files:**
- Create: `extensions/sticky-user-prompt/assets/verification/2026-08-19-inline-prompt-rule/inline-rule.png`
- Create: `extensions/sticky-user-prompt/assets/verification/2026-08-19-inline-prompt-rule/sticky-rule.png`
- Create: `extensions/sticky-user-prompt/assets/verification/2026-08-19-inline-prompt-rule/verdict.md`

**Interfaces:**
- Consumes: the installed extension and Pi fullscreen TUI.
- Produces: screenshot evidence and one-line visual verdict; no runtime or source changes outside the extension.

- [ ] **Step 1: Start an isolated fullscreen Pi in the user-requested Herdr pane**

Use the installed Herdr CLI syntax to target `w14:pJ`. Set `PI_CODING_AGENT_DIR` to a temporary directory that auto-discovers only this extension, then start Pi with `--tui-mode fullscreen` and a session/fixture that avoids a real model call.

- [ ] **Step 2: Submit a user prompt and capture the inline boundary**

Use the existing `assets/demos/shot.sh` helper or Herdr pane capture to save `inline-rule.png`. The prompt has its user-message background and a visible horizontal divider immediately beneath it.

- [ ] **Step 3: Scroll until that prompt becomes sticky and capture the handoff**

Save `sticky-rule.png`. Confirm the sticky divider shares the inline divider's colors/background, with no duplicate divider, gap, or jump at the top edge.

- [ ] **Step 4: Write the visual verdict**

Write exactly one line to `verdict.md`, for example: `PASS — the submitted prompt's divider is visible inline and remains visually continuous as the prompt becomes sticky.`

- [ ] **Step 5: Run the complete verification suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit verification artifacts**

```bash
git add extensions/sticky-user-prompt/assets/verification/2026-08-19-inline-prompt-rule
git commit -m "test(sticky): verify inline prompt rule" -m "Device: $(hostname -s)"
```

## Self-review

- Spec coverage: Task 1 creates the user-only display decorator; Task 2 preserves its display-only scope, synchronizes `/sticky rule`, and keeps capped sticky boundaries; Task 3 validates inline-to-sticky continuity in fullscreen Pi.
- Placeholder scan: no TBD/TODO or undefined implementation names remain.
- Type consistency: `decorateUserPrompt(markdown, messageType, ruleEnabled)` has one definition and is used unchanged by tests and the Markdown transformer.

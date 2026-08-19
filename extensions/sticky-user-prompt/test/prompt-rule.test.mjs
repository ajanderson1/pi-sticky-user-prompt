import assert from "node:assert/strict";
import test from "node:test";
import { decorateUserPrompt, lastContentRow } from "../prompt-rule.js";

test("adds a Markdown rule only to enabled user prompts", () => {
	assert.equal(decorateUserPrompt("Explain this", "user", true), "Explain this\n\n---");
});

test("leaves non-user messages and a disabled rule unchanged", () => {
	assert.equal(decorateUserPrompt("Reply", "assistant", true), "Reply");
	assert.equal(decorateUserPrompt("Prompt", "user", false), "Prompt");
});

test("does not duplicate an authored final horizontal rule", () => {
	assert.equal(decorateUserPrompt("Prompt\n\n---", "user", true), "Prompt\n\n---");
});

test("finds the last content row before sticky-rule padding", () => {
	assert.equal(lastContentRow([" top padding ", "Prompt text", "   "], 2), 1);
	assert.equal(lastContentRow(["", "   "], 1), -1);
});

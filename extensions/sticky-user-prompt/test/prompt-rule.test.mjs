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

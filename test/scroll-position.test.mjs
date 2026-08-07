import assert from "node:assert/strict";
import test from "node:test";
import { effectiveScrollTop } from "../extensions/sticky-user-prompt/scroll-position.js";

test("tail-following removes the sticky header's prior layout displacement", () => {
	assert.equal(effectiveScrollTop(20, true, 4), 16);
});

test("manual scroll positions are not compensated", () => {
	assert.equal(effectiveScrollTop(20, false, 4), 20);
});

test("compensation cannot produce a negative document position", () => {
	assert.equal(effectiveScrollTop(2, true, 4), 0);
});

test("prompt ownership remains stable across repeated tail-following frames", () => {
	const nextPromptStart = 20;
	let previousHeaderHeight = 0;
	let rawScrollTop = 16;
	const owners = [];
	const heights = [];

	for (let frame = 0; frame < 6; frame += 1) {
		const scrollTop = effectiveScrollTop(rawScrollTop, true, previousHeaderHeight);
		const ownsPreviousPrompt = scrollTop < nextPromptStart;
		const height = ownsPreviousPrompt ? Math.min(4, nextPromptStart - scrollTop) : 0;
		owners.push(ownsPreviousPrompt ? "previous" : "next");
		heights.push(height);
		previousHeaderHeight = height;
		rawScrollTop = 16 + height;
	}

	assert.deepEqual(owners, ["previous", "previous", "previous", "previous", "previous", "previous"]);
	assert.deepEqual(heights, [4, 4, 4, 4, 4, 4]);
});

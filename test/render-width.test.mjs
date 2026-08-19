import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { fitLines } from "../extensions/sticky-user-prompt/width.js";

test("constrains ANSI-styled wide-Unicode sticky-header lines to the render width", () => {
	const width = 143;
	const style = "\x1b[48;5;236m\x1b[38;5;231m";
	const styledWideLine = `${style}✅ ${"x".repeat(142)}\x1b[0m`;
	const inBoundsLine = "Sticky prompt stays pinned";

	assert.ok(visibleWidth(styledWideLine) > width);

	const lines = fitLines([styledWideLine, inBoundsLine], width);

	assert.ok(lines.every((line) => visibleWidth(line) <= width));
	assert.strictEqual(lines[0], `${style}✅ ${"x".repeat(140)}\x1b[0m`);
	assert.strictEqual(lines[1], inBoundsLine);
});

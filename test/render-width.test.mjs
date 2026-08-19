import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { fitLines } from "../extensions/sticky-user-prompt/width.js";

test("constrains ANSI-styled wide-Unicode sticky-header lines to the render width", () => {
	const width = 143;
	const styledWideLine = `\x1b[48;5;236m\x1b[38;5;231m✅ ${"x".repeat(142)}\x1b[0m`;
	const inBoundsLine = "Sticky prompt stays pinned";

	assert.ok(visibleWidth(styledWideLine) > width);

	const lines = fitLines([styledWideLine, inBoundsLine], width);

	assert.ok(lines.every((line) => visibleWidth(line) <= width));
	assert.match(lines[0], /\x1b\[/);
	assert.strictEqual(lines[1], inBoundsLine);
});

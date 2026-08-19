import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const fitLines = (lines, width) =>
	lines.map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width) : line));

const HORIZONTAL_RULE = "\n\n---";

export function decorateUserPrompt(markdown, messageType, ruleEnabled) {
	if (messageType !== "user" || !ruleEnabled || markdown.endsWith(HORIZONTAL_RULE)) return markdown;
	return `${markdown}${HORIZONTAL_RULE}`;
}

export function lastContentRow(lines, end, toPlain = (line) => line) {
	for (let index = end; index >= 0; index -= 1) {
		if (toPlain(lines[index]).trim()) return index;
	}
	return -1;
}

export function hasContentAfter(lines, start, toPlain = (line) => line) {
	return lines.slice(start).some((line) => toPlain(line).trim());
}

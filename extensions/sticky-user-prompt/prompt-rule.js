const HORIZONTAL_RULE = "\n\n---";

export function decorateUserPrompt(markdown, messageType, ruleEnabled) {
	if (messageType !== "user" || !ruleEnabled || markdown.endsWith(HORIZONTAL_RULE)) return markdown;
	return `${markdown}${HORIZONTAL_RULE}`;
}

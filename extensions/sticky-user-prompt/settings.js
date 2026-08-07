const REQUIRED_TUI_MODE = "fullscreen";

const fullscreenSettingsMessage =
	'sticky-user-prompt requires persistent { "tuiMode": "fullscreen" } in ~/.pi/agent/settings.json or the project .pi/settings.json. The --tui-mode fullscreen CLI override alone is not supported.';

export function assertFullscreenTui(settingsManager) {
	if (settingsManager?.getTuiMode?.() !== REQUIRED_TUI_MODE) {
		throw new Error(fullscreenSettingsMessage);
	}
}

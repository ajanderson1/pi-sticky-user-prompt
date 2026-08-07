import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { assertFullscreenTui } from "../extensions/sticky-user-prompt/settings.js";

const settings = (mode) => ({
	getTuiMode: () => mode,
});

test("allows the fullscreen TUI mode", () => {
	assert.doesNotThrow(() => assertFullscreenTui(settings("fullscreen")));
});

test("rejects missing and regular TUI modes", () => {
	for (const mode of [undefined, "regular"]) {
		assert.throws(
			() => assertFullscreenTui(settings(mode)),
			(error) =>
				error instanceof Error &&
				/requires.*fullscreen/i.test(error.message) &&
				/\{.*tuiMode.*fullscreen.*\}/i.test(error.message) &&
				/\.pi\/agent\/settings\.json/.test(error.message) &&
				/\.pi\/settings\.json/.test(error.message) &&
				/--tui-mode fullscreen/.test(error.message),
		);
	}
});

test("uses project settings as the effective override", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "sticky-settings-"));
	const agentDir = path.join(root, "agent");
	await mkdir(agentDir, { recursive: true });
	await writeFile(path.join(agentDir, "settings.json"), '{"tuiMode":"fullscreen"}\n');

	assert.equal(SettingsManager.create(root, agentDir).getTuiMode(), "fullscreen");

	const projectDir = path.join(root, ".pi");
	await mkdir(projectDir);
	await writeFile(path.join(projectDir, "settings.json"), '{"tuiMode":"regular"}\n');
	assert.equal(SettingsManager.create(root, agentDir).getTuiMode(), "regular");
});

test("the factory loads with a persistent fullscreen setting", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "sticky-extension-fullscreen-"));
	const agentDir = path.join(root, "agent");
	await mkdir(agentDir, { recursive: true });
	await writeFile(path.join(agentDir, "settings.json"), '{"tuiMode":"fullscreen"}\n');
	const originalCwd = process.cwd();
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.chdir(root);
	process.env.PI_CODING_AGENT_DIR = agentDir;

	try {
		const { default: stickyUserPrompt } = await import("../extensions/sticky-user-prompt/index.ts");
		const calls = [];
		const api = {
			on: () => calls.push("on"),
			registerCommand: () => calls.push("command"),
		};

		assert.doesNotThrow(() => stickyUserPrompt(api));
		assert.ok(calls.includes("on"));
		assert.ok(calls.includes("command"));
	} finally {
		process.chdir(originalCwd);
		if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	}
});

test("the factory refuses before registering anything", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "sticky-extension-"));
	const agentDir = path.join(root, "agent");
	await mkdir(agentDir, { recursive: true });
	const originalCwd = process.cwd();
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.chdir(root);
	process.env.PI_CODING_AGENT_DIR = agentDir;

	try {
		const { default: stickyUserPrompt } = await import("../extensions/sticky-user-prompt/index.ts");
		const calls = [];
		const api = {
			on: () => calls.push("on"),
			registerCommand: () => calls.push("command"),
		};

		assert.throws(() => stickyUserPrompt(api), /requires.*fullscreen/i);
		assert.deepEqual(calls, []);
	} finally {
		process.chdir(originalCwd);
		if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	}
});

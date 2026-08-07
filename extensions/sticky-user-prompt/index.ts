/**
 * sticky-user-prompt — pins the user message whose section you are reading to the
 * TOP of the viewport, CSS `position: sticky` style.
 *
 * The transcript is treated as sections: each user message opens a section that
 * runs until the next user message. The header always shows the prompt for the
 * section occupying the top of the viewport, so scrolling up walks the header
 * backwards through your prompt history (turn N, N-1, N-2 ...) and scrolling
 * down walks it forward again. Above the first prompt it shows nothing, and a
 * message that is still visible on screen is never duplicated.
 *
 * Fullscreen (alt-screen) TUI  -> true top-of-viewport sticky header.
 * Persistent fullscreen settings are required; regular-mode TUI is unsupported.
 *
 * Internal couplings (each guarded to avoid crashing on Pi shape changes):
 *   1. TuiAltScreen.prototype.setLayoutRoot  - to own the top row
 *   2. ScrollView.child                      - to reach the transcript document
 *   3. UserMessageComponent (name + .text)   - to locate section boundaries
 *
 * Author: AJ Anderson. MIT.
 */

import fs from "node:fs";
import { getAgentDir, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TuiAltScreen, VStack, isViewportTUI, sliceByColumn, stripTerminalSequences } from "@earendil-works/pi-tui";
import { assertFullscreenTui } from "./settings.js";

type Any = any;

interface Anchor {
	/** First document line of this user message. */
	start: number;
	/** First document line after this user message. */
	end: number;
	text: string;
	/** The live UserMessageComponent, re-rendered so the pin looks identical inline. */
	component: Any;
}

/** OSC 133 shell-integration zone markers that UserMessageComponent injects. */
const OSC133 = /\x1b\]133;[A-C](?:\x07|\x1b\\)/g;

const WIDGET_KEY = "sticky-user-prompt";
const STICKY_MARK = "__stickyUserPrompt";
const WRAPPER_PROP = "__stickyUserPromptWrapper";
/** Minimum gap between document walks, so streaming frames cannot thrash. */
const MEASURE_THROTTLE_MS = 80;

const config = {
	enabled: true,
	/** Draw a dim rule under the sticky line. */
	rule: true,
	/** Max prompt characters retained before ellipsis. */
	maxChars: 400,
	/** Max rows of the pinned message block (excluding the rule). */
	maxBlockLines: 4,
};

export default function stickyUserPrompt(pi: ExtensionAPI) {
	assertFullscreenTui(SettingsManager.create(process.cwd(), getAgentDir()));

	let anchors: Anchor[] = [];
	let measureKey = "";
	let measuredAt = 0;
	/** Debug: total lines our walk counted, and a per-component breakdown. */
	let lastHeight = 0;
	let lastScrollTop = -1;
	let nudgeBudget = 2;
	let lastTotal = 0;
	let lastBreakdown: Array<{ name: string; height: number; depth: number }> = [];
	/** Latest prompt from events - drives the guarded empty-anchor fallback. */
	let latestPrompt: string | null = null;
	let theme: Any = null;
	let tuiRef: Any = null;

	const plain = (text: string): string =>
		text
			.replace(/\s*\n+\s*/g, " ⏎ ")
			.replace(/\s{2,}/g, " ")
			.trim()
			.slice(0, config.maxChars);

	const scrollView = (): Any => {
		try {
			return tuiRef?.getPrimaryScrollView?.() ?? null;
		} catch {
			return null;
		}
	};

	// --- document measurement -------------------------------------------------

	const isUserMessage = (component: Any): boolean => {
		if (!component) return false;
		if (component.constructor?.name === "UserMessageComponent") return true;
		// Duck-type fallback if the class is ever renamed.
		return typeof component.text === "string" && typeof component.rebuild === "function" && "markdownTheme" in component;
	};

	/** Plain containers concatenate their children, so recursion is exact. */
	const isPlainContainer = (component: Any): boolean =>
		component?.constructor?.name === "Container" && Array.isArray(component.children);

	/**
	 * Walk the transcript and record one anchor per user message.
	 * Leaf renders are cache hits (Text/Markdown cache per text+width), and the
	 * ScrollView already renders the whole document each frame, so this is a
	 * second pass over work pi has done anyway.
	 */
	const measure = (width: number): void => {
		const sv = scrollView();
		const doc = sv?.child;
		if (!sv || !doc) return;

		const contentWidth = typeof sv.getContentWidth === "function" ? sv.getContentWidth(width) : width;
		const key = `${contentWidth}:${sv.contentHeight ?? 0}`;
		if (key === measureKey) return;

		const now = Date.now();
		if (now - measuredAt < MEASURE_THROTTLE_MS) return;
		measureKey = key;
		measuredAt = now;

		const found: Anchor[] = [];
		const breakdown: Array<{ name: string; height: number; depth: number }> = [];
		let offset = 0;
		const visit = (component: Any, depth: number): void => {
			if (!component) return;
			if (isUserMessage(component)) {
				const height = component.render(contentWidth).length;
				found.push({ start: offset, end: offset + height, text: plain(component.text ?? ""), component });
				breakdown.push({ name: "UserMessageComponent", height, depth });
				offset += height;
				return;
			}
			if (isPlainContainer(component)) {
				for (const child of component.children) visit(child, depth + 1);
				return;
			}
			const height = component.render(contentWidth).length;
			breakdown.push({ name: component?.constructor?.name ?? "?", height, depth });
			offset += height;
		};

		try {
			visit(doc, 0);
			anchors = found;
			lastTotal = offset;
			lastBreakdown = breakdown;
		} catch {
			// Leave the previous anchors in place rather than going blank.
			measureKey = "";
		}
	};

	/**
	 * Section owning the viewport top: the last message whose FIRST line has
	 * reached or passed the top edge. Using `start` (not `end`) is what lets the
	 * message pin progressively as it scrolls up, instead of vanishing and
	 * popping back as a header.
	 */
	const pinned = (scrollTop: number): Anchor | null => {
		let lo = 0;
		let hi = anchors.length - 1;
		let hit: Anchor | null = null;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (anchors[mid].start <= scrollTop) {
				hit = anchors[mid];
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		return hit;
	};

	// --- debug trace ----------------------------------------------------------

	let traceState = "";
	const trace = (scrollTop: number, hit: Anchor | null): void => {
		try {
			if (!fs.existsSync("/tmp/sticky-trace-on")) return;
			const state = `${scrollTop}|${hit ? hit.start : "none"}|${anchors.length}`;
			if (state === traceState) return;
			traceState = state;
			const list = anchors.map((a) => `${a.start}-${a.end}`).join(",");
			const consumed = hit ? scrollTop - hit.start : 0;
			const chosen = hit ? `${hit.start}-${hit.end} consumed=${consumed} rows=${lastHeight} ${hit.text.slice(0, 20)}` : "NONE";
			fs.appendFileSync("/tmp/sticky-trace.log", `scrollTop=${scrollTop} anchors=[${list}] pinned=${chosen}\n`);
		} catch {
			/* tracing must never break rendering */
		}
	};

	// --- rendering ------------------------------------------------------------

	/**
	 * The rule is the block's own bottom edge, so it must sit ON the message
	 * background. theme.fg resets only the foreground (\x1b[39m) and theme.bg only
	 * the background (\x1b[49m), so nesting keeps the shading across the row.
	 */
	const ruleLine = (width: number, shaded: boolean): string => {
		const line = "─".repeat(width);
		try {
			if (shaded && typeof theme?.bg === "function" && typeof theme?.fg === "function") {
				return theme.bg("userMessageBg", theme.fg("dim", line));
			}
			return theme?.fg ? theme.fg("dim", line) : line;
		} catch {
			return line;
		}
	};

	/**
	 * Splice "…" in just after the row's last visible character, keeping the
	 * message background intact on both sides. sliceByColumn carries the active
	 * SGR codes into each slice, so the shading survives the cut.
	 */
	const appendEllipsis = (line: string, width: number): string => {
		try {
			const plain = stripTerminalSequences(line);
			let col = plain.replace(/\s+$/, "").length;
			if (col > width - 2) col = width - 2;
			if (col < 0) return line;
			const head = sliceByColumn(line, 0, col);
			const tail = sliceByColumn(line, col + 1, Math.max(0, width - col - 1));
			const dots = theme?.fg ? theme.fg("dim", "…") : "…";
			return `${head}${dots}${tail}`;
		} catch {
			return line;
		}
	};

	const withRule = (lines: string[], width: number, rule: boolean, shaded = true): string[] => {
		if (!rule || lines.length === 0) return lines;
		return [...lines, ruleLine(width, shaded)];
	};

	/**
	 * Render the pinned message by re-rendering the real UserMessageComponent, so
	 * the sticky block is pixel-identical to the inline block - same background,
	 * same padding, same text colour - just capped in height and ruled off.
	 */
	/**
	 * Render exactly the rows of the message that have scrolled off the top.
	 *
	 * The pinned height always equals the number of document lines consumed, so
	 * the rows above the scroll area and the rows still inside it stay one
	 * contiguous run: the message appears to slide up and STOP at the top edge,
	 * with no duplicate, no gap, and no jump. `consumed` rows pinned + the rest
	 * still scrolling = the whole message, always.
	 */
	const block = (width: number, anchor: Anchor, rows: number, fromBottom: boolean): string[] => {
		if (width < 8 || rows <= 0) return [];
		let lines: string[] = [];
		try {
			lines = anchor.component.render(width).map((line: string) => line.replace(OSC133, ""));
		} catch {
			lines = [];
		}
		if (lines.length === 0) return fallbackBlock(width, anchor.text);

		const height = Math.min(lines.length, config.maxBlockLines);
		const shown = Math.min(rows, height);
		// Growing: show the rows that have scrolled off (top-down).
		// Being pushed out by the next message: show the rows still on screen
		// (bottom-up), so the block slides up under the top edge like CSS sticky.
		const out = fromBottom ? lines.slice(height - shown, height) : lines.slice(0, shown);
		// Fully pinned: swap the closing padding row for the rule so the block keeps
		// its height and the content underneath never shifts.
		const ruled = shown === height && !fromBottom && config.rule && out.length > 1;
		if (ruled) out[out.length - 1] = ruleLine(width, true);

		// The message is taller than the cap: mark the cut on the last message row
		// actually shown (the rule row, when present, is not part of the message).
		if (shown === height && lines.length > height) {
			const last = out.length - (ruled ? 2 : 1);
			if (last >= 0) out[last] = appendEllipsis(out[last], width);
		}
		return out;
	};

	/** Height of a fully pinned block, for the trace and for convergence checks. */
	const blockHeight = (width: number, anchor: Anchor): number => {
		try {
			return Math.min(anchor.component.render(width).length, config.maxBlockLines);
		} catch {
			return 0;
		}
	};

	/** Used only when the fullscreen transcript shape temporarily yields no component. */
	const fallbackBlock = (width: number, text: string, rule = config.rule): string[] => {
		if (!text || width < 8) return [];
		const body = text.length > width - 2 ? `${text.slice(0, Math.max(1, width - 3))}…` : text;
		const padded = ` ${body}`.padEnd(width, " ");
		if (typeof theme?.bg === "function" && typeof theme?.fg === "function") {
			const blank = theme.bg("userMessageBg", " ".repeat(width));
			const line = theme.bg("userMessageBg", theme.fg("userMessageText", padded));
			return withRule([blank, line, blank], width, rule);
		}
		return withRule([padded], width, rule);
	};

	/** Top sticky header: first row of the fullscreen layout root. */
	const header = {
		render(width: number): string[] {
			if (!config.enabled) return [];
			const sv = scrollView();
			if (!sv) return [];

			measure(width);
			const scrollTop: number = sv.scrollTop ?? 0;

			const hit = pinned(scrollTop);
			trace(scrollTop, hit);
			if (hit) {
				const height = blockHeight(width, hit);
				const grown = Math.min(scrollTop - hit.start, height);
				// Distance to the next message; once it is closer than our own height
				// it pushes us off row by row, so the handover costs zero jump.
				const nextIndex = anchors.indexOf(hit) + 1;
				const gap = nextIndex < anchors.length ? anchors[nextIndex].start - scrollTop : Number.MAX_SAFE_INTEGER;
				const rows = Math.max(0, Math.min(grown, gap, height));
				const lines = block(width, hit, rows, gap < height);
				// While following the tail, our own height feeds back into scrollTop.
				// Nudge one more frame so it settles immediately instead of on the
				// next unrelated render.
				if (scrollTop !== lastScrollTop) {
					lastScrollTop = scrollTop;
					nudgeBudget = 2; // fresh scroll position: allow it to settle again
				}
				if (lines.length !== lastHeight) {
					lastHeight = lines.length;
					// At the tail our height feeds back into scrollTop. Converge in at
					// most two extra frames; a bounded budget cannot spin.
					if (sv.isFollowingEnd && nudgeBudget > 0) {
						nudgeBudget -= 1;
						queueMicrotask(() => tuiRef?.requestRender?.());
					}
				}
				if (lines.length > 0) return lines;
			}

			// Degraded path: measurement found nothing (internal shape changed),
			// but we still know the live prompt from events.
			if (anchors.length === 0 && latestPrompt && scrollTop > 0) return fallbackBlock(width, latestPrompt);
			return [];
		},
		invalidate() {},
	};

	/** Empty widget used to receive the live TUI reference; the header owns rendering. */
	const widget = {
		render(_width: number): string[] {
			return [];
		},
		invalidate() {},
	};

	// --- layout-root wrapping -------------------------------------------------
	//
	// The `tui` handed to widget factories is a Proxy forwarding to the live
	// renderer, so per-instance method patching self-recurses. Patch the
	// TuiAltScreen prototype once instead and stash the wrapper on the instance.

	const patchPrototype = (): boolean => {
		try {
			const proto: Any = (TuiAltScreen as Any)?.prototype;
			if (!proto?.setLayoutRoot) return false;
			if (proto.setLayoutRoot[STICKY_MARK]) return true;
			const original = proto.setLayoutRoot;
			const patched = function (this: Any, component?: Any) {
				if (!component) {
					this[WRAPPER_PROP] = undefined;
					return original.call(this, undefined);
				}
				if (component === this[WRAPPER_PROP]) return original.call(this, component);
				const wrapper = new VStack([
					{ component: header as Any, basis: "auto", grow: 0, shrink: 0 },
					{ component, basis: 0, grow: 1, shrink: 1, minSize: 1 },
				]);
				this[WRAPPER_PROP] = wrapper;
				return original.call(this, wrapper);
			};
			(patched as Any)[STICKY_MARK] = true;
			proto.setLayoutRoot = patched;
			return true;
		} catch {
			return false;
		}
	};

	const prototypePatched = patchPrototype();

	const attach = (tui: Any) => {
		tuiRef = tui;
		if (!tui || !isViewportTUI(tui) || !prototypePatched) return;
		const current = tui.layoutRoot;
		if (current && current !== tui[WRAPPER_PROP]) tui.setLayoutRoot(current);
	};

	// --- wiring ---------------------------------------------------------------

	const mount = (ctx: Any) => {
		if (!ctx.hasUI) return;
		theme = ctx.ui.theme;
		ctx.ui.setWidget(WIDGET_KEY, (tui: Any, activeTheme: Any) => {
			theme = activeTheme ?? theme;
			attach(tui);
			return widget;
		});
	};

	const remember = (text: string | undefined | null) => {
		const cleaned = plain(text ?? "");
		if (!cleaned) return;
		latestPrompt = cleaned;
		measureKey = ""; // force a fresh walk on the next frame
		tuiRef?.requestRender?.();
	};

	pi.on("session_start", async (_event, ctx) => mount(ctx));

	pi.on("input", async (event: Any, ctx: Any) => {
		if (event.source === "interactive") {
			remember(event.text);
			mount(ctx);
		}
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event: Any) => {
		if (!latestPrompt) remember(event.prompt);
		return undefined;
	});

	const VERBS: Array<{ value: string; label: string; description: string }> = [
		{ value: "on", label: "on", description: "Enable the sticky prompt header" },
		{ value: "off", label: "off", description: "Disable it (transcript renders untouched)" },
		{ value: "toggle", label: "toggle", description: "Flip enabled/disabled" },
		{ value: "rule", label: "rule", description: "Toggle the shaded underline on the pinned block" },
		{ value: "rows", label: "rows <n>", description: "Max rows a pinned block may occupy (now: N)" },
		{ value: "status", label: "status", description: "Diagnostics: mode, anchors, scroll position" },
		{ value: "dump", label: "dump", description: "Write the anchor table to /tmp/sticky-dump.json" },
		{ value: "help", label: "help", description: "What this extension does and how it behaves" },
	];

	const helpLines = (): string[] => [
		"sticky-user-prompt - the user message whose section you are reading stays pinned to the top.",
		"",
		"  Scroll down  the message slides up, stops at the top edge, and stays.",
		"  Scroll up    it hands back to the previous turn, then the one before that.",
		"  At the top   nothing is pinned above your first prompt.",
		"",
		"  Requires persistent { \"tuiMode\": \"fullscreen\" } in settings.json.",
		"  The --tui-mode fullscreen CLI override alone is not supported.",
		"",
		...VERBS.map((v) => `  /sticky ${v.label.padEnd(10)} ${v.description.replace("now: N", `now: ${config.maxBlockLines}`)}`),
	];

	/**
	 * notify() is a single transient status line - looping it just overwrites
	 * itself, so multi-line help needs its own focused panel.
	 */
	const showHelp = async (ctx: Any): Promise<void> => {
		const lines = helpLines();
		if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
			ctx.ui.notify(lines.filter(Boolean).join(" | "), "info");
			return;
		}
		await ctx.ui.custom((_tui: Any, activeTheme: Any, _keys: Any, done: Any) => ({
			render(width: number): string[] {
				const body = lines.map((line) => (line.length > width ? line.slice(0, Math.max(1, width - 1)) : line));
				const hint = "  press any key to dismiss";
				return [
					...body.map((line, index) =>
						index === 0 && activeTheme?.fg ? activeTheme.fg("accent", line) : activeTheme?.fg ? activeTheme.fg("muted", line) : line,
					),
					"",
					activeTheme?.fg ? activeTheme.fg("dim", hint) : hint,
				];
			},
			handleInput(): void {
				done(null);
			},
			invalidate(): void {},
		}));
	};

	pi.registerCommand("sticky", {
		description: "Sticky user-prompt header - run bare for the options menu, or /sticky help",
		getArgumentCompletions: (prefix: string) => {
			const items = VERBS.map((v) => ({
				value: v.value,
				label: v.label,
				description: v.description.replace("now: N", `now: ${config.maxBlockLines}`),
			})).filter((item) => item.value.startsWith(prefix));
			return items.length > 0 ? items : null;
		},
		handler: async (args: string, ctx: Any) => {
			const raw = (args ?? "").trim();
			const [verb, ...rest] = raw.split(/\s+/);
			let arg = verb ?? "";

			// Bare /sticky opens the native selector: a reminder you can act on.
			if (!arg && ctx.hasUI) {
				const state = (on: boolean) => (on ? "on" : "off");
				const menu = [
					`${config.enabled ? "Disable" : "Enable"} sticky header  (currently ${state(config.enabled)})`,
					`${config.rule ? "Hide" : "Show"} the underline rule  (currently ${state(config.rule)})`,
					`Max pinned rows: ${config.maxBlockLines}  (cycle 3 / 4 / 6 / 8)`,
					"Diagnostics (status)",
					"Write anchor dump to /tmp/sticky-dump.json",
					"Help - what this does",
				];
				const choice = await ctx.ui.select("Sticky prompt header", menu);
				if (!choice) return;
				const index = menu.indexOf(choice);
				arg = ["toggle", "rule", "rows", "status", "dump", "help"][index] ?? "help";
				if (arg === "rows") {
					const cycle = [3, 4, 6, 8];
					config.maxBlockLines = cycle[(cycle.indexOf(config.maxBlockLines) + 1) % cycle.length];
					measureKey = "";
					tuiRef?.requestRender?.();
					ctx.ui.notify(`sticky: max pinned rows = ${config.maxBlockLines}`, "info");
					return;
				}
			}

			if (arg === "help") {
				await showHelp(ctx);
				return;
			}
			if (arg === "on" || arg === "off") {
				config.enabled = arg === "on";
				tuiRef?.requestRender?.();
				ctx.ui.notify(`sticky-user-prompt: ${config.enabled ? "enabled" : "disabled"}`, "info");
				return;
			}
			if (arg === "rows") {
				const next = Number.parseInt(rest[0] ?? "", 10);
				if (Number.isFinite(next) && next >= 1 && next <= 20) config.maxBlockLines = next;
				measureKey = "";
				tuiRef?.requestRender?.();
				ctx.ui.notify(`sticky: max pinned rows = ${config.maxBlockLines}`, "info");
				return;
			}
			if (arg === "status") {
				const sv = scrollView();
				const scrollTop: number = sv?.scrollTop ?? 0;
				const hit = pinned(scrollTop);
				ctx.ui.notify(
					[
						`enabled=${config.enabled}`,
						`mode=${tuiRef && isViewportTUI(tuiRef) ? "fullscreen (top sticky)" : "fullscreen (not attached)"}`,
						`patched=${prototypePatched}`,
						`anchors=${anchors.length}`,
						`scrollTop=${scrollTop} content=${sv?.contentHeight ?? "-"}`,
						`pinned=${hit ? `${hit.start}-${hit.end} "${hit.text.slice(0, 40)}"` : "none"}`,
					].join("  "),
					"info",
				);
				return;
			}
			if (arg === "dump") {
				const sv = scrollView();
				const fs = await import("node:fs");
				const payload = {
					walkTotal: lastTotal,
					contentHeight: sv?.contentHeight ?? null,
					scrollTop: sv?.scrollTop ?? null,
					viewportHeight: sv?.viewportHeight ?? null,
					anchors,
					breakdown: lastBreakdown,
				};
				fs.writeFileSync("/tmp/sticky-dump.json", JSON.stringify(payload, null, 2));
				ctx.ui.notify(`sticky: dumped walk=${lastTotal} content=${sv?.contentHeight ?? "-"} to /tmp/sticky-dump.json`, "info");
				return;
			}
			if (arg === "rule") config.rule = !config.rule;
			else if (arg === "toggle" || arg === "") config.enabled = !config.enabled;
			else {
				// Unknown verb: remind rather than silently toggling something.
				await showHelp(ctx);
				return;
			}
			measureKey = "";
			tuiRef?.requestRender?.();
			ctx.ui.notify(`sticky-user-prompt: enabled=${config.enabled} rule=${config.rule}`, "info");
		},
	});
}

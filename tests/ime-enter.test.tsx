import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Root } from "react-dom/client";
import { parseHTML } from "linkedom";

// The IME regression: the Enter that CONFIRMS a Japanese conversion arrives
// as keydown key="Enter" (Chromium: isComposing=true; Safari: keyCode 229)
// and must never send. Real React handlers, isolated DOM, as in
// setup-dialog-interaction.
const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window,
	document: dom.document,
	Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement,
	HTMLInputElement: dom.window.HTMLInputElement,
	HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});
// react-dom decides at load time whether "input" events exist; without this
// (and the DOM globals above) it falls back to an IE polyfill that needs
// attachEvent. Hence the dynamic imports.
(dom.document as unknown as Record<string, unknown>).oninput = null;
const { createRoot } = await import("react-dom/client");
const { Composer } = await import("../components/composer.tsx");

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sent = 0;

async function mount() {
	sent = 0;
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => {
		root!.render(<Composer busy={false} value="にほんご" onChange={() => {}} onSend={() => { sent++; }} onStop={() => {}} canSend />);
	});
}

async function enter(init: Record<string, unknown> = {}) {
	const textarea = document.querySelector<HTMLElement>('[data-testid="composer"] textarea');
	assert.ok(textarea);
	await act(async () => {
		const key = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(key, { key: "Enter", keyCode: 13, ...init });
		textarea.dispatchEvent(key);
	});
}

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

describe("IME conversion Enter never sends", () => {
	it("Enter confirming a conversion (isComposing) does not send", async () => {
		await mount();
		await enter({ isComposing: true, keyCode: 229 });
		assert.equal(sent, 0);
	});

	it("Safari's post-compositionend confirm Enter (keyCode 229) does not send", async () => {
		await mount();
		await enter({ keyCode: 229 });
		assert.equal(sent, 0);
	});

	it("a plain Enter after the conversion still sends", async () => {
		await mount();
		await enter();
		assert.equal(sent, 1);
	});
});

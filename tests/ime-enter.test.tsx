import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import type { SideThreadState } from "../components/use-side-thread.ts";

// The IME regression: the Enter that CONFIRMS a Japanese conversion arrives
// as keydown key="Enter" (Chromium: isComposing=true; Safari: keyCode 229)
// and must never send/commit. Real React handlers, isolated DOM.
const dom = parseHTML("<!doctype html><html><body></body></html>");
dom.window.HTMLInputElement.prototype.select = () => {};
Object.assign(globalThis, {
	window: dom.window,
	document: dom.document,
	Node: dom.window.Node,
	Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement,
	HTMLInputElement: dom.window.HTMLInputElement,
	HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
	Event: dom.window.Event,
	CustomEvent: dom.window.CustomEvent,
	IS_REACT_ACT_ENVIRONMENT: true,
});
// react-dom decides at load time whether "input" events exist; without this
// (and the DOM globals above) it falls back to an IE polyfill that needs
// attachEvent. Hence the dynamic imports.
(dom.document as unknown as Record<string, unknown>).oninput = null;
const { createRoot } = await import("react-dom/client");
const { Composer } = await import("../components/composer.tsx");
const { EditableSourceName } = await import("../components/source-folder-tree.tsx");
const { SideThreadBody } = await import("../components/side-thread.tsx");

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sent = 0;

async function mountComposer() {
	sent = 0;
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => {
		root!.render(<Composer busy={false} value="にほんご" onChange={() => {}} onSend={() => { sent++; }} onStop={() => {}} canSend />);
	});
}

async function mountInputs() {
	sent = 0;
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const sideState: SideThreadState = {
		threadId: "side_1",
		segmentId: "seg_1",
		messages: [],
		answering: false,
		streamText: "",
		mode: "popover",
		anchor: { kind: "composer" },
	};
	await act(async () => {
		root!.render(
			<>
				<EditableSourceName
					name=""
					initiallyEditing
					onSave={async () => { sent++; }}
				/>
				<SideThreadBody
					state={sideState}
					draft="にほんご"
					readDraft={() => "にほんご"}
					onAsk={async () => { sent++; return true; }}
					onStop={() => {}}
					onExpand={() => {}}
					onFloat={() => {}}
					onClose={() => {}}
				/>
			</>,
		);
	});
}

async function dispatchEnter(selector: string, init: Record<string, unknown> = {}) {
	const el = document.querySelector<HTMLElement>(selector);
	assert.ok(el);
	await act(async () => {
		const key = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(key, { key: "Enter", keyCode: 13, ...init });
		el.dispatchEvent(key);
	});
}

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

describe("IME conversion Enter never sends", () => {
	it("Composer: Enter confirming a conversion (isComposing) does not send", async () => {
		await mountComposer();
		await dispatchEnter('[data-testid="composer"] [role="textbox"]', { isComposing: true, keyCode: 229 });
		assert.equal(sent, 0);
	});

	it("Composer: Safari's post-compositionend confirm Enter (keyCode 229) does not send", async () => {
		await mountComposer();
		await dispatchEnter('[data-testid="composer"] [role="textbox"]', { keyCode: 229 });
		assert.equal(sent, 0);
	});

	it("Composer: a plain Enter after the conversion still sends", async () => {
		await mountComposer();
		await dispatchEnter('[data-testid="composer"] [role="textbox"]');
		assert.equal(sent, 1);
	});

	it("input/textarea: IME confirm Enter (isComposing / keyCode 229) does not commit or send", async () => {
		await mountInputs();
		const sourceInput = document.querySelector<HTMLInputElement>('[data-testid="source-name-input"]')!;
		await act(async () => {
			sourceInput.value = "フォルダ";
			sourceInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
		await dispatchEnter('[data-testid="source-name-input"]', { isComposing: true, keyCode: 229 });
		await dispatchEnter('[data-testid="source-name-input"]', { keyCode: 229 });
		await dispatchEnter('[data-testid="side-thread-input"]', { isComposing: true, keyCode: 229 });
		await dispatchEnter('[data-testid="side-thread-input"]', { keyCode: 229 });
		assert.equal(sent, 0);

		await dispatchEnter('[data-testid="side-thread-input"]');
		assert.equal(sent, 1);
	});
});

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PlaygroundProvider } from '../playground/PlaygroundProvider';
import { EditorInfo, PlaygroundSourceKind } from '../playground/PlaygroundSession';
import { PlaygroundSourcesView } from '../playground/PlaygroundSourcesView';

const OPEN_EDITORS: EditorInfo[] = [
	{ id: 'file:///data.json', fileName: 'data.json', language: 'json', isDirty: false },
	{ id: 'file:///template.jsonata', fileName: 'template.jsonata', language: 'jsonata', isDirty: true }
];

/** Stands in for the view VS Code would resolve, so the bar can be driven directly */
function stubWebviewView() {
	const posted: any[] = [];
	let listener: ((message: any) => void) | undefined;

	const view = {
		webview: {
			options: {},
			html: '',
			cspSource: 'vscode-webview://stub',
			postMessage: (message: any) => {
				posted.push(message);
				return Promise.resolve(true);
			},
			onDidReceiveMessage: (handler: (message: any) => void) => {
				listener = handler;
				return { dispose: () => undefined };
			},
			asWebviewUri: (uri: vscode.Uri) => uri
		},
		onDidDispose: () => ({ dispose: () => undefined })
	};

	return {
		view: view as unknown as vscode.WebviewView,
		posted,
		send: (message: any) => listener?.(message)
	};
}

suite('Playground Sources View Test Suite', () => {

	let view: PlaygroundSourcesView;
	let playgroundChanges: vscode.EventEmitter<void>;
	let sourceChanges: vscode.EventEmitter<void>;
	let selected: { kind: PlaygroundSourceKind; editorId: string | null }[];

	setup(() => {
		playgroundChanges = new vscode.EventEmitter<void>();
		sourceChanges = new vscode.EventEmitter<void>();
		selected = [];

		const playground = {
			onDidChangeSources: sourceChanges.event,
			currentState: {
				availableEditors: OPEN_EDITORS,
				selectedJsonInputEditor: 'file:///data.json',
				selectedTemplateEditor: null
			},
			selectSource: (kind: PlaygroundSourceKind, editorId: string | null) => {
				selected.push({ kind, editorId });
			}
		};

		const provider = {
			onDidChangePlayground: playgroundChanges.event,
			getCurrentPlayground: () => playground
		} as unknown as PlaygroundProvider;

		// Left unregistered: the running extension already owns the view id
		view = new PlaygroundSourcesView(provider);
	});

	teardown(() => {
		view.dispose();
		sourceChanges.dispose();
		playgroundChanges.dispose();
	});

	test('renders the two labelled dropdowns the results panel used to carry', () => {
		const stub = stubWebviewView();
		view.resolveWebviewView(stub.view);

		const html = stub.view.webview.html;
		assert.ok(html.includes('JSON Input Source'), html);
		assert.ok(html.includes('JSONata Template Source'), html);
		assert.ok(html.includes('id="jsonInputSelect"'), html);
		assert.ok(html.includes('id="templateSelect"'), html);

		// The entry that points a source back at the playground's own editor
		assert.ok(html.includes('Default (Internal Editor)'), html);
	});

	test('hands the bar the open editors and what each source reads from', () => {
		const stub = stubWebviewView();
		view.resolveWebviewView(stub.view);

		const state = stub.posted.at(-1);
		assert.strictEqual(state.type, 'state');
		assert.deepStrictEqual(state.availableEditors, OPEN_EDITORS);
		assert.strictEqual(state.input, 'file:///data.json');
		assert.strictEqual(state.template, null);
	});

	test('re-publishes when the playground changes what it reads from', () => {
		const stub = stubWebviewView();
		view.resolveWebviewView(stub.view);
		const before = stub.posted.length;

		sourceChanges.fire();

		assert.strictEqual(stub.posted.length, before + 1, 'the bar must be told about the change');
	});

	test('changing a dropdown points that source at the chosen editor', () => {
		const stub = stubWebviewView();
		view.resolveWebviewView(stub.view);

		stub.send({ type: 'selectSource', kind: 'template', editorId: 'file:///template.jsonata' });
		stub.send({ type: 'selectSource', kind: 'input', editorId: null });

		assert.deepStrictEqual(selected, [
			{ kind: 'template', editorId: 'file:///template.jsonata' },
			{ kind: 'input', editorId: null }
		]);
	});

	test('runs only the three commands the bar owns', async () => {
		const stub = stubWebviewView();
		view.resolveWebviewView(stub.view);

		let reached = false;
		const trap = vscode.commands.registerCommand('jsonata-validator.test.trap', () => {
			reached = true;
		});

		try {
			stub.send({ type: 'command', command: 'jsonata-validator.test.trap' });
			await new Promise(resolve => setTimeout(resolve, 100));

			// A webview posts whatever it likes, so the bar's buttons are an
			// allow-list rather than a way into the command palette
			assert.strictEqual(reached, false, 'a command outside the bar must not run');
		} finally {
			trap.dispose();
		}
	});
});

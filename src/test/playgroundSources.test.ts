import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PlaygroundResultDocument } from '../playground/PlaygroundResultDocument';
import { PlaygroundSession } from '../playground/PlaygroundSession';

/** An input that evaluates to something the defaults never produce */
const ALTERNATE_INPUT = '{"example": [{"value": 9}, {"value": 11}]}';
const ALTERNATE_RESULT = '[\n  9,\n  11\n]';

/** Evaluating the playground's own default input and expression */
const DEFAULT_RESULT = '[\n  7,\n  13\n]';

/** Only the workspace state is ever touched, so only it needs standing in for */
function stubContext(): vscode.ExtensionContext {
	const store = new Map<string, unknown>();
	return {
		workspaceState: {
			get: (key: string) => store.get(key),
			update: (key: string, value: unknown) => {
				store.set(key, value);
				return Promise.resolve();
			},
			keys: () => [...store.keys()]
		}
	} as unknown as vscode.ExtensionContext;
}

async function waitFor(check: () => boolean, message: () => string, timeoutMs = 5000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	assert.fail(message());
}

suite('Playground Sources Test Suite', () => {

	let temporaryDirectory: string;
	let result: PlaygroundResultDocument;
	let session: PlaygroundSession;

	// Stand-ins for the playground's own two panels
	let ownInput: vscode.TextDocument;
	let ownExpression: vscode.TextDocument;

	// A file the user already had open, which either source can be pointed at
	let file: vscode.TextDocument;
	let fileId: string;

	setup(async () => {
		temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonata-playground-'));
		const filePath = path.join(temporaryDirectory, 'other-input.json');
		fs.writeFileSync(filePath, ALTERNATE_INPUT, 'utf8');

		ownInput = await vscode.workspace.openTextDocument({
			content: '{"example": [{"value": 4}, {"value": 7}, {"value": 13}]}',
			language: 'json'
		});
		ownExpression = await vscode.workspace.openTextDocument({
			content: 'example[value > 5].value',
			language: 'jsonata'
		});
		file = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
		fileId = file.uri.toString();

		// All three get tabs, so the exclusion below is proved against editors
		// that really are open rather than against documents that are not
		for (const document of [ownInput, ownExpression, file]) {
			await vscode.window.showTextDocument(document, { preview: false });
		}

		result = new PlaygroundResultDocument();
		session = new PlaygroundSession(result, stubContext());
		session.setOwnSourceReaders(() => ownInput, () => ownExpression);
		session.refresh();
	});

	teardown(async () => {
		session.dispose();
		result.dispose();
		await vscode.window.tabGroups.close(vscode.window.tabGroups.all.flatMap(group => group.tabs));
		fs.rmSync(temporaryDirectory, { recursive: true, force: true });
	});

	test('offers the open editors, and leaves the playground own two out of them', () => {
		session.updateAvailableEditors();
		const offered = session.currentState.availableEditors.map(editor => editor.id);

		assert.ok(offered.includes(fileId), 'an open file must be offered as a source');

		// Those two are reachable as "Playground editor", so listing their
		// untitled tabs as well would offer the same editor twice
		assert.ok(!offered.includes(ownInput.uri.toString()), 'the playground input must not be listed');
		assert.ok(!offered.includes(ownExpression.uri.toString()), 'the playground expression must not be listed');
	});

	test('names the playground until a source is pointed at a file', () => {
		assert.deepStrictEqual(session.sourceLabels, { input: 'Playground', template: 'Playground' });

		session.updateAvailableEditors();
		session.selectSource('input', fileId);

		assert.strictEqual(session.sourceLabels.input, 'other-input.json');
		assert.strictEqual(session.sourceLabels.template, 'Playground', 'the expression source is untouched');
	});

	test('evaluates against the file the input source points at', async () => {
		await waitFor(
			() => result.text === DEFAULT_RESULT,
			() => `the defaults never evaluated (last saw ${JSON.stringify(result.text)})`
		);

		session.updateAvailableEditors();
		session.selectSource('input', fileId);

		await waitFor(
			() => result.text === ALTERNATE_RESULT,
			() => `the chosen file was never evaluated (last saw ${JSON.stringify(result.text)})`
		);
	});

	test('evaluates the expression the template source points at', async () => {
		const templatePath = path.join(temporaryDirectory, 'other-template.jsonata');
		fs.writeFileSync(templatePath, '$sum(example.value)', 'utf8');
		const template = await vscode.workspace.openTextDocument(vscode.Uri.file(templatePath));
		await vscode.window.showTextDocument(template, { preview: false });

		session.updateAvailableEditors();
		session.selectSource('template', template.uri.toString());

		// 4 + 7 + 13, over the playground's own input
		await waitFor(
			() => result.text === '24',
			() => `the chosen template was never evaluated (last saw ${JSON.stringify(result.text)})`
		);
	});

	test('falls back to the playground editor when the chosen file is closed', async () => {
		session.updateAvailableEditors();
		session.selectSource('input', fileId);

		await waitFor(
			() => result.text === ALTERNATE_RESULT,
			() => `the chosen file was never evaluated (last saw ${JSON.stringify(result.text)})`
		);

		const tabs = vscode.window.tabGroups.all
			.flatMap(group => group.tabs)
			.filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === fileId);
		await vscode.window.tabGroups.close(tabs);

		// The selection is dropped rather than left pointing at a closed file,
		// and the input comes back from the playground's own editor
		await waitFor(
			() => session.currentState.selectedJsonInputEditor === null && result.text === DEFAULT_RESULT,
			() => `the source never fell back (last saw ${JSON.stringify(result.text)})`
		);
		assert.strictEqual(session.sourceLabels.input, 'Playground');
	});
});

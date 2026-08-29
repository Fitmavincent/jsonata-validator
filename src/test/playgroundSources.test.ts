import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PlaygroundResultDocument, RESULT_SCHEME } from '../playground/PlaygroundResultDocument';
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

	test('offers every open tab, the playground own two included', () => {
		session.updateAvailableEditors();
		const offered = session.currentState.availableEditors.map(editor => editor.id);

		// The list is the open tabs, so anything the user can see open is in it
		assert.ok(offered.includes(fileId), 'an open file must be offered as a source');
		assert.ok(offered.includes(ownInput.uri.toString()), 'the playground input tab must be offered');
		assert.ok(offered.includes(ownExpression.uri.toString()), 'the playground expression tab must be offered');
	});

	test('leaves the playground own output out, so a result cannot feed itself', async () => {
		const output = await vscode.workspace.openTextDocument(
			vscode.Uri.parse(`${RESULT_SCHEME}:/Another Result.json`)
		);
		await vscode.window.showTextDocument(output, { preview: false });

		session.updateAvailableEditors();
		const offered = session.currentState.availableEditors;

		assert.ok(
			offered.every(editor => !editor.id.startsWith(`${RESULT_SCHEME}:`)),
			`the result panel must not be offered as a source: ${JSON.stringify(offered.map(e => e.id))}`
		);
	});

	test('describes each tab by name, language and whether it is unsaved', async () => {
		session.updateAvailableEditors();

		const offered = session.currentState.availableEditors;
		const saved = offered.find(editor => editor.id === fileId);
		assert.ok(saved, 'the open file must be offered');
		assert.strictEqual(saved.fileName, 'other-input.json');
		assert.strictEqual(saved.language, 'json');
		assert.strictEqual(saved.isDirty, false);

		// An untitled document is unsaved from the moment it exists, which is
		// the marker the dropdown shows as a bullet
		const untitled = offered.find(editor => editor.id === ownInput.uri.toString());
		assert.ok(untitled, 'the playground input tab must be offered');
		assert.strictEqual(untitled.language, 'json');
		assert.strictEqual(untitled.isDirty, true);
	});

	test('reads from the playground until a source is pointed at a file', () => {
		assert.strictEqual(session.currentState.selectedJsonInputEditor, null);
		assert.strictEqual(session.currentState.selectedTemplateEditor, null);

		session.updateAvailableEditors();
		session.selectSource('input', fileId);

		assert.strictEqual(session.currentState.selectedJsonInputEditor, fileId);
		assert.strictEqual(
			session.currentState.selectedTemplateEditor,
			null,
			'the expression source is untouched'
		);
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
	});
});

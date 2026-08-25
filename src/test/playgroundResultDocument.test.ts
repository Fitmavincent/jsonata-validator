import * as assert from 'assert';
import * as vscode from 'vscode';
import { PlaygroundResultDocument, RESULT_SCHEME } from '../playground/PlaygroundResultDocument';

/**
 * Opens the result document fresh, so the assertions see the provider's current
 * content rather than a copy VS Code cached from an earlier test.
 */
async function readDocument(result: PlaygroundResultDocument): Promise<vscode.TextDocument> {
	const document = await vscode.workspace.openTextDocument(result.uri);
	return document;
}

suite('Playground Result Document Test Suite', () => {

	let result: PlaygroundResultDocument;

	setup(() => {
		result = new PlaygroundResultDocument();
	});

	teardown(() => {
		result.dispose();
	});

	test('serves the content it was given', async () => {
		result.setContent('{\n  "a": 1\n}');
		const document = await readDocument(result);
		assert.strictEqual(document.getText(), '{\n  "a": 1\n}');
	});

	test('uses the jsonata-result scheme', () => {
		assert.strictEqual(result.uri.scheme, RESULT_SCHEME);
	});

	test('resolves to the JSON language, which is what folding hangs off', async () => {
		const document = await readDocument(result);
		assert.strictEqual(document.languageId, 'json');
	});

	test('falls back to valid JSON when there is nothing to show', () => {
		result.setContent('{"a": 1}');
		result.setContent('   ');

		// Valid JSON either way, so the panel keeps its syntax colours and never
		// picks up a parse squiggle of its own
		assert.strictEqual(result.text, 'null');
		assert.doesNotThrow(() => JSON.parse(result.text));
	});

	test('reports the text that copy-result hands out', () => {
		result.setContent('[1, 2, 3]');
		assert.strictEqual(result.text, '[1, 2, 3]');
	});

	test('rejects edits, so the output cannot be tampered with', async () => {
		result.setContent('{"untouched": true}');
		const document = await readDocument(result);
		const editor = await vscode.window.showTextDocument(document, { preview: false });

		// The edit call itself reports success, so the content is what has to be
		// checked - VS Code drops the change on the way to the document
		await editor.edit(builder => {
			builder.insert(new vscode.Position(0, 0), 'tampered');
		});
		await editor.edit(builder => {
			builder.delete(new vscode.Range(0, 0, 0, 5));
		});

		assert.strictEqual(document.getText(), '{"untouched": true}', 'the output must survive an edit attempt');
		assert.strictEqual(document.isDirty, false, 'a rejected edit must not leave the document dirty');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('typing into the result panel changes nothing', async () => {
		result.setContent('[1, 2, 3]');
		const document = await readDocument(result);
		await vscode.window.showTextDocument(document, { preview: false });

		await vscode.commands.executeCommand('type', { text: 'nope' });

		assert.strictEqual(document.getText(), '[1, 2, 3]');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
});

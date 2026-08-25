import * as assert from 'assert';
import * as vscode from 'vscode';
import { RESULT_SCHEME } from '../playground/PlaygroundResultDocument';

/** Evaluating DEFAULT_JSON_INPUT with DEFAULT_JSONATA_EXPRESSION */
const DEFAULT_RESULT = '[\n  7,\n  13\n]';

function openTabs(): vscode.Tab[] {
	return vscode.window.tabGroups.all.flatMap(group => group.tabs);
}

function resultTab(): vscode.Tab | undefined {
	return openTabs().find(tab =>
		tab.input instanceof vscode.TabInputText &&
		tab.input.uri.scheme === RESULT_SCHEME
	);
}

/** Polls until `check` holds, since the playground initializes off the constructor */
async function waitFor(check: () => boolean, message: string, timeoutMs = 8000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	assert.fail(message);
}

suite('Playground Panel Test Suite', () => {

	suiteTeardown(async () => {
		await vscode.window.tabGroups.close(openTabs());
	});

	test('opens the result as a read-only JSON editor holding the evaluated output', async function () {
		this.timeout(30000);

		await vscode.commands.executeCommand('jsonata-validator.openPlayground');
		await waitFor(() => resultTab() !== undefined, 'the playground never opened a result tab');

		const tab = resultTab()!;
		const uri = (tab.input as vscode.TabInputText).uri;
		const document = await vscode.workspace.openTextDocument(uri);

		// The whole point of the change: a real editor, not a rendered webview
		assert.strictEqual(document.languageId, 'json', 'the result must be a JSON document to fold and highlight');

		await waitFor(
			() => document.getText() === DEFAULT_RESULT,
			`the result panel never showed the evaluated defaults (last saw ${JSON.stringify(document.getText())})`
		);

		// ...and one the user cannot edit into something the expression never produced
		const editor = await vscode.window.showTextDocument(document, { preview: false });
		await editor.edit(builder => {
			builder.insert(new vscode.Position(0, 0), 'tampered');
		});
		await vscode.commands.executeCommand('type', { text: 'tampered' });

		assert.strictEqual(document.getText(), DEFAULT_RESULT, 'the result editor must reject edits');
		assert.strictEqual(document.isDirty, false, 'a rejected edit must not leave the document dirty');
	});

	test('lays the three panels out across three editor groups', async () => {
		const groups = vscode.window.tabGroups.all;
		assert.strictEqual(groups.length, 3, 'expected input, expression and result to each have a group');

		const languages = await Promise.all(
			openTabs()
				.filter((tab): tab is vscode.Tab & { input: vscode.TabInputText } => tab.input instanceof vscode.TabInputText)
				.map(async tab => (await vscode.workspace.openTextDocument(tab.input.uri)).languageId)
		);

		assert.ok(languages.includes('jsonata'), 'the expression editor should be open');
		assert.ok(languages.includes('json'), 'the JSON input editor should be open');
	});
});

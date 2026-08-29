import * as assert from 'assert';
import * as vscode from 'vscode';
import { RESULT_SCHEME } from '../playground/PlaygroundResultDocument';

/** Evaluating DEFAULT_JSON_INPUT with DEFAULT_JSONATA_EXPRESSION */
const DEFAULT_RESULT = '[\n  7,\n  13\n]';

/** The arrangement the playground opens with, as PlaygroundPanel lays it out */
const INPUT_COLUMN = vscode.ViewColumn.One;
const RESULT_COLUMN = vscode.ViewColumn.Two;
const EXPRESSION_COLUMN = vscode.ViewColumn.Three;

function openTabs(): vscode.Tab[] {
	return vscode.window.tabGroups.all.flatMap(group => group.tabs);
}

function resultTab(): vscode.Tab | undefined {
	return openTabs().find(tab =>
		tab.input instanceof vscode.TabInputText &&
		tab.input.uri.scheme === RESULT_SCHEME
	);
}

/**
 * The playground's own expression editor. Earlier suites leave untitled JSONata
 * documents behind in `workspace.textDocuments`, so the search runs over the
 * visible editors, which only the playground's own panel is among.
 */
function expressionDocument(): vscode.TextDocument | undefined {
	return vscode.window.visibleTextEditors.find(editor =>
		editor.document.languageId === 'jsonata' && editor.document.isUntitled
	)?.document;
}

/** Replaces a document's whole text without needing its editor to be focused */
async function replaceText(document: vscode.TextDocument, text: string): Promise<void> {
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
	assert.ok(await vscode.workspace.applyEdit(edit), 'the edit was rejected');
}

/** The documents open in one editor group, in tab order */
async function documentsIn(column: vscode.ViewColumn): Promise<vscode.TextDocument[]> {
	const group = vscode.window.tabGroups.all.find(candidate => candidate.viewColumn === column);
	assert.ok(group, `no editor group in column ${column}`);

	return Promise.all(
		group.tabs
			.filter((tab): tab is vscode.Tab & { input: vscode.TabInputText } => tab.input instanceof vscode.TabInputText)
			.map(tab => vscode.workspace.openTextDocument(tab.input.uri))
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

		// ...and one the user cannot edit into something the expression never
		// produced. Shown in its own column so the layout is left as it was.
		const editor = await vscode.window.showTextDocument(document, {
			viewColumn: RESULT_COLUMN,
			preview: false
		});
		await editor.edit(builder => {
			builder.insert(new vscode.Position(0, 0), 'tampered');
		});
		await vscode.commands.executeCommand('type', { text: 'tampered' });

		assert.strictEqual(document.getText(), DEFAULT_RESULT, 'the result editor must reject edits');
		assert.strictEqual(document.isDirty, false, 'a rejected edit must not leave the document dirty');
	});

	test('renders a broken expression as a framed report, not as output', async function () {
		this.timeout(30000);

		const expression = expressionDocument();
		assert.ok(expression, 'the playground should have opened an expression editor');

		await replaceText(expression, 'example[value > 5.value');

		const document = await vscode.workspace.openTextDocument(
			(resultTab()!.input as vscode.TabInputText).uri
		);

		await waitFor(
			() => document.getText().startsWith('compilation error'),
			`the panel never showed a report (last saw ${JSON.stringify(document.getText().slice(0, 80))})`
		);

		const text = document.getText();

		// The offending line is shown and underlined, rather than the reader
		// being sent back to the expression to find it
		assert.ok(text.includes('1 │ example[value > 5.value'), text);
		assert.ok(text.includes('^'), text);
		assert.ok(/expression:\d+:\d+/.test(text), text);

		// A report is not JSON, so the document must not still claim to be
		await waitFor(
			() => document.languageId === 'jsonata-result',
			`the result document stayed as ${document.languageId}`
		);

		// Fixing the expression returns the panel to JSON output
		await replaceText(expression, 'example[value > 5].value');

		await waitFor(
			() => document.getText() === DEFAULT_RESULT && document.languageId === 'json',
			`the panel never returned to JSON output (last saw ${document.languageId}: ${JSON.stringify(document.getText().slice(0, 60))})`
		);
	});

	test('puts the input on the left, with the result above the expression on the right', async () => {
		assert.strictEqual(
			vscode.window.tabGroups.all.length,
			3,
			'expected input, result and expression to each have a group'
		);

		const [input] = await documentsIn(INPUT_COLUMN);
		assert.strictEqual(input.languageId, 'json', 'the JSON input belongs in the left column');

		const [result] = await documentsIn(RESULT_COLUMN);
		assert.strictEqual(result.uri.scheme, RESULT_SCHEME, 'the result belongs in the top-right column');

		const [template] = await documentsIn(EXPRESSION_COLUMN);
		assert.strictEqual(template.languageId, 'jsonata', 'the expression belongs in the bottom-right column');
	});

	test('registers a command for each source, so either can be re-pointed on its own', async () => {
		const commands = await vscode.commands.getCommands(true);

		for (const command of [
			'jsonata-validator.selectPlaygroundSources',
			'jsonata-validator.selectPlaygroundInputSource',
			'jsonata-validator.selectPlaygroundTemplateSource'
		]) {
			assert.ok(commands.includes(command), `${command} is not registered`);
		}
	});

	test('the result scheme still resolves once the playground closes', async function () {
		this.timeout(30000);

		// Closing the result tab closes the playground with it
		await vscode.window.tabGroups.close(resultTab()!);
		await waitFor(() => resultTab() === undefined, 'the result tab never closed');

		// VS Code restores the result tab across a window reload and an
		// extension host restart, both of which outlive the playground that
		// opened it, and it resolves from scratch rather than from anything
		// this session cached - which is what a URI that has never been opened
		// stands in for here. With the provider gone this throws, and the panel
		// comes back as "Unable to resolve resource": a dead pane where the
		// read-only editor was.
		const restored = await vscode.workspace.openTextDocument(
			vscode.Uri.parse(`${RESULT_SCHEME}:/JSONata Result (restored).json`)
		);
		assert.strictEqual(restored.languageId, 'json', 'the restored panel must still be a JSON editor');
	});

	test('a second playground starts from its own output, not the last one', async function () {
		this.timeout(30000);

		await vscode.commands.executeCommand('jsonata-validator.openPlayground');
		await waitFor(() => resultTab() !== undefined, 'the playground never reopened');

		const document = await vscode.workspace.openTextDocument(
			(resultTab()!.input as vscode.TabInputText).uri
		);
		await waitFor(
			() => document.getText() === DEFAULT_RESULT,
			`the reopened panel never evaluated (last saw ${JSON.stringify(document.getText())})`
		);
	});
});

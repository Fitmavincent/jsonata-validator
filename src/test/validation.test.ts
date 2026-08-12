import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * These exercise behaviour that only exists inside a running VS Code instance:
 * the debounced document listener, the cached configuration, and the diagnostics
 * that land in the Problems panel. None of it is reachable from a plain Node
 * test, because it all runs through the `vscode` API.
 */

const SECTION = 'jsonataValidator';

// Each test gets its own file. Untitled documents reuse URIs (`Untitled-1` is
// handed straight back out after it is closed), which lets one test's
// diagnostics surface in the next one.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonata-validator-tests-'));
let fileCounter = 0;

/** Waits until `predicate` holds, or gives up after `timeoutMs` */
async function waitFor(
	predicate: () => boolean,
	timeoutMs = 3000,
	intervalMs = 50
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return true;
		}
		await new Promise(resolve => setTimeout(resolve, intervalMs));
	}
	return predicate();
}

/** Replaces the whole document, the way a user pasting over a selection would */
async function setContent(editor: vscode.TextEditor, text: string): Promise<void> {
	const document = editor.document;
	const fullRange = new vscode.Range(
		document.positionAt(0),
		document.positionAt(document.getText().length)
	);
	await editor.edit(builder => builder.replace(fullRange, text));
}

async function openJsonata(content: string): Promise<vscode.TextEditor> {
	const file = path.join(tempDir, `case-${fileCounter++}.jsonata`);
	fs.writeFileSync(file, content, 'utf8');

	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
	return vscode.window.showTextDocument(document);
}

function jsonataDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
	return vscode.languages
		.getDiagnostics(uri)
		.filter(d => d.source === 'jsonata-validator');
}

suite('Validation behaviour inside VS Code', () => {

	teardown(async () => {
		await vscode.workspace.getConfiguration(SECTION)
			.update('validateOnType', undefined, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration(SECTION)
			.update('warnOnUnsupportedLineComments', undefined, vscode.ConfigurationTarget.Global);
		// Revert first: closing a dirty editor puts up a save prompt and hangs
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	suiteTeardown(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('Rapid edits settle on the final content, not an intermediate one', async () => {
		const editor = await openJsonata('$.valid');

		// Type through a broken intermediate state and land on a valid one. The
		// listener is debounced, so only the last state may produce diagnostics.
		await setContent(editor, '$.products[');
		await setContent(editor, '$.products[price');
		await setContent(editor, '$.products[price > 100]');

		const settled = await waitFor(() => jsonataDiagnostics(editor.document.uri).length === 0);

		assert.ok(
			settled,
			'Expected no diagnostics for the final valid expression, got: ' +
			JSON.stringify(jsonataDiagnostics(editor.document.uri).map(d => d.message))
		);
	});

	test('Rapid edits ending on a broken expression do report it', async () => {
		const editor = await openJsonata('$.valid');

		await setContent(editor, '$.a');
		await setContent(editor, '$.a..');
		await setContent(editor, '$sum(unclosed');

		const reported = await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);

		assert.ok(reported, 'Expected the final broken expression to be reported');
	});

	test('Diagnostics are not duplicated when the same edit is repeated', async () => {
		const editor = await openJsonata('$.valid');

		for (let i = 0; i < 5; i++) {
			await setContent(editor, '$sum(unclosed');
			await setContent(editor, '$sum(unclosed ');
		}

		await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);
		const diagnostics = jsonataDiagnostics(editor.document.uri);

		assert.strictEqual(
			diagnostics.length, 1,
			'One broken expression should produce exactly one diagnostic, got ' + diagnostics.length
		);
	});

	test('validateOnType=false suppresses validation while typing', async () => {
		const editor = await openJsonata('$.valid');

		// Settle any validation triggered by opening the document
		await waitFor(() => jsonataDiagnostics(editor.document.uri).length === 0);

		await vscode.workspace.getConfiguration(SECTION)
			.update('validateOnType', false, vscode.ConfigurationTarget.Global);

		await setContent(editor, '$sum(unclosed');

		// Give the debounce window plus a margin to elapse
		await new Promise(resolve => setTimeout(resolve, 1200));

		assert.deepStrictEqual(
			jsonataDiagnostics(editor.document.uri).map(d => d.message), [],
			'No diagnostics should be produced while validateOnType is disabled'
		);
	});

	test('Re-enabling validateOnType takes effect without a reload', async () => {
		const editor = await openJsonata('$.valid');

		await vscode.workspace.getConfiguration(SECTION)
			.update('validateOnType', false, vscode.ConfigurationTarget.Global);
		await setContent(editor, '$sum(unclosed');
		await new Promise(resolve => setTimeout(resolve, 800));

		// The setting is cached, so this only works if the change is observed
		await vscode.workspace.getConfiguration(SECTION)
			.update('validateOnType', true, vscode.ConfigurationTarget.Global);
		await setContent(editor, '$sum(still unclosed');

		const reported = await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);

		assert.ok(reported, 'Validation should resume once the setting is turned back on');
	});

	test('Diagnostic carries the JSONata error code and a usable range', async () => {
		const editor = await openJsonata('$sum(unclosed');

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);

		const [diagnostic] = jsonataDiagnostics(editor.document.uri);
		assert.ok(diagnostic, 'Expected a diagnostic');
		assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
		assert.ok(diagnostic.code, 'Diagnostic should carry the JSONata error code');
		assert.ok(
			diagnostic.range.end.isAfterOrEqual(diagnostic.range.start),
			'Diagnostic range must not be inverted'
		);
		assert.ok(
			diagnostic.range.start.line < editor.document.lineCount,
			'Diagnostic must point inside the document'
		);
	});

	test('Fixing the expression clears the diagnostic', async () => {
		const editor = await openJsonata('$sum(unclosed');
		const uri = editor.document.uri;

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		const reported = await waitFor(() => jsonataDiagnostics(uri).length > 0);
		assert.ok(reported, 'Expected the broken expression to be reported first');

		await setContent(editor, '$sum([1, 2, 3])');

		const cleared = await waitFor(() => jsonataDiagnostics(uri).length === 0);
		assert.ok(
			cleared,
			'Diagnostics should clear once the expression is valid, still present: ' +
			JSON.stringify(jsonataDiagnostics(uri).map(d => d.message))
		);
	});

	test('Only the broken expression in a multi-expression file is flagged', async () => {
		const editor = await openJsonata([
			'$.firstName',
			'$.address.city',
			'$.invalid..syntax',
			'$.products'
		].join('\n'));

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);

		const diagnostics = jsonataDiagnostics(editor.document.uri);
		assert.strictEqual(diagnostics.length, 1, 'Exactly one expression is broken');
		assert.strictEqual(
			diagnostics[0].range.start.line, 2,
			'The diagnostic should sit on the broken line'
		);
	});

	test('Comments and blank lines do not shift diagnostic positions', async () => {
		const editor = await openJsonata([
			'/* leading comment */',
			'',
			'$.firstName',
			'',
			'/* another comment */',
			'$.invalid..syntax'
		].join('\n'));

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);

		const [diagnostic] = jsonataDiagnostics(editor.document.uri);
		assert.strictEqual(
			diagnostic.range.start.line, 5,
			'The diagnostic should track the real line number, not the expression index'
		);
	});

	test('An unclosed bracket absorbs the lines that follow it', async () => {
		// Characterising existing behaviour: extraction is bracket-driven, so an
		// unbalanced "(" keeps consuming lines until the brackets close or the
		// file ends. The reported position therefore lands after the open line.
		const editor = await openJsonata([
			'$.firstName',
			'$sum(unclosed',
			'$.products'
		].join('\n'));

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);

		const diagnostics = jsonataDiagnostics(editor.document.uri);
		assert.strictEqual(diagnostics.length, 1, 'The absorbed lines form one expression');
		assert.ok(
			diagnostics[0].range.start.line >= 1,
			'The diagnostic belongs to the expression starting at the unclosed bracket'
		);
	});

	// https://github.com/Fitmavincent/jsonata-validator/issues/1
	test('A multi-line block comment is not reported as a syntax error', async () => {
		const editor = await openJsonata([
			'/*',
			' * Everyone still on the books',
			' */',
			'$.users[active = true].name /* one per user */'
		].join('\n'));

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await new Promise(resolve => setTimeout(resolve, 500));

		assert.deepStrictEqual(
			jsonataDiagnostics(editor.document.uri).map(d => d.message), [],
			'Comments should not produce diagnostics'
		);
	});

	test('An expression continued on the next line is not split apart', async () => {
		const editor = await openJsonata('$.products.price\n  ~> $sum()');

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await new Promise(resolve => setTimeout(resolve, 500));

		assert.deepStrictEqual(
			jsonataDiagnostics(editor.document.uri).map(d => d.message), [],
			'A continuation line should not be validated on its own'
		);
	});

	test('A // comment is a warning, and the rest of the file still validates', async () => {
		const editor = await openJsonata('// JSONata has no line comments\n$.invalid..syntax');

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await waitFor(() => jsonataDiagnostics(editor.document.uri).length === 2);

		const diagnostics = jsonataDiagnostics(editor.document.uri);
		const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
		const warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning);

		assert.strictEqual(warnings.length, 1, 'The line comment should be warned about');
		assert.strictEqual(warnings[0].code, 'unsupported-line-comment');
		assert.strictEqual(warnings[0].range.start.line, 0);

		assert.strictEqual(errors.length, 1, 'The broken expression should still be reported');
		assert.strictEqual(errors[0].range.start.line, 1);
	});

	test('warnOnUnsupportedLineComments=false silences the warning', async () => {
		await vscode.workspace.getConfiguration(SECTION)
			.update('warnOnUnsupportedLineComments', false, vscode.ConfigurationTarget.Global);

		const editor = await openJsonata('// JSONata has no line comments\n$.firstName');

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await new Promise(resolve => setTimeout(resolve, 500));

		assert.deepStrictEqual(jsonataDiagnostics(editor.document.uri).map(d => d.message), []);
	});

	test('Turning the warning back on refreshes what is already open', async () => {
		await vscode.workspace.getConfiguration(SECTION)
			.update('warnOnUnsupportedLineComments', false, vscode.ConfigurationTarget.Global);

		const editor = await openJsonata('// JSONata has no line comments\n$.firstName');

		await vscode.commands.executeCommand('jsonata-validator.validateDocument');
		await new Promise(resolve => setTimeout(resolve, 500));
		assert.strictEqual(jsonataDiagnostics(editor.document.uri).length, 0);

		// No edit follows, so this only works if the settings change itself
		// triggers a re-validation of the open document
		await vscode.workspace.getConfiguration(SECTION)
			.update('warnOnUnsupportedLineComments', true, vscode.ConfigurationTarget.Global);

		const warned = await waitFor(() => jsonataDiagnostics(editor.document.uri).length > 0);
		assert.ok(warned, 'The warning should appear without touching the document');
	});
});

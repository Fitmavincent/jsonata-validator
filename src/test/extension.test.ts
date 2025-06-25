import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

// Import our extension module
import * as myExtension from '../extension';

suite('JSONata Validator Extension Test Suite', () => {
	vscode.window.showInformationMessage('Starting JSONata Validator tests.');

	setup(async () => {
		// Ensure extension is activated
		const extension = vscode.extensions.getExtension('undefined_publisher.jsonata-validator');
		if (extension && !extension.isActive) {
			await extension.activate();
		}
	});
	test('Extension should be present', () => {
		// Extension might not have a publisher defined in development
		const extension = vscode.extensions.getExtension('undefined_publisher.jsonata-validator') ||
						  vscode.extensions.getExtension('jsonata-validator');
		assert.ok(extension, 'Extension should be loaded');
	});

	test('Should register commands', async () => {
		const commands = await vscode.commands.getCommands(true);
		const hasValidateDocument = commands.includes('jsonata-validator.validateDocument');
		const hasValidateSelection = commands.includes('jsonata-validator.validateSelection');

		assert.ok(hasValidateDocument, 'validateDocument command should be registered');
		assert.ok(hasValidateSelection, 'validateSelection command should be registered');
	});

	test('Should validate valid JSONata expression', async () => {
		// Create a test document with valid JSONata
		const validJsonata = '$.firstName';
		const doc = await vscode.workspace.openTextDocument({
			content: validJsonata,
			language: 'jsonata'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Execute validation command
		await vscode.commands.executeCommand('jsonata-validator.validateDocument');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		// Check that no diagnostics were created (valid expression)
		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		assert.strictEqual(diagnostics.length, 0, 'Valid JSONata should not have diagnostics');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('Should detect invalid JSONata expression', async () => {
		// Create a test document with invalid JSONata
		const invalidJsonata = '$.firstName..invalid';
		const doc = await vscode.workspace.openTextDocument({
			content: invalidJsonata,
			language: 'jsonata'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Execute validation command
		await vscode.commands.executeCommand('jsonata-validator.validateDocument');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		// Check that diagnostics were created (invalid expression)
		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		assert.ok(diagnostics.length > 0, 'Invalid JSONata should have diagnostics');
		assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('Should validate selection', async () => {
		// Create a test document with mixed content
		const content = `// Valid expression
$.firstName
// Invalid expression
$.products[invalid`;

		const doc = await vscode.workspace.openTextDocument({
			content: content,
			language: 'jsonata'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Select the valid expression
		const validLineRange = new vscode.Range(1, 0, 1, 11); // $.firstName
		editor.selection = new vscode.Selection(validLineRange.start, validLineRange.end);

		// Execute selection validation command
		await vscode.commands.executeCommand('jsonata-validator.validateSelection');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('Should handle multiple JSONata expressions', async () => {
		const multipleExpressions = `$.firstName
$.address.city
$.products[price > 100]
$.invalid..syntax`;

		const doc = await vscode.workspace.openTextDocument({
			content: multipleExpressions,
			language: 'jsonata'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Execute validation command
		await vscode.commands.executeCommand('jsonata-validator.validateDocument');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		// Should have diagnostics for the invalid expression only
		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		assert.ok(diagnostics.length > 0, 'Should detect invalid expression');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('Should work with JSON files containing JSONata', async () => {
		const jsonWithJsonata = `{
  "template": "$.firstName",
  "filter": "$.products[price > 100]",
  "invalid": "$.bad..syntax"
}`;

		const doc = await vscode.workspace.openTextDocument({
			content: jsonWithJsonata,
			language: 'json'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Execute validation command
		await vscode.commands.executeCommand('jsonata-validator.validateDocument');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('Should provide detailed JSONata error information', async () => {
		// Create a test document with a specific JSONata syntax error
		const invalidJsonata = '$sum(unclosed';
		const doc = await vscode.workspace.openTextDocument({
			content: invalidJsonata,
			language: 'jsonata'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Execute validation command
		await vscode.commands.executeCommand('jsonata-validator.validateDocument');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 200));

		// Check that diagnostics include JSONata error codes and detailed messages
		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		assert.ok(diagnostics.length > 0, 'Should detect syntax error');

		const diagnostic = diagnostics[0];
		assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
		assert.ok(diagnostic.message.includes('Expected'), 'Should include expected token information');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('Should handle multi-line JSONata expressions correctly', async () => {
		const multiLineJsonata = `$.products[
  price > 100
].name`;

		const doc = await vscode.workspace.openTextDocument({
			content: multiLineJsonata,
			language: 'jsonata'
		});

		const editor = await vscode.window.showTextDocument(doc);

		// Execute validation command
		await vscode.commands.executeCommand('jsonata-validator.validateDocument');

		// Wait a bit for validation to complete
		await new Promise(resolve => setTimeout(resolve, 200));

		// Should be valid (no diagnostics)
		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		assert.strictEqual(diagnostics.length, 0, 'Valid multi-line JSONata should not have errors');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
});

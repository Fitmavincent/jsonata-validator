// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import jsonata from 'jsonata';

// Diagnostic collection for JSONata validation errors
let diagnosticCollection: vscode.DiagnosticCollection;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('JSONata Validator extension is now active!');

	// Create diagnostic collection
	diagnosticCollection = vscode.languages.createDiagnosticCollection('jsonata');
	context.subscriptions.push(diagnosticCollection);

	// Register commands
	const validateDocumentCommand = vscode.commands.registerCommand('jsonata-validator.validateDocument', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			validateDocument(editor.document);
		}
	});

	const validateSelectionCommand = vscode.commands.registerCommand('jsonata-validator.validateSelection', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.selection && !editor.selection.isEmpty) {
			const selectedText = editor.document.getText(editor.selection);
			validateSelection(editor.document, selectedText, editor.selection);
		}
	});

	// Register event listeners
	const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
		const config = vscode.workspace.getConfiguration('jsonataValidator');
		if (config.get<boolean>('validateOnType', true)) {
			if (isJsonataFile(event.document)) {
				// Debounce validation to avoid too frequent calls
				setTimeout(() => validateDocument(event.document), 500);
			}
		}
	});

	const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => {
		const config = vscode.workspace.getConfiguration('jsonataValidator');
		if (config.get<boolean>('validateOnSave', true)) {
			if (isJsonataFile(document)) {
				validateDocument(document);
			}
		}
	});

	const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(document => {
		if (isJsonataFile(document)) {
			validateDocument(document);
		}
	});

	const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument(document => {
		diagnosticCollection.delete(document.uri);
	});

	// Add all subscriptions
	context.subscriptions.push(
		validateDocumentCommand,
		validateSelectionCommand,
		onDidChangeTextDocument,
		onDidSaveTextDocument,
		onDidOpenTextDocument,
		onDidCloseTextDocument
	);

	// Validate already open documents
	vscode.workspace.textDocuments.forEach(document => {
		if (isJsonataFile(document)) {
			validateDocument(document);
		}
	});
}

/**
 * Check if a document is a JSONata file
 */
function isJsonataFile(document: vscode.TextDocument): boolean {
	return document.languageId === 'jsonata' ||
		   document.fileName.endsWith('.jsonata') ||
		   (document.languageId === 'json' && containsJsonataExpression(document.getText()));
}

/**
 * Simple heuristic to detect if JSON content might contain JSONata expressions
 */
function containsJsonataExpression(text: string): boolean {
	// Look for common JSONata patterns
	const jsonataPatterns = [
		/\$[a-zA-Z_][a-zA-Z0-9_]*/,  // Variables like $variable
		/\*\./,                       // Wildcard selectors
		/\[\?\]/,                     // Filter expressions
		/\{\%.*?\%\}/,               // Template expressions
		/\~\>/,                       // Chain operator
		/\|/                          // Union operator in certain contexts
	];

	return jsonataPatterns.some(pattern => pattern.test(text));
}

/**
 * Validate an entire document
 */
function validateDocument(document: vscode.TextDocument): void {
	const text = document.getText();
	const diagnostics = validateJsonataText(text, document);
	diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * Validate a selection within a document
 */
function validateSelection(document: vscode.TextDocument, selectedText: string, selection: vscode.Selection): void {
	const diagnostics = validateJsonataText(selectedText, document, selection.start);

	// Show results in a message
	if (diagnostics.length === 0) {
		vscode.window.showInformationMessage('✓ JSONata selection is valid');
	} else {
		const errorCount = diagnostics.length;
		vscode.window.showErrorMessage(`✗ JSONata selection has ${errorCount} error${errorCount > 1 ? 's' : ''}`);
	}
}

/**
 * Validate JSONata text and return diagnostics
 */
function validateJsonataText(text: string, document: vscode.TextDocument, offset?: vscode.Position): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];
	const config = vscode.workspace.getConfiguration('jsonataValidator');
	const maxProblems = config.get<number>('maxNumberOfProblems', 100);

	// Split text into lines to handle multi-line JSONata expressions
	const lines = text.split('\n');

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex].trim();

		// Skip empty lines and comments
		if (!line || line.startsWith('//') || line.startsWith('/*')) {
			continue;
		}

		// Try to extract JSONata expressions from JSON strings
		const expressions = extractJsonataExpressions(line);

		for (const expression of expressions) {
			if (expression.expression.trim()) {
				try {
					// Attempt to compile the JSONata expression
					jsonata(expression.expression);
				} catch (error: any) {
					if (diagnostics.length >= maxProblems) {
						break;
					}

					const range = calculateErrorRange(
						document,
						lineIndex,
						expression.startPos,
						expression.endPos,
						offset
					);

					const diagnostic = new vscode.Diagnostic(
						range,
						`JSONata validation error: ${error.message}`,
						vscode.DiagnosticSeverity.Error
					);

					diagnostic.source = 'jsonata-validator';
					diagnostics.push(diagnostic);
				}
			}
		}

		if (diagnostics.length >= maxProblems) {
			break;
		}
	}

	return diagnostics;
}

/**
 * Extract JSONata expressions from a line of text
 */
function extractJsonataExpressions(line: string): Array<{expression: string, startPos: number, endPos: number}> {
	const expressions: Array<{expression: string, startPos: number, endPos: number}> = [];

	// If the entire line looks like a JSONata expression (not wrapped in quotes)
	if (!line.includes('"') && !line.includes("'")) {
		expressions.push({
			expression: line,
			startPos: 0,
			endPos: line.length
		});
	} else {
		// Extract expressions from JSON string values
		const stringRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
		let match;

		while ((match = stringRegex.exec(line)) !== null) {
			const stringContent = match[1];
			// Check if this string contains JSONata patterns
			if (containsJsonataExpression(stringContent)) {
				expressions.push({
					expression: stringContent,
					startPos: match.index + 1, // +1 to skip opening quote
					endPos: match.index + match[0].length - 1 // -1 to skip closing quote
				});
			}
		}
	}

	return expressions;
}

/**
 * Calculate the error range in the document
 */
function calculateErrorRange(
	document: vscode.TextDocument,
	lineIndex: number,
	startPos: number,
	endPos: number,
	offset?: vscode.Position
): vscode.Range {
	const actualLineIndex = offset ? offset.line + lineIndex : lineIndex;
	const startCharacter = offset ? (lineIndex === 0 ? offset.character + startPos : startPos) : startPos;
	const endCharacter = offset ? (lineIndex === 0 ? offset.character + endPos : endPos) : endPos;

	return new vscode.Range(
		new vscode.Position(actualLineIndex, startCharacter),
		new vscode.Position(actualLineIndex, endCharacter)
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (diagnosticCollection) {
		diagnosticCollection.dispose();
	}
}

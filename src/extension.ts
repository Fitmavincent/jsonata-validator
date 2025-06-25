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

	// Handle different file types differently
	if (document.languageId === 'jsonata' || document.fileName.endsWith('.jsonata')) {
		// For pure JSONata files, validate the entire content as a single expression
		const expressions = extractJsonataExpressionsFromPureJsonata(text);		for (const expression of expressions) {
			if (diagnostics.length >= maxProblems) {
				break;
			}

			const expressionDiagnostics = validateSingleJsonataExpression(
				expression.expression,
				document,
				expression.line,
				expression.startPos,
				expression.endPos,
				offset
			);
			diagnostics.push(...expressionDiagnostics);
		}
	} else {
		// For JSON files or other formats, extract JSONata from strings
		const lines = text.split('\n');		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			if (diagnostics.length >= maxProblems) {
				break;
			}

			const line = lines[lineIndex];
			const expressions = extractJsonataExpressionsFromLine(line);

			for (const expression of expressions) {
				if (diagnostics.length >= maxProblems) {
					break;
				}

				const expressionDiagnostics = validateSingleJsonataExpression(
					expression.expression,
					document,
					lineIndex,
					expression.startPos,
					expression.endPos,
					offset
				);
				diagnostics.push(...expressionDiagnostics);
			}
		}
	}

	return diagnostics;
}

/**
 * Validate a single JSONata expression and return diagnostics
 */
function validateSingleJsonataExpression(
	expression: string,
	document: vscode.TextDocument,
	lineIndex: number,
	startPos: number,
	endPos: number,
	offset?: vscode.Position
): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];

	if (!expression.trim()) {
		return diagnostics;
	}

	try {
		// Attempt to compile the JSONata expression
		jsonata(expression);
	} catch (error: any) {
		// JSONata provides detailed error information
		const diagnostic = createDiagnosticFromJsonataError(
			error,
			expression,
			document,
			lineIndex,
			startPos,
			endPos,
			offset
		);

		if (diagnostic) {
			diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}

/**
 * Create a diagnostic from JSONata error information
 */
function createDiagnosticFromJsonataError(
	error: any,
	expression: string,
	document: vscode.TextDocument,
	lineIndex: number,
	expressionStartPos: number,
	expressionEndPos: number,
	offset?: vscode.Position
): vscode.Diagnostic | null {
	// JSONata error structure: { code, position, token, value, message, stack }
	let message = error.message || 'JSONata syntax error';

	// Calculate the exact position within the document
	const errorLocation = calculateErrorLocation(
		expression,
		error.position,
		error.token,
		lineIndex,
		expressionStartPos,
		document
	);

	// Enhance error message with JSONata error details
	if (error.code) {
		message = `[${error.code}] ${message}`;
	}

	if (error.token && error.value && error.token !== error.value && error.value !== 'undefined') {
		message += ` (expected '${error.value}', got '${error.token}')`;
	}

	const range = calculateErrorRange(
		document,
		errorLocation.line,
		errorLocation.startChar,
		errorLocation.endChar,
		offset
	);

	const diagnostic = new vscode.Diagnostic(
		range,
		message,
		vscode.DiagnosticSeverity.Error
	);

	diagnostic.source = 'jsonata-validator';

	// Add error code if available
	if (error.code) {
		diagnostic.code = error.code;
	}

	return diagnostic;
}

/**
 * Calculate the exact error location within multi-line expressions
 */
function calculateErrorLocation(
	expression: string,
	errorPosition: number,
	errorToken: string,
	startLineIndex: number,
	expressionStartPos: number,
	document: vscode.TextDocument
): { line: number; startChar: number; endChar: number } {
	if (typeof errorPosition !== 'number' || errorPosition < 0) {
		// Fallback: highlight the entire expression
		return {
			line: startLineIndex,
			startChar: expressionStartPos,
			endChar: expressionStartPos + (expression.split('\n')[0]?.length || 0)
		};
	}

	// Split expression into lines to find which line contains the error
	const expressionLines = expression.split('\n');
	let currentPosition = 0;
	let targetLine = startLineIndex;
	let targetStartChar = expressionStartPos;
	let targetEndChar = expressionStartPos + 1;

	// Find the line containing the error position
	for (let i = 0; i < expressionLines.length; i++) {
		const lineLength = expressionLines[i].length;

		// Check if error position is within this line
		if (errorPosition <= currentPosition + lineLength) {
			targetLine = startLineIndex + i;

			// Calculate character position within the line
			const charPositionInLine = errorPosition - currentPosition;

			if (i === 0) {
				// First line: add expression start position
				targetStartChar = expressionStartPos + charPositionInLine;
			} else {
				// Subsequent lines: position is relative to line start
				targetStartChar = charPositionInLine;
			}

			// Special handling for specific error patterns
			const adjustedPosition = adjustErrorPositionForCommonPatterns(
				expression,
				errorPosition,
				errorToken,
				expressionLines,
				i,
				charPositionInLine
			);

			if (adjustedPosition) {
				targetLine = startLineIndex + adjustedPosition.lineIndex;
				// For the first line of the expression, we need to add the expression start position
				if (adjustedPosition.lineIndex === 0) {
					targetStartChar = expressionStartPos + adjustedPosition.startChar;
					targetEndChar = expressionStartPos + adjustedPosition.endChar;
				} else {
					targetStartChar = adjustedPosition.startChar;
					targetEndChar = adjustedPosition.endChar;
				}
			} else {
				// Calculate end position based on token
				if (errorToken && errorToken !== '(end)') {
					targetEndChar = targetStartChar + errorToken.length;
				} else if (errorToken === '(end)') {
					// For end-of-expression errors
					if (charPositionInLine >= lineLength) {
						// Error is at the end of line
						targetStartChar = Math.max(0, lineLength - 1);
						targetEndChar = lineLength;
					} else {
						targetEndChar = targetStartChar + 1;
					}
				} else {
					targetEndChar = targetStartChar + 1;
				}
			}

			break;
		}

		// Move to next line (add 1 for the newline character)
		currentPosition += lineLength + 1;
	}

	// Handle case where error position is beyond the expression
	if (errorPosition >= expression.length) {
		const lastLineIndex = expressionLines.length - 1;
		const lastLine = expressionLines[lastLineIndex] || '';

		targetLine = startLineIndex + lastLineIndex;

		if (lastLineIndex === 0) {
			targetStartChar = expressionStartPos + lastLine.length - 1;
			targetEndChar = expressionStartPos + lastLine.length;
		} else {
			targetStartChar = Math.max(0, lastLine.length - 1);
			targetEndChar = lastLine.length;
		}
	}

	return {
		line: targetLine,
		startChar: Math.max(0, targetStartChar),
		endChar: Math.max(targetStartChar, targetEndChar)
	};
}

/**
 * Adjust error position for common error patterns
 */
function adjustErrorPositionForCommonPatterns(
	expression: string,
	errorPosition: number,
	errorToken: string,
	expressionLines: string[],
	currentLineIndex: number,
	charPositionInLine: number
): { lineIndex: number; startChar: number; endChar: number } | null {

	// Pattern 1: "}" cannot be used as a unary operator - likely trailing comma
	if (errorToken === '}' && currentLineIndex > 0) {
		const currentLine = expressionLines[currentLineIndex];
		const previousLine = expressionLines[currentLineIndex - 1];

		// Check if current line is just whitespace + "}" and previous line ends with ","
		if (currentLine.trim() === '}' && previousLine.trim().endsWith(',')) {
			// Highlight the trailing comma on the previous line
			const commaPosition = previousLine.lastIndexOf(',');
			if (commaPosition >= 0) {
				return {
					lineIndex: currentLineIndex - 1,
					startChar: commaPosition,
					endChar: commaPosition + 1
				};
			}
		}
	}

	// Pattern 2: "]" cannot be used as a unary operator - likely trailing comma in array
	if (errorToken === ']' && currentLineIndex > 0) {
		const currentLine = expressionLines[currentLineIndex];
		const previousLine = expressionLines[currentLineIndex - 1];

		// Check if current line is just whitespace + "]" and previous line ends with ","
		if (currentLine.trim() === ']' && previousLine.trim().endsWith(',')) {
			// Highlight the trailing comma on the previous line
			const commaPosition = previousLine.lastIndexOf(',');
			if (commaPosition >= 0) {
				return {
					lineIndex: currentLineIndex - 1,
					startChar: commaPosition,
					endChar: commaPosition + 1
				};
			}
		}
	}

	return null;
}

/**
 * Extract JSONata expressions from pure JSONata files
 */
function extractJsonataExpressionsFromPureJsonata(text: string): Array<{expression: string, line: number, startPos: number, endPos: number}> {
	const expressions: Array<{expression: string, line: number, startPos: number, endPos: number}> = [];
	const lines = text.split('\n');

	let currentExpression = '';
	let expressionStartLine = -1;
	let expressionStartPos = 0;
	let inMultiLineExpression = false;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const trimmedLine = line.trim();

		// Skip empty lines and comments when not in a multi-line expression
		if (!inMultiLineExpression && (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*'))) {
			continue;
		}

		// Check if we're starting a new expression
		if (!inMultiLineExpression && trimmedLine) {
			currentExpression = trimmedLine;
			expressionStartLine = lineIndex;
			expressionStartPos = line.indexOf(trimmedLine);
			inMultiLineExpression = !isCompleteExpression(trimmedLine);

			if (!inMultiLineExpression) {
				// Single line expression
				expressions.push({
					expression: trimmedLine,
					line: lineIndex,
					startPos: expressionStartPos,
					endPos: expressionStartPos + trimmedLine.length
				});
			}
		} else if (inMultiLineExpression) {
			// Continue building multi-line expression
			// Preserve original formatting for accurate position calculation
			currentExpression += '\n' + line;

			// Check if expression is now complete
			if (isCompleteExpression(currentExpression)) {
				expressions.push({
					expression: currentExpression,
					line: expressionStartLine,
					startPos: expressionStartPos,
					endPos: line.length // This will be recalculated properly in error handling
				});

				currentExpression = '';
				inMultiLineExpression = false;
			}
		}
	}

	// Handle case where file ends with incomplete expression
	if (inMultiLineExpression && currentExpression.trim()) {
		expressions.push({
			expression: currentExpression,
			line: expressionStartLine,
			startPos: expressionStartPos,
			endPos: currentExpression.length
		});
	}

	return expressions;
}

/**
 * Extract JSONata expressions from a single line (for JSON files)
 */
function extractJsonataExpressionsFromLine(line: string): Array<{expression: string, startPos: number, endPos: number}> {
	const expressions: Array<{expression: string, startPos: number, endPos: number}> = [];

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

	return expressions;
}

/**
 * Check if a JSONata expression appears to be complete
 * This is a heuristic check for basic bracket/parentheses matching
 */
function isCompleteExpression(expression: string): boolean {
	const brackets = { '(': ')', '[': ']', '{': '}' };
	const stack: string[] = [];
	let inString = false;
	let escaped = false;

	for (let i = 0; i < expression.length; i++) {
		const char = expression[i];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === '\\') {
			escaped = true;
			continue;
		}

		if (char === '"' || char === "'") {
			inString = !inString;
			continue;
		}

		if (!inString) {
			if (char in brackets) {
				stack.push(brackets[char as keyof typeof brackets]);
			} else if (Object.values(brackets).includes(char)) {
				if (stack.length === 0 || stack.pop() !== char) {
					return false; // Mismatched brackets
				}
			}
		}
	}

	return stack.length === 0; // Complete if no unclosed brackets
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
	// Calculate the actual line and character positions
	let actualLineIndex = lineIndex;
	let startCharacter = startPos;
	let endCharacter = endPos;

	// Apply offset if provided (for selections)
	if (offset) {
		actualLineIndex = offset.line + lineIndex;

		// For multi-line selections, only add offset character on the first line
		if (lineIndex === 0) {
			startCharacter = offset.character + startPos;
			endCharacter = offset.character + endPos;
		}
		// For subsequent lines, use positions as-is since they're relative to line start
	}

	// Ensure we don't go beyond the document bounds
	const maxLines = document.lineCount;
	actualLineIndex = Math.min(actualLineIndex, maxLines - 1);

	// Get the actual line to ensure we don't exceed line length
	const documentLine = document.lineAt(actualLineIndex);
	const lineLength = documentLine.text.length;

	// Clamp positions to valid ranges
	startCharacter = Math.max(0, Math.min(startCharacter, lineLength));
	endCharacter = Math.max(startCharacter, Math.min(endCharacter, lineLength));

	// If end position would be at or beyond line end, extend to include the last character
	if (endCharacter >= lineLength && startCharacter < lineLength) {
		endCharacter = lineLength;
	} else if (startCharacter >= lineLength) {
		// Error is beyond the line, position at the end
		startCharacter = Math.max(0, lineLength - 1);
		endCharacter = lineLength;
	}

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

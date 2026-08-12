import * as vscode from 'vscode';

/**
 * Check if a document is a JSONata file
 */
export function isJsonataFile(document: vscode.TextDocument): boolean {
	return document.languageId === 'jsonata' ||
		   document.fileName.endsWith('.jsonata') ||
		   (document.languageId === 'json' && containsJsonataExpression(document.getText()));
}

/**
 * Simple heuristic to detect if JSON content might contain JSONata expressions
 */
export function containsJsonataExpression(text: string): boolean {
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

// Re-exported so callers have a single entry point for JSONata text handling
export {
	createScanState,
	isBalanced,
	isCompleteExpression,
	scanLine,
	stripComments
} from './jsonataScanner';
export type { LineCommentLocation, LineScan, ScanState } from './jsonataScanner';

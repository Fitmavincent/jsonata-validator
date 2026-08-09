import * as vscode from 'vscode';

export { BracketScanner, isCompleteExpression } from './bracketScanner';

/**
 * Check if a document is a JSONata file
 */
export function isJsonataFile(document: vscode.TextDocument): boolean {
	return document.languageId === 'jsonata' || document.fileName.endsWith('.jsonata');
}

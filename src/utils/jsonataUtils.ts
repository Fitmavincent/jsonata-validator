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

/**
 * Check if a JSONata expression appears to be complete
 * This is a heuristic check for basic bracket/parentheses matching
 */
export function isCompleteExpression(expression: string): boolean {
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

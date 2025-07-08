import * as vscode from 'vscode';
import { isCompleteExpression, containsJsonataExpression as utilsContainsJsonataExpression } from '../utils/jsonataUtils';

/**
 * Extract JSONata expressions from pure JSONata files
 */
export function extractJsonataExpressionsFromPureJsonata(text: string): Array<{expression: string, line: number, startPos: number, endPos: number}> {
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
export function extractJsonataExpressionsFromLine(line: string): Array<{expression: string, startPos: number, endPos: number}> {
	const expressions: Array<{expression: string, startPos: number, endPos: number}> = [];

	// Extract expressions from JSON string values
	const stringRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
	let match;

	while ((match = stringRegex.exec(line)) !== null) {
		const stringContent = match[1];
		// Check if this string contains JSONata patterns
		if (utilsContainsJsonataExpression(stringContent)) {
			expressions.push({
				expression: stringContent,
				startPos: match.index + 1, // +1 to skip opening quote
				endPos: match.index + match[0].length - 1 // -1 to skip closing quote
			});
		}
	}

	return expressions;
}

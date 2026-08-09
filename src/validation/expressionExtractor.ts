import { BracketScanner } from '../utils/bracketScanner';

export interface ExtractedExpression {
	expression: string;
	line: number;
	startPos: number;
	endPos: number;
}

/**
 * Extract JSONata expressions from pure JSONata files
 */
export function extractJsonataExpressionsFromPureJsonata(text: string): ExtractedExpression[] {
	const expressions: ExtractedExpression[] = [];
	const lines = text.split('\n');
	const scanner = new BracketScanner();

	const openLines: string[] = [];
	let expressionStartLine = -1;
	let expressionStartPos = 0;
	let inMultiLineExpression = false;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const trimmedLine = line.trim();

		if (!inMultiLineExpression) {
			// Skip empty lines and comments between expressions
			if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
				continue;
			}

			// Start a new expression on this line
			scanner.reset();
			scanner.scanLine(trimmedLine);
			expressionStartLine = lineIndex;
			expressionStartPos = line.indexOf(trimmedLine);

			if (scanner.isBalanced) {
				expressions.push({
					expression: trimmedLine,
					line: lineIndex,
					startPos: expressionStartPos,
					endPos: expressionStartPos + trimmedLine.length
				});
			} else {
				inMultiLineExpression = true;
				openLines.length = 0;
				openLines.push(trimmedLine);
			}
			continue;
		}

		// Continue building a multi-line expression, preserving the original
		// formatting so error positions still line up with the document
		openLines.push(line);
		scanner.scanLine(line);

		if (scanner.isBalanced) {
			expressions.push({
				expression: openLines.join('\n'),
				line: expressionStartLine,
				startPos: expressionStartPos,
				endPos: line.length // Recalculated properly during error handling
			});
			openLines.length = 0;
			inMultiLineExpression = false;
		}
	}

	// Handle case where file ends with incomplete expression
	if (inMultiLineExpression && openLines.length > 0) {
		const expression = openLines.join('\n');
		if (expression.trim()) {
			expressions.push({
				expression,
				line: expressionStartLine,
				startPos: expressionStartPos,
				endPos: expression.length
			});
		}
	}

	return expressions;
}

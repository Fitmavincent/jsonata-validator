import { JsonataScanner } from '../utils/jsonataScanner';

export interface ExtractedExpression {
	expression: string;
	line: number;
	startPos: number;
	endPos: number;
}

/**
 * Operators that can only ever continue the expression above them, so a line
 * starting with one belongs to that expression rather than beginning a new one.
 *
 * `*`, `**`, `/`, `%`, `|`, `(`, `[` and `{` are deliberately absent: each of them
 * can legally start a fresh JSONata expression (wildcard, descendant, regex,
 * parent, transform, block, array, object), so treating them as continuations
 * would glue unrelated expressions together.
 */
const CONTINUATION_PREFIXES = ['~>', ':=', '!=', '<=', '>=', '..', '.', ',', ';', '&', '+', '-', '=', '<', '>', '?', ':'];

/**
 * An expression can never end on an operator, so a trailing one means more is
 * coming. `*`, `/`, `%` and `|` are left out because they double as wildcard,
 * regex delimiter, parent reference and transform, all of which can legitimately
 * end an expression.
 */
const TRAILING_OPERATORS = ['~>', ':=', '!=', '<=', '>=', '.', ',', ';', '&', '+', '-', '=', '<', '>', '?', ':'];

/** Word operators, matched on a boundary so `and` doesn't match `andrew` */
const LEADING_WORD_OPERATOR = /^(and|or|in)\b/;
const TRAILING_WORD_OPERATOR = /\b(and|or|in)$/;

function startsWithContinuation(code: string): boolean {
	const trimmed = code.trim();

	return trimmed !== '' &&
		   (CONTINUATION_PREFIXES.some(operator => trimmed.startsWith(operator)) ||
		    LEADING_WORD_OPERATOR.test(trimmed));
}

function endsWithOperator(code: string): boolean {
	const trimmed = code.trimEnd();

	return trimmed !== '' &&
		   (TRAILING_OPERATORS.some(operator => trimmed.endsWith(operator)) ||
		    TRAILING_WORD_OPERATOR.test(trimmed));
}

/**
 * Looks past blank lines and stand-alone comments to see whether the expression
 * that just balanced actually carries on below.
 */
function continuesBelow(collectedCode: string, lines: string[], lineIndex: number): boolean {
	if (endsWithOperator(collectedCode)) {
		return true;
	}

	// A fresh scanner is safe here: this is only reached once the expression has
	// balanced, so there is no block comment left open to carry over.
	const lookahead = new JsonataScanner();

	for (let i = lineIndex + 1; i < lines.length; i++) {
		const scan = lookahead.scanLine(lines[i]);
		if (scan.firstCodeColumn !== -1) {
			return startsWithContinuation(scan.code.slice(scan.firstCodeColumn));
		}
	}

	return false;
}

/**
 * Extract JSONata expressions from pure JSONata files
 *
 * A `.jsonata` file usually holds one expression, but this extension also
 * supports scratch files holding several, so the text is split wherever an
 * expression is complete and nothing below continues it. Comments are skipped
 * between expressions and passed through untouched inside one.
 *
 * The first line of each expression is returned trimmed and paired with the
 * column it started at, while the remaining lines are returned verbatim; the
 * diagnostics position themselves off exactly that arrangement.
 */
export function extractJsonataExpressionsFromPureJsonata(text: string): ExtractedExpression[] {
	const expressions: ExtractedExpression[] = [];
	const lines = text.split('\n');
	const scanner = new JsonataScanner();

	const openLines: string[] = [];
	const openCode: string[] = [];
	let expressionStartLine = -1;
	let expressionStartPos = 0;

	const flush = () => {
		const lastLine = openLines[openLines.length - 1] ?? '';

		expressions.push({
			expression: openLines.join('\n'),
			line: expressionStartLine,
			startPos: expressionStartPos,
			endPos: openLines.length > 1 ? lastLine.length : expressionStartPos + lastLine.length
		});

		openLines.length = 0;
		openCode.length = 0;
		expressionStartLine = -1;
		expressionStartPos = 0;
		scanner.reset();
	};

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const scan = scanner.scanLine(line);

		if (expressionStartLine === -1) {
			// Blank lines and stand-alone comments sit between expressions
			if (scan.firstCodeColumn === -1) {
				continue;
			}

			expressionStartLine = lineIndex;
			expressionStartPos = scan.firstCodeColumn;
			openLines.push(line.slice(scan.firstCodeColumn).trimEnd());
			openCode.push(scan.code.slice(scan.firstCodeColumn));
		} else {
			// Preserve the original formatting so error positions still line up
			openLines.push(line);
			openCode.push(scan.code);
		}

		// A mismatched bracket can never be repaired by reading further, so end
		// the expression here and let the rest of the file be checked on its own
		const done = scanner.isMismatched ||
					 (scanner.isBalanced && !continuesBelow(openCode.join('\n'), lines, lineIndex));

		if (done) {
			flush();
		}
	}

	// The file ended mid-expression - report what we have so the error surfaces
	if (expressionStartLine !== -1) {
		flush();
	}

	return expressions;
}

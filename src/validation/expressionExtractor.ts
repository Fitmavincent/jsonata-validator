import { createScanState, isBalanced, scanLine } from '../utils/jsonataScanner';
import { containsJsonataExpression as utilsContainsJsonataExpression } from '../utils/jsonataUtils';

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
 * Look past blank lines and stand-alone comments to see whether the expression
 * that just balanced actually carries on below.
 */
function continuesBelow(collectedCode: string, lines: string[], lineIndex: number): boolean {
	if (endsWithOperator(collectedCode)) {
		return true;
	}

	// Safe to start from a clean state: this is only called once the expression
	// has balanced, which means no string or block comment is left open.
	const lookahead = createScanState();

	for (let i = lineIndex + 1; i < lines.length; i++) {
		const scan = scanLine(lines[i], lookahead);
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

	let state = createScanState();
	let collected: string[] = [];
	let collectedCode: string[] = [];
	let startLine = -1;
	let startPos = 0;

	const flush = () => {
		const expression = collected.join('\n');
		const lastLine = collected[collected.length - 1] ?? '';

		expressions.push({
			expression,
			line: startLine,
			startPos,
			endPos: collected.length > 1 ? lastLine.length : startPos + lastLine.length
		});

		collected = [];
		collectedCode = [];
		startLine = -1;
		startPos = 0;

		// Only the bracket bookkeeping belonged to the expression just finished;
		// a comment or string still open carries on into whatever follows
		state = {
			...createScanState(),
			inBlockComment: state.inBlockComment,
			stringDelimiter: state.stringDelimiter
		};
	};

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const scan = scanLine(line, state);

		if (startLine === -1) {
			// Blank lines and stand-alone comments sit between expressions
			if (scan.firstCodeColumn === -1) {
				continue;
			}

			startLine = lineIndex;
			startPos = scan.firstCodeColumn;
			collected.push(line.slice(scan.firstCodeColumn).trimEnd());
			collectedCode.push(scan.code.slice(scan.firstCodeColumn));
		} else {
			collected.push(line);
			collectedCode.push(scan.code);
		}

		// A mismatched bracket can never be resolved by reading further, so end
		// the expression here and let the rest of the file be checked on its own
		if (state.mismatched) {
			flush();
		} else if (isBalanced(state) && !continuesBelow(collectedCode.join('\n'), lines, lineIndex)) {
			flush();
		}
	}

	// The file ended mid-expression - report what we have so the error surfaces
	if (startLine !== -1) {
		flush();
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

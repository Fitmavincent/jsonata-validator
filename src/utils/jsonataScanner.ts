/**
 * A small hand-rolled scanner for JSONata source.
 *
 * Deliberately free of any `vscode` import so it can be reasoned about - and
 * tested - on its own.
 */

const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSING_BRACKETS = Object.values(BRACKET_PAIRS);

/**
 * Lexer state carried from one line of JSONata source to the next, so that
 * strings and block comments spanning several lines stay understood as such.
 */
export interface ScanState {
	/** Closing brackets still expected, innermost last */
	stack: string[];
	/** Quote character of the string literal left open, or null */
	stringDelimiter: string | null;
	/** True while a block comment opened earlier is still unterminated */
	inBlockComment: boolean;
	/** True once a closing bracket turned up without a matching opener */
	mismatched: boolean;
}

/**
 * Where an unsupported `//` comment was found
 */
export interface LineCommentLocation {
	line: number;
	character: number;
	length: number;
}

/**
 * Result of scanning a single line
 */
export interface LineScan {
	/** Column of the first code character, or -1 when the line holds no code */
	firstCodeColumn: number;
	/** The line with every comment blanked out, so columns still line up */
	code: string;
	/** Columns where an unsupported `//` comment starts */
	lineCommentColumns: number[];
}

export function createScanState(): ScanState {
	return { stack: [], stringDelimiter: null, inBlockComment: false, mismatched: false };
}

/**
 * True when the scanner sits at a point where an expression could legally end
 */
export function isBalanced(state: ScanState): boolean {
	return state.stack.length === 0 && state.stringDelimiter === null && !state.inBlockComment;
}

/**
 * Advance `state` across one line of JSONata source.
 *
 * Comments are replaced by spaces rather than removed so that every remaining
 * character keeps its original column, which is what the diagnostics rely on to
 * point at the right place in the document.
 */
export function scanLine(line: string, state: ScanState): LineScan {
	const code = line.split('');
	const lineCommentColumns: number[] = [];
	let firstCodeColumn = -1;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (state.inBlockComment) {
			code[i] = ' ';
			if (char === '*' && line[i + 1] === '/') {
				code[i + 1] = ' ';
				state.inBlockComment = false;
				i++;
			}
			continue;
		}

		if (state.stringDelimiter !== null) {
			if (char === '\\') {
				i++; // the escaped character is part of the string, whatever it is
			} else if (char === state.stringDelimiter) {
				state.stringDelimiter = null;
			}
			continue;
		}

		if (char === '/' && line[i + 1] === '*') {
			code[i] = ' ';
			code[i + 1] = ' ';
			state.inBlockComment = true;
			i++;
			continue;
		}

		// JSONata has no line comments, but `//` is a habit people bring from
		// other languages. Treat the rest of the line as a comment so a single
		// slip doesn't cascade into bogus syntax errors; the caller reports it.
		if (char === '/' && line[i + 1] === '/') {
			lineCommentColumns.push(i);
			for (let j = i; j < line.length; j++) {
				code[j] = ' ';
			}
			break;
		}

		if (firstCodeColumn === -1 && char.trim()) {
			firstCodeColumn = i;
		}

		if (char === '"' || char === "'") {
			state.stringDelimiter = char;
		} else if (char in BRACKET_PAIRS) {
			state.stack.push(BRACKET_PAIRS[char]);
		} else if (CLOSING_BRACKETS.includes(char)) {
			if (state.stack.pop() !== char) {
				state.mismatched = true;
			}
		}
	}

	return { firstCodeColumn, code: code.join(''), lineCommentColumns };
}

/**
 * Blank out every comment in `text`, keeping the character count intact.
 *
 * Block comments are valid JSONata and could be left alone, but removing them
 * here means a file made up of nothing but comments reduces to whitespace and
 * is correctly treated as having nothing to validate.
 */
export function stripComments(text: string): { text: string; lineComments: LineCommentLocation[] } {
	const state = createScanState();
	const lineComments: LineCommentLocation[] = [];

	const strippedLines = text.split('\n').map((line, lineIndex) => {
		const scan = scanLine(line, state);
		for (const character of scan.lineCommentColumns) {
			lineComments.push({ line: lineIndex, character, length: line.length - character });
		}
		return scan.code;
	});

	return { text: strippedLines.join('\n'), lineComments };
}

/**
 * Check if a JSONata expression appears to be complete
 *
 * Heuristic: every bracket is matched and no string or block comment is left
 * hanging. Brackets and quotes inside comments and string literals don't count.
 */
export function isCompleteExpression(expression: string): boolean {
	const state = createScanState();

	for (const line of expression.split('\n')) {
		scanLine(line, state);
	}

	return !state.mismatched && isBalanced(state);
}

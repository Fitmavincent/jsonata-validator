const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSING_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

/**
 * Where an unsupported `//` comment was found
 */
export interface LineCommentLocation {
	line: number;
	character: number;
	length: number;
}

/**
 * What a single line contributed, once its comments have been discounted
 */
export interface LineScan {
	/** Column of the first code character, or -1 when the line holds no code */
	firstCodeColumn: number;
	/** The line with every comment blanked out, so columns still line up */
	code: string;
	/** Columns where an unsupported `//` comment starts */
	lineCommentColumns: number[];
}

/**
 * Tracks bracket nesting and comments across the lines of a single expression.
 *
 * Feeding lines in one at a time keeps extraction linear in the size of the
 * document; re-checking the whole accumulated expression after every line makes
 * it quadratic, which is what a large .jsonata file used to pay on each
 * keystroke.
 */
export class JsonataScanner {
	private readonly expectedClosers: string[] = [];
	private mismatched = false;
	private inBlockComment = false;

	/**
	 * Consumes one line of an expression, returning it with comments blanked
	 * out. Comments become spaces rather than disappearing, so every remaining
	 * character keeps the column the diagnostics will point at.
	 *
	 * String literals cannot span lines in JSONata, so quote state deliberately
	 * does not carry over to the next call — an unterminated quote can no longer
	 * swallow the rest of the file. Block comments are the opposite: they are
	 * written across several lines all the time, so that state does carry.
	 */
	public scanLine(line: string): LineScan {
		const code = line.split('');
		const lineCommentColumns: number[] = [];
		let firstCodeColumn = -1;
		let quote: string | null = null;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (this.inBlockComment) {
				code[i] = ' ';
				if (char === '*' && line[i + 1] === '/') {
					code[i + 1] = ' ';
					this.inBlockComment = false;
					i++;
				}
				continue;
			}

			if (quote) {
				if (char === '\\') {
					i++; // Skip the escaped character
				} else if (char === quote) {
					quote = null;
				}
				continue;
			}

			if (char === '/' && line[i + 1] === '*') {
				code[i] = ' ';
				code[i + 1] = ' ';
				this.inBlockComment = true;
				i++;
				continue;
			}

			// JSONata has no line comments, but `//` is a habit people bring
			// from other languages. Treat the rest of the line as a comment so a
			// single slip doesn't cascade into bogus syntax errors on the lines
			// below; the caller reports it separately.
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
				quote = char;
			} else if (char in BRACKET_PAIRS) {
				this.expectedClosers.push(BRACKET_PAIRS[char]);
			} else if (CLOSING_BRACKETS.has(char)) {
				if (this.expectedClosers.pop() !== char) {
					this.mismatched = true;
				}
			}
		}

		return { firstCodeColumn, code: code.join(''), lineCommentColumns };
	}

	/**
	 * True when every bracket opened so far has been closed by a matching one
	 * and no block comment is still hanging open
	 */
	public get isBalanced(): boolean {
		return !this.mismatched && this.expectedClosers.length === 0 && !this.inBlockComment;
	}

	/**
	 * True once a closing bracket turned up without a matching opener. Reading
	 * further lines can never repair this, so callers stop accumulating.
	 */
	public get isMismatched(): boolean {
		return this.mismatched;
	}

	/**
	 * Clears the bracket bookkeeping for the next expression. An unterminated
	 * block comment is deliberately kept: it belongs to whatever follows, not to
	 * the expression that just ended.
	 */
	public reset(): void {
		this.expectedClosers.length = 0;
		this.mismatched = false;
	}
}

/**
 * Blanks out every comment in `text`, keeping the character count intact.
 *
 * Block comments are valid JSONata and could be left alone, but removing them
 * here means a file made up of nothing but comments reduces to whitespace and
 * is correctly treated as having nothing to validate.
 */
export function stripComments(text: string): { text: string; lineComments: LineCommentLocation[] } {
	const scanner = new JsonataScanner();
	const lineComments: LineCommentLocation[] = [];

	const strippedLines = text.split('\n').map((line, lineIndex) => {
		const scan = scanner.scanLine(line);
		for (const character of scan.lineCommentColumns) {
			lineComments.push({ line: lineIndex, character, length: line.length - character });
		}
		return scan.code;
	});

	return { text: strippedLines.join('\n'), lineComments };
}

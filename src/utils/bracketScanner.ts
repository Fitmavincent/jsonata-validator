const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSING_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

/**
 * Tracks bracket nesting across the lines of a single expression.
 *
 * Feeding lines in one at a time keeps extraction linear in the size of the
 * document; re-checking the whole accumulated expression after every line makes
 * it quadratic, which is what a large .jsonata file used to pay on each
 * keystroke.
 */
export class BracketScanner {
	private readonly expectedClosers: string[] = [];
	private mismatched = false;

	/**
	 * Consumes one line of an expression. String literals cannot span lines in
	 * JSONata, so quote state deliberately does not carry over to the next call
	 * — an unterminated quote can no longer swallow the rest of the file.
	 */
	public scanLine(line: string): void {
		let quote: string | null = null;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (quote) {
				if (char === '\\') {
					i++; // Skip the escaped character
				} else if (char === quote) {
					quote = null;
				}
				continue;
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
	}

	/**
	 * True when every bracket opened so far has been closed by a matching one
	 */
	public get isBalanced(): boolean {
		return !this.mismatched && this.expectedClosers.length === 0;
	}

	public reset(): void {
		this.expectedClosers.length = 0;
		this.mismatched = false;
	}
}

/**
 * Check if a JSONata expression appears to be complete
 * This is a heuristic check for basic bracket/parentheses matching
 */
export function isCompleteExpression(expression: string): boolean {
	const scanner = new BracketScanner();
	for (const line of expression.split('\n')) {
		scanner.scanLine(line);
	}
	return scanner.isBalanced;
}

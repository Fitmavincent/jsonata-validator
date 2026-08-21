/**
 * A zero-based location within an expression
 */
export interface ExpressionPosition {
	line: number;
	character: number;
}

/**
 * The span of source text an error refers to, as zero-based offsets
 */
export interface ErrorOffsets {
	start: number;
	end: number;
}

/**
 * Converts an offset into the line and character it falls on.
 */
export function offsetToPosition(text: string, offset: number): ExpressionPosition {
	const clamped = Math.min(Math.max(offset, 0), text.length);
	const before = text.slice(0, clamped);
	const lastBreak = before.lastIndexOf('\n');

	return {
		line: before.split('\n').length - 1,
		character: clamped - (lastBreak + 1)
	};
}

/**
 * Finds the source span an evaluation or compilation error points at.
 *
 * JSONata reports `position` as the offset just *past* the offending token,
 * and for a function call it has already consumed the `(` that follows the
 * name. Reporting that offset verbatim underlines whatever happens to come
 * next - `model` in `$number(model.value)` - so walk back to the token the
 * user actually wrote.
 */
export function resolveErrorOffsets(expression: string, position: number, token?: string): ErrorOffsets {
	const end = Math.min(Math.max(position, 0), expression.length);

	// `(end)` means the parser ran out of input; there is no token to point at
	if (!token || token === '(end)') {
		return { start: Math.max(0, end - 1), end };
	}

	// A function invocation error names the function but points past its `(`
	const tokenEnd = token !== '(' && expression[end - 1] === '(' ? end - 1 : end;
	let start = tokenEnd - token.length;

	if (start < 0 || expression.slice(start, tokenEnd) !== token) {
		// The token does not line up - fall back to the reported offset
		return { start: Math.max(0, end - 1), end };
	}

	// Include the `$` that introduces a function or variable name
	if (expression[start - 1] === '$') {
		start -= 1;
	}

	return { start, end: tokenEnd };
}

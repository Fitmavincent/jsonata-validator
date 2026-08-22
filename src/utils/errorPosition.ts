/**
 * Converts an offset into the line and character it falls on.
 */
export function offsetToPosition(text: string, offset: number): { line: number; character: number } {
	const before = text.slice(0, Math.max(offset, 0));

	return {
		line: before.split('\n').length - 1,
		character: before.length - (before.lastIndexOf('\n') + 1)
	};
}

/**
 * Finds the source span an evaluation or compilation error points at.
 *
 * JSONata reports `position` as the offset just *past* the offending token,
 * and for a function call it has already consumed the `(` that follows the
 * name. Reporting that offset verbatim underlines whatever happens to come
 * next - `model` in `$number(model.value)` - so walk back to the token the
 * user actually wrote. The span is never empty, so it always highlights.
 */
export function resolveErrorOffsets(expression: string, position: number, token?: string): { start: number; end: number } {
	const end = Math.min(Math.max(position, 0), expression.length);

	// Nothing to point at: flag the character the parser stopped on
	const stoppedHere = { start: Math.max(0, end - 1), end: Math.max(end, 1) };

	// `(end)` means the parser ran out of input; there is no token to walk back to
	if (!token || token === '(end)') {
		return stoppedHere;
	}

	// A function invocation error names the function but points past its `(`
	const tokenEnd = token !== '(' && expression[end - 1] === '(' ? end - 1 : end;
	let start = tokenEnd - token.length;

	if (start < 0 || expression.slice(start, tokenEnd) !== token) {
		return stoppedHere;
	}

	// Include the `$` that introduces a function or variable name
	if (expression[start - 1] === '$') {
		start -= 1;
	}

	return { start, end: tokenEnd };
}

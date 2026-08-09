import jsonata from 'jsonata';

export type CompileResult =
	| { ok: true; expression: jsonata.Expression }
	| { ok: false; error: any };

const MAX_ENTRIES = 200;

/**
 * Compiled expressions keyed by source text, in insertion order so the oldest
 * entry can be evicted once the cache is full.
 */
const cache = new Map<string, CompileResult>();

/**
 * Compiles a JSONata expression, reusing the result for identical source text.
 *
 * Both validation and the playground recompile on every document change, and
 * most of those changes leave the majority of expressions in the file (or the
 * expression itself, when only the JSON input moved) byte-for-byte identical.
 * Compiled expressions are stateless as long as no functions are bound to them,
 * so they are safe to evaluate repeatedly.
 */
export function compileExpression(source: string): CompileResult {
	const cached = cache.get(source);
	if (cached) {
		// Refresh recency so hot expressions survive eviction
		cache.delete(source);
		cache.set(source, cached);
		return cached;
	}

	let result: CompileResult;
	try {
		result = { ok: true, expression: jsonata(source) };
	} catch (error) {
		result = { ok: false, error };
	}

	if (cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next();
		if (!oldest.done) {
			cache.delete(oldest.value);
		}
	}
	cache.set(source, result);

	return result;
}

/**
 * Drops every cached expression. Exposed for tests and extension teardown.
 */
export function clearExpressionCache(): void {
	cache.clear();
}

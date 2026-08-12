import * as assert from 'assert';
import jsonata from 'jsonata';
import { extractJsonataExpressionsFromPureJsonata } from '../validation/expressionExtractor';
import { stripComments } from '../utils/jsonataScanner';

/**
 * Mirrors what ValidationService does to a document: comments are blanked out,
 * then each extracted expression is compiled. Returns the expressions that
 * failed, which is exactly the set the user would see squiggles under.
 */
function failingExpressions(source: string): Array<{ line: number; message: string }> {
	const { text } = stripComments(source);
	const failures: Array<{ line: number; message: string }> = [];

	for (const extracted of extractJsonataExpressionsFromPureJsonata(text)) {
		if (!extracted.expression.trim()) {
			continue;
		}

		try {
			jsonata(extracted.expression);
		} catch (error: any) {
			failures.push({ line: extracted.line, message: error.message });
		}
	}

	return failures;
}

function assertNoFailures(source: string): void {
	const failures = failingExpressions(source);
	assert.deepStrictEqual(failures, [], `expected no errors, got ${JSON.stringify(failures)}`);
}

suite('Expression Extractor Test Suite', () => {

	// https://github.com/Fitmavincent/jsonata-validator/issues/1
	suite('comments are not reported as syntax errors', () => {
		test('block comment above an expression', () => {
			assertNoFailures('/*\n * Returns the active users\n */\n$.users[active = true].name');
		});

		test('block comment between two expressions', () => {
			assertNoFailures('$.a\n\n/* first\n   second\n   third */\n\n$.b');
		});

		test('block comment on the same line as the expression', () => {
			assertNoFailures('$.users /* pick them */ .name');
		});

		test('block comment opening mid-line and closing on a later line', () => {
			assertNoFailures('$.foo  /* note\n   spanning lines */ .bar');
		});

		test('block comment nested inside brackets', () => {
			assertNoFailures('$sum(\n  /* the values */\n  $.values\n)');
		});

		test('brackets and quotes inside a comment are ignored', () => {
			assertNoFailures("/* don't ) use ] this { */\n$.foo");
		});

		test('an unsupported // comment does not break the expression below it', () => {
			assertNoFailures('// a note\n$.foo');
		});

		test('an unsupported // comment does not break the expression beside it', () => {
			assertNoFailures('$.foo // a note');
		});
	});

	suite('expressions spanning lines without brackets', () => {
		test('continuation line starting with ~>', () => {
			assertNoFailures('$.foo\n  ~> $string()');
		});

		test('continuation line starting with +', () => {
			assertNoFailures('$.a\n+ $.b');
		});

		test('line ending on a trailing operator', () => {
			assertNoFailures('$.a &\n$.b');
		});

		test('continuation separated by a comment', () => {
			assertNoFailures('$.foo\n/* why */\n~> $string()');
		});
	});

	suite('real errors are still reported', () => {
		test('unclosed parenthesis', () => {
			assert.strictEqual(failingExpressions('$sum(unclosed').length, 1);
		});

		test('trailing comma in an object', () => {
			assert.strictEqual(failingExpressions('{\n  "a": 1,\n  "b": 2,\n}').length, 1);
		});

		test('error is located past a leading comment', () => {
			const failures = failingExpressions('/* explain */\n$.products[price > 100');

			assert.strictEqual(failures.length, 1);
			assert.strictEqual(failures[0].line, 1);
		});

		test('one bad expression among several good ones', () => {
			const failures = failingExpressions('$.firstName\n$.address.city\n$.invalid..syntax');

			assert.strictEqual(failures.length, 1);
			assert.strictEqual(failures[0].line, 2);
		});
	});

	suite('extraction boundaries', () => {
		test('a file of only comments yields nothing to validate', () => {
			const { text } = stripComments('/* just\n   notes */');

			assert.deepStrictEqual(extractJsonataExpressionsFromPureJsonata(text), []);
		});

		test('separate expressions are kept separate', () => {
			const extracted = extractJsonataExpressionsFromPureJsonata('$.a\n$.b\n$.c');

			assert.deepStrictEqual(extracted.map(e => e.line), [0, 1, 2]);
		});

		test('the start column skips leading whitespace and comments', () => {
			const { text } = stripComments('    /* c */ $.foo');
			const extracted = extractJsonataExpressionsFromPureJsonata(text);

			assert.strictEqual(extracted.length, 1);
			assert.strictEqual(extracted[0].startPos, 12);
			assert.strictEqual(extracted[0].expression.trimEnd(), '$.foo');
		});
	});
});

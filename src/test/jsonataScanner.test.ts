import * as assert from 'assert';
import { createScanState, isCompleteExpression, scanLine, stripComments } from '../utils/jsonataScanner';

suite('JSONata Scanner Test Suite', () => {

	suite('stripComments', () => {
		test('blanks a block comment while keeping every column in place', () => {
			const { text } = stripComments('$.a /* note */ .b');
			assert.strictEqual(text, '$.a            .b');
		});

		test('blanks a block comment spanning several lines', () => {
			const lines = stripComments('/*\n * heading\n */\n$.foo').text.split('\n');

			// Comments become spaces, so every column still matches the original
			assert.deepStrictEqual(lines.map(line => line.length), [2, 10, 3, 5]);
			assert.deepStrictEqual(lines.map(line => line.trim()), ['', '', '', '$.foo']);
		});

		test('leaves comment markers inside string literals alone', () => {
			const source = '$.foo["/* not a comment */"]';
			assert.strictEqual(stripComments(source).text, source);
		});

		test('reduces a file of nothing but comments to whitespace', () => {
			assert.strictEqual(stripComments('/* just\n   notes */').text.trim(), '');
		});

		test('reports the location of an unsupported // comment', () => {
			const { lineComments } = stripComments('$.foo // a note\n$.bar');

			assert.strictEqual(lineComments.length, 1);
			assert.deepStrictEqual(lineComments[0], { line: 0, character: 6, length: 9 });
		});

		test('does not mistake a URL inside a string for a // comment', () => {
			assert.strictEqual(stripComments('$.a & "http://example.com"').lineComments.length, 0);
		});

		test('does not report // that sits inside a block comment', () => {
			assert.strictEqual(stripComments('/* see http://x */ $.foo').lineComments.length, 0);
		});
	});

	suite('scanLine', () => {
		test('reports the first code column, skipping a leading comment', () => {
			assert.strictEqual(scanLine('  /* c */ $.foo', createScanState()).firstCodeColumn, 10);
		});

		test('reports no code for a line that is only a comment', () => {
			assert.strictEqual(scanLine('   /* c */   ', createScanState()).firstCodeColumn, -1);
		});

		test('carries an unterminated block comment to the next line', () => {
			const state = createScanState();

			scanLine('$.foo /* opening', state);
			assert.strictEqual(state.inBlockComment, true);

			scanLine('still comment */ .bar', state);
			assert.strictEqual(state.inBlockComment, false);
		});

		test('flags a closing bracket that has no opener', () => {
			const state = createScanState();
			scanLine('$.foo)', state);

			assert.strictEqual(state.mismatched, true);
		});
	});

	suite('isCompleteExpression', () => {
		const complete = [
			'$.foo',
			'$foo["a)b"]',          // bracket inside a double quoted string
			"$foo['a]b']",          // bracket inside a single quoted string
			'$."it\'s fine"',       // apostrophe inside a double quoted string
			'/* ( */ $.foo',        // bracket inside a comment
			'$sum([1, 2, 3])'
		];

		for (const expression of complete) {
			test(`treats ${JSON.stringify(expression)} as complete`, () => {
				assert.strictEqual(isCompleteExpression(expression), true);
			});
		}

		const incomplete = [
			'$sum(',
			'/* unterminated',
			'"unterminated',
			'$.foo)'
		];

		for (const expression of incomplete) {
			test(`treats ${JSON.stringify(expression)} as incomplete`, () => {
				assert.strictEqual(isCompleteExpression(expression), false);
			});
		}
	});
});

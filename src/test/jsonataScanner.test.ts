import * as assert from 'assert';
import { JsonataScanner, stripComments } from '../utils/jsonataScanner';

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

	suite('JsonataScanner', () => {
		test('reports the first code column, skipping a leading comment', () => {
			assert.strictEqual(new JsonataScanner().scanLine('  /* c */ $.foo').firstCodeColumn, 10);
		});

		test('reports no code for a line that is only a comment', () => {
			assert.strictEqual(new JsonataScanner().scanLine('   /* c */   ').firstCodeColumn, -1);
		});

		test('carries an unterminated block comment to the next line', () => {
			const scanner = new JsonataScanner();

			scanner.scanLine('$sum( /* opening');
			assert.strictEqual(scanner.isBalanced, false, 'the open comment leaves the line unbalanced');

			scanner.scanLine('still comment */ 1)');
			assert.strictEqual(scanner.isBalanced, true);
		});

		test('keeps an open block comment across a reset', () => {
			const scanner = new JsonataScanner();

			scanner.scanLine('$.foo /* opening');
			scanner.reset();

			// The comment belongs to whatever follows, not to the expression
			// that just ended, so this line is still comment text
			assert.strictEqual(scanner.scanLine('$.notCode').firstCodeColumn, -1);
		});

		test('ignores brackets written inside a comment', () => {
			const scanner = new JsonataScanner();
			scanner.scanLine('/* ( [ { */ $.foo');

			assert.strictEqual(scanner.isBalanced, true);
		});

		test('ignores brackets written inside a string literal', () => {
			const scanner = new JsonataScanner();
			scanner.scanLine('$foo["a)b"]');

			assert.strictEqual(scanner.isBalanced, true);
		});

		test('flags a closing bracket that has no opener', () => {
			const scanner = new JsonataScanner();
			scanner.scanLine('$.foo)');

			assert.strictEqual(scanner.isMismatched, true);
			assert.strictEqual(scanner.isBalanced, false);
		});

		test('reset clears the bracket bookkeeping', () => {
			const scanner = new JsonataScanner();

			scanner.scanLine('$sum(');
			assert.strictEqual(scanner.isBalanced, false);

			scanner.reset();
			assert.strictEqual(scanner.isBalanced, true);
		});
	});
});

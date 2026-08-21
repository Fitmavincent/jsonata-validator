import * as assert from 'assert';
import jsonata from 'jsonata';
import { offsetToPosition, resolveErrorOffsets } from '../utils/errorPosition';

/**
 * Runs an expression and hands back the JSONata error it throws
 */
async function captureError(expression: string, input: any): Promise<any> {
	try {
		await jsonata(expression).evaluate(input);
	} catch (error) {
		return error;
	}
	assert.fail(`Expected ${expression} to fail`);
}

suite('Error Position Test Suite', () => {

	suite('offsetToPosition', () => {
		test('reports the first line as line zero', () => {
			assert.deepStrictEqual(offsetToPosition('abc', 2), { line: 0, character: 2 });
		});

		test('counts line breaks and restarts the column', () => {
			assert.deepStrictEqual(offsetToPosition('a\nbc\nd', 5), { line: 2, character: 0 });
		});

		test('clamps an offset past the end of the text', () => {
			assert.deepStrictEqual(offsetToPosition('ab', 99), { line: 0, character: 2 });
		});
	});

	suite('resolveErrorOffsets', () => {
		test('walks back past the "(" of a failing function call', () => {
			// $number(a.b) reports position 8 - just past the "("
			assert.deepStrictEqual(resolveErrorOffsets('$number(a.b)', 8, 'number'), { start: 0, end: 7 });
		});

		test('covers an operator that ends at the reported position', () => {
			assert.deepStrictEqual(resolveErrorOffsets('a + b', 3, '+'), { start: 2, end: 3 });
		});

		test('falls back to a single character at the end of the input', () => {
			assert.deepStrictEqual(resolveErrorOffsets('a.b[', 4, '(end)'), { start: 3, end: 4 });
		});

		test('falls back when the token does not line up with the position', () => {
			assert.deepStrictEqual(resolveErrorOffsets('a + b', 3, 'nowhere'), { start: 2, end: 3 });
		});
	});

	suite('real JSONata errors', () => {
		test('points at $number rather than the argument that follows it', async () => {
			// The report in issue #6: a value the cast cannot handle
			const expression = '{\n    "value": $number(model.value)\n}';
			const error = await captureError(expression, { model: { value: '7.' } });

			assert.strictEqual(error.code, 'D3030');

			const offsets = resolveErrorOffsets(expression, error.position, error.token);
			assert.strictEqual(expression.slice(offsets.start, offsets.end), '$number');
			assert.deepStrictEqual(offsetToPosition(expression, offsets.start), { line: 1, character: 13 });
			assert.deepStrictEqual(offsetToPosition(expression, offsets.end), { line: 1, character: 20 });
		});

		test('points at the operator that received the wrong type', async () => {
			const expression = 'a + b';
			const error = await captureError(expression, { a: 'x', b: 1 });

			const offsets = resolveErrorOffsets(expression, error.position, error.token);
			assert.strictEqual(expression.slice(offsets.start, offsets.end), '+');
		});

		test('points at a compilation error inside the expression', () => {
			let error: any;
			try {
				jsonata('{ "x": 1, }');
			} catch (thrown) {
				error = thrown;
			}

			const offsets = resolveErrorOffsets('{ "x": 1, }', error.position, error.token);
			assert.strictEqual('{ "x": 1, }'.slice(offsets.start, offsets.end), '}');
		});
	});
});

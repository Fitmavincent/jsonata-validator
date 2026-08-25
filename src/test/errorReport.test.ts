import * as assert from 'assert';
import { ErrorDetails, formatErrorReport, ReportStyle } from '../playground/errorReport';

const SOURCES = { expression: 'example[value > 5].value', jsonInput: '{"a": 1}' };

function render(details: ErrorDetails, sources = SOURCES): string[] {
	return formatErrorReport(details, sources).text.split('\n');
}

/** The text a given style covers, across the whole report */
function styled(details: ErrorDetails, style: ReportStyle, sources = SOURCES): string[] {
	const report = formatErrorReport(details, sources);
	const lines = report.text.split('\n');
	return report.spans
		.filter(span => span.style === style)
		.map(span => lines[span.line].slice(span.start, span.end));
}

suite('Error Report Test Suite', () => {

	suite('headline', () => {
		test('names the phase and carries the code', () => {
			const lines = render({ type: 'compilation', code: 'S0201', message: 'Unexpected token' });
			assert.strictEqual(lines[0], 'compilation error [S0201]: Unexpected token');
		});

		test('runtime failures are labelled as such', () => {
			const lines = render({ type: 'runtime', code: 'T1006', message: 'Not a function' });
			assert.strictEqual(lines[0], 'runtime error [T1006]: Not a function');
		});

		test('a code-less failure drops the brackets rather than showing empty ones', () => {
			const lines = render({ type: 'json-parse', message: 'Invalid JSON input' });
			assert.strictEqual(lines[0], 'error: Invalid JSON input');
		});

		test('the phase and code are the part marked as the error', () => {
			assert.deepStrictEqual(
				styled({ type: 'compilation', code: 'S0201', message: 'Unexpected token' }, 'error'),
				['compilation error [S0201]']
			);
		});
	});

	suite('source frame', () => {
		const details: ErrorDetails = {
			type: 'compilation',
			code: 'S0201',
			message: 'Unexpected token',
			line: 0,
			character: 8,
			endLine: 0,
			endCharacter: 13
		};

		test('shows the offending line under its own number', () => {
			const lines = render(details);
			assert.ok(lines.includes('1 │ example[value > 5].value'), lines.join('\n'));
		});

		test('underlines exactly the reported span', () => {
			const lines = render(details);
			const caret = lines.find(line => line.includes('^'))!;

			// The carets must sit under "value", the span the error reported
			const source = lines.find(line => line.startsWith('1 │ '))!;
			assert.strictEqual(caret.indexOf('^'), source.indexOf('value'));
			assert.strictEqual(caret.slice(caret.indexOf('^')), '^'.repeat('value'.length));
		});

		test('reports a one-based line and column, matching the editor', () => {
			const lines = render(details);
			assert.ok(lines.some(line => line.includes('expression:1:9')), lines.join('\n'));
		});

		test('frames the input, not the expression, for a bad JSON document', () => {
			const lines = render(
				{ type: 'json-parse', message: 'Invalid JSON input', line: 1, character: 2 },
				{ expression: 'a.b', jsonInput: '{\n  "a" 1\n}' }
			);
			assert.ok(lines.some(line => line.includes('input:2:3')), lines.join('\n'));
			assert.ok(lines.includes('2 │   "a" 1'), lines.join('\n'));
		});

		test('keeps the gutter aligned when the line number is wider', () => {
			const expression = Array.from({ length: 12 }, (_, i) => `line${i}`).join('\n');
			const lines = render(
				{ type: 'runtime', message: 'Boom', line: 11, character: 0, endLine: 11, endCharacter: 4 },
				{ expression, jsonInput: '{}' }
			);

			const source = lines.find(line => line.startsWith('12 │'))!;
			const caret = lines.find(line => line.includes('^'))!;

			// The rails line up regardless of how many digits the number takes
			assert.strictEqual(source.indexOf('│'), caret.indexOf('│'));
		});

		test('is omitted when there is no position to point at', () => {
			const lines = render({ type: 'runtime', message: 'Boom' });
			assert.ok(!lines.some(line => line.includes('│')), lines.join('\n'));
		});
	});

	suite('long lines', () => {
		test('windows a wide line and keeps the caret over the right token', () => {
			const expression = `${'a'.repeat(200)}$number(x)`;
			const start = expression.indexOf('$number');
			const lines = render(
				{ type: 'runtime', message: 'Boom', line: 0, character: start, endLine: 0, endCharacter: start + 7 },
				{ expression, jsonInput: '{}' }
			);

			const source = lines.find(line => line.startsWith('1 │ '))!;
			const caret = lines.find(line => line.includes('^'))!;

			assert.ok(source.length < 120, `line was not windowed: ${source.length}`);
			assert.ok(source.includes('…'), 'a windowed line should show it was cut');
			assert.strictEqual(caret.indexOf('^'), source.indexOf('$number'));
		});
	});

	suite('help', () => {
		test('wraps a long suggestion instead of running off the panel', () => {
			const suggestion = 'The input value is not a valid number. '.repeat(4);
			const lines = render({ type: 'runtime', message: 'Boom', suggestion });

			const helpLines = lines.filter(line => line.trim().length > 0).slice(1);
			assert.ok(helpLines.length > 1, 'a long suggestion should wrap');
			assert.ok(helpLines.every(line => line.length <= 84), lines.join('\n'));
		});

		test('is left out entirely when there is nothing to suggest', () => {
			const lines = render({ type: 'runtime', message: 'Boom' });
			assert.ok(!lines.some(line => line.includes('help')), lines.join('\n'));
		});
	});

	test('every span lands inside the line it points at', () => {
		const report = formatErrorReport({
			type: 'runtime',
			code: 'D3030',
			message: 'Unable to cast value to a number',
			line: 0,
			character: 8,
			endLine: 0,
			endCharacter: 13,
			suggestion: 'Check the JSON input, or guard the cast with $exists().'
		}, SOURCES);

		const lines = report.text.split('\n');
		for (const span of report.spans) {
			assert.ok(span.line < lines.length, `span past end of report: line ${span.line}`);
			assert.ok(span.start < span.end, 'a span must cover something');
			assert.ok(
				span.end <= lines[span.line].length,
				`span ${span.start}-${span.end} overruns "${lines[span.line]}"`
			);
		}
	});
});

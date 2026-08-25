/**
 * Renders a JSONata failure as a source-framed report, in the shape compilers
 * have settled on: what went wrong, where, and the line itself with the
 * offending span underlined. The point is that the reader can see the mistake
 * without going back to the expression to hunt for it.
 */

export interface ErrorDetails {
    message: string;
    code?: string;
    position?: number;
    token?: string;
    value?: string;
    /** Start of the offending source span, zero-based */
    line?: number;
    character?: number;
    /** End of the offending source span, zero-based and exclusive */
    endLine?: number;
    endCharacter?: number;
    type: 'compilation' | 'runtime' | 'json-parse';
    suggestion?: string;
}

/** The two things a report can point at */
export interface ReportSources {
    expression: string;
    jsonInput: string;
}

/** How a span should read, resolved to real colours by the decorator */
export type ReportStyle = 'error' | 'muted' | 'location' | 'hint';

/** A zero-based span within the rendered report */
export interface ReportSpan {
    line: number;
    start: number;
    end: number;
    style: ReportStyle;
}

export interface ErrorReport {
    text: string;
    spans: ReportSpan[];
}

/** Report text wraps here, comfortably inside a half-width panel */
const WRAP_COLUMNS = 84;

/** A source line longer than this is windowed around the error */
const MAX_SOURCE_WIDTH = 92;

/** Builds the report line by line, recording spans as it goes */
class ReportBuilder {
    private readonly lines: string[] = [];
    private readonly spans: ReportSpan[] = [];

    /** Appends a line, optionally styling a slice of it */
    public push(text: string, style?: ReportStyle, start = 0, end = text.length): void {
        if (style && end > start) {
            this.spans.push({ line: this.lines.length, start, end, style });
        }
        this.lines.push(text);
    }

    /** Appends a line already carrying its own spans, offset into place */
    public pushStyled(text: string, spans: Omit<ReportSpan, 'line'>[]): void {
        for (const span of spans) {
            if (span.end > span.start) {
                this.spans.push({ ...span, line: this.lines.length });
            }
        }
        this.lines.push(text);
    }

    public blank(): void {
        this.lines.push('');
    }

    public build(): ErrorReport {
        return { text: this.lines.join('\n'), spans: this.spans };
    }
}

/**
 * Splits text into lines that fit the wrap width, breaking on spaces where it
 * can and mid-word only when a single word is longer than the whole width.
 */
function wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let current = '';

    for (const word of text.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= width) {
            current = candidate;
            continue;
        }

        if (current) {
            lines.push(current);
        }

        // A single word wider than the line has to be broken somewhere
        let rest = word;
        while (rest.length > width) {
            lines.push(rest.slice(0, width));
            rest = rest.slice(width);
        }
        current = rest;
    }

    if (current) {
        lines.push(current);
    }

    return lines.length > 0 ? lines : [''];
}

/**
 * Narrows an over-long source line to a window around the offending span, so
 * the caret stays on screen instead of scrolling off to the right.
 */
function windowSourceLine(
    source: string,
    start: number,
    end: number
): { text: string; start: number; end: number } {
    if (source.length <= MAX_SOURCE_WIDTH) {
        return { text: source, start, end };
    }

    const ellipsis = '…';
    const spanWidth = Math.max(1, end - start);
    const room = MAX_SOURCE_WIDTH - Math.min(spanWidth, MAX_SOURCE_WIDTH);
    const lead = Math.max(0, start - Math.floor(room / 2));

    const from = Math.min(lead, Math.max(0, source.length - MAX_SOURCE_WIDTH));
    const to = Math.min(source.length, from + MAX_SOURCE_WIDTH);

    const prefix = from > 0 ? ellipsis : '';
    const suffix = to < source.length ? ellipsis : '';
    const offset = prefix.length - from;

    return {
        text: prefix + source.slice(from, to) + suffix,
        start: Math.max(prefix.length, start + offset),
        end: Math.max(prefix.length + 1, Math.min(prefix.length + (to - from), end + offset))
    };
}

/** "compilation error", "runtime error", or plain "error" for bad input JSON */
function headline(details: ErrorDetails): string {
    switch (details.type) {
        case 'compilation':
            return 'compilation error';
        case 'runtime':
            return 'runtime error';
        default:
            return 'error';
    }
}

/** Which source a failure of this kind points into, and what to call it */
function frameLabel(details: ErrorDetails): 'expression' | 'input' {
    return details.type === 'json-parse' ? 'input' : 'expression';
}

/**
 * Renders the failure. Always returns something readable: the source frame is
 * dropped when there is no position to point at, rather than faked.
 */
export function formatErrorReport(details: ErrorDetails, sources: ReportSources): ErrorReport {
    const report = new ReportBuilder();

    // ── Headline: "runtime error [D3030]: Unable to cast value to a number" ──
    const label = headline(details);
    const code = details.code ? ` [${details.code}]` : '';
    const prefix = `${label}${code}`;
    const headlineSpans: Omit<ReportSpan, 'line'>[] = [
        { start: 0, end: prefix.length, style: 'error' }
    ];

    const messageLines = wrap(details.message, WRAP_COLUMNS - prefix.length - 2);
    report.pushStyled(`${prefix}: ${messageLines[0]}`, headlineSpans);
    for (const line of messageLines.slice(1)) {
        report.push(' '.repeat(prefix.length + 2) + line);
    }

    const source = frameLabel(details) === 'input' ? sources.jsonInput : sources.expression;
    const hasFrame = details.line !== undefined && details.character !== undefined;

    if (hasFrame) {
        const lineIndex = details.line!;
        const sourceLines = source.split('\n');
        const rawLine = sourceLines[lineIndex] ?? '';

        // The span may run to the next line; the frame only shows the first
        const spanEnd = details.endLine === lineIndex && details.endCharacter !== undefined
            ? details.endCharacter
            : rawLine.length;

        const windowed = windowSourceLine(
            rawLine,
            details.character!,
            Math.max(details.character! + 1, spanEnd)
        );

        const lineNumber = String(lineIndex + 1);
        const gutter = ' '.repeat(lineNumber.length);
        const location = `${frameLabel(details)}:${lineNumber}:${details.character! + 1}`;

        report.blank();

        // ┌─ expression:1:19
        const openRail = `${gutter} ┌─ `;
        report.pushStyled(`${openRail}${location}`, [
            { start: 0, end: openRail.length, style: 'muted' },
            { start: openRail.length, end: openRail.length + location.length, style: 'location' }
        ]);

        report.push(`${gutter} │`, 'muted');

        // 1 │ example[value > 5.value
        const sourcePrefix = `${lineNumber} │ `;
        report.pushStyled(`${sourcePrefix}${windowed.text}`, [
            { start: 0, end: sourcePrefix.length, style: 'muted' }
        ]);

        //   │                   ^^^^^
        const caretPrefix = `${gutter} │ `;
        const caretPad = ' '.repeat(windowed.start);
        const carets = '^'.repeat(Math.max(1, windowed.end - windowed.start));
        report.pushStyled(`${caretPrefix}${caretPad}${carets}`, [
            { start: 0, end: caretPrefix.length, style: 'muted' },
            {
                start: caretPrefix.length + caretPad.length,
                end: caretPrefix.length + caretPad.length + carets.length,
                style: 'error'
            }
        ]);

        if (details.suggestion) {
            report.push(`${gutter} │`, 'muted');
        }
    }

    if (details.suggestion) {
        if (!hasFrame) {
            // Without a frame the help would otherwise crowd the headline
            report.blank();
        }

        // A single-space gutter matches the framed layout, whose narrowest
        // gutter is one line-number digit wide
        const gutter = hasFrame ? ' '.repeat(String(details.line! + 1).length) : ' ';
        const marker = `${gutter} = help: `;
        const continuation = ' '.repeat(marker.length);
        const wrapped = wrap(details.suggestion, WRAP_COLUMNS - marker.length);

        report.pushStyled(`${marker}${wrapped[0]}`, [
            { start: 0, end: gutter.length + 3, style: 'muted' },
            { start: gutter.length + 3, end: marker.length - 1, style: 'hint' }
        ]);
        for (const line of wrapped.slice(1)) {
            report.push(continuation + line);
        }
    }

    return report.build();
}

import * as vscode from 'vscode';
import { ErrorReport, ReportSpan, ReportStyle } from './errorReport';

/** Scheme for the playground's result document */
export const RESULT_SCHEME = 'jsonata-result';

/**
 * The path ends in `.json` so VS Code resolves the JSON language, and with it
 * folding, bracket matching, the outline and the rest of the editor features
 * a hand-rolled webview cannot offer.
 */
const RESULT_URI = vscode.Uri.parse(`${RESULT_SCHEME}:/JSONata Result.json`);

/** Shown before the first evaluation lands, and whenever there is nothing to show */
const EMPTY_RESULT = 'null';

/**
 * An error report is not JSON, so it gets a language of its own. Leaving it as
 * `json` would bury the report under parse squiggles of the editor's own making.
 */
const ERROR_LANGUAGE = 'jsonata-result';
const RESULT_LANGUAGE = 'json';

/**
 * Resolved against the active colour theme rather than hard-coded, so the
 * report reads correctly in light, dark and high-contrast alike.
 */
const STYLE_COLORS: Record<ReportStyle, string> = {
    error: 'editorError.foreground',
    muted: 'descriptionForeground',
    location: 'textLink.foreground',
    hint: 'editorInfo.foreground'
};

/**
 * Backs the playground's result panel with a virtual document.
 *
 * Documents served by a TextDocumentContentProvider are read-only in VS Code,
 * so the output cannot be edited into something that never came out of the
 * expression, while still behaving like a real editor in every other way.
 */
export class PlaygroundResultDocument implements vscode.TextDocumentContentProvider {
    private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this.changeEmitter.event;

    private content = EMPTY_RESULT;
    private language = RESULT_LANGUAGE;
    private spans: ReportSpan[] = [];

    private readonly decorations = new Map<ReportStyle, vscode.TextEditorDecorationType>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            vscode.workspace.registerTextDocumentContentProvider(RESULT_SCHEME, this)
        );

        for (const [style, color] of Object.entries(STYLE_COLORS) as [ReportStyle, string][]) {
            this.decorations.set(style, vscode.window.createTextEditorDecorationType({
                color: new vscode.ThemeColor(color),
                fontWeight: style === 'error' ? 'bold' : undefined
            }));
        }

        // Decorations are per-editor and are lost when the panel is hidden or
        // the content is replaced, so they are re-applied on both
        this.disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(() => this.applyDecorations()),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() === RESULT_URI.toString()) {
                    this.applyDecorations();
                }
            })
        );
    }

    public get uri(): vscode.Uri {
        return RESULT_URI;
    }

    /** The text currently displayed, which is what "copy result" hands out */
    public get text(): string {
        return this.content;
    }

    public provideTextDocumentContent(): string {
        return this.content;
    }

    /** Shows evaluated output: pretty-printed JSON, in the JSON language */
    public setResult(json: string): void {
        this.publish(json.trim().length > 0 ? json : EMPTY_RESULT, RESULT_LANGUAGE, []);
    }

    /** Shows a failure as a source-framed report rather than as output */
    public setError(report: ErrorReport): void {
        this.publish(report.text, ERROR_LANGUAGE, report.spans);
    }

    private publish(content: string, language: string, spans: ReportSpan[]): void {
        const languageChanged = language !== this.language;
        const contentChanged = content !== this.content;

        this.spans = spans;
        this.content = content;
        this.language = language;

        if (contentChanged) {
            // VS Code re-reads the content on this event, which preserves the
            // reader's folds and scroll position far better than replacing the
            // whole editor would
            this.changeEmitter.fire(RESULT_URI);
        }

        if (languageChanged) {
            this.applyLanguage();
        }

        this.applyDecorations();
    }

    /** Re-associates the open document with the language the current state needs */
    private applyLanguage(): void {
        const document = vscode.workspace.textDocuments.find(
            candidate => candidate.uri.toString() === RESULT_URI.toString()
        );

        if (!document || document.languageId === this.language) {
            return;
        }

        Promise.resolve(vscode.languages.setTextDocumentLanguage(document, this.language)).then(
            () => this.applyDecorations(),
            error => console.warn('Error setting playground result language:', error)
        );
    }

    private applyDecorations(): void {
        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri.toString() === RESULT_URI.toString()
        );

        if (editors.length === 0) {
            return;
        }

        for (const [style, decoration] of this.decorations) {
            const ranges = this.spans
                .filter(span => span.style === style)
                .map(span => new vscode.Range(span.line, span.start, span.line, span.end));

            for (const editor of editors) {
                editor.setDecorations(decoration, ranges);
            }
        }
    }

    /** Opens the result document, without stealing focus from the editor being typed in */
    public async show(viewColumn: vscode.ViewColumn): Promise<vscode.TextEditor> {
        const document = await vscode.workspace.openTextDocument(RESULT_URI);

        // VS Code caches document content per URI, and the URI is a constant, so
        // a playground opened after an earlier one would otherwise start out
        // showing the previous session's output until the next evaluation
        this.changeEmitter.fire(RESULT_URI);
        this.applyLanguage();

        const editor = await vscode.window.showTextDocument(document, {
            viewColumn,
            preserveFocus: true,
            preview: false
        });

        this.applyDecorations();
        return editor;
    }

    public dispose(): void {
        this.decorations.forEach(decoration => decoration.dispose());
        this.decorations.clear();

        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;

        this.changeEmitter.dispose();
    }
}

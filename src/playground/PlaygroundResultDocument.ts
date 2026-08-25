import * as vscode from 'vscode';

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
    private readonly registration: vscode.Disposable;

    constructor() {
        this.registration = vscode.workspace.registerTextDocumentContentProvider(RESULT_SCHEME, this);
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

    /**
     * Replaces the document body. VS Code re-reads the content on the change
     * event, which preserves the reader's folds and scroll position far better
     * than replacing the whole editor would.
     */
    public setContent(content: string): void {
        const next = content.trim().length > 0 ? content : EMPTY_RESULT;
        if (this.content === next) {
            return;
        }

        this.content = next;
        this.changeEmitter.fire(RESULT_URI);
    }

    /** Opens the result document, without stealing focus from the editor being typed in */
    public async show(viewColumn: vscode.ViewColumn): Promise<vscode.TextEditor> {
        const document = await vscode.workspace.openTextDocument(RESULT_URI);

        // VS Code caches document content per URI, and the URI is a constant, so
        // a playground opened after an earlier one would otherwise start out
        // showing the previous session's output until the next evaluation
        this.changeEmitter.fire(RESULT_URI);

        return vscode.window.showTextDocument(document, {
            viewColumn,
            preserveFocus: true,
            preview: false
        });
    }

    public dispose(): void {
        this.registration.dispose();
        this.changeEmitter.dispose();
    }
}

import * as vscode from 'vscode';

/**
 * Manages editor documents for the JSONata playground
 */
export class PlaygroundEditorManager {
    private jsonInputDocument: vscode.TextDocument | undefined;
    private jsonataExpressionDocument: vscode.TextDocument | undefined;
    private disposables: vscode.Disposable[] = [];
    private onJsonInputChangeCallback?: (content: string) => void;
    private onJsonataExpressionChangeCallback?: (content: string) => void;

    constructor() {
        this.setupDocumentChangeListeners();
    }

    private setupDocumentChangeListeners(): void {
        // Listen for document changes
        const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            if (this.jsonInputDocument && event.document === this.jsonInputDocument) {
                if (this.onJsonInputChangeCallback) {
                    this.onJsonInputChangeCallback(event.document.getText());
                }
            } else if (this.jsonataExpressionDocument && event.document === this.jsonataExpressionDocument) {
                if (this.onJsonataExpressionChangeCallback) {
                    this.onJsonataExpressionChangeCallback(event.document.getText());
                }
            }
        });

        this.disposables.push(changeDisposable);
    }

    /**
     * Opens the playground's own JSON input editor. The column is the caller's
     * to choose, so the whole layout is decided in one place.
     */
    public async createJsonInputEditor(
        initialContent: string,
        viewColumn: vscode.ViewColumn
    ): Promise<vscode.TextEditor> {
        // Create a new untitled JSON document
        this.jsonInputDocument = await vscode.workspace.openTextDocument({
            content: initialContent,
            language: 'json'
        });

        const editor = await vscode.window.showTextDocument(this.jsonInputDocument, {
            viewColumn,
            preserveFocus: true,
            preview: false // Ensure it opens as a proper tab
        });

        return editor;
    }

    /** Opens the playground's own expression editor, in the given column */
    public async createJsonataExpressionEditor(
        initialContent: string,
        viewColumn: vscode.ViewColumn
    ): Promise<vscode.TextEditor> {
        // Create a new untitled JSONata document
        this.jsonataExpressionDocument = await vscode.workspace.openTextDocument({
            content: initialContent,
            language: 'jsonata'
        });

        const editor = await vscode.window.showTextDocument(this.jsonataExpressionDocument, {
            viewColumn,
            preserveFocus: false,
            preview: false // Ensure it opens as a proper tab
        });

        return editor;
    }

    /** The playground's own JSON editor, while it is still open */
    public get inputDocument(): vscode.TextDocument | undefined {
        return this.jsonInputDocument;
    }

    /** The playground's own expression editor, while it is still open */
    public get expressionDocument(): vscode.TextDocument | undefined {
        return this.jsonataExpressionDocument;
    }

    public setOnJsonInputChange(callback: (content: string) => void): void {
        this.onJsonInputChangeCallback = callback;
    }

    public setOnJsonataExpressionChange(callback: (content: string) => void): void {
        this.onJsonataExpressionChangeCallback = callback;
    }

    public async updateJsonInputContent(content: string): Promise<void> {
        if (this.jsonInputDocument) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === this.jsonInputDocument);
            if (editor) {
                await editor.edit(editBuilder => {
                    const fullRange = new vscode.Range(
                        this.jsonInputDocument!.positionAt(0),
                        this.jsonInputDocument!.positionAt(this.jsonInputDocument!.getText().length)
                    );
                    editBuilder.replace(fullRange, content);
                });
            }
        }
    }

    public async updateJsonataExpressionContent(content: string): Promise<void> {
        if (this.jsonataExpressionDocument) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === this.jsonataExpressionDocument);
            if (editor) {
                await editor.edit(editBuilder => {
                    const fullRange = new vscode.Range(
                        this.jsonataExpressionDocument!.positionAt(0),
                        this.jsonataExpressionDocument!.positionAt(this.jsonataExpressionDocument!.getText().length)
                    );
                    editBuilder.replace(fullRange, content);
                });
            }
        }
    }



    public dispose(): void {
        // Close the tabs by identity rather than by focusing each document and
        // closing whatever is active, which stole focus and could close a tab
        // the playground does not own
        const owned = new Set(
            [this.jsonInputDocument, this.jsonataExpressionDocument]
                .filter((document): document is vscode.TextDocument => document !== undefined)
                .map(document => document.uri.toString())
        );

        const tabs = vscode.window.tabGroups.all.flatMap(group =>
            group.tabs.filter(tab =>
                tab.input instanceof vscode.TabInputText &&
                owned.has(tab.input.uri.toString())
            )
        );

        if (tabs.length > 0) {
            Promise.resolve(vscode.window.tabGroups.close(tabs)).then(undefined, error => {
                console.warn('Error closing playground editors:', error);
            });
        }

        // Dispose of event listeners
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Clear references
        this.jsonInputDocument = undefined;
        this.jsonataExpressionDocument = undefined;
        this.onJsonInputChangeCallback = undefined;
        this.onJsonataExpressionChangeCallback = undefined;
    }
}

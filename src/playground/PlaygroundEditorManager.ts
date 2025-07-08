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

    constructor(private context: vscode.ExtensionContext) {
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

    public async createJsonInputEditor(initialContent: string): Promise<vscode.TextEditor> {
        // Create a new untitled JSON document
        this.jsonInputDocument = await vscode.workspace.openTextDocument({
            content: initialContent,
            language: 'json'
        });

        // Open the document in the editor (Column 1 - left side)
        const editor = await vscode.window.showTextDocument(this.jsonInputDocument, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
            preview: false // Ensure it opens as a proper tab
        });

        return editor;
    }

    public async createJsonataExpressionEditor(initialContent: string): Promise<vscode.TextEditor> {
        // Create a new untitled JSONata document
        this.jsonataExpressionDocument = await vscode.workspace.openTextDocument({
            content: initialContent,
            language: 'jsonata'
        });

        // Open the document in the editor (Column 2 - top right)
        const editor = await vscode.window.showTextDocument(this.jsonataExpressionDocument, {
            viewColumn: vscode.ViewColumn.Two,
            preserveFocus: false,
            preview: false // Ensure it opens as a proper tab
        });

        return editor;
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

    public getJsonInputContent(): string {
        return this.jsonInputDocument?.getText() || '';
    }

    public getJsonataExpressionContent(): string {
        return this.jsonataExpressionDocument?.getText() || '';
    }

    public dispose(): void {
        // Close the documents by closing their tabs
        const closePromises: Promise<any>[] = [];

        if (this.jsonInputDocument) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === this.jsonInputDocument);
            if (editor) {
                const closePromise = Promise.resolve(vscode.window.showTextDocument(editor.document)).then(() => {
                    return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                });
                closePromises.push(closePromise);
            }
        }

        if (this.jsonataExpressionDocument) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === this.jsonataExpressionDocument);
            if (editor) {
                const closePromise = Promise.resolve(vscode.window.showTextDocument(editor.document)).then(() => {
                    return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                });
                closePromises.push(closePromise);
            }
        }

        // Wait for all close operations to complete
        Promise.all(closePromises).catch(error => {
            console.warn('Error closing playground editors:', error);
        });

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

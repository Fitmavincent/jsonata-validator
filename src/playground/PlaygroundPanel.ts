import * as vscode from 'vscode';
import {
    PlaygroundSession,
    PlaygroundSourceKind,
    PlaygroundState,
    DEFAULT_JSON_INPUT,
    DEFAULT_JSONATA_EXPRESSION
} from './PlaygroundSession';
import { PlaygroundEditorManager } from './PlaygroundEditorManager';
import { PlaygroundResultDocument, RESULT_SCHEME } from './PlaygroundResultDocument';
import { SOURCES_CONTAINER_FOCUS } from './playgroundViews';

/**
 * The three panels, in the arrangement the playground opens with: the input on
 * the left, and the result above the expression that produces it on the right.
 */
const INPUT_COLUMN = vscode.ViewColumn.One;
const RESULT_COLUMN = vscode.ViewColumn.Two;
const EXPRESSION_COLUMN = vscode.ViewColumn.Three;

/**
 * Owns the three panels of the JSONata playground: the JSON input editor, the
 * expression editor, and the read-only result document they feed.
 */
export class PlaygroundPanel {
    private readonly resultDocument = new PlaygroundResultDocument();
    private readonly session: PlaygroundSession;
    private readonly editorManager: PlaygroundEditorManager;
    private readonly disposeEmitter = new vscode.EventEmitter<void>();
    private disposables: vscode.Disposable[] = [];
    private jsonInputEditor: vscode.TextEditor | undefined;
    private jsonataExpressionEditor: vscode.TextEditor | undefined;
    private disposed = false;

    constructor(
        private context: vscode.ExtensionContext,
        private onShareCallback?: () => Promise<void>,
        private onImportCallback?: () => Promise<void>
    ) {
        this.editorManager = new PlaygroundEditorManager();
        this.session = new PlaygroundSession(this.resultDocument, this.context);
        this.session.setOwnSourceReaders(
            () => this.editorManager.inputDocument,
            () => this.editorManager.expressionDocument
        );

        this.setupEventHandlers();
        this.initializePlayground();
    }

    private async initializePlayground(): Promise<void> {
        try {
            // Establish the grid up front so each panel can be opened straight
            // into its final group, rather than split into place afterwards
            await this.applyLayout();

            // Bring the source bar out so it is on screen with the panels
            // rather than waiting to be found. It runs before the editors open,
            // and the expression editor takes focus after it, so the caret
            // still ends up where the playground is driven from.
            await this.revealSourcesView();

            // Opened in layout order, and the expression last, so the caret ends
            // up in the editor the playground is actually driven from
            this.jsonInputEditor = await this.editorManager.createJsonInputEditor(
                DEFAULT_JSON_INPUT,
                INPUT_COLUMN
            );
            await this.resultDocument.show(RESULT_COLUMN);
            this.jsonataExpressionEditor = await this.editorManager.createJsonataExpressionEditor(
                DEFAULT_JSONATA_EXPRESSION,
                EXPRESSION_COLUMN
            );
            this.watchForResultTabClose();

            this.editorManager.setOnJsonInputChange((content) => {
                this.session.updateJsonInput(content);
            });

            this.editorManager.setOnJsonataExpressionChange((content) => {
                this.session.updateJsonataExpression(content);
            });

            this.setupShareImportCallbacks();

            // The session evaluated the defaults when it was constructed; this
            // picks up whatever else the user already had open
            this.session.updateAvailableEditors();
        } catch (error) {
            console.error('Failed to initialize playground:', error);
            vscode.window.showErrorMessage('Failed to initialize JSONata playground');
        }
    }

    /**
     * Lays the editor area out as input on the left, with the result above the
     * expression on the right. Setting the grid explicitly keeps the columns
     * stable, so ViewColumn.Three is reliably the bottom-right panel.
     */
    private async applyLayout(): Promise<void> {
        await vscode.commands.executeCommand('vscode.setEditorLayout', {
            orientation: 0, // Top-level groups sit side by side
            groups: [
                { size: 0.4 },
                { groups: [{ size: 0.5 }, { size: 0.5 }], size: 0.6 }
            ]
        });
    }

    /**
     * Opens the panel the two source dropdowns live in. Never fatal: the
     * playground is still usable if the panel refuses to open.
     */
    private async revealSourcesView(): Promise<void> {
        try {
            await vscode.commands.executeCommand(SOURCES_CONTAINER_FOCUS);
        } catch (error) {
            console.warn('Error revealing the playground sources view:', error);
        }
    }

    /**
     * Sets up the share and import callbacks for the session
     */
    private setupShareImportCallbacks(): void {
        if (this.onShareCallback) {
            this.session.setOnShareCallback(this.onShareCallback);
        }
        if (this.onImportCallback) {
            this.session.setOnImportCallback(this.onImportCallback);
        }
    }

    private setupEventHandlers(): void {
        // Re-evaluate when the reader comes back to the result panel, so a
        // change made while it was hidden is never left showing stale output
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor?.document.uri.scheme === RESULT_SCHEME) {
                    this.session.refresh();
                }
            })
        );
    }

    /**
     * Closing the result panel closes the playground, which is the role the
     * webview panel's own disposal used to play. Armed only once the tab is
     * open, since before that "no result tab" is the normal state.
     */
    private watchForResultTabClose(): void {
        this.disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(() => {
                if (!this.disposed && !this.isResultTabOpen()) {
                    this.dispose();
                }
            })
        );
    }

    private closeResultTab(): void {
        const resultUri = this.resultDocument.uri.toString();
        const tabs = vscode.window.tabGroups.all.flatMap(group =>
            group.tabs.filter(tab =>
                tab.input instanceof vscode.TabInputText &&
                tab.input.uri.toString() === resultUri
            )
        );

        if (tabs.length > 0) {
            Promise.resolve(vscode.window.tabGroups.close(tabs)).then(undefined, error => {
                console.warn('Error closing playground result tab:', error);
            });
        }
    }

    private isResultTabOpen(): boolean {
        const resultUri = this.resultDocument.uri.toString();
        return vscode.window.tabGroups.all.some(group =>
            group.tabs.some(tab =>
                tab.input instanceof vscode.TabInputText &&
                tab.input.uri.toString() === resultUri
            )
        );
    }

    /**
     * The current evaluation state, used when exporting a session
     */
    public get currentState(): PlaygroundState {
        return this.session.currentState;
    }

    /**
     * Brings the playground's panels back into view
     */
    public reveal(): void {
        this.resultDocument.show(RESULT_COLUMN).then(undefined, error => {
            console.warn('Error revealing playground result panel:', error);
        });
    }

    /** Re-reads every source and evaluates again */
    public refresh(): void {
        this.session.refresh();
    }

    /** Asks which open editors should feed the input and the expression */
    public async pickSources(): Promise<void> {
        await this.session.pickSources();
    }

    /** Asks which open editor should feed one of the two sources */
    public async pickSource(kind: PlaygroundSourceKind): Promise<void> {
        await this.session.pickSource(kind);
    }

    /** Points one source at an open editor, which is what the dropdowns do */
    public selectSource(kind: PlaygroundSourceKind, editorId: string | null): void {
        this.session.selectSource(kind, editorId);
    }

    /** Fires when either source, or the list of editors to choose from, changes */
    public get onDidChangeSources(): vscode.Event<void> {
        return this.session.onDidChangeSources;
    }

    /** Copies the current result to the clipboard */
    public async copyResult(): Promise<void> {
        await this.session.copyResultToClipboard();
    }

    /**
     * Disposes the playground and cleans up resources
     */
    public dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        this.session.dispose();
        this.editorManager.dispose();
        this.closeResultTab();
        this.resultDocument.dispose();

        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }

        this.disposeEmitter.fire();
        this.disposeEmitter.dispose();
    }

    /**
     * Returns a disposable that fires when the playground is disposed
     */
    public onDidDispose(listener: () => void): vscode.Disposable {
        return this.disposeEmitter.event(listener);
    }

    /**
     * Sets the JSONata expression in the playground
     */
    public async setJsonataExpression(expression: string): Promise<void> {
        if (this.jsonataExpressionEditor) {
            await this.editorManager.updateJsonataExpressionContent(expression);
        } else {
            // Store for when editor is ready
            this.session.setJsonataExpression(expression);
        }
    }

    /**
     * Sets the JSON input data in the playground
     */
    public async setJsonInput(jsonData: string): Promise<void> {
        if (this.jsonInputEditor) {
            await this.editorManager.updateJsonInputContent(jsonData);
        } else {
            // Store for when editor is ready
            this.session.setJsonInput(jsonData);
        }
    }

    /**
     * Populates the playground with content from the currently active editor
     */
    public async populateFromActiveEditor(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const content = activeEditor.document.getText();
            const language = activeEditor.document.languageId;

            if (language === 'json') {
                await this.setJsonInput(content);
                vscode.window.showInformationMessage('JSON content loaded as input data');
            } else if (language === 'jsonata') {
                await this.setJsonataExpression(content);
                vscode.window.showInformationMessage('JSONata expression loaded');
            } else {
                // For other file types, try to use as JSON input if it's valid JSON
                try {
                    JSON.parse(content);
                    await this.setJsonInput(content);
                    vscode.window.showInformationMessage('Content loaded as JSON input data');
                } catch {
                    // If not valid JSON, use as JSONata expression
                    await this.setJsonataExpression(content);
                    vscode.window.showInformationMessage('Content loaded as JSONata expression');
                }
            }
        }
    }
}

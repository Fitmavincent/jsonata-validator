import * as vscode from 'vscode';
import { Debouncer } from '../utils/debounce';
import { compileExpression } from '../utils/expressionCache';
import { offsetToPosition, resolveErrorOffsets } from '../utils/errorPosition';
import { PlaygroundResultDocument, RESULT_SCHEME } from './PlaygroundResultDocument';
import { ErrorDetails, formatErrorReport } from './errorReport';

/** Content the playground starts with, and falls back to when a source closes */
export const DEFAULT_JSON_INPUT = '{\n  "example": [\n    {"value": 4},\n    {"value": 7},\n    {"value": 13}\n  ]\n}';
export const DEFAULT_JSONATA_EXPRESSION = 'example[value > 5].value';

/** How long input has to settle before the expression is re-evaluated */
const EVALUATION_DEBOUNCE_MS = 200;

/** How long tab churn has to settle before the editor list is rebuilt */
const EDITOR_LIST_DEBOUNCE_MS = 100;

export interface PlaygroundState {
    jsonInput: string;
    jsonataExpression: string;
    result: string;
    error: string | null;
    errorDetails: ErrorDetails | null;
    availableEditors: EditorInfo[];
    selectedJsonInputEditor: string | null;
    selectedTemplateEditor: string | null;
}

export interface EditorInfo {
    id: string;
    fileName: string;
    language: string;
    isDirty: boolean;
}

/** Which of the playground's two inputs a source selection applies to */
export type PlaygroundSourceKind = 'input' | 'template';

/** Titles on the source pickers, and the labels the status bar reads them by */
const SOURCE_TITLES: Record<PlaygroundSourceKind, string> = {
    input: 'JSON input source',
    template: 'JSONata expression source'
};

/**
 * The language a tab is most likely in, for tabs whose document is not loaded
 * yet and so cannot be asked. Replaced by the real language id the moment the
 * document opens.
 */
function languageFromFileName(path: string): string {
    const name = path.split('/').pop() ?? path;
    const extension = name.includes('.') ? name.split('.').pop() : undefined;
    return extension || 'text';
}

/**
 * Digs the offending position out of a JSON.parse message so the report can
 * frame the input the same way it frames an expression. V8 has carried the
 * byte offset for years and added "(line L column C)" more recently, so both
 * spellings are read, newest first.
 */
function locateJsonParseError(
    message: string,
    jsonInput: string
): { line: number; character: number } | undefined {
    const lineColumn = /line (\d+) column (\d+)/.exec(message);
    if (lineColumn) {
        return { line: Number(lineColumn[1]) - 1, character: Number(lineColumn[2]) - 1 };
    }

    const position = /at position (\d+)/.exec(message);
    if (position) {
        return offsetToPosition(jsonInput, Number(position[1]));
    }

    return undefined;
}

/**
 * Evaluates the playground expression and publishes the outcome to the
 * read-only result document.
 */
export class PlaygroundSession {
    private state: PlaygroundState = {
        jsonInput: DEFAULT_JSON_INPUT,
        jsonataExpression: DEFAULT_JSONATA_EXPRESSION,
        result: '',
        error: null,
        errorDetails: null,
        availableEditors: [],
        selectedJsonInputEditor: null,
        selectedTemplateEditor: null
    };
    private disposables: vscode.Disposable[] = [];
    private playgroundDiagnosticCollection: vscode.DiagnosticCollection;
    private readonly evaluationDebouncer = new Debouncer(EVALUATION_DEBOUNCE_MS);
    private readonly editorListDebouncer = new Debouncer(EDITOR_LIST_DEBOUNCE_MS);

    // Incremented per evaluation so a slow run cannot overwrite a newer result
    private evaluationGeneration = 0;

    // Last values written to workspace state, to avoid redundant writes
    private persistedSelection = '';

    // Callbacks for share/import functionality
    private onShareCallback?: () => Promise<void>;
    private onImportCallback?: () => Promise<void>;

    // The playground's own two editors, used whenever a source selection falls
    // back to them - either by choice or because an external tab closed
    private ownJsonInput?: () => vscode.TextDocument | undefined;
    private ownExpression?: () => vscode.TextDocument | undefined;

    private readonly sourcesChangeEmitter = new vscode.EventEmitter<void>();

    /** Fires when a selection, or the list of editors to choose from, changes */
    public readonly onDidChangeSources = this.sourcesChangeEmitter.event;

    constructor(
        private readonly resultDocument: PlaygroundResultDocument,
        private context: vscode.ExtensionContext
    ) {
        this.playgroundDiagnosticCollection = vscode.languages.createDiagnosticCollection('jsonata-playground');

        // Initialize state first, then set up listeners
        this.initializeState();
        this.setupDocumentChangeListeners();
        this.evaluateExpression();
    }

    /**
     * Initializes the playground state, restoring from context state if available
     */
    private initializeState(): void {
        // Try to restore state from context
        const savedState = this.context.workspaceState.get<Partial<PlaygroundState>>('playgroundState');
        if (savedState && savedState.selectedJsonInputEditor !== undefined) {
            // Restore saved state but keep current default values for content
            this.state = {
                ...this.state,
                selectedJsonInputEditor: savedState.selectedJsonInputEditor ?? null,
                selectedTemplateEditor: savedState.selectedTemplateEditor ?? null
            };

            // Validate that selected editors are still available and update content
            this.updateAvailableEditors();
            this.validateSelectedEditors();

            // Pull the content of whichever editors survived
            this.state.jsonInput = this.readJsonInputSource();
            this.state.jsonataExpression = this.readTemplateSource();
        } else {
            // Initialize with fresh state
            this.updateAvailableEditors();
        }
    }

    /**
     * Gets the current playground state
     */
    public get currentState(): PlaygroundState {
        return this.state;
    }

    /**
     * Re-reads every source and evaluates again. Backs the Refresh action, and
     * runs whenever the result panel is brought back into view.
     */
    public refresh(): void {
        this.updateAvailableEditors();
        this.validateSelectedEditors();

        this.state.jsonInput = this.readJsonInputSource();
        this.state.jsonataExpression = this.readTemplateSource();

        this.evaluateExpression();
    }

    /**
     * Asks which open editor should feed one of the two inputs, and resolves to
     * false when the picker is dismissed.
     */
    public async pickSource(kind: PlaygroundSourceKind): Promise<boolean> {
        this.updateAvailableEditors();

        const choice = await this.pickEditor(SOURCE_TITLES[kind], this.selectionFor(kind));
        if (choice === undefined) {
            return false; // Cancelled
        }

        this.selectSource(kind, choice);
        return true;
    }

    /** Walks both sources in turn, which is what one Select Sources action does */
    public async pickSources(): Promise<void> {
        if (await this.pickSource('input')) {
            await this.pickSource('template');
        }
    }

    private selectionFor(kind: PlaygroundSourceKind): string | null {
        return kind === 'input'
            ? this.state.selectedJsonInputEditor
            : this.state.selectedTemplateEditor;
    }

    /**
     * Resolves to the chosen editor id, null for the playground's own editor,
     * or undefined when the picker is dismissed.
     */
    private async pickEditor(
        title: string,
        current: string | null
    ): Promise<string | null | undefined> {
        // `picked` only renders in a multi-select picker, so the current source
        // is called out in the description instead of being left invisible
        const describe = (id: string | null, description: string) =>
            id === current ? `${description} • current` : description;

        const items: (vscode.QuickPickItem & { id: string | null })[] = [
            {
                id: null,
                label: '$(edit) Playground editor',
                description: describe(null, 'Use the panel the playground opened')
            },
            ...this.state.availableEditors.map(editor => ({
                id: editor.id,
                label: `$(file) ${editor.fileName}`,
                description: describe(
                    editor.id,
                    editor.isDirty ? `${editor.language} • unsaved` : editor.language
                )
            }))
        ];

        const choice = await vscode.window.showQuickPick(items, {
            title,
            placeHolder: 'Pick the editor to read from'
        });

        return choice ? choice.id : undefined;
    }

    /**
     * Registers the playground's own two editors. Their text backs every source
     * that is not pointed at a file, and their URIs are kept out of the picker,
     * so "Playground editor" is the only way those two are named.
     */
    public setOwnSourceReaders(
        jsonInput: () => vscode.TextDocument | undefined,
        expression: () => vscode.TextDocument | undefined
    ): void {
        this.ownJsonInput = jsonInput;
        this.ownExpression = expression;
    }

    /**
     * Sets the callback for share session functionality
     */
    public setOnShareCallback(callback: () => Promise<void>): void {
        this.onShareCallback = callback;
    }

    /**
     * Sets the callback for import session functionality
     */
    public setOnImportCallback(callback: () => Promise<void>): void {
        this.onImportCallback = callback;
    }

    /**
     * Handles a share request from the result panel
     */
    private async handleShareSession(): Promise<void> {
        if (this.onShareCallback) {
            await this.onShareCallback();
        } else {
            vscode.window.showErrorMessage('Share functionality is not available.');
        }
    }

    /**
     * Handles an import request from the result panel
     */
    private async handleImportSession(): Promise<void> {
        if (this.onImportCallback) {
            await this.onImportCallback();
        } else {
            vscode.window.showErrorMessage('Import functionality is not available.');
        }
    }

    /**
     * Updates the JSON input and triggers evaluation
     */
    public updateJsonInput(jsonData: string): void {
        if (this.state.jsonInput === jsonData) {
            return;
        }

        // Clear diagnostics when JSON input changes (in case it affects runtime errors)
        this.clearTemplateDiagnostics();

        this.state.jsonInput = jsonData;
        this.scheduleEvaluation();
    }

    /**
     * Updates the JSONata expression and triggers evaluation
     */
    public updateJsonataExpression(expression: string): void {
        if (this.state.jsonataExpression === expression) {
            return;
        }

        // Clear diagnostics when the expression changes
        this.clearTemplateDiagnostics();

        this.state.jsonataExpression = expression;
        this.scheduleEvaluation();
    }

    /**
     * Sets the JSONata expression (legacy method for compatibility)
     */
    public setJsonataExpression(expression: string): void {
        this.updateJsonataExpression(expression);
    }

    /**
     * Sets the JSON input data (legacy method for compatibility)
     */
    public setJsonInput(jsonData: string): void {
        this.updateJsonInput(jsonData);
    }

    /**
     * Queues an evaluation, collapsing bursts of edits into a single run
     */
    private scheduleEvaluation(): void {
        this.evaluationDebouncer.schedule(() => this.evaluateExpression());
    }

    /**
     * Copies the current result to the clipboard
     */
    public async copyResultToClipboard(): Promise<void> {
        if (this.state.error) {
            vscode.window.showWarningMessage('There is no result to copy - the expression did not evaluate.');
            return;
        }

        try {
            await vscode.env.clipboard.writeText(this.resultDocument.text);
            vscode.window.setStatusBarMessage('JSONata result copied to clipboard', 3000);
        } catch (error) {
            console.error('Failed to copy result to clipboard:', error);
            vscode.window.showErrorMessage('Failed to copy the JSONata result.');
        }
    }

    /**
     * Disposes resources
     */
    public dispose(): void {
        // Clear saved state on disposal
        this.context.workspaceState.update('playgroundState', undefined);

        // Drop pending work so nothing runs against a disposed panel
        this.evaluationDebouncer.dispose();
        this.editorListDebouncer.dispose();

        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
        this.playgroundDiagnosticCollection.dispose();
        this.sourcesChangeEmitter.dispose();
    }

    /**
     * Updates the list of available editors
     */
    public updateAvailableEditors(): void {
        const editors = this.getOpenEditors();

        // Tab events fire far more often than the list actually changes, and
        // rebuilding the dropdowns resets the user's selection mid-interaction.
        // The entries are plain data built at one site, so key order is stable.
        if (JSON.stringify(editors) === JSON.stringify(this.state.availableEditors)) {
            return;
        }

        this.state.availableEditors = editors;
        this.sourcesChangeEmitter.fire();
    }

    /**
     * Points one of the two sources at an open editor, or back at the
     * playground's own editor when given null.
     */
    public selectSource(kind: PlaygroundSourceKind, editorId: string | null): void {
        // The squiggle belongs to the expression that was showing, so it goes
        // whichever source moved: a new input can resolve a runtime error too
        this.clearTemplateDiagnostics();

        if (kind === 'input') {
            this.state.selectedJsonInputEditor = editorId;
            this.state.jsonInput = this.readJsonInputSource();
        } else {
            this.state.selectedTemplateEditor = editorId;
            this.state.jsonataExpression = this.readTemplateSource();
        }

        this.sourcesChangeEmitter.fire();
        this.evaluateExpression();

        if (editorId) {
            this.openUnloadedSource(editorId);
        }
    }

    /**
     * Loads the document behind a tab that has not been opened yet, so a source
     * pointed at one reads its real content instead of silently falling back to
     * the playground's own editor. A no-op once the document is loaded.
     */
    private openUnloadedSource(editorId: string): void {
        if (this.getEditorContent(editorId) !== null) {
            return;
        }

        Promise.resolve(vscode.workspace.openTextDocument(vscode.Uri.parse(editorId))).then(
            () => this.refresh(),
            error => console.warn('Error opening a playground source document:', error)
        );
    }

    /**
     * The JSON input as it stands now: the selected external editor, else the
     * playground's own editor, else the starting content.
     */
    private readJsonInputSource(): string {
        const selected = this.state.selectedJsonInputEditor;
        if (selected) {
            const content = this.getEditorContent(selected);
            if (content !== null) {
                return content;
            }
        }
        return this.ownJsonInput?.()?.getText() ?? DEFAULT_JSON_INPUT;
    }

    /** The expression as it stands now, resolved the same way as the input */
    private readTemplateSource(): string {
        const selected = this.state.selectedTemplateEditor;
        if (selected) {
            const content = this.getEditorContent(selected);
            if (content !== null) {
                return content;
            }
        }
        return this.ownExpression?.()?.getText() ?? DEFAULT_JSONATA_EXPRESSION;
    }

    private async evaluateExpression(): Promise<void> {
        // Evaluation is asynchronous, so a long-running expression can still be
        // in flight when the next edit arrives. Only the newest run may publish.
        const generation = ++this.evaluationGeneration;

        try {
            // Reset error state and clear diagnostics
            this.state.error = null;
            this.state.errorDetails = null;
            this.clearTemplateDiagnostics();

            // Parse JSON input
            let jsonData: any;
            try {
                jsonData = JSON.parse(this.state.jsonInput);
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                const errorMessage = `Invalid JSON input: ${detail}`;
                this.state.error = errorMessage;
                this.state.errorDetails = {
                    message: errorMessage,
                    type: 'json-parse',
                    ...locateJsonParseError(detail, this.state.jsonInput)
                };
                this.state.result = '';
                this.publishState();
                return;
            }

            // Compile JSONata expression (reusing the previous compile when the
            // expression is unchanged and only the JSON input moved)
            const compiled = compileExpression(this.state.jsonataExpression);
            if (!compiled.ok) {
                // Enhanced error handling for compilation errors
                const errorDetails = this.createDetailedErrorInfo(compiled.error, 'compilation');
                this.state.error = this.formatErrorMessage(errorDetails);
                this.state.errorDetails = errorDetails;
                this.state.result = '';

                // Create diagnostics for the template editor
                this.createTemplateDiagnostics(errorDetails);

                this.publishState();
                return;
            }

            // Evaluate expression
            try {
                const result = await compiled.expression.evaluate(jsonData);
                if (generation !== this.evaluationGeneration) {
                    return; // Superseded by a newer edit
                }
                // JSONata yields undefined when nothing matched, which
                // JSON.stringify maps to the value undefined rather than text
                this.state.result = result === undefined ? 'null' : JSON.stringify(result, null, 2);
            } catch (error: any) {
                if (generation !== this.evaluationGeneration) {
                    return; // Superseded by a newer edit
                }

                // Enhanced error handling for runtime errors
                const errorDetails = this.createDetailedErrorInfo(error, 'runtime');
                this.state.error = this.formatErrorMessage(errorDetails);
                this.state.errorDetails = errorDetails;
                this.state.result = '';

                // Create diagnostics for the template editor
                this.createTemplateDiagnostics(errorDetails);
            }
        } catch (error) {
            const errorMessage = `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.state.error = errorMessage;
            this.state.errorDetails = {
                message: errorMessage,
                type: 'runtime'
            };
            this.state.result = '';
        }

        this.publishState();
    }

    /**
     * Creates detailed error information from JSONata errors
     */
    private createDetailedErrorInfo(error: any, type: 'compilation' | 'runtime'): ErrorDetails {
        const errorDetails: ErrorDetails = {
            message: error.message || 'Unknown error',
            type: type
        };

        // Add JSONata-specific error details
        if (error.code) {
            errorDetails.code = error.code;
        }

        if (error.token) {
            errorDetails.token = error.token;
        }

        // `value` is the expected token for compilation errors, and the value
        // that tripped the evaluation up - of any type - for runtime ones
        if (error.value !== undefined) {
            errorDetails.value = typeof error.value === 'string'
                ? error.value
                : JSON.stringify(error.value);
        }

        if (error.position !== undefined) {
            errorDetails.position = error.position;

            const expression = this.state.jsonataExpression;
            const offsets = resolveErrorOffsets(expression, error.position, errorDetails.token);
            const start = offsetToPosition(expression, offsets.start);
            const end = offsetToPosition(expression, offsets.end);

            errorDetails.line = start.line;
            errorDetails.character = start.character;
            errorDetails.endLine = end.line;
            errorDetails.endCharacter = end.character;
        }

        // Add helpful suggestion
        const suggestion = this.getErrorSuggestion(errorDetails);
        if (suggestion) {
            errorDetails.suggestion = suggestion;
        }

        return errorDetails;
    }

    /**
     * Formats error message for display
     */
    private formatErrorMessage(errorDetails: ErrorDetails): string {
        let message = errorDetails.message;

        if (errorDetails.code) {
            message = `[${errorDetails.code}] ${message}`;
        }

        if (errorDetails.line !== undefined && errorDetails.character !== undefined) {
            message += ` at line ${errorDetails.line + 1}, character ${errorDetails.character + 1}`;
        } else if (errorDetails.position !== undefined) {
            message += ` at position ${errorDetails.position}`;
        }

        // Add helpful suggestions for common errors
        if (errorDetails.suggestion) {
            message += `\n\n💡 Suggestion: ${errorDetails.suggestion}`;
        }

        return `JSONata ${errorDetails.type} error: ${message}`;
    }

    /**
     * Creates diagnostics for JSONata template errors and applies them to the appropriate editor
     */
    private createTemplateDiagnostics(errorDetails: ErrorDetails): void {
        // Clear any existing diagnostics first
        this.clearTemplateDiagnostics();

        if (!errorDetails || errorDetails.line === undefined || errorDetails.character === undefined) {
            return;
        }

        // Create a diagnostic from the error details
        const diagnostic = this.createDiagnosticFromError(errorDetails);
        if (!diagnostic) {
            return;
        }

        // Apply the diagnostic to the appropriate editor
        let targetUri: vscode.Uri | null = null;

        // Check if we're using an external template editor
        if (this.state.selectedTemplateEditor) {
            // Find the document for the selected template editor
            const document = vscode.workspace.textDocuments.find(doc =>
                doc.uri.toString() === this.state.selectedTemplateEditor
            );
            if (document) {
                targetUri = document.uri;
            }
        } else {
            // Use the internal playground editor - find by content match and language
            const playgroundEditor = vscode.window.visibleTextEditors.find(editor => {
                return editor.document.languageId === 'jsonata' &&
                       editor.document.isUntitled &&
                       editor.document.getText().trim() === this.state.jsonataExpression.trim();
            });

            if (playgroundEditor) {
                targetUri = playgroundEditor.document.uri;
            } else {
                // Fallback: try to find any untitled JSONata editor
                const anyJsonataEditor = vscode.window.visibleTextEditors.find(editor =>
                    editor.document.languageId === 'jsonata' && editor.document.isUntitled
                );
                if (anyJsonataEditor) {
                    targetUri = anyJsonataEditor.document.uri;
                }
            }
        }

        if (targetUri) {
            this.playgroundDiagnosticCollection.set(targetUri, [diagnostic]);
            // Note: We no longer force cursor movement to the error location
            // This allows users to continue editing without cursor interference
            // while still showing error highlights via the diagnostic system
        }
    }

    /**
     * Clears template diagnostics from all editors
     */
    private clearTemplateDiagnostics(): void {
        this.playgroundDiagnosticCollection.clear();
    }

    /**
     * Creates a VS Code diagnostic from error details
     */
    private createDiagnosticFromError(errorDetails: ErrorDetails): vscode.Diagnostic | null {
        if (errorDetails.line === undefined || errorDetails.character === undefined ||
            errorDetails.endLine === undefined || errorDetails.endCharacter === undefined) {
            return null;
        }

        // Highlight the span the error points at, which createDetailedErrorInfo
        // has already walked back from JSONata's past-the-token offset
        const range = new vscode.Range(
            new vscode.Position(errorDetails.line, errorDetails.character),
            new vscode.Position(errorDetails.endLine, errorDetails.endCharacter)
        );

        // Create the diagnostic message
        let message = errorDetails.message;
        if (errorDetails.code) {
            message = `[${errorDetails.code}] ${message}`;
        }

        const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error
        );

        diagnostic.source = 'jsonata-playground';

        if (errorDetails.code) {
            diagnostic.code = errorDetails.code;
        }

        // Add related information if we have suggestions
        if (errorDetails.suggestion) {
            diagnostic.relatedInformation = [
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(vscode.Uri.parse(''), range),
                    `💡 Suggestion: ${errorDetails.suggestion}`
                )
            ];
        }

        return diagnostic;
    }
    private getErrorSuggestion(errorDetails: ErrorDetails): string | null {
        const code = errorDetails.code;
        const token = errorDetails.token;
        const message = errorDetails.message?.toLowerCase() || '';

        // Common error patterns and suggestions
        if (code === 'D3030') {
            const value = errorDetails.value !== undefined ? ` '${errorDetails.value}'` : '';
            return `The input value${value} is not a valid number. Check the JSON input, or guard the cast with $exists()/$match() before calling $number().`;
        }

        if (code === 'T1006') {
            return `'${token ?? 'The name'}' is not a function. Check the spelling, or use $$ to reach the top-level input if you meant a field.`;
        }

        if (code === 'S0211' && token === '.') {
            return 'The dot operator cannot be used as a unary operator. Check for missing parentheses or operators before the dot.';
        }

        if (code === 'S0201' || message.includes('unexpected token')) {
            if (token === '(') {
                return 'Check for missing closing parenthesis ")" or incorrect function syntax.';
            }
            if (token === '[') {
                return 'Check for missing closing bracket "]" or incorrect array notation.';
            }
            if (token === '{') {
                return 'Check for missing closing brace "}" or incorrect object construction.';
            }
        }

        if (code === 'S0301') {
            return 'Check for empty regular expression patterns. Use proper regex syntax between forward slashes.';
        }

        if (message.includes('trailing comma') || token === ',') {
            return 'Remove the trailing comma. JSONata does not allow trailing commas in object or array literals.';
        }

        if (message.includes('undefined')) {
            return 'Check that all variables and functions are properly defined and spelled correctly.';
        }

        if (message.includes('function') && message.includes('not found')) {
            return 'Verify the function name is correct. Common functions include $count(), $sum(), $map(), $filter(), etc.';
        }

        return null;
    }

    private publishState(): void {
        // Persist the editor selection, but only when it actually changed;
        // workspace state is backed by storage and this runs on every edit
        const selection = JSON.stringify([
            this.state.selectedJsonInputEditor,
            this.state.selectedTemplateEditor
        ]);
        if (selection !== this.persistedSelection) {
            this.persistedSelection = selection;
            this.context.workspaceState.update('playgroundState', {
                selectedJsonInputEditor: this.state.selectedJsonInputEditor,
                selectedTemplateEditor: this.state.selectedTemplateEditor
            });
        }

        if (this.state.errorDetails) {
            this.resultDocument.setError(formatErrorReport(this.state.errorDetails, {
                expression: this.state.jsonataExpression,
                jsonInput: this.state.jsonInput
            }));
        } else {
            this.resultDocument.setResult(this.state.result);
        }
    }


    /**
     * Gets the list of currently open editor tabs
     */
    private getOpenEditors(): EditorInfo[] {
        // Index the open documents once instead of scanning them per tab
        const documentsByUri = new Map<string, vscode.TextDocument>();
        for (const document of vscode.workspace.textDocuments) {
            documentsByUri.set(document.uri.toString(), document);
        }

        // Keyed by URI so a file open in several tab groups is listed once
        const openEditors = new Map<string, EditorInfo>();

        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                // Only include text document tabs
                if (!(tab.input instanceof vscode.TabInputText)) {
                    continue;
                }

                // Every other open tab is fair game, but the playground's own
                // output is not: feeding a result back in as its own input
                // would have it re-evaluate itself for as long as it changed
                if (tab.input.uri.scheme === RESULT_SCHEME) {
                    continue;
                }

                const uri = tab.input.uri.toString();
                if (openEditors.has(uri)) {
                    continue;
                }

                openEditors.set(uri, this.describeTab(tab, tab.input.uri, documentsByUri.get(uri)));
            }
        }

        // Fallback: If tabGroups API doesn't return expected results, use visible editors
        if (openEditors.size === 0) {
            for (const editor of vscode.window.visibleTextEditors) {
                const document = editor.document;
                if (document.uri.scheme === RESULT_SCHEME) {
                    continue;
                }

                const uri = document.uri.toString();

                openEditors.set(uri, {
                    id: uri,
                    fileName: document.isUntitled
                        ? `Untitled-${document.languageId}`
                        : this.getDisplayName(document),
                    language: document.languageId,
                    isDirty: document.isDirty
                });
            }
        }

        // Sort by filename for better organization
        return [...openEditors.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
    }

    /**
     * Describes one open tab for the source list.
     *
     * A tab does not imply a loaded document: VS Code restores tabs lazily and
     * only materialises the document when something asks for it. Dropping those
     * tabs would leave files the user can plainly see open missing from the
     * list, so the tab's own label and dirty flag stand in until it is opened,
     * and the language is read off the file name in the meantime.
     */
    private describeTab(
        tab: vscode.Tab,
        uri: vscode.Uri,
        document: vscode.TextDocument | undefined
    ): EditorInfo {
        if (!document) {
            return {
                id: uri.toString(),
                fileName: tab.label || this.getDisplayPath(uri.fsPath),
                language: languageFromFileName(uri.path),
                isDirty: tab.isDirty
            };
        }

        return {
            id: uri.toString(),
            // For untitled documents, prefer the tab's own label
            fileName: document.isUntitled
                ? (tab.label || `Untitled-${document.languageId}`)
                : this.getDisplayName(document),
            language: document.languageId,
            isDirty: document.isDirty
        };
    }

    /**
     * Workspace-relative path for a saved document, or its bare file name when
     * it lives outside the workspace
     */
    private getDisplayName(document: vscode.TextDocument): string {
        return this.getDisplayPath(document.fileName);
    }

    private getDisplayPath(fileName: string): string {
        const relativePath = vscode.workspace.asRelativePath(fileName);
        if (relativePath !== fileName) {
            return relativePath;
        }
        return fileName.split(/[/\\]/).pop() || relativePath;
    }

    /**
     * Gets the content of a specific editor by ID
     */
    private getEditorContent(editorId: string): string | null {
        // First try to find the document in workspace
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === editorId);
        if (document) {
            return document.getText();
        }

        // Fallback: try visible editors
        const visibleEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === editorId);
        if (visibleEditor) {
            return visibleEditor.document.getText();
        }

        return null;
    }

    /**
     * Sets up listeners for document changes to update live evaluation
     */
    private setupDocumentChangeListeners(): void {
        const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            // Check if the changed document is one of our selected editors
            const documentUri = event.document.uri.toString();

            if (this.state.selectedJsonInputEditor === documentUri) {
                this.state.jsonInput = event.document.getText();
                this.scheduleEvaluation();
            } else if (this.state.selectedTemplateEditor === documentUri) {
                this.state.jsonataExpression = event.document.getText();
                this.scheduleEvaluation();
            }
        });
        this.disposables.push(changeDisposable);

        // Listen for when documents are saved (in case content changes)
        const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
            const documentUri = document.uri.toString();

            if (this.state.selectedJsonInputEditor === documentUri) {
                this.state.jsonInput = document.getText();
            } else if (this.state.selectedTemplateEditor === documentUri) {
                this.state.jsonataExpression = document.getText();
            } else {
                return;
            }

            // Saving supersedes anything the debouncer is still holding
            this.evaluationDebouncer.cancel();
            this.evaluateExpression();
        });
        this.disposables.push(saveDisposable);

        // Listen for tab changes to update available editors
        const tabChangeDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
            this.scheduleEditorListRefresh();
        });
        this.disposables.push(tabChangeDisposable);

        // Listen for when documents are closed
        const closeDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
            const documentUri = document.uri.toString();
            let selectionCleared = false;

            // If a selected editor was closed, reset the selection
            if (this.state.selectedJsonInputEditor === documentUri) {
                this.state.selectedJsonInputEditor = null;
                this.state.jsonInput = this.readJsonInputSource();
                selectionCleared = true;
            }

            if (this.state.selectedTemplateEditor === documentUri) {
                this.state.selectedTemplateEditor = null;
                this.state.jsonataExpression = this.readTemplateSource();
                selectionCleared = true;
            }

            if (selectionCleared) {
                this.sourcesChangeEmitter.fire();
                this.scheduleEvaluation();
            }

            // Update available editors list
            this.scheduleEditorListRefresh();
        });
        this.disposables.push(closeDisposable);

        // Listen for when text documents are opened (to catch new editors)
        const openDisposable = vscode.workspace.onDidOpenTextDocument(() => {
            this.scheduleEditorListRefresh();
        });
        this.disposables.push(openDisposable);
    }

    /**
     * Rebuilds the editor list once the current burst of tab activity settles.
     * Opening a folder or restoring a session fires one event per file.
     */
    private scheduleEditorListRefresh(): void {
        this.editorListDebouncer.schedule(() => {
            this.updateAvailableEditors();
            this.validateSelectedEditors();
        });
    }

    /**
     * Validates that selected editors are still available and resets if not
     */
    private validateSelectedEditors(): void {
        const availableEditorIds = new Set(this.state.availableEditors.map(e => e.id));
        let stateChanged = false;

        if (this.state.selectedJsonInputEditor && !availableEditorIds.has(this.state.selectedJsonInputEditor)) {
            this.state.selectedJsonInputEditor = null;
            this.state.jsonInput = this.readJsonInputSource();
            stateChanged = true;
        }

        if (this.state.selectedTemplateEditor && !availableEditorIds.has(this.state.selectedTemplateEditor)) {
            this.state.selectedTemplateEditor = null;
            this.state.jsonataExpression = this.readTemplateSource();
            stateChanged = true;
        }

        // If state changed, re-evaluate and republish
        if (stateChanged) {
            this.sourcesChangeEmitter.fire();
            this.evaluateExpression();
        }
    }
}
import * as vscode from 'vscode';
import jsonata from 'jsonata';
import { ValidationService } from '../validation/ValidationService';

interface PlaygroundState {
    jsonInput: string;
    jsonataExpression: string;
    result: string;
    error: string | null;
    errorDetails: ErrorDetails | null;
    availableEditors: EditorInfo[];
    selectedJsonInputEditor: string | null;
    selectedTemplateEditor: string | null;
}

interface ErrorDetails {
    message: string;
    code?: string;
    position?: number;
    token?: string;
    value?: string;
    line?: number;
    character?: number;
    type: 'compilation' | 'runtime' | 'json-parse';
    suggestion?: string;
}

interface EditorInfo {
    id: string;
    fileName: string;
    language: string;
    isDirty: boolean;
}

interface WebviewMessage {
    type: string;
    data?: any;
}

/**
 * Manages the webview content and communication for the JSONata playground
 */
export class PlaygroundWebviewManager {
    private state: PlaygroundState = {
        jsonInput: '{\n  "example": [\n    {"value": 4},\n    {"value": 7},\n    {"value": 13}\n  ]\n}',
        jsonataExpression: 'example[value > 5].value',
        result: '',
        error: null,
        errorDetails: null,
        availableEditors: [],
        selectedJsonInputEditor: null,
        selectedTemplateEditor: null
    };
    private disposables: vscode.Disposable[] = [];
    private playgroundDiagnosticCollection: vscode.DiagnosticCollection;

    // Callbacks for share/import functionality
    private onShareCallback?: () => Promise<void>;
    private onImportCallback?: () => Promise<void>;

    constructor(
        private webview: vscode.Webview,
        private context: vscode.ExtensionContext,
        private validationService?: ValidationService
    ) {
        this.playgroundDiagnosticCollection = vscode.languages.createDiagnosticCollection('jsonata-playground');
        this.evaluateExpression();
        this.setupDocumentChangeListeners();
    }

    /**
     * Updates the webview HTML content
     */
    public updateWebviewContent(): void {
        this.webview.html = this.getWebviewContent();
    }

    /**
     * Gets the current playground state
     */
    public get currentState(): PlaygroundState {
        return this.state;
    }

    /**
     * Handles messages from the webview (now only for results panel)
     */
    public handleMessage(message: WebviewMessage): void {
        switch (message.type) {
            case 'requestState':
                this.sendStateToWebview();
                break;
            case 'selectJsonInputEditor':
                this.selectJsonInputEditor(message.data.editorId);
                break;
            case 'selectTemplateEditor':
                this.selectTemplateEditor(message.data.editorId);
                break;
            case 'refreshEditors':
                this.updateAvailableEditors();
                break;
            case 'copyResult':
                this.copyResultToClipboard();
                break;
            case 'getJsonataExpression':
                this.sendJsonataExpressionToWebview();
                break;
            case 'shareSession':
                this.handleShareSession();
                break;
            case 'importSession':
                this.handleImportSession();
                break;
        }
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
     * Handles share session request from webview
     */
    private async handleShareSession(): Promise<void> {
        if (this.onShareCallback) {
            await this.onShareCallback();
        } else {
            vscode.window.showErrorMessage('Share functionality is not available.');
        }
    }

    /**
     * Handles import session request from webview
     */
    private async handleImportSession(): Promise<void> {
        if (this.onImportCallback) {
            await this.onImportCallback();
        } else {
            vscode.window.showErrorMessage('Import functionality is not available.');
        }
    }

    /**
     * Sends the current JSONata expression to the webview for error highlighting
     */
    private sendJsonataExpressionToWebview(): void {
        this.webview.postMessage({
            type: 'jsonataExpression',
            data: {
                expression: this.state.jsonataExpression,
                errorDetails: this.state.errorDetails
            }
        });
    }

    /**
     * Called when the panel becomes visible
     */
    public onPanelVisible(): void {
        this.sendStateToWebview();
    }

    /**
     * Updates the JSON input and triggers evaluation
     */
    public updateJsonInput(jsonData: string): void {
        // Clear diagnostics when JSON input changes (in case it affects runtime errors)
        this.clearTemplateDiagnostics();

        this.state.jsonInput = jsonData;
        this.evaluateExpression();
    }

    /**
     * Updates the JSONata expression and triggers evaluation
     */
    public updateJsonataExpression(expression: string): void {
        // Clear diagnostics when the expression changes
        this.clearTemplateDiagnostics();

        this.state.jsonataExpression = expression;
        this.evaluateExpression();
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
        this.evaluateExpression();
        this.sendStateToWebview();
    }

    /**
     * Copies the current result to the clipboard
     */
    private async copyResultToClipboard(): Promise<void> {
        if (this.state.result && !this.state.error) {
            try {
                await vscode.env.clipboard.writeText(this.state.result);
                // Optionally show a success message
                this.webview.postMessage({
                    type: 'copySuccess',
                    data: { message: 'Result copied to clipboard' }
                });
            } catch (error) {
                console.error('Failed to copy result to clipboard:', error);
                this.webview.postMessage({
                    type: 'copyError',
                    data: { message: 'Failed to copy result' }
                });
            }
        }
    }

    /**
     * Disposes resources
     */
    public dispose(): void {
        // Clean up any resources if needed
        this.disposables.forEach(disposable => disposable.dispose());
        this.playgroundDiagnosticCollection.dispose();
    }

    /**
     * Updates the list of available editors
     */
    public updateAvailableEditors(): void {
        this.state.availableEditors = this.getOpenEditors();
        this.sendStateToWebview();
    }

    /**
     * Selects an editor as the JSON input source
     */
    private selectJsonInputEditor(editorId: string | null): void {
        this.state.selectedJsonInputEditor = editorId;
        if (editorId) {
            const content = this.getEditorContent(editorId);
            if (content !== null) {
                this.state.jsonInput = content;
                this.evaluateExpression();
            }
        }
        this.sendStateToWebview();
    }

    /**
     * Selects an editor as the template/expression source
     */
    private selectTemplateEditor(editorId: string | null): void {
        // Clear diagnostics from the previous editor
        this.clearTemplateDiagnostics();

        this.state.selectedTemplateEditor = editorId;
        if (editorId) {
            const content = this.getEditorContent(editorId);
            if (content !== null) {
                this.state.jsonataExpression = content;
                this.evaluateExpression();
            }
        }
        this.sendStateToWebview();
    }

    private async evaluateExpression(): Promise<void> {
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
                const errorMessage = `Invalid JSON input: ${error instanceof Error ? error.message : 'Unknown error'}`;
                this.state.error = errorMessage;
                this.state.errorDetails = {
                    message: errorMessage,
                    type: 'json-parse'
                };
                this.state.result = '';
                this.sendStateToWebview();
                return;
            }

            // Compile JSONata expression
            let expression: any;
            try {
                expression = jsonata(this.state.jsonataExpression);
            } catch (error: any) {
                // Enhanced error handling for compilation errors
                const errorDetails = this.createDetailedErrorInfo(error, 'compilation');
                this.state.error = this.formatErrorMessage(errorDetails);
                this.state.errorDetails = errorDetails;
                this.state.result = '';

                // Create diagnostics for the template editor
                this.createTemplateDiagnostics(errorDetails);

                this.sendStateToWebview();
                return;
            }

            // Evaluate expression
            try {
                const result = await expression.evaluate(jsonData);
                this.state.result = JSON.stringify(result, null, 2);
            } catch (error: any) {
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

        this.sendStateToWebview();
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

        if (error.position !== undefined) {
            errorDetails.position = error.position;

            // Calculate line and character position from the position
            const lines = this.state.jsonataExpression.split('\n');
            let currentPosition = 0;
            let line = 0;
            let character = 0;

            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length;
                if (error.position <= currentPosition + lineLength) {
                    line = i;
                    character = error.position - currentPosition;
                    break;
                }
                currentPosition += lineLength + 1; // +1 for newline
            }

            errorDetails.line = line;
            errorDetails.character = character;
        }

        if (error.token) {
            errorDetails.token = error.token;
        }

        if (error.value) {
            errorDetails.value = error.value;
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

        if (errorDetails.token && errorDetails.value &&
            errorDetails.token !== errorDetails.value &&
            errorDetails.value !== 'undefined') {
            message += ` (expected '${errorDetails.value}', got '${errorDetails.token}')`;
        }

        if (errorDetails.line !== undefined && errorDetails.character !== undefined) {
            message += ` at line ${errorDetails.line + 1}, character ${errorDetails.character + 1}`;
        } else if (errorDetails.position !== undefined) {
            message += ` at position ${errorDetails.position}`;
        }

        // Add helpful suggestions for common errors
        const suggestion = this.getErrorSuggestion(errorDetails);
        if (suggestion) {
            message += `\n\n💡 Suggestion: ${suggestion}`;
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

            // Also highlight the error in the editor if possible
            this.highlightErrorInEditor(targetUri, errorDetails);
        }
    }

    /**
     * Highlights the error in the editor by setting selection/cursor position
     */
    private highlightErrorInEditor(uri: vscode.Uri, errorDetails: ErrorDetails): void {
        if (errorDetails.line === undefined || errorDetails.character === undefined) {
            return;
        }

        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        if (editor) {
            const position = new vscode.Position(errorDetails.line, errorDetails.character);
            let endPosition = position;

            // If we have a token, select the entire token
            if (errorDetails.token && errorDetails.token !== '(end)') {
                endPosition = new vscode.Position(errorDetails.line, errorDetails.character + errorDetails.token.length);
            }

            const range = new vscode.Range(position, endPosition);
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
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
        if (errorDetails.line === undefined || errorDetails.character === undefined) {
            return null;
        }

        // Create the range for the error
        const startPos = new vscode.Position(errorDetails.line, errorDetails.character);
        let endPos = startPos;

        // If we have a token, highlight the entire token
        if (errorDetails.token && errorDetails.token !== '(end)') {
            endPos = new vscode.Position(errorDetails.line, errorDetails.character + errorDetails.token.length);
        } else {
            // Default to highlighting one character
            endPos = new vscode.Position(errorDetails.line, errorDetails.character + 1);
        }

        const range = new vscode.Range(startPos, endPos);

        // Create the diagnostic message
        let message = errorDetails.message;
        if (errorDetails.code) {
            message = `[${errorDetails.code}] ${message}`;
        }

        if (errorDetails.token && errorDetails.value &&
            errorDetails.token !== errorDetails.value &&
            errorDetails.value !== 'undefined') {
            message += ` (expected '${errorDetails.value}', got '${errorDetails.token}')`;
        }

        const diagnostic = new vscode.Diagnostic(
            range,
            message,
            errorDetails.type === 'compilation' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
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

        if (message.includes('undefined') || code === 'T1006') {
            return 'Check that all variables and functions are properly defined and spelled correctly.';
        }

        if (message.includes('function') && message.includes('not found')) {
            return 'Verify the function name is correct. Common functions include $count(), $sum(), $map(), $filter(), etc.';
        }

        return null;
    }

    private sendStateToWebview(): void {
        this.webview.postMessage({
            type: 'updateState',
            data: this.state
        });
    }    private getWebviewContent(): string {
        const nonce = this.generateNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>JSONata Results</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            padding: 10px 15px;
            background-color: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .header h1 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }

        .info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .controls {
            padding: 8px 15px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 15px;
            align-items: center;
            flex-wrap: wrap;
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 200px;
        }

        .control-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .control-select {
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            font-size: 12px;
            border-radius: 2px;
            min-width: 180px;
        }

        .control-select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .refresh-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 2px;
            cursor: pointer;
            height: 24px;
        }

        .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .share-controls {
            display: flex;
            gap: 8px;
            margin-left: auto;
        }

        .share-btn, .import-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 2px;
            cursor: pointer;
            height: 24px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.2s;
        }

        .share-btn:hover, .import-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .share-btn:active, .import-btn:active {
            background-color: var(--vscode-button-secondaryActiveBackground);
        }

        .share-btn:focus, .import-btn:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .container {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .result-panel {
            flex: 1;
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .panel-header {
            padding: 8px 12px;
            background-color: var(--vscode-tab-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .copy-button {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
            opacity: 0.7;
            transition: opacity 0.2s, background-color 0.2s;
            min-width: 60px;
            justify-content: center;
        }

        .copy-button:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .copy-button:active {
            background-color: var(--vscode-toolbar-activeBackground);
        }

        .copy-button:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .copy-button.copied {
            color: var(--vscode-terminal-ansiGreen);
            opacity: 1;
        }

        .copy-button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .panel-content {
            flex: 1;
            position: relative;
            min-height: 0;
            overflow: hidden;
        }

        .result-content {
            width: 100%;
            height: 100%;
            border: none;
            outline: none;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 12px;
            box-sizing: border-box;
            overflow: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.4;
            position: relative;
        }

        .result-content:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .result-content:focus::before {
            content: "Press Ctrl+C to copy";
            position: absolute;
            top: 8px;
            right: 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            opacity: 0.8;
            pointer-events: none;
        }

        /* JSON Syntax Highlighting */
        .result-content .json-key {
            color: #9cdcfe !important;
            font-weight: normal;
        }

        .result-content .json-string {
            color: #ce9178 !important;
        }

        .result-content .json-number {
            color: #b5cea8 !important;
        }

        .result-content .json-boolean {
            color: #569cd6 !important;
        }

        .result-content .json-null {
            color: #569cd6 !important;
        }

        .result-content .json-punctuation {
            color: var(--vscode-editor-foreground) !important;
        }

        /* Dark theme adjustments */
        body[data-vscode-theme-kind="vscode-dark"] .result-content .json-key {
            color: #9cdcfe !important;
        }

        body[data-vscode-theme-kind="vscode-dark"] .result-content .json-string {
            color: #ce9178 !important;
        }

        body[data-vscode-theme-kind="vscode-dark"] .result-content .json-number {
            color: #b5cea8 !important;
        }

        body[data-vscode-theme-kind="vscode-dark"] .result-content .json-boolean {
            color: #569cd6 !important;
        }

        body[data-vscode-theme-kind="vscode-dark"] .result-content .json-null {
            color: #569cd6 !important;
        }

        /* Light theme adjustments */
        body[data-vscode-theme-kind="vscode-light"] .result-content .json-key {
            color: #0070c1 !important;
        }

        body[data-vscode-theme-kind="vscode-light"] .result-content .json-string {
            color: #a31515 !important;
        }

        body[data-vscode-theme-kind="vscode-light"] .result-content .json-number {
            color: #09885a !important;
        }

        body[data-vscode-theme-kind="vscode-light"] .result-content .json-boolean {
            color: #0000ff !important;
        }

        body[data-vscode-theme-kind="vscode-light"] .result-content .json-null {
            color: #0000ff !important;
        }

        /* High contrast theme adjustments */
        body[data-vscode-theme-kind="vscode-high-contrast"] .result-content .json-key {
            color: #569cd6 !important;
        }

        body[data-vscode-theme-kind="vscode-high-contrast"] .result-content .json-string {
            color: #ce9178 !important;
        }

        body[data-vscode-theme-kind="vscode-high-contrast"] .result-content .json-number {
            color: #b5cea8 !important;
        }

        body[data-vscode-theme-kind="vscode-high-contrast"] .result-content .json-boolean {
            color: #569cd6 !important;
        }

        body[data-vscode-theme-kind="vscode-high-contrast"] .result-content .json-null {
            color: #569cd6 !important;
        }

        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 12px;
            margin: 12px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 1.4;
        }

        .error-header {
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .error-title {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .error-actions {
            display: flex;
            gap: 4px;
        }

        .error-action-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 2px 6px;
            font-size: 10px;
            border-radius: 2px;
            cursor: pointer;
            opacity: 0.8;
            transition: opacity 0.2s;
        }

        .line-number {
            color: var(--vscode-editorLineNumber-foreground);
            margin-right: 8px;
            user-select: none;
            min-width: 20px;
            display: inline-block;
            text-align: right;
        }

        .error-type {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 500;
        }

        .error-message {
            margin-bottom: 8px;
        }

        .error-details {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            padding: 8px;
            border-radius: 3px;
            font-size: 12px;
            font-family: var(--vscode-editor-font-family);
        }

        .error-location {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            margin-bottom: 4px;
        }

        .error-code-snippet {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            border-radius: 3px;
            margin-top: 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            overflow-x: auto;
            white-space: pre;
        }

        .error-highlight {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border-radius: 2px;
            padding: 0 2px;
        }

        .error-line {
            display: block;
            position: relative;
        }

        .error-line.highlighted {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-radius: 2px;
            margin: -2px;
            padding: 2px;
        }

        .error-suggestion {
            background-color: var(--vscode-textCodeBlock-background);
            border-left: 3px solid var(--vscode-charts-blue);
            padding: 8px 12px;
            margin-top: 8px;
            border-radius: 0 3px 3px 0;
            font-size: 12px;
        }

        .error-suggestion-header {
            font-weight: 600;
            color: var(--vscode-charts-blue);
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .status-bar {
            padding: 6px 12px;
            background-color: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-success {
            color: var(--vscode-terminal-ansiGreen);
        }

        .status-error {
            color: var(--vscode-errorForeground);
        }

        .evaluation-info {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        .editor-option {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .editor-language {
            font-size: 10px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 4px;
            border-radius: 2px;
        }

        .editor-dirty {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }
    </style>
</head>
<body data-vscode-theme-kind="vscode-dark">
    <div class="header">
        <h1>📊 JSONata Results</h1>
        <div class="info">Live evaluation • Select any open editor as input source</div>
    </div>

    <div class="controls">
        <div class="control-group">
            <label class="control-label">JSON Input Source</label>
            <select id="jsonInputSelect" class="control-select">
                <option value="">Default (Internal Editor)</option>
            </select>
        </div>
        <div class="control-group">
            <label class="control-label">JSONata Template Source</label>
            <select id="templateSelect" class="control-select">
                <option value="">Default (Internal Editor)</option>
            </select>
        </div>
        <button id="refreshBtn" class="refresh-btn">🔄 Refresh</button>
        <div class="share-controls">
            <button id="shareBtn" class="share-btn" title="Share current session">
                <span>📤</span>
                <span>Share</span>
            </button>
            <button id="importBtn" class="import-btn" title="Import session">
                <span>📥</span>
                <span>Import</span>
            </button>
        </div>
    </div>

    <div class="container">
        <div class="result-panel">
            <div class="panel-header">
                Live Evaluation Result
                <button id="copyBtn" class="copy-button" title="Copy result to clipboard">
                    <span id="copyIcon">📋</span>
                    <span id="copyText">Copy</span>
                </button>
            </div>
            <div class="panel-content">
                <div id="result" class="result-content"></div>
                <div id="error" class="error" style="display: none;"></div>
            </div>
        </div>
    </div>

    <div class="status-bar">
        <div class="status-item">
            <span id="statusText">Ready</span>
        </div>
        <div class="status-item">
            <span class="evaluation-info">Updates automatically on input change</span>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            const result = document.getElementById('result');
            const error = document.getElementById('error');
            const statusText = document.getElementById('statusText');
            const jsonInputSelect = document.getElementById('jsonInputSelect');
            const templateSelect = document.getElementById('templateSelect');
            const refreshBtn = document.getElementById('refreshBtn');
            const shareBtn = document.getElementById('shareBtn');
            const importBtn = document.getElementById('importBtn');
            const copyBtn = document.getElementById('copyBtn');
            const copyIcon = document.getElementById('copyIcon');
            const copyText = document.getElementById('copyText');

            let currentResultText = '';

            // Detect and set theme
            function setTheme() {
                const body = document.body;
                const computedStyle = getComputedStyle(body);
                const backgroundColor = computedStyle.backgroundColor;

                // Simple theme detection based on background color
                if (backgroundColor === 'rgb(30, 30, 30)' || backgroundColor === 'rgb(37, 37, 38)') {
                    body.setAttribute('data-vscode-theme-kind', 'vscode-dark');
                } else if (backgroundColor === 'rgb(255, 255, 255)' || backgroundColor === 'rgb(248, 248, 248)') {
                    body.setAttribute('data-vscode-theme-kind', 'vscode-light');
                } else {
                    body.setAttribute('data-vscode-theme-kind', 'vscode-high-contrast');
                }
            }

            // Set theme on load
            setTheme();

            function updateStatus(text, isError = false) {
                statusText.textContent = text;
                statusText.className = 'status-item ' + (isError ? 'status-error' : 'status-success');
            }

            function highlightJson(jsonString) {
                if (!jsonString || jsonString.trim() === '') {
                    return '';
                }

                try {
                    // First, try to parse and re-stringify to ensure it's valid JSON
                    const parsed = JSON.parse(jsonString);
                    const formatted = JSON.stringify(parsed, null, 2);

                    // Use a more straightforward approach for highlighting
                    return formatted
                        .split('\\n')
                        .map(line => {
                            // Property names (keys)
                            line = line.replace(/("(?:[^"\\\\]|\\\\.)*")(\s*:)/g, '<span class="json-key">$1</span>$2');

                            // String values
                            line = line.replace(/:(\s*)("(?:[^"\\\\]|\\\\.)*")/g, ':$1<span class="json-string">$2</span>');

                            // Numbers
                            line = line.replace(/:(\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, ':$1<span class="json-number">$2</span>');

                            // Booleans
                            line = line.replace(/:(\s*)(true|false)\\b/g, ':$1<span class="json-boolean">$2</span>');

                            // Null values
                            line = line.replace(/:(\s*)(null)\\b/g, ':$1<span class="json-null">$2</span>');

                            // Punctuation
                            line = line.replace(/([{}\\[\\],])/g, '<span class="json-punctuation">$1</span>');

                            return line;
                        })
                        .join('\\n');
                } catch (e) {
                    // If it's not valid JSON, check if it's a simple value and highlight accordingly
                    const trimmed = jsonString.trim();
                    if (trimmed.match(/^".*"$/)) {
                        return '<span class="json-string">' + jsonString + '</span>';
                    } else if (trimmed.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/)) {
                        return '<span class="json-number">' + jsonString + '</span>';
                    } else if (trimmed.match(/^(true|false)$/)) {
                        return '<span class="json-boolean">' + jsonString + '</span>';
                    } else if (trimmed.match(/^null$/)) {
                        return '<span class="json-null">' + jsonString + '</span>';
                    }

                    // If none of the above, return as is (might be a complex result)
                    return jsonString;
                }
            }

            function copyToClipboard() {
                if (!currentResultText) {
                    return;
                }

                // Temporarily disable the button to prevent multiple clicks
                copyBtn.disabled = true;

                navigator.clipboard.writeText(currentResultText).then(() => {
                    // Show success state
                    copyIcon.textContent = '✓';
                    copyText.textContent = 'Copied';
                    copyBtn.classList.add('copied');

                    // Reset after 2 seconds
                    setTimeout(() => {
                        copyIcon.textContent = '📋';
                        copyText.textContent = 'Copy';
                        copyBtn.classList.remove('copied');
                        copyBtn.disabled = false;
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = currentResultText;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        copyIcon.textContent = '✓';
                        copyText.textContent = 'Copied';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyIcon.textContent = '📋';
                            copyText.textContent = 'Copy';
                            copyBtn.classList.remove('copied');
                            copyBtn.disabled = false;
                        }, 2000);
                    } catch (e) {
                        console.error('Fallback copy failed: ', e);
                        copyIcon.textContent = '❌';
                        copyText.textContent = 'Failed';
                        setTimeout(() => {
                            copyIcon.textContent = '📋';
                            copyText.textContent = 'Copy';
                            copyBtn.disabled = false;
                        }, 2000);
                    }
                    document.body.removeChild(textArea);
                });
            }

            function populateEditorSelects(availableEditors, selectedJsonInputEditor, selectedTemplateEditor) {
                // Clear existing options (keep default)
                jsonInputSelect.innerHTML = '<option value="">Default (Internal Editor)</option>';
                templateSelect.innerHTML = '<option value="">Default (Internal Editor)</option>';

                // Add available editors
                availableEditors.forEach(editor => {
                    const option = document.createElement('option');
                    option.value = editor.id;
                    option.innerHTML = \`
                        <span class="editor-option">
                            \${editor.fileName}
                            <span class="editor-language">\${editor.language}</span>
                            \${editor.isDirty ? '<span class="editor-dirty">●</span>' : ''}
                        </span>
                    \`;
                    option.textContent = \`\${editor.fileName} (\${editor.language})\${editor.isDirty ? ' ●' : ''}\`;

                    jsonInputSelect.appendChild(option.cloneNode(true));
                    templateSelect.appendChild(option);
                });

                // Set selected values
                jsonInputSelect.value = selectedJsonInputEditor || '';
                templateSelect.value = selectedTemplateEditor || '';
            }

            function handleStateUpdate(state) {
                populateEditorSelects(state.availableEditors, state.selectedJsonInputEditor, state.selectedTemplateEditor);

                if (state.error) {
                    error.innerHTML = formatError(state.error, state.errorDetails);
                    error.style.display = 'block';
                    result.innerHTML = '';
                    currentResultText = '';
                    copyBtn.style.display = 'none';
                    updateStatus('Error in evaluation', true);
                } else {
                    error.style.display = 'none';
                    currentResultText = state.result;

                    // Apply JSON highlighting
                    const highlightedResult = highlightJson(state.result);
                    result.innerHTML = highlightedResult;

                    // Debug: log the result to console to see what we're working with
                    console.log('Result text:', state.result);
                    console.log('Highlighted result:', highlightedResult);

                    // Show/hide and enable/disable copy button based on result
                    if (currentResultText) {
                        copyBtn.style.display = 'flex';
                        copyBtn.disabled = false;
                    } else {
                        copyBtn.style.display = 'none';
                        copyBtn.disabled = true;
                    }

                    updateStatus('Evaluation successful');
                }
            }

            function formatError(errorMessage, errorDetails) {
                if (!errorDetails) {
                    return \`<div class="error-message">\${escapeHtml(errorMessage)}</div>\`;
                }

                let html = \`
                    <div class="error-header">
                        <div class="error-title">
                            <span>🚨</span>
                            <span class="error-type">\${errorDetails.type}</span>
                            <span>Error</span>
                        </div>
                        <div class="error-actions">
                            <button class="error-action-btn" onclick="copyErrorDetails('\${escapeHtml(JSON.stringify(errorDetails))}')">📋 Copy</button>
                        </div>
                    </div>
                    <div class="error-message">\${escapeHtml(errorDetails.message)}</div>
                \`;

                if (errorDetails.line !== undefined && errorDetails.character !== undefined) {
                    html += \`<div class="error-location">📍 Line \${errorDetails.line + 1}, Character \${errorDetails.character + 1}</div>\`;
                }

                if (errorDetails.code || errorDetails.token || errorDetails.value) {
                    html += '<div class="error-details">';

                    if (errorDetails.code) {
                        html += \`<div><strong>Error Code:</strong> \${escapeHtml(errorDetails.code)}</div>\`;
                    }

                    if (errorDetails.token) {
                        html += \`<div><strong>Token:</strong> '\${escapeHtml(errorDetails.token)}'</div>\`;
                    }

                    if (errorDetails.value && errorDetails.value !== errorDetails.token) {
                        html += \`<div><strong>Expected:</strong> '\${escapeHtml(errorDetails.value)}'</div>\`;
                    }

                    html += '</div>';
                }

                // Add code snippet with error highlighting if we have position information
                if (errorDetails.line !== undefined && errorDetails.character !== undefined) {
                    html += formatCodeSnippetWithError(errorDetails);
                }

                // Add suggestion if available
                if (errorDetails.suggestion) {
                    html += \`
                        <div class="error-suggestion">
                            <div class="error-suggestion-header">💡 Suggestion</div>
                            <div>\${escapeHtml(errorDetails.suggestion)}</div>
                        </div>
                    \`;
                }

                return html;
            }

            function copyErrorDetails(errorDetailsJson) {
                try {
                    const errorDetails = JSON.parse(errorDetailsJson);
                    let errorText = \`JSONata \${errorDetails.type} Error\\n\`;
                    errorText += \`Message: \${errorDetails.message}\\n\`;

                    if (errorDetails.line !== undefined && errorDetails.character !== undefined) {
                        errorText += \`Location: Line \${errorDetails.line + 1}, Character \${errorDetails.character + 1}\\n\`;
                    }

                    if (errorDetails.code) {
                        errorText += \`Code: \${errorDetails.code}\\n\`;
                    }

                    if (errorDetails.token) {
                        errorText += \`Token: '\${errorDetails.token}'\\n\`;
                    }

                    if (errorDetails.value && errorDetails.value !== errorDetails.token) {
                        errorText += \`Expected: '\${errorDetails.value}'\\n\`;
                    }

                    navigator.clipboard.writeText(errorText).then(() => {
                        // Show temporary feedback
                        const btn = event.target;
                        const originalText = btn.textContent;
                        btn.textContent = '✓ Copied';
                        setTimeout(() => {
                            btn.textContent = originalText;
                        }, 1500);
                    }).catch(err => {
                        console.error('Failed to copy error details:', err);
                    });
                } catch (err) {
                    console.error('Failed to parse error details:', err);
                }
            }

            // Make copyErrorDetails globally available
            window.copyErrorDetails = copyErrorDetails;

            function formatCodeSnippetWithError(errorDetails) {
                // Get the current JSONata expression from the webview state
                // We'll request it from the extension
                vscode.postMessage({ type: 'getJsonataExpression' });

                // For now, we'll create a placeholder that will be updated
                return \`
                    <div class="error-code-snippet" id="errorCodeSnippet">
                        <div class="error-location">Error location will be highlighted when available</div>
                    </div>
                \`;
            }

            function updateCodeSnippetWithError(jsonataExpression, errorDetails) {
                const snippetElement = document.getElementById('errorCodeSnippet');
                if (!snippetElement || !jsonataExpression || errorDetails.line === undefined) {
                    return;
                }

                const lines = jsonataExpression.split('\\n');
                const errorLine = errorDetails.line;
                const errorChar = errorDetails.character || 0;

                // Show context: 2 lines before and after the error line
                const startLine = Math.max(0, errorLine - 2);
                const endLine = Math.min(lines.length - 1, errorLine + 2);

                let html = '';
                for (let i = startLine; i <= endLine; i++) {
                    const lineNumber = i + 1;
                    const lineContent = lines[i] || '';
                    const isErrorLine = i === errorLine;

                    let displayLine = escapeHtml(lineContent);

                    if (isErrorLine && errorChar < lineContent.length) {
                        // Highlight the error position
                        const beforeError = escapeHtml(lineContent.substring(0, errorChar));
                        const errorToken = errorDetails.token || lineContent.charAt(errorChar) || '';
                        const afterError = escapeHtml(lineContent.substring(errorChar + errorToken.length));

                        displayLine = \`\${beforeError}<span class="error-highlight">\${escapeHtml(errorToken)}</span>\${afterError}\`;
                    }

                    html += \`
                        <span class="error-line \${isErrorLine ? 'highlighted' : ''}">
                            <span class="line-number">\${lineNumber}</span>\${displayLine}
                        </span>\\n
                    \`;
                }

                snippetElement.innerHTML = html;
            }

            function escapeHtml(unsafe) {
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            }

            // Event listeners
            jsonInputSelect.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'selectJsonInputEditor',
                    data: { editorId: jsonInputSelect.value || null }
                });
            });

            templateSelect.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'selectTemplateEditor',
                    data: { editorId: templateSelect.value || null }
                });
            });

            refreshBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'refreshEditors' });
            });

            shareBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'shareSession' });
            });

            importBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'importSession' });
            });

            copyBtn.addEventListener('click', copyToClipboard);

            // Add keyboard shortcut for copy (Ctrl+C)
            document.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'c' && currentResultText) {
                    // Only copy if the result panel is focused or if nothing else is selected
                    if (document.activeElement === result || window.getSelection().toString() === '') {
                        event.preventDefault();
                        copyToClipboard();
                    }
                }
            });

            // Make the result div focusable for keyboard shortcuts
            result.setAttribute('tabindex', '0');

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'updateState':
                        handleStateUpdate(message.data);
                        break;
                    case 'jsonataExpression':
                        updateCodeSnippetWithError(message.data.expression, message.data.errorDetails);
                        break;
                    case 'copySuccess':
                        // Show success state
                        copyIcon.textContent = '✓';
                        copyText.textContent = 'Copied';
                        copyBtn.classList.add('copied');
                        copyBtn.disabled = false;
                        setTimeout(() => {
                            copyIcon.textContent = '📋';
                            copyText.textContent = 'Copy';
                            copyBtn.classList.remove('copied');
                        }, 2000);
                        break;
                    case 'copyError':
                        // Show error state briefly
                        copyIcon.textContent = '❌';
                        copyText.textContent = 'Failed';
                        copyBtn.disabled = false;
                        setTimeout(() => {
                            copyIcon.textContent = '📋';
                            copyText.textContent = 'Copy';
                        }, 2000);
                        break;
                }
            });

            // Request initial state
            vscode.postMessage({ type: 'requestState' });
        })();
    </script>
</body>
</html>`;
    }

    private generateNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Gets the list of currently open editor tabs
     */
    private getOpenEditors(): EditorInfo[] {
        const openEditors: EditorInfo[] = [];

        // Get all tab groups and their tabs
        const tabGroups = vscode.window.tabGroups.all;

        tabGroups.forEach(tabGroup => {
            tabGroup.tabs.forEach(tab => {
                // Only include text document tabs
                if (tab.input instanceof vscode.TabInputText) {
                    const document = tab.input.uri;

                    // Try to find the corresponding text document
                    const textDoc = vscode.workspace.textDocuments.find(doc =>
                        doc.uri.toString() === document.toString()
                    );

                    if (textDoc) {
                        let fileName: string;
                        if (textDoc.isUntitled) {
                            // For untitled documents, create a more descriptive name
                            const tabLabel = tab.label || `Untitled-${textDoc.languageId}`;
                            fileName = tabLabel;
                        } else {
                            fileName = vscode.workspace.asRelativePath(textDoc.fileName);
                            // If the relative path is the same as the full path, show just the filename
                            if (fileName === textDoc.fileName) {
                                fileName = textDoc.fileName.split(/[/\\]/).pop() || fileName;
                            }
                        }

                        // Avoid duplicates (same file can be open in multiple tab groups)
                        const existingEditor = openEditors.find(e => e.id === textDoc.uri.toString());
                        if (!existingEditor) {
                            openEditors.push({
                                id: textDoc.uri.toString(),
                                fileName: fileName,
                                language: textDoc.languageId,
                                isDirty: textDoc.isDirty
                            });
                        }
                    }
                }
            });
        });

        // Fallback: If tabGroups API doesn't return expected results, use visible editors
        if (openEditors.length === 0) {
            vscode.window.visibleTextEditors.forEach(editor => {
                let fileName: string;
                if (editor.document.isUntitled) {
                    fileName = `Untitled-${editor.document.languageId}`;
                } else {
                    fileName = vscode.workspace.asRelativePath(editor.document.fileName);
                    if (fileName === editor.document.fileName) {
                        fileName = editor.document.fileName.split(/[/\\]/).pop() || fileName;
                    }
                }

                openEditors.push({
                    id: editor.document.uri.toString(),
                    fileName: fileName,
                    language: editor.document.languageId,
                    isDirty: editor.document.isDirty
                });
            });
        }

        // Sort by filename for better organization
        return openEditors.sort((a, b) => a.fileName.localeCompare(b.fileName));
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
                this.evaluateExpression();
            } else if (this.state.selectedTemplateEditor === documentUri) {
                this.state.jsonataExpression = event.document.getText();
                this.evaluateExpression();
            }
        });
        this.disposables.push(changeDisposable);

        // Listen for when documents are saved (in case content changes)
        const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
            const documentUri = document.uri.toString();

            if (this.state.selectedJsonInputEditor === documentUri) {
                this.state.jsonInput = document.getText();
                this.evaluateExpression();
            } else if (this.state.selectedTemplateEditor === documentUri) {
                this.state.jsonataExpression = document.getText();
                this.evaluateExpression();
            }
        });
        this.disposables.push(saveDisposable);

        // Listen for tab changes to update available editors
        const tabChangeDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
            // Update available editors when tabs change
            this.updateAvailableEditors();

            // Check if selected editors are still available
            this.validateSelectedEditors();
        });
        this.disposables.push(tabChangeDisposable);

        // Listen for when documents are closed
        const closeDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
            const documentUri = document.uri.toString();

            // If a selected editor was closed, reset the selection
            if (this.state.selectedJsonInputEditor === documentUri) {
                this.state.selectedJsonInputEditor = null;
                // Reset to default content if needed
                this.state.jsonInput = '{\n  "example": [\n    {"value": 4},\n    {"value": 7},\n    {"value": 13}\n  ]\n}';
                this.evaluateExpression();
            }

            if (this.state.selectedTemplateEditor === documentUri) {
                this.state.selectedTemplateEditor = null;
                // Reset to default content if needed
                this.state.jsonataExpression = 'example[value > 5].value';
                this.evaluateExpression();
            }

            // Update available editors list
            this.updateAvailableEditors();
        });
        this.disposables.push(closeDisposable);
    }

    /**
     * Validates that selected editors are still available and resets if not
     */
    private validateSelectedEditors(): void {
        const availableEditorIds = this.state.availableEditors.map(e => e.id);

        if (this.state.selectedJsonInputEditor && !availableEditorIds.includes(this.state.selectedJsonInputEditor)) {
            this.state.selectedJsonInputEditor = null;
            this.state.jsonInput = '{\n  "example": [\n    {"value": 4},\n    {"value": 7},\n    {"value": 13}\n  ]\n}';
            this.evaluateExpression();
        }

        if (this.state.selectedTemplateEditor && !availableEditorIds.includes(this.state.selectedTemplateEditor)) {
            this.state.selectedTemplateEditor = null;
            this.state.jsonataExpression = 'example[value > 5].value';
            this.evaluateExpression();
        }
    }
}
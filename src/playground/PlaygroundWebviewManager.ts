import * as vscode from 'vscode';
import jsonata from 'jsonata';

interface PlaygroundState {
    jsonInput: string;
    jsonataExpression: string;
    result: string;
    error: string | null;
    availableEditors: EditorInfo[];
    selectedJsonInputEditor: string | null;
    selectedTemplateEditor: string | null;
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
        availableEditors: [],
        selectedJsonInputEditor: null,
        selectedTemplateEditor: null
    };
    private disposables: vscode.Disposable[] = [];

    constructor(
        private webview: vscode.Webview,
        private context: vscode.ExtensionContext
    ) {
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
        }
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
        this.state.jsonInput = jsonData;
        this.evaluateExpression();
    }

    /**
     * Updates the JSONata expression and triggers evaluation
     */
    public updateJsonataExpression(expression: string): void {
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
     * Disposes resources
     */
    public dispose(): void {
        // Clean up any resources if needed
        this.disposables.forEach(disposable => disposable.dispose());
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
            // Reset error state
            this.state.error = null;

            // Parse JSON input
            let jsonData: any;
            try {
                jsonData = JSON.parse(this.state.jsonInput);
            } catch (error) {
                this.state.error = `Invalid JSON input: ${error instanceof Error ? error.message : 'Unknown error'}`;
                this.state.result = '';
                this.sendStateToWebview();
                return;
            }

            // Compile JSONata expression
            let expression: any;
            try {
                expression = jsonata(this.state.jsonataExpression);
            } catch (error: any) {
                this.state.error = `JSONata compilation error: ${error.message || 'Unknown error'}`;
                this.state.result = '';
                this.sendStateToWebview();
                return;
            }

            // Evaluate expression
            try {
                const result = await expression.evaluate(jsonData);
                this.state.result = JSON.stringify(result, null, 2);
            } catch (error: any) {
                // Handle runtime errors
                let errorMessage = error.message || 'Unknown evaluation error';
                if (error.code) {
                    errorMessage = `[${error.code}] ${errorMessage}`;
                }
                if (error.token) {
                    errorMessage += ` (token: '${error.token}')`;
                }
                if (error.position !== undefined) {
                    errorMessage += ` (position: ${error.position})`;
                }

                this.state.error = `JSONata runtime error: ${errorMessage}`;
                this.state.result = '';
            }
        } catch (error) {
            this.state.error = `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.state.result = '';
        }

        this.sendStateToWebview();
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
<body>
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
    </div>

    <div class="container">
        <div class="result-panel">
            <div class="panel-header">Live Evaluation Result</div>
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

            function updateStatus(text, isError = false) {
                statusText.textContent = text;
                statusText.className = 'status-item ' + (isError ? 'status-error' : 'status-success');
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
                    error.textContent = state.error;
                    error.style.display = 'block';
                    result.textContent = '';
                    updateStatus('Error in evaluation', true);
                } else {
                    error.style.display = 'none';
                    result.textContent = state.result;
                    updateStatus('Evaluation successful');
                }
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

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'updateState':
                        handleStateUpdate(message.data);
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
     * Gets the list of currently open editors
     */
    private getOpenEditors(): EditorInfo[] {
        const openEditors: EditorInfo[] = [];

        // Get all visible text editors
        const visibleEditors = vscode.window.visibleTextEditors.filter(editor => {
            // Include saved files and untitled files that could be relevant
            return !editor.document.isUntitled ||
                   ['json', 'jsonata', 'javascript', 'typescript', 'plaintext'].includes(editor.document.languageId);
        });

        // Add visible editors
        visibleEditors.forEach(editor => {
            let fileName: string;
            if (editor.document.isUntitled) {
                fileName = `Untitled-${editor.document.languageId}`;
            } else {
                fileName = vscode.workspace.asRelativePath(editor.document.fileName);
                // If the relative path is the same as the full path, show just the filename
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

        // Also add recently opened documents that might not be visible
        vscode.workspace.textDocuments.forEach(doc => {
            const existingEditor = openEditors.find(e => e.id === doc.uri.toString());
            if (!existingEditor && !doc.isUntitled &&
                ['json', 'jsonata', 'javascript', 'typescript', 'plaintext'].includes(doc.languageId)) {

                let fileName = vscode.workspace.asRelativePath(doc.fileName);
                if (fileName === doc.fileName) {
                    fileName = doc.fileName.split(/[/\\]/).pop() || fileName;
                }

                openEditors.push({
                    id: doc.uri.toString(),
                    fileName: fileName + ' (not visible)',
                    language: doc.languageId,
                    isDirty: doc.isDirty
                });
            }
        });

        return openEditors.sort((a, b) => {
            // Sort by: visible editors first, then by filename
            const aVisible = !a.fileName.includes('(not visible)');
            const bVisible = !b.fileName.includes('(not visible)');

            if (aVisible && !bVisible) {
                return -1;
            }
            if (!aVisible && bVisible) {
                return 1;
            }

            return a.fileName.localeCompare(b.fileName);
        });
    }

    /**
     * Gets the content of a specific editor by ID
     */
    private getEditorContent(editorId: string): string | null {
        // First try visible editors
        const visibleEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === editorId);
        if (visibleEditor) {
            return visibleEditor.document.getText();
        }

        // Then try all workspace documents
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === editorId);
        if (document) {
            return document.getText();
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
    }
}
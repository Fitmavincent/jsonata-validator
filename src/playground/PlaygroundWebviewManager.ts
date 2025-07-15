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
            case 'copyResult':
                this.copyResultToClipboard();
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
        .json-key {
            color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
        }

        .json-string {
            color: var(--vscode-symbolIcon-stringForeground, #ce9178);
        }

        .json-number {
            color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
        }

        .json-boolean {
            color: var(--vscode-symbolIcon-booleanForeground, #569cd6);
        }

        .json-null {
            color: var(--vscode-symbolIcon-nullForeground, #569cd6);
        }

        .json-punctuation {
            color: var(--vscode-editor-foreground);
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
            const copyBtn = document.getElementById('copyBtn');
            const copyIcon = document.getElementById('copyIcon');
            const copyText = document.getElementById('copyText');

            let currentResultText = '';

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

                    // Apply syntax highlighting with more robust regex patterns
                    return formatted
                        .replace(/("(?:[^"\\\\]|\\\\.)*")\s*:/g, '<span class="json-key">$1</span>:')
                        .replace(/:\s*("(?:[^"\\\\]|\\\\.)*")/g, ': <span class="json-string">$1</span>')
                        .replace(/:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, ': <span class="json-number">$1</span>')
                        .replace(/:\s*(true|false)\b/g, ': <span class="json-boolean">$1</span>')
                        .replace(/:\s*(null)\b/g, ': <span class="json-null">$1</span>')
                        .replace(/([{}\[\],])/g, '<span class="json-punctuation">$1</span>');
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
                    error.textContent = state.error;
                    error.style.display = 'block';
                    result.innerHTML = '';
                    currentResultText = '';
                    copyBtn.style.display = 'none';
                    updateStatus('Error in evaluation', true);
                } else {
                    error.style.display = 'none';
                    currentResultText = state.result;
                    result.innerHTML = highlightJson(state.result);

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
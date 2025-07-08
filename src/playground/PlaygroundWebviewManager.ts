import * as vscode from 'vscode';
import jsonata from 'jsonata';

interface PlaygroundState {
    jsonInput: string;
    jsonataExpression: string;
    result: string;
    error: string | null;
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
        error: null
    };

    constructor(
        private webview: vscode.Webview,
        private context: vscode.ExtensionContext
    ) {
        this.evaluateExpression();
    }

    /**
     * Updates the webview HTML content
     */
    public updateWebviewContent(): void {
        this.webview.html = this.getWebviewContent();
    }

    /**
     * Handles messages from the webview
     */
    public handleMessage(message: WebviewMessage): void {
        switch (message.type) {
            case 'updateJsonInput':
                this.state.jsonInput = message.data;
                this.evaluateExpression();
                break;
            case 'updateJsonataExpression':
                this.state.jsonataExpression = message.data;
                this.evaluateExpression();
                break;
            case 'requestState':
                this.sendStateToWebview();
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
     * Sets the JSONata expression
     */
    public setJsonataExpression(expression: string): void {
        this.state.jsonataExpression = expression;
        this.evaluateExpression();
        this.sendStateToWebview();
    }

    /**
     * Sets the JSON input data
     */
    public setJsonInput(jsonData: string): void {
        this.state.jsonInput = jsonData;
        this.evaluateExpression();
        this.sendStateToWebview();
    }

    /**
     * Disposes resources
     */
    public dispose(): void {
        // Clean up any resources if needed
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
    }

    private getWebviewContent(): string {
        const nonce = this.generateNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>JSONata Playground</title>
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
            gap: 10px;
        }

        .header h1 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }

        .container {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 1px;
            background-color: var(--vscode-panel-border);
            min-height: 0;
        }

        .panel {
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .panel.input {
            grid-row: 1 / 3;
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
        }

        .editor {
            width: 100%;
            height: 100%;
            border: none;
            outline: none;
            resize: none;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 8px;
            box-sizing: border-box;
        }

        .result-panel {
            position: relative;
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
            padding: 8px;
            box-sizing: border-box;
            overflow: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 8px;
            margin: 8px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        .status-bar {
            padding: 4px 12px;
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
            gap: 4px;
        }

        .status-success {
            color: var(--vscode-terminal-ansiGreen);
        }

        .status-error {
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 JSONata Playground</h1>
    </div>

    <div class="container">
        <div class="panel input">
            <div class="panel-header">JSON Input</div>
            <div class="panel-content">
                <textarea id="jsonInput" class="editor" placeholder="Enter your JSON data here..."></textarea>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header">JSONata Expression</div>
            <div class="panel-content">
                <textarea id="jsonataExpression" class="editor" placeholder="Enter your JSONata expression here..."></textarea>
            </div>
        </div>

        <div class="panel result-panel">
            <div class="panel-header">Result</div>
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
            <span>JSONata Playground</span>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            const jsonInput = document.getElementById('jsonInput');
            const jsonataExpression = document.getElementById('jsonataExpression');
            const result = document.getElementById('result');
            const error = document.getElementById('error');
            const statusText = document.getElementById('statusText');

            let debounceTimeout;

            function debounce(func, delay) {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(func, delay);
            }

            function updateStatus(text, isError = false) {
                statusText.textContent = text;
                statusText.className = 'status-item ' + (isError ? 'status-error' : 'status-success');
            }

            function handleStateUpdate(state) {
                if (state.error) {
                    error.textContent = state.error;
                    error.style.display = 'block';
                    result.textContent = '';
                    updateStatus('Error', true);
                } else {
                    error.style.display = 'none';
                    result.textContent = state.result;
                    updateStatus('Evaluation successful');
                }
            }

            // Set up event listeners
            jsonInput.addEventListener('input', () => {
                debounce(() => {
                    vscode.postMessage({
                        type: 'updateJsonInput',
                        data: jsonInput.value
                    });
                }, 300);
            });

            jsonataExpression.addEventListener('input', () => {
                debounce(() => {
                    vscode.postMessage({
                        type: 'updateJsonataExpression',
                        data: jsonataExpression.value
                    });
                }, 300);
            });

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'updateState':
                        const state = message.data;
                        jsonInput.value = state.jsonInput;
                        jsonataExpression.value = state.jsonataExpression;
                        handleStateUpdate(state);
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
}
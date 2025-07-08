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
     * Handles messages from the webview (now only for results panel)
     */
    public handleMessage(message: WebviewMessage): void {
        switch (message.type) {
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
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 JSONata Results</h1>
        <div class="info">Live evaluation • AI tools available in input panels</div>
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

            function updateStatus(text, isError = false) {
                statusText.textContent = text;
                statusText.className = 'status-item ' + (isError ? 'status-error' : 'status-success');
            }

            function handleStateUpdate(state) {
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
}
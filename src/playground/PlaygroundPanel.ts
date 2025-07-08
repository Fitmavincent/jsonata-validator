import * as vscode from 'vscode';
import { PlaygroundWebviewManager } from './PlaygroundWebviewManager';

/**
 * Manages the webview panel for the JSONata playground
 */
export class PlaygroundPanel {
    private panel: vscode.WebviewPanel;
    private webviewManager: PlaygroundWebviewManager;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        // Create the webview panel
        this.panel = vscode.window.createWebviewPanel(
            'jsonataPlayground',
            'JSONata Playground',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'dist')
                ]
            }
        );

        // Set the webview icon
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'playground-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'playground-dark.svg')
        };

        // Initialize webview manager
        this.webviewManager = new PlaygroundWebviewManager(this.panel.webview, this.context);

        // Set up event handlers
        this.setupEventHandlers();

        // Load the initial content
        this.webviewManager.updateWebviewContent();
    }

    private setupEventHandlers(): void {
        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);

        // Handle view state changes
        this.panel.onDidChangeViewState((e) => {
            if (e.webviewPanel.visible) {
                this.webviewManager.onPanelVisible();
            }
        }, null, this.disposables);

        // Handle webview messages
        this.panel.webview.onDidReceiveMessage(
            (message) => this.webviewManager.handleMessage(message),
            null,
            this.disposables
        );
    }

    /**
     * Reveals the panel in the editor
     */
    public reveal(): void {
        this.panel.reveal();
    }

    /**
     * Disposes the panel and cleans up resources
     */
    public dispose(): void {
        this.panel.dispose();
        this.webviewManager.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Returns a disposable that fires when the panel is disposed
     */
    public onDidDispose(listener: () => void): vscode.Disposable {
        return this.panel.onDidDispose(listener);
    }

    /**
     * Sets the JSONata expression in the playground
     */
    public setJsonataExpression(expression: string): void {
        this.webviewManager.setJsonataExpression(expression);
    }

    /**
     * Sets the JSON input data in the playground
     */
    public setJsonInput(jsonData: string): void {
        this.webviewManager.setJsonInput(jsonData);
    }
}

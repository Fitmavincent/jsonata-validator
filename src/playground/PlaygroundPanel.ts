import * as vscode from 'vscode';
import { PlaygroundWebviewManager } from './PlaygroundWebviewManager';
import { PlaygroundEditorManager } from './PlaygroundEditorManager';

/**
 * Manages the webview panel for the JSONata playground
 */
export class PlaygroundPanel {
    private panel: vscode.WebviewPanel;
    private webviewManager: PlaygroundWebviewManager;
    private editorManager: PlaygroundEditorManager;
    private disposables: vscode.Disposable[] = [];
    private jsonInputEditor: vscode.TextEditor | undefined;
    private jsonataExpressionEditor: vscode.TextEditor | undefined;

    constructor(private context: vscode.ExtensionContext) {
        // Initialize editor manager first
        this.editorManager = new PlaygroundEditorManager(context);

        // Create the webview panel for results - it will be positioned after editors are created
        this.panel = vscode.window.createWebviewPanel(
            'jsonataPlaygroundResults',
            'JSONata Results',
            { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
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

        // Initialize webview manager for results display
        this.webviewManager = new PlaygroundWebviewManager(this.panel.webview, this.context);

        // Set up event handlers
        this.setupEventHandlers();

        // Initialize the playground
        this.initializePlayground();
    }

    private async initializePlayground(): Promise<void> {
        // Create editor instances with specific layout
        const defaultJsonInput = '{\n  "example": [\n    {"value": 4},\n    {"value": 7},\n    {"value": 13}\n  ]\n}';
        const defaultJsonataExpression = 'example[value > 5].value';

        try {
            // Step 1: Create JSON input editor in Column 1 (left side)
            this.jsonInputEditor = await this.editorManager.createJsonInputEditor(defaultJsonInput);

            // Step 2: Create JSONata expression editor in Column 2 (top right)
            this.jsonataExpressionEditor = await this.editorManager.createJsonataExpressionEditor(defaultJsonataExpression);

            // Step 3: Set up change listeners for real-time updates
            this.editorManager.setOnJsonInputChange((content) => {
                this.webviewManager.updateJsonInput(content);
            });

            this.editorManager.setOnJsonataExpressionChange((content) => {
                this.webviewManager.updateJsonataExpression(content);
            });

            // Step 4: Load the webview content for results (bottom right)
            this.webviewManager.updateWebviewContent();

            // Step 5: Set up the layout properly after a short delay
            setTimeout(async () => {
                await this.ensureProperLayout();
            }, 300);

            // Step 6: Trigger initial evaluation and update available editors
            this.webviewManager.updateJsonInput(defaultJsonInput);
            this.webviewManager.updateJsonataExpression(defaultJsonataExpression);

            // Initialize available editors list
            this.webviewManager.updateAvailableEditors();

        } catch (error) {
            console.error('Failed to initialize playground:', error);
            vscode.window.showErrorMessage('Failed to initialize JSONata playground');
        }
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
        this.editorManager.dispose();

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
    public async setJsonataExpression(expression: string): Promise<void> {
        if (this.jsonataExpressionEditor) {
            await this.editorManager.updateJsonataExpressionContent(expression);
        } else {
            // Store for when editor is ready
            this.webviewManager.setJsonataExpression(expression);
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
            this.webviewManager.setJsonInput(jsonData);
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

    /**
     * Ensures the proper 3-panel layout: JSON input (left), JSONata expression (top right), Results (bottom right)
     */
    private async ensureProperLayout(): Promise<void> {
        try {
            // Wait for editors to be fully initialized
            await new Promise(resolve => setTimeout(resolve, 100));

            // Step 1: Focus JSON input editor in Column 1 (left)
            if (this.jsonInputEditor) {
                await vscode.window.showTextDocument(this.jsonInputEditor.document, {
                    viewColumn: vscode.ViewColumn.One,
                    preserveFocus: true
                });
            }

            // Step 2: Focus JSONata expression editor in Column 2 (top right)
            if (this.jsonataExpressionEditor) {
                await vscode.window.showTextDocument(this.jsonataExpressionEditor.document, {
                    viewColumn: vscode.ViewColumn.Two,
                    preserveFocus: false
                });
            }

            // Wait for layout to settle
            await new Promise(resolve => setTimeout(resolve, 150));

            // Step 3: Split down to create bottom right panel for results
            await vscode.commands.executeCommand('workbench.action.splitEditorDown');

            // Step 4: Show results panel in the newly created bottom area
            this.panel.reveal(vscode.ViewColumn.Active, false);

        } catch (error) {
            console.warn('Layout setup encountered issue, using fallback:', error);
            // Fallback: just show results panel beside other panels
            this.panel.reveal(vscode.ViewColumn.Beside, false);
        }
    }

    /**
     * Manually reorganizes the layout to the desired 3-panel structure
     */
    public async reorganizeLayout(): Promise<void> {
        await this.ensureProperLayout();
    }
}

import * as vscode from 'vscode';
import { PlaygroundPanel } from './PlaygroundPanel';

/**
 * Provider class that manages the JSONata playground functionality
 */
export class PlaygroundProvider {
    private static instance: PlaygroundProvider;
    private currentPanel: PlaygroundPanel | undefined;

    private constructor(private context: vscode.ExtensionContext) {}

    public static getInstance(context?: vscode.ExtensionContext): PlaygroundProvider {
        if (!PlaygroundProvider.instance) {
            if (!context) {
                throw new Error('Context is required to create PlaygroundProvider instance');
            }
            PlaygroundProvider.instance = new PlaygroundProvider(context);
        }
        return PlaygroundProvider.instance;
    }

    /**
     * Opens or focuses the playground panel
     */
    public openPlayground(): void {
        if (this.currentPanel) {
            // If panel already exists, reveal it
            this.currentPanel.reveal();
        } else {
            // Create new panel
            this.currentPanel = new PlaygroundPanel(this.context);

            // Handle panel disposal
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
            });
        }
    }

    /**
     * Closes the playground panel if it exists
     */
    public closePlayground(): void {
        if (this.currentPanel) {
            this.currentPanel.dispose();
            this.currentPanel = undefined;
        }
    }

    /**
     * Checks if the playground is currently open
     */
    public isPlaygroundOpen(): boolean {
        return this.currentPanel !== undefined;
    }

    /**
     * Gets the current playground panel instance
     */
    public getCurrentPlayground(): PlaygroundPanel | undefined {
        return this.currentPanel;
    }

    /**
     * Sets the JSONata expression in the playground
     */
    public async setJsonataExpression(expression: string): Promise<void> {
        if (this.currentPanel) {
            await this.currentPanel.setJsonataExpression(expression);
        }
    }

    /**
     * Sets the JSON input data in the playground
     */
    public async setJsonInput(jsonData: string): Promise<void> {
        if (this.currentPanel) {
            await this.currentPanel.setJsonInput(jsonData);
        }
    }
}

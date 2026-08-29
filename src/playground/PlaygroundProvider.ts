import * as vscode from 'vscode';
import { PlaygroundPanel } from './PlaygroundPanel';
import { ExportService } from '../share/ExportService';
import { ImportService } from '../share/ImportService';
import { PLAYGROUND_OPEN_CONTEXT } from './playgroundViews';

/**
 * Provider class that manages the JSONata playground functionality
 */
export class PlaygroundProvider {
    private static instance: PlaygroundProvider;
    private currentPanel: PlaygroundPanel | undefined;

    private readonly playgroundChangeEmitter = new vscode.EventEmitter<void>();

    /** Fires when a playground opens or closes, so views can re-bind to it */
    public readonly onDidChangePlayground = this.playgroundChangeEmitter.event;

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
            // Create callback functions for share/import
            const onShareCallback = async () => {
                await ExportService.showExportDialog(this);
            };

            const onImportCallback = async () => {
                await ImportService.showImportDialog(this);
            };

            // Create new panel with callbacks
            this.currentPanel = new PlaygroundPanel(
                this.context,
                onShareCallback,
                onImportCallback
            );

            // Handle panel disposal
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
                this.announcePlayground();
            });

            this.announcePlayground();
        }
    }

    /**
     * Publishes whether a playground is open, both as the context key the
     * sources view is gated on and as an event for it to re-bind on.
     */
    private announcePlayground(): void {
        Promise.resolve(vscode.commands.executeCommand(
            'setContext',
            PLAYGROUND_OPEN_CONTEXT,
            this.currentPanel !== undefined
        )).then(undefined, error => {
            console.warn('Error publishing playground state:', error);
        });

        this.playgroundChangeEmitter.fire();
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

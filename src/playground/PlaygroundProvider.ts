import * as vscode from 'vscode';
import { PlaygroundPanel } from './PlaygroundPanel';
import { PlaygroundResultDocument, RESULT_SCHEME } from './PlaygroundResultDocument';
import { ExportService } from '../share/ExportService';
import { ImportService } from '../share/ImportService';
import { PLAYGROUND_OPEN_CONTEXT } from './playgroundViews';

/**
 * Provider class that manages the JSONata playground functionality
 */
export class PlaygroundProvider {
    private static instance: PlaygroundProvider;
    private currentPanel: PlaygroundPanel | undefined;

    /**
     * The result panel's backing document, owned here rather than by the panel
     * so the `jsonata-result` scheme resolves for as long as the extension is
     * active. A tab restored by a window reload or an extension host restart
     * outlives the playground that opened it, and without a provider behind it
     * that tab opens as "Unable to resolve resource" instead of as the
     * read-only editor it was.
     */
    private readonly resultDocument = new PlaygroundResultDocument();

    private readonly playgroundChangeEmitter = new vscode.EventEmitter<void>();

    /** Fires when a playground opens or closes, so views can re-bind to it */
    public readonly onDidChangePlayground = this.playgroundChangeEmitter.event;

    private constructor(private context: vscode.ExtensionContext) {
        context.subscriptions.push(this.resultDocument);
        this.closeRestoredResultTabs();
    }

    /**
     * Closes a result tab left over from a previous window.
     *
     * Nothing but a playground opens one, and no playground can be open yet at
     * activation, so any result tab standing here is the visible half of a
     * session that did not survive a reload: the editors come back, the session
     * behind them does not. Closing it says so, rather than leaving a pane that
     * looks live and never updates. Opening the playground brings a real one
     * back.
     */
    private closeRestoredResultTabs(): void {
        const tabs = vscode.window.tabGroups.all.flatMap(group =>
            group.tabs.filter(tab =>
                tab.input instanceof vscode.TabInputText &&
                tab.input.uri.scheme === RESULT_SCHEME
            )
        );

        if (tabs.length === 0) {
            return;
        }

        Promise.resolve(vscode.window.tabGroups.close(tabs)).then(undefined, error => {
            console.warn('Error closing a restored playground result tab:', error);
        });
    }

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
                this.resultDocument,
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

import * as vscode from 'vscode';
import { PlaygroundSession, ShareService } from './ShareService';
import { PlaygroundProvider } from '../playground/PlaygroundProvider';

/**
 * Service for exporting JSONata playground sessions
 */
export class ExportService {

    /**
     * Exports the current playground session
     */
    public static async exportCurrentSession(
        playgroundProvider: PlaygroundProvider,
        target?: 'clipboard' | 'file'
    ): Promise<boolean> {
        // Get current playground
        const playground = playgroundProvider.getCurrentPlayground();
        if (!playground) {
            vscode.window.showErrorMessage('No playground is currently open. Please open a playground first.');
            return false;
        }

        // Extract current session data
        const sessionData = await this.extractSessionData(playground);
        if (!sessionData) {
            vscode.window.showErrorMessage('Failed to extract playground data.');
            return false;
        }

        // Create shareable session
        const session = ShareService.createShareableSession(
            sessionData.jsonInput,
            sessionData.jsonataExpression,
            sessionData.result,
            sessionData.hasError,
            sessionData.errorMessage,
            'Exported JSONata Playground Session'
        );

        // Convert to shareable string
        const sessionString = ShareService.sessionToShareableString(session);

        // Determine export target
        if (!target) {
            const selectedTarget = await ShareService.showShareOptions();
            if (!selectedTarget) {
                return false;
            }
            target = selectedTarget;
        }

        // Export based on target
        let success = false;
        if (target === 'clipboard') {
            success = await this.exportToClipboard(sessionString);
        } else if (target === 'file') {
            success = await this.exportToFile(sessionString);
        }

        if (success) {
            const targetName = target === 'clipboard' ? 'clipboard' : 'file';
            vscode.window.showInformationMessage(
                `Session exported to ${targetName} successfully!`,
                { detail: 'You can now share this session with others.' }
            );
        }

        return success;
    }

    /**
     * Extracts session data from the current playground
     */
    private static async extractSessionData(playground: any): Promise<{
        jsonInput: string;
        jsonataExpression: string;
        result: string;
        hasError: boolean;
        errorMessage?: string;
    } | null> {
        try {
            // Get the webview manager to access current state
            const webviewManager = playground.webviewManager;
            if (!webviewManager || !webviewManager.currentState) {
                console.error('Webview manager or state not available');
                return null;
            }

            const state = webviewManager.currentState;

            return {
                jsonInput: state.jsonInput || '',
                jsonataExpression: state.jsonataExpression || '',
                result: state.result || '',
                hasError: !!state.error,
                errorMessage: state.error || undefined
            };
        } catch (error) {
            console.error('Failed to extract session data:', error);
            return null;
        }
    }

    /**
     * Exports session to clipboard
     */
    private static async exportToClipboard(sessionString: string): Promise<boolean> {
        const success = await ShareService.copyToClipboard(sessionString);
        if (!success) {
            vscode.window.showErrorMessage('Failed to copy session to clipboard.');
        }
        return success;
    }

    /**
     * Exports session to file
     */
    private static async exportToFile(sessionString: string): Promise<boolean> {
        const success = await ShareService.saveSessionToFile(sessionString);
        if (!success) {
            vscode.window.showErrorMessage('Failed to save session to file.');
        }
        return success;
    }

    /**
     * Shows export options dialog
     */
    public static async showExportDialog(playgroundProvider: PlaygroundProvider): Promise<void> {
        const playground = playgroundProvider.getCurrentPlayground();
        if (!playground) {
            vscode.window.showErrorMessage('No playground is currently open. Please open a playground first.');
            return;
        }

        const options = [
            {
                label: '📋 Export to Clipboard',
                description: 'Copy session data for easy sharing',
                action: () => this.exportCurrentSession(playgroundProvider, 'clipboard')
            },
            {
                label: '💾 Export to File',
                description: 'Save session as .jsonata-session file',
                action: () => this.exportCurrentSession(playgroundProvider, 'file')
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Choose export target for current JSONata session',
            title: 'Export JSONata Playground Session'
        });

        if (selected) {
            await selected.action();
        }
    }

    /**
     * Quick export to clipboard with minimal UI
     */
    public static async quickExportToClipboard(playgroundProvider: PlaygroundProvider): Promise<boolean> {
        return await this.exportCurrentSession(playgroundProvider, 'clipboard');
    }

    /**
     * Quick export to file with minimal UI
     */
    public static async quickExportToFile(playgroundProvider: PlaygroundProvider): Promise<boolean> {
        return await this.exportCurrentSession(playgroundProvider, 'file');
    }

    /**
     * Creates a preview of what will be exported
     */
    public static async showExportPreview(playgroundProvider: PlaygroundProvider): Promise<void> {
        const playground = playgroundProvider.getCurrentPlayground();
        if (!playground) {
            vscode.window.showErrorMessage('No playground is currently open.');
            return;
        }

        const sessionData = await this.extractSessionData(playground);
        if (!sessionData) {
            vscode.window.showErrorMessage('Failed to extract playground data.');
            return;
        }

        const session = ShareService.createShareableSession(
            sessionData.jsonInput,
            sessionData.jsonataExpression,
            sessionData.result,
            sessionData.hasError,
            sessionData.errorMessage,
            'Preview Session'
        );

        const sessionString = ShareService.sessionToShareableString(session);

        // Show preview in a new document
        const doc = await vscode.workspace.openTextDocument({
            content: sessionString,
            language: 'json'
        });

        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });

        vscode.window.showInformationMessage(
            'Session preview opened. You can copy this content to share with others.',
            'Copy to Clipboard'
        ).then(async (selection) => {
            if (selection === 'Copy to Clipboard') {
                await ShareService.copyToClipboard(sessionString);
                vscode.window.showInformationMessage('Session copied to clipboard!');
            }
        });
    }
}

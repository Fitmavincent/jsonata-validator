import * as vscode from 'vscode';
import { PlaygroundSession, ShareService } from './ShareService';
import { PlaygroundProvider } from '../playground/PlaygroundProvider';

/**
 * Service for importing JSONata playground sessions
 */
export class ImportService {

    /**
     * Imports a session from various sources (clipboard, file, or direct session object)
     */
    public static async importSession(
        playgroundProvider: PlaygroundProvider,
        source?: 'clipboard' | 'file' | PlaygroundSession
    ): Promise<boolean> {
        let session: PlaygroundSession | null = null;

        if (!source) {
            // Ask user for import source
            const importSource = await ShareService.showImportOptions();
            if (!importSource) {
                return false;
            }
            source = importSource;
        }

        // Get session data based on source
        if (typeof source === 'object') {
            // Direct session object
            session = source;
        } else if (source === 'clipboard') {
            session = await this.importFromClipboard();
        } else if (source === 'file') {
            session = await this.importFromFile();
        }

        if (!session) {
            vscode.window.showErrorMessage('Failed to load session data.');
            return false;
        }

        // Validate session compatibility
        if (!ShareService.isSessionCompatible(session)) {
            const proceed = await vscode.window.showWarningMessage(
                `This session was created with a different version (${session.version}). ` +
                'Import might not work correctly. Do you want to proceed?',
                'Yes', 'No'
            );
            if (proceed !== 'Yes') {
                return false;
            }
        }

        // Show session info and confirm import
        const description = ShareService.createSessionDescription(session);
        const confirmImport = await vscode.window.showInformationMessage(
            `Import session: ${description}?`,
            { detail: 'This will replace the current playground content.' },
            'Import', 'Cancel'
        );

        if (confirmImport !== 'Import') {
            return false;
        }

        // Import the session
        return await this.applySessionToPlayground(playgroundProvider, session);
    }

    /**
     * Imports session from clipboard
     */
    private static async importFromClipboard(): Promise<PlaygroundSession | null> {
        const clipboardContent = await ShareService.getFromClipboard();
        if (!clipboardContent) {
            vscode.window.showErrorMessage('Clipboard is empty or inaccessible.');
            return null;
        }

        const session = ShareService.parseSharedSession(clipboardContent);
        if (!session) {
            vscode.window.showErrorMessage('Clipboard does not contain valid JSONata session data.');
            return null;
        }

        return session;
    }

    /**
     * Imports session from file
     */
    private static async importFromFile(): Promise<PlaygroundSession | null> {
        const fileContent = await ShareService.loadSessionFromFile();
        if (!fileContent) {
            return null; // User cancelled or error already shown
        }

        const session = ShareService.parseSharedSession(fileContent);
        if (!session) {
            vscode.window.showErrorMessage('Selected file does not contain valid JSONata session data.');
            return null;
        }

        return session;
    }

    /**
     * Applies a session to the playground
     */
    private static async applySessionToPlayground(
        playgroundProvider: PlaygroundProvider,
        session: PlaygroundSession
    ): Promise<boolean> {
        try {
            // Open or get existing playground
            let playground = playgroundProvider.getCurrentPlayground();
            if (!playground) {
                playgroundProvider.openPlayground();
                // Wait for playground to initialize
                await new Promise(resolve => setTimeout(resolve, 1000));
                playground = playgroundProvider.getCurrentPlayground();
            }

            if (!playground) {
                vscode.window.showErrorMessage('Failed to open playground.');
                return false;
            }

            // Apply session data with a delay to ensure editors are ready
            await new Promise(resolve => setTimeout(resolve, 500));

            // Set JSON input
            await playground.setJsonInput(session.data.jsonInput);

            // Wait a bit before setting JSONata expression
            await new Promise(resolve => setTimeout(resolve, 200));

            // Set JSONata expression
            await playground.setJsonataExpression(session.data.jsonataExpression);

            // Show success message
            vscode.window.showInformationMessage(
                'Session imported successfully! The 3-panel layout is ready.',
                { detail: 'JSON input, JSONata template, and results are now loaded.' }
            );

            // Focus the playground
            playground.reveal();

            return true;
        } catch (error) {
            console.error('Failed to apply session to playground:', error);
            vscode.window.showErrorMessage('Failed to import session: ' + (error instanceof Error ? error.message : 'Unknown error'));
            return false;
        }
    }

    /**
     * Shows import session options in the command palette
     */
    public static async showImportDialog(playgroundProvider: PlaygroundProvider): Promise<void> {
        const options = [
            {
                label: '📋 Import from Clipboard',
                description: 'Import JSONata session from clipboard',
                action: () => this.importSession(playgroundProvider, 'clipboard')
            },
            {
                label: '📁 Import from File',
                description: 'Import JSONata session from file',
                action: () => this.importSession(playgroundProvider, 'file')
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Choose import source for JSONata session',
            title: 'Import JSONata Playground Session'
        });

        if (selected) {
            await selected.action();
        }
    }

    /**
     * Quick import from clipboard with minimal UI
     */
    public static async quickImportFromClipboard(playgroundProvider: PlaygroundProvider): Promise<boolean> {
        return await this.importSession(playgroundProvider, 'clipboard');
    }

    /**
     * Quick import from file with minimal UI
     */
    public static async quickImportFromFile(playgroundProvider: PlaygroundProvider): Promise<boolean> {
        return await this.importSession(playgroundProvider, 'file');
    }
}

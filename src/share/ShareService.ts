import * as vscode from 'vscode';

/**
 * Interface for JSONata playground session data that can be shared/imported
 */
export interface PlaygroundSession {
    version: string;
    timestamp: string;
    metadata: {
        extensionVersion: string;
        vscodeVersion: string;
        description?: string;
    };
    data: {
        jsonInput: string;
        jsonataExpression: string;
        result: string;
        hasError: boolean;
        errorMessage?: string;
    };
}

/**
 * Service for sharing and importing JSONata playground sessions
 */
export class ShareService {
    private static readonly CURRENT_VERSION = '1.0.0';
    private static readonly SHARE_FORMAT_VERSION = '1.0';

    /**
     * Creates a shareable session object from the current playground state
     */
    public static createShareableSession(
        jsonInput: string,
        jsonataExpression: string,
        result: string,
        hasError: boolean = false,
        errorMessage?: string,
        description?: string
    ): PlaygroundSession {
        return {
            version: this.SHARE_FORMAT_VERSION,
            timestamp: new Date().toISOString(),
            metadata: {
                extensionVersion: this.getExtensionVersion(),
                vscodeVersion: vscode.version,
                description: description || 'JSONata Playground Session'
            },
            data: {
                jsonInput,
                jsonataExpression,
                result,
                hasError,
                errorMessage
            }
        };
    }

    /**
     * Converts a session object to a formatted JSON string for sharing
     */
    public static sessionToShareableString(session: PlaygroundSession): string {
        return JSON.stringify(session, null, 2);
    }

    /**
     * Parses a shared session string and validates its format
     */
    public static parseSharedSession(sessionString: string): PlaygroundSession | null {
        try {
            const session = JSON.parse(sessionString) as PlaygroundSession;

            // Basic validation
            if (!this.isValidSession(session)) {
                return null;
            }

            return session;
        } catch (error) {
            console.error('Failed to parse shared session:', error);
            return null;
        }
    }

    /**
     * Validates that a session object has the required structure
     */
    private static isValidSession(session: any): session is PlaygroundSession {
        return (
            session &&
            typeof session === 'object' &&
            typeof session.version === 'string' &&
            typeof session.timestamp === 'string' &&
            session.metadata &&
            typeof session.metadata === 'object' &&
            typeof session.metadata.extensionVersion === 'string' &&
            typeof session.metadata.vscodeVersion === 'string' &&
            session.data &&
            typeof session.data === 'object' &&
            typeof session.data.jsonInput === 'string' &&
            typeof session.data.jsonataExpression === 'string' &&
            typeof session.data.result === 'string' &&
            typeof session.data.hasError === 'boolean'
        );
    }

    /**
     * Copies a session string to the clipboard
     */
    public static async copyToClipboard(sessionString: string): Promise<boolean> {
        try {
            await vscode.env.clipboard.writeText(sessionString);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Gets session string from clipboard
     */
    public static async getFromClipboard(): Promise<string | null> {
        try {
            return await vscode.env.clipboard.readText();
        } catch (error) {
            console.error('Failed to read from clipboard:', error);
            return null;
        }
    }

    /**
     * Shows a quick pick to let user choose export format
     */
    public static async showShareOptions(): Promise<'clipboard' | 'file' | null> {
        const options = [
            {
                label: '📋 Copy to Clipboard',
                description: 'Copy session data for easy sharing',
                value: 'clipboard' as const
            },
            {
                label: '💾 Save to File',
                description: 'Save session as .jsonata-session file',
                value: 'file' as const
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'How would you like to share this session?',
            title: 'Share JSONata Session'
        });

        return selected?.value || null;
    }

    /**
     * Shows a quick pick to let user choose import source
     */
    public static async showImportOptions(): Promise<'clipboard' | 'file' | null> {
        const options = [
            {
                label: '📋 From Clipboard',
                description: 'Import session data from clipboard',
                value: 'clipboard' as const
            },
            {
                label: '📁 From File',
                description: 'Import session from .jsonata-session file',
                value: 'file' as const
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Where would you like to import the session from?',
            title: 'Import JSONata Session'
        });

        return selected?.value || null;
    }

    /**
     * Saves session to a file
     */
    public static async saveSessionToFile(sessionString: string): Promise<boolean> {
        try {
            const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const uri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri ? vscode.Uri.joinPath(defaultUri, 'playground-session.jsonata-session') : undefined,
                filters: {
                    'JSONata Session': ['jsonata-session'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                title: 'Save JSONata Playground Session'
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(sessionString, 'utf8'));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to save session to file:', error);
            return false;
        }
    }

    /**
     * Loads session from a file
     */
    public static async loadSessionFromFile(): Promise<string | null> {
        try {
            const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const uris = await vscode.window.showOpenDialog({
                defaultUri,
                canSelectFiles: true,
                canSelectMany: false,
                filters: {
                    'JSONata Session': ['jsonata-session'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                title: 'Open JSONata Playground Session'
            });

            if (uris && uris.length > 0) {
                const content = await vscode.workspace.fs.readFile(uris[0]);
                return Buffer.from(content).toString('utf8');
            }
            return null;
        } catch (error) {
            console.error('Failed to load session from file:', error);
            return null;
        }
    }

    /**
     * Gets the current extension version
     */
    private static getExtensionVersion(): string {
        try {
            const extension = vscode.extensions.getExtension('Fitmavincent.jsonata-validator');
            return extension?.packageJSON?.version || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * Creates a session description from metadata
     */
    public static createSessionDescription(session: PlaygroundSession): string {
        const date = new Date(session.timestamp).toLocaleString();
        const hasError = session.data.hasError ? ' (with errors)' : '';
        return `JSONata Session from ${date}${hasError}`;
    }

    /**
     * Validates if a session is compatible with current extension
     */
    public static isSessionCompatible(session: PlaygroundSession): boolean {
        // For now, we accept all versions, but this can be extended for future compatibility checks
        return session.version === this.SHARE_FORMAT_VERSION;
    }
}

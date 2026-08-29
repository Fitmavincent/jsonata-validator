import * as vscode from 'vscode';
import { PlaygroundProvider } from './PlaygroundProvider';
import { EditorInfo, PlaygroundSourceKind } from './PlaygroundSession';
import { SOURCES_VIEW_ID } from './playgroundViews';

/** What the webview posts back, and the state it is given to render */
interface SourcesMessage {
    type: 'selectSource' | 'command';
    kind?: PlaygroundSourceKind;
    editorId?: string | null;
    command?: string;
}

/** The commands the buttons in the bar are allowed to run */
const BAR_COMMANDS = new Set([
    'jsonata-validator.refreshPlaygroundResult',
    'jsonata-validator.sharePlaygroundSession',
    'jsonata-validator.importPlaygroundSession'
]);

function nonce(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let index = 0; index < 32; index++) {
        value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return value;
}

/**
 * The two source selections, as the pair of labelled dropdowns the results
 * webview used to carry above the output.
 *
 * The results panel is a read-only editor now and has nowhere to hang a
 * dropdown, so the bar moved into a view of its own. Everything else about it
 * is as it was: both sources listed side by side, each naming the open tab it
 * reads from, with Refresh, Share and Import alongside.
 */
export class PlaygroundSourcesView implements vscode.WebviewViewProvider, vscode.Disposable {

    private view: vscode.WebviewView | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    // Replaced whenever a new playground opens, rather than living as long as
    // the view does, so it is tracked apart from `disposables`
    private sourcesSubscription: vscode.Disposable | undefined;

    constructor(private readonly provider: PlaygroundProvider) {
        this.disposables.push(
            provider.onDidChangePlayground(() => this.followCurrentPlayground())
        );

        this.followCurrentPlayground();
    }

    /**
     * Contributes the bar to the window. Separate from construction because a
     * view id admits only one provider, so claiming it is the caller's call.
     */
    public register(): void {
        this.disposables.push(
            vscode.window.registerWebviewViewProvider(SOURCES_VIEW_ID, this, {
                webviewOptions: { retainContextWhenHidden: true }
            })
        );
    }

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this.render(view.webview);

        view.webview.onDidReceiveMessage(
            (message: SourcesMessage) => this.handleMessage(message),
            undefined,
            this.disposables
        );

        // A hidden view is torn down unless its state is retained, and even
        // then it is re-resolved after a window reload
        view.onDidDispose(() => {
            if (this.view === view) {
                this.view = undefined;
            }
        }, undefined, this.disposables);

        this.publish();
    }

    private handleMessage(message: SourcesMessage): void {
        if (message.type === 'selectSource' && message.kind) {
            this.provider.getCurrentPlayground()?.selectSource(
                message.kind,
                message.editorId ?? null
            );
            return;
        }

        // Only the bar's own three buttons, so a compromised webview cannot
        // reach the rest of the command palette
        if (message.type === 'command' && message.command && BAR_COMMANDS.has(message.command)) {
            Promise.resolve(vscode.commands.executeCommand(message.command)).then(undefined, error => {
                console.warn('Error running a playground sources command:', error);
            });
        }
    }

    /** Hands the webview the open editors and which of them each source reads */
    private publish(): void {
        const state = this.provider.getCurrentPlayground()?.currentState;

        this.view?.webview.postMessage({
            type: 'state',
            availableEditors: state?.availableEditors ?? ([] as EditorInfo[]),
            input: state?.selectedJsonInputEditor ?? null,
            template: state?.selectedTemplateEditor ?? null
        });
    }

    private followCurrentPlayground(): void {
        this.sourcesSubscription?.dispose();
        this.sourcesSubscription = this.provider
            .getCurrentPlayground()
            ?.onDidChangeSources(() => this.publish());

        this.publish();
    }

    private render(webview: vscode.Webview): string {
        const scriptNonce = nonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    /* No background of its own, so the bar sits on whichever container it is
       dragged into - the panel it opens in, or the sidebar */
    body {
        margin: 0;
        padding: 0;
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
    }

    .controls {
        padding: 8px 15px;
        display: flex;
        gap: 15px;
        align-items: flex-end;
        flex-wrap: wrap;
    }

    .control-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1 1 200px;
        min-width: 160px;
    }

    .control-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .control-select {
        background-color: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border);
        padding: 4px 8px;
        font-size: 12px;
        border-radius: 2px;
        width: 100%;
    }

    .control-select:focus {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }

    .refresh-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 2px;
        cursor: pointer;
        height: 24px;
    }

    .refresh-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
    }

    .share-controls {
        display: flex;
        gap: 8px;
        margin-left: auto;
    }

    .share-btn {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border);
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 2px;
        cursor: pointer;
        height: 24px;
    }

    .share-btn:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
    }
</style>
</head>
<body>
    <div class="controls">
        <div class="control-group">
            <label class="control-label" for="jsonInputSelect">JSON Input Source</label>
            <select id="jsonInputSelect" class="control-select">
                <option value="">Default (Internal Editor)</option>
            </select>
        </div>
        <div class="control-group">
            <label class="control-label" for="templateSelect">JSONata Template Source</label>
            <select id="templateSelect" class="control-select">
                <option value="">Default (Internal Editor)</option>
            </select>
        </div>
        <button id="refreshBtn" class="refresh-btn" title="Re-read every source and evaluate again">Refresh</button>
        <div class="share-controls">
            <button id="shareBtn" class="share-btn" title="Share current session">Share</button>
            <button id="importBtn" class="share-btn" title="Import session">Import</button>
        </div>
    </div>

<script nonce="${scriptNonce}">
    (function () {
        const vscode = acquireVsCodeApi();
        const selects = {
            input: document.getElementById('jsonInputSelect'),
            template: document.getElementById('templateSelect')
        };

        for (const [kind, select] of Object.entries(selects)) {
            select.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'selectSource',
                    kind: kind,
                    editorId: select.value || null
                });
            });
        }

        const run = (id, command) => document.getElementById(id).addEventListener('click', () => {
            vscode.postMessage({ type: 'command', command: command });
        });
        run('refreshBtn', 'jsonata-validator.refreshPlaygroundResult');
        run('shareBtn', 'jsonata-validator.sharePlaygroundSession');
        run('importBtn', 'jsonata-validator.importPlaygroundSession');

        function fill(select, editors, selected) {
            // Rebuilding drops the open list, so a dropdown the user is
            // currently looking through is left alone until they are done
            if (document.activeElement === select) {
                return;
            }

            select.innerHTML = '';
            const fallback = document.createElement('option');
            fallback.value = '';
            fallback.textContent = 'Default (Internal Editor)';
            select.appendChild(fallback);

            for (const editor of editors) {
                const option = document.createElement('option');
                option.value = editor.id;
                option.textContent = editor.fileName + ' (' + editor.language + ')' + (editor.isDirty ? ' ●' : '');
                select.appendChild(option);
            }

            select.value = selected || '';
        }

        window.addEventListener('message', event => {
            const state = event.data;
            if (!state || state.type !== 'state') {
                return;
            }

            fill(selects.input, state.availableEditors, state.input);
            fill(selects.template, state.availableEditors, state.template);
        });
    }());
</script>
</body>
</html>`;
    }

    public dispose(): void {
        this.sourcesSubscription?.dispose();
        this.sourcesSubscription = undefined;

        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
    }
}

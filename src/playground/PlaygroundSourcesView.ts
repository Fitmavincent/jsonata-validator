import * as vscode from 'vscode';
import { PlaygroundProvider } from './PlaygroundProvider';
import { PlaygroundSourceKind } from './PlaygroundSession';

/** Matches the view contributed in package.json */
export const SOURCES_VIEW_ID = 'jsonataPlaygroundSources';

/** How each source is named in the view, and what picking it runs */
const ROWS: {
    kind: PlaygroundSourceKind;
    label: string;
    icon: string;
    command: string;
}[] = [
    {
        kind: 'input',
        label: 'JSON input',
        icon: 'json',
        command: 'jsonata-validator.selectPlaygroundInputSource'
    },
    {
        kind: 'template',
        label: 'JSONata expression',
        icon: 'file-code',
        command: 'jsonata-validator.selectPlaygroundTemplateSource'
    }
];

/**
 * The two source selections, as a pair of rows in the Explorer.
 *
 * The results webview used to carry them as labelled dropdowns, and a
 * read-only editor has nowhere to hang those. A row does the same two jobs a
 * dropdown did - it names what is selected, and it is one click from changing
 * it - while staying on screen the whole time the playground is open.
 */
export class PlaygroundSourcesView
    implements vscode.TreeDataProvider<PlaygroundSourceKind>, vscode.Disposable {

    private readonly changeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.changeEmitter.event;

    private readonly disposables: vscode.Disposable[] = [];

    // Held separately from `disposables` because it is replaced every time a
    // new playground opens, rather than living as long as the view does
    private sourcesSubscription: vscode.Disposable | undefined;

    constructor(private readonly provider: PlaygroundProvider) {
        this.disposables.push(
            vscode.window.registerTreeDataProvider(SOURCES_VIEW_ID, this),
            provider.onDidChangePlayground(() => this.followCurrentPlayground())
        );

        this.followCurrentPlayground();
    }

    public getChildren(element?: PlaygroundSourceKind): PlaygroundSourceKind[] {
        return element ? [] : ROWS.map(row => row.kind);
    }

    public getTreeItem(kind: PlaygroundSourceKind): vscode.TreeItem {
        const row = ROWS.find(candidate => candidate.kind === kind)!;

        // The view is only shown while a playground is open, but the tree can
        // still be asked to render one frame after it closes
        const source = this.provider.getCurrentPlayground()?.sourceLabels[kind] ?? 'Playground';

        const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None);
        item.description = source;
        item.iconPath = new vscode.ThemeIcon(row.icon);
        item.contextValue = `jsonataPlaygroundSource.${kind}`;
        item.tooltip = new vscode.MarkdownString(
            `The **${row.label}** is read from \`${source}\`.\n\n` +
            'Click to read it from another open editor instead.'
        );
        item.command = {
            command: row.command,
            title: `Choose the ${row.label} source`
        };

        return item;
    }

    /** Re-renders on every change to the playground, or to what it reads from */
    private followCurrentPlayground(): void {
        this.sourcesSubscription?.dispose();
        this.sourcesSubscription = this.provider
            .getCurrentPlayground()
            ?.onDidChangeSources(() => this.changeEmitter.fire());

        this.changeEmitter.fire();
    }

    public dispose(): void {
        this.sourcesSubscription?.dispose();
        this.sourcesSubscription = undefined;

        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
        this.changeEmitter.dispose();
    }
}

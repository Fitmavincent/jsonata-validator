import * as assert from 'assert';
import * as vscode from 'vscode';
import { PlaygroundProvider } from '../playground/PlaygroundProvider';
import { PlaygroundSourceKind } from '../playground/PlaygroundSession';
import { PlaygroundSourcesView } from '../playground/PlaygroundSourcesView';

/**
 * Stands in for an open playground. Only the two members the view reads are
 * needed, so the real panel - which would take over the editor layout - is not.
 */
function stubPlayground(labels: Record<PlaygroundSourceKind, string>, onDidChangeSources: vscode.Event<void>) {
	return { sourceLabels: labels, onDidChangeSources };
}

suite('Playground Sources View Test Suite', () => {

	let view: PlaygroundSourcesView;
	let playgroundChanges: vscode.EventEmitter<void>;
	let sourceChanges: vscode.EventEmitter<void>;
	let playground: ReturnType<typeof stubPlayground> | undefined;

	setup(() => {
		playgroundChanges = new vscode.EventEmitter<void>();
		sourceChanges = new vscode.EventEmitter<void>();
		playground = stubPlayground({ input: 'Playground', template: 'Playground' }, sourceChanges.event);

		const provider = {
			onDidChangePlayground: playgroundChanges.event,
			getCurrentPlayground: () => playground
		} as unknown as PlaygroundProvider;

		view = new PlaygroundSourcesView(provider);
	});

	teardown(() => {
		view.dispose();
		sourceChanges.dispose();
		playgroundChanges.dispose();
	});

	test('shows a row per source, each naming what it reads from', () => {
		const kinds = view.getChildren();
		assert.deepStrictEqual(kinds, ['input', 'template']);

		const rows = kinds.map(kind => view.getTreeItem(kind));
		assert.deepStrictEqual(rows.map(row => row.label), ['JSON input', 'JSONata expression']);

		// The half a dropdown does that a hidden command cannot: say what is selected
		assert.deepStrictEqual(rows.map(row => row.description), ['Playground', 'Playground']);
	});

	test('clicking a row opens the picker for that source alone', () => {
		assert.strictEqual(
			view.getTreeItem('input').command?.command,
			'jsonata-validator.selectPlaygroundInputSource'
		);
		assert.strictEqual(
			view.getTreeItem('template').command?.command,
			'jsonata-validator.selectPlaygroundTemplateSource'
		);
	});

	test('follows the playground when a source is pointed somewhere else', async () => {
		const rendered = new Promise<void>(resolve => {
			const subscription = view.onDidChangeTreeData(() => {
				subscription.dispose();
				resolve();
			});
		});

		playground = stubPlayground({ input: 'sample-data.json', template: 'Playground' }, sourceChanges.event);
		sourceChanges.fire();
		await rendered;

		assert.strictEqual(view.getTreeItem('input').description, 'sample-data.json');
		assert.strictEqual(view.getTreeItem('template').description, 'Playground');
	});

	test('falls back to the playground label once the playground is gone', () => {
		playground = undefined;
		playgroundChanges.fire();

		assert.strictEqual(view.getTreeItem('input').description, 'Playground');
	});
});

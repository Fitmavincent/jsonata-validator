// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PlaygroundProvider } from './playground/PlaygroundProvider';
import { PlaygroundSourcesView } from './playground/PlaygroundSourcesView';
import { ValidationService } from './validation/ValidationService';
import { isJsonataFile } from './utils/jsonataUtils';
import { getValidatorConfiguration, registerConfigurationWatcher } from './utils/configuration';
import { Debouncer } from './utils/debounce';
import { ExportService } from './share/ExportService';
import { ImportService } from './share/ImportService';

// How long typing has to pause before a document is re-validated
const VALIDATION_DEBOUNCE_MS = 500;

// Diagnostic collection for JSONata validation errors
let diagnosticCollection: vscode.DiagnosticCollection;
let validationService: ValidationService;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('JSONata Validator extension is now active!');

	// Create diagnostic collection
	diagnosticCollection = vscode.languages.createDiagnosticCollection('jsonata');
	context.subscriptions.push(diagnosticCollection);

	// Initialize validation service
	validationService = new ValidationService(diagnosticCollection);

	// Initialize playground provider
	const playgroundProvider = PlaygroundProvider.getInstance(context);

	// The two source selections, shown in the Explorer while a playground is open
	const playgroundSourcesView = new PlaygroundSourcesView(playgroundProvider);

	// Register commands
	const validateDocumentCommand = vscode.commands.registerCommand('jsonata-validator.validateDocument', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			validationService.validateDocument(editor.document);
		}
	});

	const validateSelectionCommand = vscode.commands.registerCommand('jsonata-validator.validateSelection', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.selection && !editor.selection.isEmpty) {
			const selectedText = editor.document.getText(editor.selection);
			validationService.validateSelection(editor.document, selectedText, editor.selection);
		}
	});

	const openPlaygroundCommand = vscode.commands.registerCommand('jsonata-validator.openPlayground', () => {
		playgroundProvider.openPlayground();
	});

	const openPlaygroundWithSelectionCommand = vscode.commands.registerCommand('jsonata-validator.openPlaygroundWithSelection', async () => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.selection && !editor.selection.isEmpty) {
			const selectedText = editor.document.getText(editor.selection);
			playgroundProvider.openPlayground();
			// Set the selected text as the JSONata expression
			setTimeout(async () => {
				await playgroundProvider.setJsonataExpression(selectedText);
			}, 500); // Longer delay to ensure editors are ready
		} else {
			playgroundProvider.openPlayground();
		}
	});

	const populatePlaygroundFromActiveEditor = vscode.commands.registerCommand('jsonata-validator.populatePlaygroundFromActiveEditor', async () => {
		const playground = playgroundProvider.getCurrentPlayground();
		if (playground) {
			await playground.populateFromActiveEditor();
		} else {
			vscode.window.showInformationMessage('No playground is currently open. Opening playground...');
			playgroundProvider.openPlayground();
			setTimeout(async () => {
				const newPlayground = playgroundProvider.getCurrentPlayground();
				if (newPlayground) {
					await newPlayground.populateFromActiveEditor();
				}
			}, 1000);
		}
	});

	// Result panel commands, which the result editor's title bar surfaces as buttons
	const refreshPlaygroundResultCommand = vscode.commands.registerCommand('jsonata-validator.refreshPlaygroundResult', () => {
		playgroundProvider.getCurrentPlayground()?.refresh();
	});

	const selectPlaygroundSourcesCommand = vscode.commands.registerCommand('jsonata-validator.selectPlaygroundSources', async () => {
		await playgroundProvider.getCurrentPlayground()?.pickSources();
	});

	// One command per source, which is what the two status bar entries click
	// through to, and what lets either be re-pointed without walking both
	const selectPlaygroundInputSourceCommand = vscode.commands.registerCommand('jsonata-validator.selectPlaygroundInputSource', async () => {
		await playgroundProvider.getCurrentPlayground()?.pickSource('input');
	});

	const selectPlaygroundTemplateSourceCommand = vscode.commands.registerCommand('jsonata-validator.selectPlaygroundTemplateSource', async () => {
		await playgroundProvider.getCurrentPlayground()?.pickSource('template');
	});

	const copyPlaygroundResultCommand = vscode.commands.registerCommand('jsonata-validator.copyPlaygroundResult', async () => {
		await playgroundProvider.getCurrentPlayground()?.copyResult();
	});

	// Share/Import commands
	const sharePlaygroundSessionCommand = vscode.commands.registerCommand('jsonata-validator.sharePlaygroundSession', async () => {
		await ExportService.showExportDialog(playgroundProvider);
	});

	const importPlaygroundSessionCommand = vscode.commands.registerCommand('jsonata-validator.importPlaygroundSession', async () => {
		await ImportService.showImportDialog(playgroundProvider);
	});

	const exportPlaygroundToClipboardCommand = vscode.commands.registerCommand('jsonata-validator.exportPlaygroundToClipboard', async () => {
		await ExportService.quickExportToClipboard(playgroundProvider);
	});

	const importPlaygroundFromClipboardCommand = vscode.commands.registerCommand('jsonata-validator.importPlaygroundFromClipboard', async () => {
		await ImportService.quickImportFromClipboard(playgroundProvider);
	});

	// Register event listeners
	const validationDebouncer = new Debouncer(VALIDATION_DEBOUNCE_MS);

	// Settings such as the line comment warning change what gets reported, so
	// refresh what is already on screen rather than waiting for the next edit
	const configurationWatcher = registerConfigurationWatcher(() => {
		vscode.workspace.textDocuments.forEach(document => {
			if (isJsonataFile(document)) {
				validationService.validateDocument(document);
			}
		});
	});

	const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
		if (!isJsonataFile(event.document) || !getValidatorConfiguration().validateOnType) {
			return;
		}

		// Collapse a burst of keystrokes into a single validation pass
		const document = event.document;
		validationDebouncer.schedule(() => validationService.validateDocument(document), document.uri.toString());
	});

	const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => {
		if (!isJsonataFile(document) || !getValidatorConfiguration().validateOnSave) {
			return;
		}

		// Saving supersedes anything the debouncer is still holding
		validationDebouncer.cancel(document.uri.toString());
		validationService.validateDocument(document);
	});

	const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(document => {
		if (isJsonataFile(document)) {
			validationService.validateDocument(document);
		}
	});

	const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument(document => {
		validationDebouncer.cancel(document.uri.toString());
		diagnosticCollection.delete(document.uri);
	});

	// Add all subscriptions
	context.subscriptions.push(
		validateDocumentCommand,
		validateSelectionCommand,
		openPlaygroundCommand,
		openPlaygroundWithSelectionCommand,
		populatePlaygroundFromActiveEditor,
		refreshPlaygroundResultCommand,
		selectPlaygroundSourcesCommand,
		selectPlaygroundInputSourceCommand,
		selectPlaygroundTemplateSourceCommand,
		copyPlaygroundResultCommand,
		sharePlaygroundSessionCommand,
		importPlaygroundSessionCommand,
		exportPlaygroundToClipboardCommand,
		importPlaygroundFromClipboardCommand,
		onDidChangeTextDocument,
		onDidSaveTextDocument,
		onDidOpenTextDocument,
		onDidCloseTextDocument,
		configurationWatcher,
		validationDebouncer,
		playgroundSourcesView
	);

	// Validate already open documents
	vscode.workspace.textDocuments.forEach(document => {
		if (isJsonataFile(document)) {
			validationService.validateDocument(document);
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (diagnosticCollection) {
		diagnosticCollection.dispose();
	}
}

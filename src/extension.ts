// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PlaygroundProvider } from './playground/PlaygroundProvider';
import { ValidationService } from './validation/ValidationService';
import { isJsonataFile } from './utils/jsonataUtils';
import { ExportService } from './share/ExportService';
import { ImportService } from './share/ImportService';

// Diagnostic collection for JSONata validation errors
let diagnosticCollection: vscode.DiagnosticCollection;
let validationService: ValidationService;

// Pending validations keyed by document URI, so a burst of keystrokes results
// in a single validation instead of one per character
const pendingValidations = new Map<string, NodeJS.Timeout>();
const VALIDATION_DEBOUNCE_MS = 500;

function scheduleValidation(document: vscode.TextDocument): void {
	const key = document.uri.toString();
	const pending = pendingValidations.get(key);

	if (pending) {
		clearTimeout(pending);
	}

	pendingValidations.set(key, setTimeout(() => {
		pendingValidations.delete(key);
		validationService.validateDocument(document);
	}, VALIDATION_DEBOUNCE_MS));
}

function cancelPendingValidation(document: vscode.TextDocument): void {
	const key = document.uri.toString();
	const pending = pendingValidations.get(key);

	if (pending) {
		clearTimeout(pending);
		pendingValidations.delete(key);
	}
}

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

	// Initialize playground provider with validation service
	const playgroundProvider = PlaygroundProvider.getInstance(context, validationService);

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
	const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
		const config = vscode.workspace.getConfiguration('jsonataValidator');
		if (config.get<boolean>('validateOnType', true)) {
			if (isJsonataFile(event.document)) {
				scheduleValidation(event.document);
			}
		}
	});

	const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => {
		const config = vscode.workspace.getConfiguration('jsonataValidator');
		if (config.get<boolean>('validateOnSave', true)) {
			if (isJsonataFile(document)) {
				cancelPendingValidation(document);
				validationService.validateDocument(document);
			}
		}
	});

	const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(document => {
		if (isJsonataFile(document)) {
			validationService.validateDocument(document);
		}
	});

	const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument(document => {
		cancelPendingValidation(document);
		diagnosticCollection.delete(document.uri);
	});

	// Settings such as the line comment warning change what is reported, so
	// refresh the open documents rather than waiting for the next edit
	const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(event => {
		if (!event.affectsConfiguration('jsonataValidator')) {
			return;
		}

		vscode.workspace.textDocuments.forEach(document => {
			if (isJsonataFile(document)) {
				validationService.validateDocument(document);
			}
		});
	});

	// Add all subscriptions
	context.subscriptions.push(
		validateDocumentCommand,
		validateSelectionCommand,
		openPlaygroundCommand,
		openPlaygroundWithSelectionCommand,
		populatePlaygroundFromActiveEditor,
		sharePlaygroundSessionCommand,
		importPlaygroundSessionCommand,
		exportPlaygroundToClipboardCommand,
		importPlaygroundFromClipboardCommand,
		onDidChangeTextDocument,
		onDidSaveTextDocument,
		onDidOpenTextDocument,
		onDidCloseTextDocument,
		onDidChangeConfiguration
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
	pendingValidations.forEach(timeout => clearTimeout(timeout));
	pendingValidations.clear();

	if (diagnosticCollection) {
		diagnosticCollection.dispose();
	}
}

import * as vscode from 'vscode';

const SECTION = 'jsonataValidator';

export interface ValidatorConfiguration {
	validateOnType: boolean;
	validateOnSave: boolean;
	maxNumberOfProblems: number;
	warnOnUnsupportedLineComments: boolean;
}

let cached: ValidatorConfiguration | undefined;

function read(): ValidatorConfiguration {
	const config = vscode.workspace.getConfiguration(SECTION);
	return {
		validateOnType: config.get<boolean>('validateOnType', true),
		validateOnSave: config.get<boolean>('validateOnSave', true),
		maxNumberOfProblems: config.get<number>('maxNumberOfProblems', 100),
		warnOnUnsupportedLineComments: config.get<boolean>('warnOnUnsupportedLineComments', true)
	};
}

/**
 * Returns the extension settings, reading them from VS Code only when they have
 * actually changed. The document-change listener consults these on every
 * keystroke, which is too hot a path for a settings lookup.
 */
export function getValidatorConfiguration(): ValidatorConfiguration {
	if (!cached) {
		cached = read();
	}
	return cached;
}

/**
 * Keeps the cached settings in sync with the user's configuration.
 *
 * `onChange` runs after the cache is dropped, so anything it triggers already
 * sees the new settings.
 */
export function registerConfigurationWatcher(onChange?: () => void): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration(SECTION)) {
			cached = undefined;
			onChange?.();
		}
	});
}

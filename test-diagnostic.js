// Test creating a specific diagnostic at line 10, position 13
const vscode = require('vscode');

// This simulates what the extension should be doing
function testDiagnostic() {
    const targetLine = 10; // 0-indexed - this should appear as line 11 in VS Code
    const targetStartChar = 13; // Position of the comma
    const targetEndChar = 14;

    console.log(`Creating diagnostic at line ${targetLine} (0-indexed), position ${targetStartChar}-${targetEndChar}`);
    console.log(`This should appear in VS Code as line ${targetLine + 1} (1-indexed)`);

    const range = new vscode.Range(
        new vscode.Position(targetLine, targetStartChar),
        new vscode.Position(targetLine, targetEndChar)
    );

    const diagnostic = new vscode.Diagnostic(
        range,
        'Test diagnostic to verify position',
        vscode.DiagnosticSeverity.Error
    );

    return diagnostic;
}

module.exports = { testDiagnostic };

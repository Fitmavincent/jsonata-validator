import * as vscode from 'vscode';
import jsonata from 'jsonata';
import { extractJsonataExpressionsFromPureJsonata } from './expressionExtractor';

/**
 * Validation service for JSONata expressions
 */
export class ValidationService {
    constructor(private diagnosticCollection: vscode.DiagnosticCollection) {}

    /**
     * Check if a document is a JSONata file
     */
    private isJsonataFile(document: vscode.TextDocument): boolean {
        return document.languageId === 'jsonata' || document.fileName.endsWith('.jsonata');
    }

    /**
     * Validate an entire document
     */
    public validateDocument(document: vscode.TextDocument): void {
        // Only validate .jsonata files
        if (!this.isJsonataFile(document)) {
            // Clear any existing diagnostics for non-jsonata files
            this.diagnosticCollection.set(document.uri, []);
            return;
        }

        const text = document.getText();
        const diagnostics = this.validateJsonataText(text, document);
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Validate a selection within a document
     */
    public validateSelection(document: vscode.TextDocument, selectedText: string, selection: vscode.Selection): void {
        // Only validate selections in JSONata files
        if (!this.isJsonataFile(document)) {
            vscode.window.showWarningMessage('Selection validation is only available for .jsonata files');
            return;
        }

        const diagnostics = this.validateJsonataText(selectedText, document, selection.start);

        // Show results in a message
        if (diagnostics.length === 0) {
            vscode.window.showInformationMessage('✓ JSONata selection is valid');
        } else {
            const errorCount = diagnostics.length;
            vscode.window.showErrorMessage(`✗ JSONata selection has ${errorCount} error${errorCount > 1 ? 's' : ''}`);
        }
    }

    /**
     * Validate JSONata text and return diagnostics
     */
    private validateJsonataText(text: string, document: vscode.TextDocument, offset?: vscode.Position): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const config = vscode.workspace.getConfiguration('jsonataValidator');
        const maxProblems = config.get<number>('maxNumberOfProblems', 100);

        // Only validate JSONata files
        if (!this.isJsonataFile(document)) {
            return diagnostics;
        }

        // For JSONata files, validate the entire content as JSONata expressions
        const expressions = extractJsonataExpressionsFromPureJsonata(text);

        for (const expression of expressions) {
            if (diagnostics.length >= maxProblems) {
                break;
            }

            const expressionDiagnostics = this.validateSingleJsonataExpression(
                expression.expression,
                document,
                expression.line,
                expression.startPos,
                expression.endPos,
                offset
            );
            diagnostics.push(...expressionDiagnostics);
        }

        return diagnostics;
    }

    /**
     * Validate a single JSONata expression and return diagnostics
     */
    private validateSingleJsonataExpression(
        expression: string,
        document: vscode.TextDocument,
        lineIndex: number,
        startPos: number,
        endPos: number,
        offset?: vscode.Position
    ): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        if (!expression.trim()) {
            return diagnostics;
        }

        try {
            // Attempt to compile the JSONata expression
            jsonata(expression);
        } catch (error: any) {
            // JSONata provides detailed error information
            const diagnostic = this.createDiagnosticFromJsonataError(
                error,
                expression,
                document,
                lineIndex,
                startPos,
                endPos,
                offset
            );

            if (diagnostic) {
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    /**
     * Create a diagnostic from JSONata error information
     */
    private createDiagnosticFromJsonataError(
        error: any,
        expression: string,
        document: vscode.TextDocument,
        lineIndex: number,
        expressionStartPos: number,
        expressionEndPos: number,
        offset?: vscode.Position
    ): vscode.Diagnostic | null {
        // JSONata error structure: { code, position, token, value, message, stack }
        let message = error.message || 'JSONata syntax error';

        // Calculate the exact position within the document
        const errorLocation = this.calculateErrorLocation(
            expression,
            error.position,
            error.token,
            lineIndex,
            expressionStartPos,
            document
        );

        // Enhance error message with JSONata error details
        if (error.code) {
            message = `[${error.code}] ${message}`;
        }

        if (error.token && error.value && error.token !== error.value && error.value !== 'undefined') {
            message += ` (expected '${error.value}', got '${error.token}')`;
        }

        const range = this.calculateErrorRange(
            document,
            errorLocation.line,
            errorLocation.startChar,
            errorLocation.endChar,
            offset
        );

        const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error
        );

        diagnostic.source = 'jsonata-validator';

        // Add error code if available
        if (error.code) {
            diagnostic.code = error.code;
        }

        return diagnostic;
    }

    /**
     * Calculate the exact error location within multi-line expressions
     */
    private calculateErrorLocation(
        expression: string,
        errorPosition: number,
        errorToken: string,
        startLineIndex: number,
        expressionStartPos: number,
        document: vscode.TextDocument
    ): { line: number; startChar: number; endChar: number } {
        if (typeof errorPosition !== 'number' || errorPosition < 0) {
            // Fallback: highlight the entire expression
            return {
                line: startLineIndex,
                startChar: expressionStartPos,
                endChar: expressionStartPos + (expression.split('\n')[0]?.length || 0)
            };
        }

        // Split expression into lines to find which line contains the error
        const expressionLines = expression.split('\n');
        let currentPosition = 0;
        let targetLine = startLineIndex;
        let targetStartChar = expressionStartPos;
        let targetEndChar = expressionStartPos + 1;

        // Find the line containing the error position
        for (let i = 0; i < expressionLines.length; i++) {
            const lineLength = expressionLines[i].length;

            // Check if error position is within this line
            if (errorPosition <= currentPosition + lineLength) {
                targetLine = startLineIndex + i;

                // Calculate character position within the line
                const charPositionInLine = errorPosition - currentPosition;

                if (i === 0) {
                    // First line: add expression start position
                    targetStartChar = expressionStartPos + charPositionInLine;
                } else {
                    // Subsequent lines: position is relative to line start
                    targetStartChar = charPositionInLine;
                }

                // Special handling for specific error patterns
                const adjustedPosition = this.adjustErrorPositionForCommonPatterns(
                    expression,
                    errorPosition,
                    errorToken,
                    expressionLines,
                    i,
                    charPositionInLine
                );

                if (adjustedPosition) {
                    targetLine = startLineIndex + adjustedPosition.lineIndex;
                    // For the first line of the expression, we need to add the expression start position
                    if (adjustedPosition.lineIndex === 0) {
                        targetStartChar = expressionStartPos + adjustedPosition.startChar;
                        targetEndChar = expressionStartPos + adjustedPosition.endChar;
                    } else {
                        targetStartChar = adjustedPosition.startChar;
                        targetEndChar = adjustedPosition.endChar;
                    }
                } else {
                    // Calculate end position based on token
                    if (errorToken && errorToken !== '(end)') {
                        targetEndChar = targetStartChar + errorToken.length;
                    } else if (errorToken === '(end)') {
                        // For end-of-expression errors
                        if (charPositionInLine >= lineLength) {
                            // Error is at the end of line
                            if (lineLength === 0) {
                                // Empty line
                                targetStartChar = 0;
                                targetEndChar = 0;
                            } else {
                                // Position at the last character of the line
                                targetStartChar = lineLength - 1;
                                targetEndChar = lineLength;
                            }
                        } else {
                            targetEndChar = targetStartChar + 1;
                        }
                    } else {
                        targetEndChar = targetStartChar + 1;
                    }
                }

                break;
            }

            // Move to next line (add 1 for the newline character)
            currentPosition += lineLength + 1;
        }

        // Handle case where error position is beyond the expression
        if (errorPosition >= expression.length) {
            const lastLineIndex = expressionLines.length - 1;
            const lastLine = expressionLines[lastLineIndex] || '';

            targetLine = startLineIndex + lastLineIndex;

            if (lastLineIndex === 0) {
                // Single line expression
                if (lastLine.length === 0) {
                    targetStartChar = expressionStartPos;
                    targetEndChar = expressionStartPos;
                } else {
                    targetStartChar = expressionStartPos + lastLine.length - 1;
                    targetEndChar = expressionStartPos + lastLine.length;
                }
            } else {
                // Multi-line expression
                if (lastLine.length === 0) {
                    targetStartChar = 0;
                    targetEndChar = 0;
                } else {
                    targetStartChar = lastLine.length - 1;
                    targetEndChar = lastLine.length;
                }
            }
        }

        return {
            line: targetLine,
            startChar: Math.max(0, targetStartChar),
            endChar: Math.max(targetStartChar, targetEndChar)
        };
    }

    /**
     * Adjust error position for common error patterns
     */
    private adjustErrorPositionForCommonPatterns(
        expression: string,
        errorPosition: number,
        errorToken: string,
        expressionLines: string[],
        currentLineIndex: number,
        charPositionInLine: number
    ): { lineIndex: number; startChar: number; endChar: number } | null {

        // Pattern 1: "}" cannot be used as a unary operator - likely trailing comma
        if (errorToken === '}' && currentLineIndex > 0) {
            const currentLine = expressionLines[currentLineIndex];
            const previousLine = expressionLines[currentLineIndex - 1];

            // Check if current line is just whitespace + "}" and previous line ends with ","
            if (currentLine.trim() === '}' && previousLine.trim().endsWith(',')) {
                // Highlight the trailing comma on the previous line
                const commaPosition = previousLine.lastIndexOf(',');
                if (commaPosition >= 0) {
                    return {
                        lineIndex: currentLineIndex - 1,
                        startChar: commaPosition,
                        endChar: commaPosition + 1
                    };
                }
            }
        }

        // Pattern 2: "]" cannot be used as a unary operator - likely trailing comma in array
        if (errorToken === ']' && currentLineIndex > 0) {
            const currentLine = expressionLines[currentLineIndex];
            const previousLine = expressionLines[currentLineIndex - 1];

            // Check if current line is just whitespace + "]" and previous line ends with ","
            if (currentLine.trim() === ']' && previousLine.trim().endsWith(',')) {
                // Highlight the trailing comma on the previous line
                const commaPosition = previousLine.lastIndexOf(',');
                if (commaPosition >= 0) {
                    return {
                        lineIndex: currentLineIndex - 1,
                        startChar: commaPosition,
                        endChar: commaPosition + 1
                    };
                }
            }
        }

        return null;
    }

    /**
     * Calculate the error range in the document
     */
    private calculateErrorRange(
        document: vscode.TextDocument,
        lineIndex: number,
        startPos: number,
        endPos: number,
        offset?: vscode.Position
    ): vscode.Range {
        // Calculate the actual line and character positions
        let actualLineIndex = lineIndex;
        let startCharacter = startPos;
        let endCharacter = endPos;

        // Apply offset if provided (for selections)
        if (offset) {
            actualLineIndex = offset.line + lineIndex;

            // For multi-line selections, only add offset character on the first line
            if (lineIndex === 0) {
                startCharacter = offset.character + startPos;
                endCharacter = offset.character + endPos;
            }
            // For subsequent lines, use positions as-is since they're relative to line start
        }

        // Ensure we don't go beyond the document bounds
        const maxLines = document.lineCount;
        actualLineIndex = Math.min(actualLineIndex, maxLines - 1);

        // Get the actual line to ensure we don't exceed line length
        const documentLine = document.lineAt(actualLineIndex);
        const lineLength = documentLine.text.length;

        // Clamp positions to valid ranges
        startCharacter = Math.max(0, Math.min(startCharacter, lineLength));
        endCharacter = Math.max(startCharacter, Math.min(endCharacter, lineLength));

        // Handle edge cases for positioning
        if (startCharacter >= lineLength && lineLength > 0) {
            // Error is beyond the line content, position at the last character
            startCharacter = lineLength - 1;
            endCharacter = lineLength;
        } else if (startCharacter >= lineLength && lineLength === 0) {
            // Empty line case
            startCharacter = 0;
            endCharacter = 0;
        } else if (endCharacter > lineLength) {
            // End position extends beyond line, clamp to line end
            endCharacter = lineLength;
        }

        // Ensure endCharacter is never less than startCharacter
        endCharacter = Math.max(startCharacter, endCharacter);

        return new vscode.Range(
            new vscode.Position(actualLineIndex, startCharacter),
            new vscode.Position(actualLineIndex, endCharacter)
        );
    }
}

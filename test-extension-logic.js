// Test the exact logic from the extension
const jsonata = require('jsonata');
const fs = require('fs');

// Read the sample file
const testExpression = fs.readFileSync('examples/sample1.jsonata', 'utf8');

console.log('=== Testing Extension Logic ===');
console.log('File has CRLF line endings:', testExpression.includes('\r\n'));

// Simulate the extension's error handling
try {
    jsonata(testExpression);
    console.log('✅ Unexpectedly valid');
} catch (error) {
    console.log('\n❌ JSONata Error Details:');
    console.log('Code:', error.code);
    console.log('Position:', error.position);
    console.log('Token:', `"${error.token}"`);
    console.log('Message:', error.message);

    // Simulate calculateErrorLocation function
    const expression = testExpression;
    const errorPosition = error.position;
    const errorToken = error.token;
    const startLineIndex = 0; // For .jsonata files, starts at line 0
    const expressionStartPos = 0; // For .jsonata files, starts at position 0

    console.log('\n=== Calculating Error Location ===');

    // Split expression into lines to find which line contains the error
    const expressionLines = expression.split('\n');
    let currentPosition = 0;
    let targetLine = startLineIndex;
    let targetStartChar = expressionStartPos;
    let targetEndChar = expressionStartPos + 1;

    console.log(`Expression has ${expressionLines.length} lines`);
    console.log(`Total expression length: ${expression.length} characters`);

    // Find the line containing the error position
    for (let i = 0; i < expressionLines.length; i++) {
        const lineLength = expressionLines[i].length;
        const lineEnd = currentPosition + lineLength;

        console.log(`Line ${i}: positions ${currentPosition}-${lineEnd} (line: "${expressionLines[i]}" length: ${lineLength})`);

        // Check if error position is within this line
        if (errorPosition <= currentPosition + lineLength) {
            targetLine = startLineIndex + i;

            // Calculate character position within the line
            const charPositionInLine = errorPosition - currentPosition;

            console.log(`*** Error found on line ${i} at character position ${charPositionInLine}`);

            if (i === 0) {
                // First line: add expression start position
                targetStartChar = expressionStartPos + charPositionInLine;
            } else {
                // Subsequent lines: position is relative to line start
                targetStartChar = charPositionInLine;
            }

            // Simulate adjustErrorPositionForCommonPatterns
            console.log('\n=== Checking for Adjustment ===');
            let adjustedPosition = null;

            if (errorToken === '}' && i > 0) {
                const currentLine = expressionLines[i];
                const previousLine = expressionLines[i - 1];

                console.log(`Current line (${i}): "${currentLine}" (trimmed: "${currentLine.trim()}")`);
                console.log(`Previous line (${i-1}): "${previousLine}" (trimmed: "${previousLine.trim()}")`);
                console.log(`Previous line ends with comma: ${previousLine.trim().endsWith(',')}`);

                if (currentLine.trim() === '}' && previousLine.trim().endsWith(',')) {
                    const commaPosition = previousLine.lastIndexOf(',');
                    if (commaPosition >= 0) {
                        console.log(`*** ADJUSTING: line ${i-1}, position ${commaPosition} (comma)`);
                        adjustedPosition = {
                            lineIndex: i - 1,
                            startChar: commaPosition,
                            endChar: commaPosition + 1
                        };
                    }
                }
            }

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
                console.log(`*** Final adjusted position: line ${targetLine}, char ${targetStartChar}-${targetEndChar}`);
            } else {
                // Calculate end position based on token
                if (errorToken && errorToken !== '(end)') {
                    targetEndChar = targetStartChar + errorToken.length;
                } else {
                    targetEndChar = targetStartChar + 1;
                }
                console.log(`*** No adjustment, final position: line ${targetLine}, char ${targetStartChar}-${targetEndChar}`);
            }

            break;
        }

        // Move to next line (add 1 for the newline character)
        // Note: On Windows, this should be +2 for \r\n, but JavaScript's split('\n')
        // already handles the \r so we only add 1
        currentPosition += lineLength + 1;
    }

    console.log(`\n=== FINAL RESULT ===`);
    console.log(`Error should be highlighted on line ${targetLine} (0-indexed), characters ${targetStartChar}-${targetEndChar}`);
    console.log(`Line content: "${expressionLines[targetLine - startLineIndex] || 'N/A'}"`);
    if (targetStartChar < expressionLines[targetLine - startLineIndex]?.length) {
        console.log(`Character at position: "${expressionLines[targetLine - startLineIndex][targetStartChar]}"`);
    }
}

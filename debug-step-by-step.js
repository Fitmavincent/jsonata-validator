// Step-by-step debug of the exact extension logic
const jsonata = require('jsonata');
const fs = require('fs');

const testExpression = fs.readFileSync('examples/sample1.jsonata', 'utf8');

try {
    jsonata(testExpression);
} catch (error) {
    console.log('=== JSONata Error ===');
    console.log('Position:', error.position);
    console.log('Token:', error.token);

    // Step 1: Split into lines exactly like the extension
    const expressionLines = testExpression.split('\n');
    console.log('\n=== Expression Lines ===');
    expressionLines.forEach((line, i) => {
        console.log(`Line ${i}: "${line}" (length: ${line.length})`);
    });

    // Step 2: Find which line contains the error position
    let currentPosition = 0;
    let foundLine = -1;
    let charPositionInLine = -1;

    console.log('\n=== Position Calculation ===');
    for (let i = 0; i < expressionLines.length; i++) {
        const lineLength = expressionLines[i].length;
        console.log(`Line ${i}: range ${currentPosition} to ${currentPosition + lineLength}`);

        if (error.position <= currentPosition + lineLength) {
            foundLine = i;
            charPositionInLine = error.position - currentPosition;
            console.log(`*** Found: error at line ${i}, character ${charPositionInLine}`);
            break;
        }

        currentPosition += lineLength + 1; // +1 for newline
    }

    // Step 3: Apply adjustment logic
    console.log('\n=== Adjustment Logic ===');
    if (error.token === '}' && foundLine > 0) {
        const currentLine = expressionLines[foundLine];
        const previousLine = expressionLines[foundLine - 1];

        console.log(`Current line (${foundLine}): "${currentLine}"`);
        console.log(`Previous line (${foundLine - 1}): "${previousLine}"`);
        console.log(`Current line trimmed: "${currentLine.trim()}"`);
        console.log(`Previous line trimmed: "${previousLine.trim()}"`);
        console.log(`Previous line ends with comma: ${previousLine.trim().endsWith(',')}`);

        if (currentLine.trim() === '}' && previousLine.trim().endsWith(',')) {
            const commaPosition = previousLine.lastIndexOf(',');
            console.log(`*** ADJUSTMENT: should highlight line ${foundLine - 1}, position ${commaPosition}`);

            // Final calculation
            const startLineIndex = 0; // For .jsonata files
            const targetLine = startLineIndex + (foundLine - 1);
            const targetStartChar = commaPosition;
            const targetEndChar = commaPosition + 1;

            console.log(`\n=== FINAL RESULT ===`);
            console.log(`Target line: ${targetLine} (0-indexed) = line ${targetLine + 1} (1-indexed in VS Code)`);
            console.log(`Target position: ${targetStartChar}-${targetEndChar}`);
            console.log(`Character: "${previousLine[commaPosition]}"`);
        }
    }
}

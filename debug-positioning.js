// Debug the specific trailing comma error
const jsonata = require('jsonata');

const testExpression = `{
    "model": "sample1",
    "description": "This is a sample JSONata model for demonstration purposes.",
    "data": [
        {
            "firstName": "John",
            "lastName": "Doe",
            "address": {
                "city": "New York",
                "state": "NY"
            },
        }
    ]
}`;

console.log('=== Debugging Trailing Comma Error ===');
console.log('Expression length:', testExpression.length);
console.log('Lines:', testExpression.split('\n').length);

// Find the trailing comma position manually
const lines = testExpression.split('\n');
lines.forEach((line, index) => {
    console.log(`Line ${index}: "${line}" (length: ${line.length})`);
});

try {
    jsonata(testExpression);
    console.log('✅ Unexpectedly valid');
} catch (error) {
    console.log('\n❌ JSONata Error Details:');
    console.log('Code:', error.code);
    console.log('Position:', error.position);
    console.log('Token:', `"${error.token}"`);
    console.log('Expected:', error.value);
    console.log('Message:', error.message);

    // Calculate position manually
    let currentPos = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineEnd = currentPos + lines[i].length;
        console.log(`Line ${i}: positions ${currentPos}-${lineEnd} (line: "${lines[i]}")`);

        if (error.position >= currentPos && error.position <= lineEnd) {
            const charInLine = error.position - currentPos;
            console.log(`*** Error is on line ${i} at character ${charInLine}`);
            console.log(`*** Character at position: "${lines[i][charInLine] || 'END'}"`);

            // Look around the error position
            const start = Math.max(0, charInLine - 5);
            const end = Math.min(lines[i].length, charInLine + 5);
            console.log(`*** Context: "${lines[i].substring(start, end)}"`);

            // Check if we should adjust for trailing comma pattern
            if (error.token === '}' && i > 0) {
                console.log(`*** Checking for trailing comma adjustment`);
                console.log(`*** Current line (${i}): "${lines[i]}" (trimmed: "${lines[i].trim()}")`);
                console.log(`*** Previous line (${i-1}): "${lines[i-1]}" (trimmed: "${lines[i-1].trim()}")`);
                console.log(`*** Previous line ends with comma: ${lines[i-1].trim().endsWith(',')}`);

                if (lines[i].trim() === '}' && lines[i-1].trim().endsWith(',')) {
                    const commaPosition = lines[i-1].lastIndexOf(',');
                    console.log(`*** SHOULD adjust to line ${i-1}, position ${commaPosition} (comma)`);
                } else {
                    console.log(`*** NO adjustment needed`);
                }
            }
        }

        currentPos = lineEnd + 1; // +1 for newline
    }
}

// Test the range calculation specifically
const fs = require('fs');

// Read the sample file
const testExpression = fs.readFileSync('examples/sample1.jsonata', 'utf8');
const lines = testExpression.split('\n');

console.log('=== File Analysis ===');
console.log('Total lines:', lines.length);
lines.forEach((line, i) => {
    console.log(`Line ${i} (1-indexed: ${i+1}): "${line}" (length: ${line.length})`);
});

console.log('\n=== Target Position Analysis ===');
console.log('We want to highlight the comma on line 10 (0-indexed) / line 11 (1-indexed)');
console.log('Line 10:', `"${lines[10]}"`);
console.log('Comma position in line 10:', lines[10].lastIndexOf(','));

// Simulate VS Code Position and Range construction
console.log('\n=== VS Code Range Construction ===');
const targetLine = 10; // 0-indexed
const targetStartChar = lines[10].lastIndexOf(',');
const targetEndChar = targetStartChar + 1;

console.log(`Diagnostic will be created with:`);
console.log(`  line: ${targetLine} (0-indexed)`);
console.log(`  startChar: ${targetStartChar}`);
console.log(`  endChar: ${targetEndChar}`);
console.log(`This should appear in VS Code as line ${targetLine + 1} (1-indexed)`);
console.log(`Character at that position: "${lines[targetLine][targetStartChar]}"`);

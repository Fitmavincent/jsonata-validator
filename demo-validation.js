// Simple test to demonstrate improved JSONata validation

// Test the jsonata library directly
const jsonata = require('jsonata');

console.log('=== JSONata Validation Improvement Demo ===\n');

const testCases = [
    {
        name: 'Valid expression',
        expression: '$.firstName'
    },
    {
        name: 'Invalid double dot',
        expression: '$.firstName..invalid'
    },
    {
        name: 'Missing closing bracket',
        expression: '$.products[price > 100'
    },
    {
        name: 'Missing closing parenthesis',
        expression: '$count(items'
    },
    {
        name: 'Complex valid expression',
        expression: '$.orders[status = "shipped"].total ~> $sum()'
    }
];

testCases.forEach(testCase => {
    console.log(`\n--- ${testCase.name} ---`);
    console.log(`Expression: ${testCase.expression}`);

    try {
        const compiled = jsonata(testCase.expression);
        console.log('✅ Valid JSONata expression');
    } catch (error) {
        console.log('❌ JSONata Error:');
        console.log(`   Code: ${error.code || 'N/A'}`);
        console.log(`   Position: ${error.position !== undefined ? error.position : 'N/A'}`);
        console.log(`   Token: ${error.token || 'N/A'}`);
        console.log(`   Expected: ${error.value || 'N/A'}`);
        console.log(`   Message: ${error.message}`);
    }
});

console.log('\n=== End Demo ===');

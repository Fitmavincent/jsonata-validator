// Quick test script to verify ShareService functionality
// This can be run manually to test the share/import functionality

import { ShareService } from '../src/share/ShareService';

// Test data
const testJsonInput = `{
  "users": [
    {"name": "John", "age": 30},
    {"name": "Jane", "age": 25},
    {"name": "Bob", "age": 35}
  ]
}`;

const testJsonataExpression = 'users[age > 25].name';
const testResult = '["John", "Bob"]';

console.log('Testing ShareService...');

// Test 1: Create a shareable session
console.log('\n1. Creating shareable session...');
const session = ShareService.createShareableSession(
    testJsonInput,
    testJsonataExpression,
    testResult,
    false,
    undefined,
    'Test Session for Filtering Users'
);

console.log('Session created:', session);

// Test 2: Convert to shareable string
console.log('\n2. Converting to shareable string...');
const sessionString = ShareService.sessionToShareableString(session);
console.log('Session string length:', sessionString.length);
console.log('Session string preview:', sessionString.substring(0, 200) + '...');

// Test 3: Parse the shared session
console.log('\n3. Parsing shared session...');
const parsedSession = ShareService.parseSharedSession(sessionString);
console.log('Parsed session valid:', parsedSession !== null);
console.log('Data matches:',
    parsedSession?.data.jsonInput === testJsonInput &&
    parsedSession?.data.jsonataExpression === testJsonataExpression &&
    parsedSession?.data.result === testResult
);

// Test 4: Create session description
console.log('\n4. Creating session description...');
if (parsedSession) {
    const description = ShareService.createSessionDescription(parsedSession);
    console.log('Description:', description);
}

// Test 5: Check compatibility
console.log('\n5. Checking compatibility...');
if (parsedSession) {
    const compatible = ShareService.isSessionCompatible(parsedSession);
    console.log('Session compatible:', compatible);
}

// Test 6: Test with error session
console.log('\n6. Testing error session...');
const errorSession = ShareService.createShareableSession(
    '{"invalid": json}',
    'invalid.expression',
    '',
    true,
    'Invalid JSON input',
    'Error Test Session'
);

const errorSessionString = ShareService.sessionToShareableString(errorSession);
const parsedErrorSession = ShareService.parseSharedSession(errorSessionString);
console.log('Error session valid:', parsedErrorSession !== null);
console.log('Has error flag:', parsedErrorSession?.data.hasError === true);

console.log('\nAll tests completed!');

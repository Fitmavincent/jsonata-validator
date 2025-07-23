# JSONata Validator Enhanced Error Handling Test

This file demonstrates the enhanced error handling features in the JSONata validator extension.

## Test Cases

### 1. Valid Expression (No Errors)
```jsonata
users[department = "Engineering"].name
```

### 2. Syntax Error - Unclosed Parenthesis
```jsonata
users[department = "Engineering"(.name
```
**Expected**: Compilation error with line/character position and suggestion about missing closing parenthesis.

### 3. Syntax Error - Trailing Comma
```jsonata
{
  "engineeringUsers": users[department = "Engineering"],
  "count": $count(users),
}
```
**Expected**: Compilation error highlighting the trailing comma with suggestion to remove it.

### 4. Runtime Error - Invalid Function
```jsonata
users.$invalidFunction()
```
**Expected**: Runtime error with suggestion about correct function names.

### 5. Syntax Error - Unary Operator
```jsonata
users.department.
```
**Expected**: Compilation error about dot operator with helpful suggestion.

### 6. Complex Multi-line Expression with Error
```jsonata
{
  "summary": {
    "totalUsers": $count(users),
    "departments": $distinct(users.department),
    "averageAge": $average(users.age)
  },
  "details": users{
    "name": name,
    "info": {
      "age": age,
      "dept": department,
    }
  }
}
```
**Expected**: Error highlighting the trailing comma in the nested object with precise line/character location.

## How to Test

1. Open the JSONata Playground from the command palette: `JSONata: Open Playground`
2. Copy sample JSON data into the JSON input editor
3. Copy each test expression into the JSONata expression editor
4. Observe the enhanced error display in the Results panel:
   - Clear error categorization (compilation/runtime)
   - Precise line and character positioning
   - Code snippet with highlighted error location
   - Helpful suggestions for common mistakes
   - Copy error details functionality

## Sample JSON Data for Testing

```json
{
  "users": [
    {"name": "Alice", "age": 30, "department": "Engineering"},
    {"name": "Bob", "age": 25, "department": "Marketing"},
    {"name": "Charlie", "age": 35, "department": "Engineering"},
    {"name": "Diana", "age": 28, "department": "Sales"}
  ],
  "company": {
    "name": "TechCorp",
    "founded": 2010,
    "locations": ["New York", "San Francisco", "London"]
  }
}
```

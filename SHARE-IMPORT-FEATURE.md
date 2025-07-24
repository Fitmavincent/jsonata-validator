# JSONata Playground Session Share/Import Feature

## Overview

The JSONata Validator extension now includes a powerful share/import feature that allows users to easily share their JSONata playground sessions with others and import sessions from different sources.

## Features

### 🚀 Easy Session Sharing
- **One-click export**: Export your current playground state including JSON input, JSONata template, and results
- **Multiple export formats**: Copy to clipboard or save to file
- **Structured JSON format**: Sessions are saved in a readable, structured JSON format

### 📥 Seamless Session Import
- **Multiple import sources**: Import from clipboard or file
- **Automatic layout setup**: Imported sessions automatically open the 3-panel layout
- **Validation**: Session format validation ensures compatibility

### 🎯 Key Benefits
- **Collaboration**: Share complex JSONata examples with team members
- **Learning**: Import and study example sessions from others
- **Documentation**: Save sessions as examples for documentation
- **Debugging**: Share problematic sessions for troubleshooting

## How to Use

### Sharing a Session

1. **Open JSONata Playground**: Use `Ctrl+Shift+P` and search for "Open JSONata Playground"
2. **Create your session**:
   - Add your JSON input data
   - Write your JSONata expression
   - View the results
3. **Share the session**:
   - Click the **📤 Share** button in the playground results panel, OR
   - Use `Ctrl+Shift+P` and search for "Share JSONata Playground Session"
4. **Choose export method**:
   - **Copy to Clipboard**: Quick sharing via copy/paste
   - **Save to File**: Save as `.jsonata-session` file for long-term storage

### Importing a Session

1. **Import a session**:
   - Click the **📥 Import** button in the playground results panel, OR
   - Use `Ctrl+Shift+P` and search for "Import JSONata Playground Session"
2. **Choose import source**:
   - **From Clipboard**: Import from copied session data
   - **From File**: Import from `.jsonata-session` file
3. **Confirm import**: Review the session details and confirm
4. **Enjoy the 3-panel layout**: The session opens with JSON input (left), JSONata template (top-right), and results (bottom-right)

## Session Format

Sessions are saved in a structured JSON format:

```json
{
  "version": "1.0",
  "timestamp": "2025-01-23T10:30:00.000Z",
  "metadata": {
    "extensionVersion": "1.3.6",
    "vscodeVersion": "1.100.0",
    "description": "JSONata Playground Session"
  },
  "data": {
    "jsonInput": "{\n  \"users\": [\n    {\"name\": \"John\", \"age\": 30},\n    {\"name\": \"Jane\", \"age\": 25}\n  ]\n}",
    "jsonataExpression": "users[age > 25].name",
    "result": "[\n  \"John\"\n]",
    "hasError": false
  }
}
```

## Commands Available

| Command | Description | Shortcut Access |
|---------|-------------|----------------|
| `jsonata-validator.sharePlaygroundSession` | Share current playground session | Command Palette |
| `jsonata-validator.importPlaygroundSession` | Import a playground session | Command Palette |
| `jsonata-validator.exportPlaygroundToClipboard` | Quick export to clipboard | Command Palette |
| `jsonata-validator.importPlaygroundFromClipboard` | Quick import from clipboard | Command Palette |

## UI Elements

### Share/Import Buttons
The playground results panel includes two new buttons:
- **📤 Share**: Opens share options dialog
- **📥 Import**: Opens import options dialog

### Integration Points
- **Command Palette**: All share/import commands are available via `Ctrl+Shift+P`
- **Direct buttons**: Quick access from the playground interface

## Use Cases

### 1. Team Collaboration
```
Developer A creates a complex JSONata transformation:
1. Opens playground
2. Adds sample data and JSONata expression
3. Clicks "Share" → "Copy to Clipboard"
4. Shares the clipboard content with Developer B
5. Developer B clicks "Import" → "From Clipboard"
6. Both developers now have identical playground state
```

### 2. Documentation
```
Technical writer wants to document JSONata examples:
1. Creates example in playground
2. Exports to file as "user-filtering-example.jsonata-session"
3. Includes file in documentation repository
4. Readers can import the example to see it in action
```

### 3. Debugging
```
Developer encounters JSONata issue:
1. Reproduces issue in playground
2. Exports session to clipboard
3. Shares with expert via chat/email
4. Expert imports session to diagnose issue
```

## Compatibility

- **Version compatibility**: Sessions include version information for future compatibility checks
- **Extension requirement**: Importing sessions requires the JSONata Validator extension
- **VS Code integration**: Seamlessly works with VS Code's clipboard and file system APIs

## Error Handling

- **Invalid session data**: Clear error messages for malformed session data
- **Version mismatches**: Warnings for sessions from different extension versions
- **Missing playground**: Automatic playground creation for import operations
- **File access**: Proper error handling for file read/write operations

## Security

- **Local operations**: All share/import operations are local to VS Code
- **No network traffic**: Sessions are shared via clipboard or local files only
- **User consent**: All import operations require user confirmation

## Future Enhancements

- **Session templates**: Pre-built session templates for common use cases
- **History**: Recent sessions history for quick access
- **Batch import**: Import multiple sessions at once
- **Export filtering**: Choose which parts of session to export

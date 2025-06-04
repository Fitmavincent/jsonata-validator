# JSONata Validator Extension

A lightweight VS Code extension for validating JSONata templates without requiring a language server. This extension provides real-time validation of JSONata expressions using the official JSONata library.

## Features

- **Real-time validation**: Validates JSONata expressions as you type
- **Multiple file support**: Works with `.jsonata` files and detects JSONata expressions in JSON files
- **Context menu commands**: Right-click to validate documents or selections
- **Configurable**: Customize validation behavior through VS Code settings
- **Lightweight**: No language server required - everything runs locally

## Usage

### File Types Supported

1. **`.jsonata` files**: Dedicated JSONata template files
2. **JSON files**: Automatically detects JSONata expressions within JSON strings

### Commands

- **Validate JSONata Document**: Validates the entire active document
- **Validate JSONata Selection**: Validates only the selected text

Access these commands via:
- Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Right-click context menu (when editing .jsonata files)

### Validation Features

The extension validates:
- JSONata syntax errors
- Invalid function calls
- Malformed expressions
- Bracket/parentheses matching

### Configuration

Configure the extension through VS Code settings:

```json
{
  "jsonataValidator.validateOnType": true,        // Validate as you type
  "jsonataValidator.validateOnSave": true,        // Validate when saving
  "jsonataValidator.maxNumberOfProblems": 100     // Maximum errors to show
}
```

## Examples

### Valid JSONata Expressions
```jsonata
$.firstName
$.address.city
$.products[price > 100]
$.orders[status = "shipped"].total ~> $sum()
```

### Common Errors Detected
```jsonata
$.firstName..invalid      // Double dot syntax error
$.products[price > 100    // Missing closing bracket
$$invalid.syntax          // Invalid variable syntax
```

## Development

To build and run the extension locally:

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension in a new Extension Development Host window.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

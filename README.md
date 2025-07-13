# JSONata Validator Extension

A l### New: Editor Tab Selection
- Select any open editor tab as the JSON input source
- Select any open editor tab as the JSONata expression source
- Changes in selected files automatically update the playground results
- Only shows files that are actually open as tabs in VS Code
- Perfect for testing expressions against multiple data setseight VS Code extension for validating JSONata templates and providing an interactive playground for testing expressions. This extension provides real-time validation of JSONata expressions using the official JSONata library.

## Features

- **Real-time validation**: Validates JSONata expressions as you type
- **Interactive playground**: Test JSONata expressions with live results (similar to try.jsonata.org)
- **Precise error positioning**: Highlights exact error locations with character-level accuracy
- **Detailed error reporting**: Shows exact error positions with JSONata error codes (e.g., S0201, S0203)
- **Enhanced error messages**: Includes expected vs. actual tokens for better debugging
- **Multi-line expression support**: Handles complex JSONata expressions spanning multiple lines with accurate line/character positioning
- **Multiple file support**: Works with `.jsonata` files and detects JSONata expressions in JSON files
- **Context menu commands**: Right-click to validate documents or selections
- **Configurable**: Customize validation behavior through VS Code settings
- **Lightweight**: No language server required - everything runs locally using the official JSONata library

## JSONata Playground

The extension includes an interactive playground for testing JSONata expressions:

### Features
- **Three-panel layout**: JSON Input (left), JSONata Expression (top-right), Results (bottom-right)
- **Real-time evaluation**: See results as you type with error handling
- **Runtime error detection**: Catches both compilation and evaluation errors
- **VS Code integration**: Full editor experience with syntax highlighting
- **Editor tab selection**: Select any open editor tab as input source for JSON data or JSONata expressions
- **Live updates**: Automatically updates results when you edit selected source files
- **Multiple data sources**: Quickly switch between different JSON files or JSONata templates

### How to Use
1. **Command Palette**: `Ctrl+Shift+P` → "Open JSONata Playground"
2. **With Selection**: Select JSONata code → "Open JSONata Playground with Selection"
3. **Context Menu**: Right-click in `.jsonata` files
4. **From Active Editor**: Use "Populate Playground from Active Editor" to automatically detect and load content

### New: Editor Tab Selection
- Select any open editor tab as the JSON input source
- Select any open editor tab as the JSONata expression source
- Changes in selected files automatically update the playground results
- Perfect for testing expressions against multiple data sets

See [PLAYGROUND.md](./PLAYGROUND.md) for detailed playground documentation and [EDITOR-TAB-SELECTION.md](./EDITOR-TAB-SELECTION.md) for the new editor selection feature.

## Validation Features

The extension provides comprehensive JSONata validation by leveraging the official JSONata parser:

### Error Detection
- **Syntax errors**: Invalid JSONata syntax with precise error locations
- **Missing brackets/parentheses**: Detects unclosed `[`, `(`, `{` with exact positions
- **Invalid operators**: Catches invalid operator usage like `..` double dots
- **Function call errors**: Validates function syntax and parameter structure

### Error Reporting
- **Error codes**: Shows JSONata error codes (S0201, S0203, etc.)
- **Character-level precision**: Highlights exact characters where errors occur
- **Helpful messages**: "Expected ']', got '}'" style messages
- **Token information**: Shows actual vs. expected tokens
- **Multi-line accuracy**: Correctly positions errors across line boundaries

### Expression Types Supported
- Simple property access: `$.firstName`
- Array filtering: `$.products[price > 100]`
- Complex transformations: `$.orders[status = "shipped"].{name: customer, total: total}`
- Function calls: `$sum($.items.price)`
- Multi-line expressions with proper bracket matching

## Usage

### File Types Supported

1. **`.jsonata` files**: Dedicated JSONata template files with full multi-line support
2. **JSON files**: Automatically detects JSONata expressions within JSON strings

### Commands

- **Validate JSONata Document**: Validates the entire active document
- **Validate JSONata Selection**: Validates only the selected text
- **Open JSONata Playground**: Opens the interactive playground
- **Open JSONata Playground with Selection**: Opens playground with selected text as expression

Access these commands via:
- Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Right-click context menu (when editing .jsonata files)

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

// Multi-line expressions
$.products[
  price > 100 and
  category = "electronics"
].{
  "name": name,
  "discountedPrice": price * 0.9
}
```

### Error Examples with Improved Reporting
```jsonata
// Error S0201: Syntax error: ".."
$.firstName..invalid

// Error S0203: Expected "]" before end of expression
$.products[price > 100

// Error S0202: Expected ")", got "syntax"
$count(invalid syntax here

// Error S0203: Expected "}" before end of expression
$.{unclosed: "object"
```

The extension now shows:
- **Error codes** (S0201, S0203, etc.)
- **Exact positions** where errors occur
- **Expected vs. actual tokens** for clearer debugging

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

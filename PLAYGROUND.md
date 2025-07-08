# JSONata Playground Feature

The JSONata Playground is an interactive environment for testing and experimenting with JSONata expressions, similar to [try.jsonata.org](https://try.jsonata.org).

## Features

- **Three-panel layout**: JSON Input (left), JSONata Expression (top-right), Results (bottom-right)
- **Real-time evaluation**: Expressions are evaluated as you type with debouncing
- **Error handling**: Both compilation and runtime errors are displayed with detailed messages
- **Syntax highlighting**: Full VS Code editor experience
- **Persistent state**: Content is maintained while the panel is open

## How to Use

### Opening the Playground

1. **Command Palette**: Press `Ctrl+Shift+P` and search for "Open JSONata Playground"
2. **Context Menu**: Right-click in a `.jsonata` file and select "Open JSONata Playground"
3. **With Selection**: Select JSONata code and use "Open JSONata Playground with Selection"

### Playground Layout

```
┌─────────────────────────────────────────────────────────┐
│ 🧪 JSONata Playground                                   │
├─────────────────┬───────────────────────────────────────┤
│ JSON INPUT      │ JSONATA EXPRESSION                    │
│                 │                                       │
│ {               │ example.products[price > 100]         │
│   "example": {  │                                       │
│     "products": │                                       │
│       [...]     │                                       │
│   }             │                                       │
│ }               ├───────────────────────────────────────┤
│                 │ RESULT                                │
│                 │                                       │
│                 │ [                                     │
│                 │   {"name": "...", "price": 150}       │
│                 │ ]                                     │
└─────────────────┴───────────────────────────────────────┘
```

### Example Usage

1. **JSON Input Panel**: Enter your test data
   ```json
   {
     "example": [
       {"value": 4},
       {"value": 7},
       {"value": 13}
     ]
   }
   ```

2. **JSONata Expression Panel**: Write your expression
   ```jsonata
   example[value > 5].value
   ```

3. **Results Panel**: See the output
   ```json
   [7, 13]
   ```

## Error Handling

The playground handles both types of JSONata errors:

### Compilation Errors
- Invalid syntax in JSONata expressions
- Shows error position and expected tokens
- Example: `[T1003] Expected "]" but got "("`

### Runtime Errors
- Errors during expression evaluation
- Function calls on non-functions
- Type mismatches
- Example: `[T1006] Attempted to invoke a non-function (token: 'notafunction')`

## Commands

| Command | Description |
|---------|-------------|
| `jsonata-validator.openPlayground` | Open the playground |
| `jsonata-validator.openPlaygroundWithSelection` | Open playground with selected text as expression |

## Keyboard Shortcuts

- **Ctrl+Shift+P** → "JSONata: Open Playground"
- Select text + **Ctrl+Shift+P** → "JSONata: Open Playground with Selection"

## Tips

1. **Auto-completion**: Use VS Code's IntelliSense for JSONata functions
2. **Multi-line expressions**: The playground supports complex, multi-line JSONata expressions
3. **Real-time feedback**: Errors appear immediately as you type
4. **Panel persistence**: The playground stays open until explicitly closed

## Architecture

The playground feature is built with a modular architecture:

```
src/
├── playground/
│   ├── PlaygroundProvider.ts     # Main controller
│   ├── PlaygroundPanel.ts        # Panel management
│   └── PlaygroundWebviewManager.ts # Webview content & messaging
├── validation/
│   ├── ValidationService.ts      # Validation logic
│   └── expressionExtractor.ts    # Expression parsing
└── utils/
    └── jsonataUtils.ts           # Utility functions
```

This modular design keeps the main extension file clean and makes the codebase easier to maintain as it grows.

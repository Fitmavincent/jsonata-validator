# JSONata Playground Feature

The JSONata Playground is an interactive environment for testing and experimenting with JSONata expressions, similar to [try.jsonata.org](https://try.jsonata.org), but with full VS Code integration including **AI tool support**.

## Features

- **Native VS Code editors**: JSON Input and JSONata Expression panels use real VS Code editors
- **AI tool integration**: Full access to Copilot, Cline, and other AI extensions in input panels
- **Real-time evaluation**: Expressions are evaluated as you type with debouncing
- **Error handling**: Both compilation and runtime errors are displayed with detailed messages
- **Syntax highlighting**: Full VS Code editor experience with IntelliSense
- **Persistent state**: Content is maintained while the panel is open
- **Three-panel layout**: JSON Input (Column 1), JSONata Expression (Column 2), Results (Column 3)

## How to Use

### Opening the Playground

1. **Command Palette**: Press `Ctrl+Shift+P` and search for "Open JSONata Playground"
2. **Context Menu**: Right-click in a `.jsonata` file and select "Open JSONata Playground"
3. **With Selection**: Select JSONata code and use "Open JSONata Playground with Selection"

### Playground Layout

When you open the playground, VS Code will automatically arrange three panels for optimal simultaneous visibility:

```
┌─────────────────┬─────────────────┐
│ Column 1        │ Column 2        │
│                 │                 │
│ JSON INPUT      │ JSONATA         │
│ (Full Height)   │ EXPRESSION      │
│                 │ (Top Half)      │
│ {               │                 │
│   "products": [ │ products[       │
│     {           │   price > 100   │
│       "name":   │ ].{             │
│       "price":  │   name: name,   │
│     }           │   discounted:   │
│   ]             │   price * 0.9   │
│ }               │ }               │
│                 │                 │
│ ✅ AI Tools     │ ✅ AI Tools     │
│ Available       │ Available       │
│                 ├─────────────────┤
│                 │ 📊 RESULTS      │
│                 │ (Bottom Half)   │
│                 │                 │
│                 │ [               │
│                 │   {             │
│                 │     "name": ... │
│                 │     "discounted │
│                 │   }             │
│                 │ ]               │
│                 │                 │
│                 │ Live Updates    │
│                 └─────────────────┘
```

**Key Benefits:**
- **Simultaneous view**: All three panels are visible at the same time
- **Instant feedback**: Changes in JSON Input or JSONata Expression panels immediately update Results
- **AI tool access**: Full Copilot, Cline, and other AI extension support in input editors
- **No tab switching**: Template and results are always visible together
│                 │     "name": "X" │
│                 │     "discounted"│
│                 │   }             │
│                 │ ]               │
│                 │                 │
│                 │ 📊 Real-time    │
│                 │ Updates         │
└─────────────────┴─────────────────┘
```

**Key Benefits of This Layout:**
- **Instant Feedback**: See results immediately as you type in the JSONata expression
- **No Tab Switching**: Template and results are always visible
- **AI Tool Access**: Both input panels support Copilot, Cline, and other AI assistants
- **Optimal Screen Usage**: Maximizes available screen real estate

### AI Tool Integration

**🚀 Key Feature**: The JSON Input and JSONata Expression panels are **real VS Code editors**, which means:

- **GitHub Copilot** can provide suggestions and completions
- **Cline** and other AI assistants can edit the content
- **IntelliSense** works for JSONata functions and JSON structure
- **All VS Code extensions** that work with editors are available

### Example Usage

1. **JSON Input Panel** (Column 1): Enter your test data
   ```json
   {
     "products": [
       {"name": "Laptop", "price": 999, "category": "Electronics"},
       {"name": "Book", "price": 15, "category": "Education"},
       {"name": "Phone", "price": 599, "category": "Electronics"}
     ]
   }
   ```

2. **JSONata Expression Panel** (Column 2): Write your expression (with AI assistance!)
   ```jsonata
   products[price > 100].{
     name: name,
     discounted: price * 0.9,
     category: category
   }
   ```

3. **Results Panel** (Column 3): See the output automatically
   ```json
   [
     {"name": "Laptop", "discounted": 899.1, "category": "Electronics"},
     {"name": "Phone", "discounted": 539.1, "category": "Electronics"}
   ]
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

# JSONata Playground Feature

The JSONata Playground is an interactive environment for testing and experimenting with JSONata expressions, similar to [try.jsonata.org](https://try.jsonata.org), but with full VS Code integration including **AI tool support**.

## Features

- **Native VS Code editors**: all three panels are real VS Code editors
- **AI tool integration**: Full access to Copilot, Cline, and other AI extensions in input panels
- **Real-time evaluation**: Expressions are evaluated as you type with debouncing
- **Error handling**: Both compilation and runtime errors are displayed with detailed messages
- **Syntax highlighting**: Full VS Code editor experience with IntelliSense
- **Foldable results**: the Results panel is a read-only JSON editor, so objects and arrays collapse, sections select and copy cleanly, and the outline and Find work as they do anywhere else
- **Tamper-proof output**: the Results panel cannot be edited, so what it shows is always what the expression produced
- **Persistent state**: Content is maintained while the panel is open
- **Three-panel layout**: JSON Input (Column 1), Results (Column 2), JSONata Expression (Column 3)
- **Editor tab selection**: either source can be pointed at any open editor, from a pair of dropdowns

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
│ JSON INPUT      │ 📊 RESULTS      │
│ (Full Height)   │ (Top Half)      │
│                 │                 │
│ {               │ [               │
│   "products": [ │   {             │
│     {           │     "name": "X" │
│       "name":   │     "discounted"│
│       "price":  │   }             │
│     }           │ ]               │
│   ]             │                 │
│ }               │ Live Updates    │
│                 │                 │
│ ✅ AI Tools     ├─────────────────┤
│ Available       │ Column 3        │
│                 │                 │
│                 │ JSONATA         │
│                 │ EXPRESSION      │
│                 │ (Bottom Half)   │
│                 │                 │
│                 │ products[       │
│                 │   price > 100   │
│                 │ ].{             │
│                 │   name: name,   │
│                 │   discounted:   │
│                 │   price * 0.9   │
│                 │ }               │
│                 │                 │
│                 │ ✅ AI Tools     │
│                 │ Available       │
└─────────────────┴─────────────────┘
```

**Key Benefits:**
- **Simultaneous view**: All three panels are visible at the same time
- **Result above the expression that produced it**: the output moves under your
  eyes as you type, rather than in a panel you have to look away to check
- **AI tool access**: Full Copilot, Cline, and other AI extension support in input editors
- **No tab switching**: Template and results are always visible together

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

2. **JSONata Expression Panel** (Column 3, bottom right): Write your expression (with AI assistance!)
   ```jsonata
   products[price > 100].{
     name: name,
     discounted: price * 0.9,
     category: category
   }
   ```

3. **Results Panel** (Column 2, top right): See the output automatically, in a
   read-only JSON editor you can fold, search and copy from
   ```json
   [
     {"name": "Laptop", "discounted": 899.1, "category": "Electronics"},
     {"name": "Phone", "discounted": 539.1, "category": "Electronics"}
   ]
   ```

## Choosing Where Each Panel Reads From

The playground does not have to read from its own two editors. Either source can
be pointed at any editor you already have open, which is how you try one
expression against several data files, or several expressions against one.

A **JSONata Playground** panel opens with the playground and closes with it,
carrying the two source dropdowns:

```
JSON INPUT SOURCE                JSONATA TEMPLATE SOURCE
[ sample-data.json (json)   v ]  [ Default (Internal Editor)  v ]   Refresh   Share  Import
```

Both list the editors open as tabs, as `name (language)` with a `●` for
unsaved. `Default (Internal Editor)` points a source back at the panel the
playground opened for you.

The bar lives in a view of its own because the Results panel is a read-only
editor and has nowhere to hang a dropdown; drag it to the sidebar if you would
rather have it there. The same two choices are on the command palette as
**Select JSONata Playground JSON Input Source** and **… Expression Source**,
and the Results panel's title bar carries **Select Sources**, which walks both
in turn.

A chosen editor is live: typing in it re-evaluates the playground, exactly as
typing in the playground's own panels does. Close the file and the source falls
back to the playground's own editor rather than being left pointing at nothing.

## Error Handling

Errors are reported in two places at once: as a red squiggle on the offending
part of the expression, and in the Results panel as a source-framed report.

```
runtime error [D3030]: Unable to cast value to a number: "n/a"

  ┌─ expression:3:12
  │
3 │   "total": $number(price) * qty
  │            ^^^^^^^
  │
  = help: The input value 'n/a' is not a valid number. Check the JSON input, or
          guard the cast with $exists()/$match() before calling $number().
```

The report is built the way compilers have long since settled on, because it
answers the three questions in order: what went wrong, where, and what the line
actually says. The offending span is underlined in place, so a mistake in a long
or multi-line expression does not send you back to hunt for it — and a very wide
line is windowed around the error rather than scrolling the caret off screen.

The panel switches to its own language while a report is showing, so the report
is never buried under JSON parse squiggles of the editor's own making, and it
switches back to JSON the moment the expression evaluates again. Colours come
from the active theme rather than being hard-coded, so the report reads correctly
in light, dark and high-contrast.

A bad **input document** is framed the same way, against the JSON rather than the
expression, pointing at the line the parser stopped on.

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
| `jsonata-validator.copyPlaygroundResult` | Copy the current result to the clipboard |
| `jsonata-validator.refreshPlaygroundResult` | Re-read every source and evaluate again |
| `jsonata-validator.selectPlaygroundSources` | Choose which open editors feed the input and the expression, in turn |
| `jsonata-validator.selectPlaygroundInputSource` | Choose which open editor feeds the JSON input |
| `jsonata-validator.selectPlaygroundTemplateSource` | Choose which open editor feeds the expression |

Copy Result, Refresh and Select Sources are also buttons in the Results panel's
title bar, with Share and Import behind its `...` menu. The two single-source
commands are what the status bar entries click through to.

## Keyboard Shortcuts

- **Ctrl+Shift+P** → "JSONata: Open Playground"
- Select text + **Ctrl+Shift+P** → "JSONata: Open Playground with Selection"

## Tips

1. **Auto-completion**: Use VS Code's IntelliSense for JSONata functions
2. **Multi-line expressions**: The playground supports complex, multi-line JSONata expressions
3. **Real-time feedback**: Errors appear immediately as you type
4. **Panel persistence**: The playground stays open until explicitly closed
5. **Reloading the window** ends the session: the editors come back but nothing
   is evaluating into them any more, so the Results panel closes itself rather
   than sitting there looking live. Open the playground again for a fresh one

## Architecture

The playground feature is built with a modular architecture:

```
src/
├── playground/
│   ├── PlaygroundProvider.ts          # Main controller
│   ├── PlaygroundPanel.ts             # Panel and layout management
│   ├── PlaygroundEditorManager.ts     # The two input editors
│   ├── PlaygroundSession.ts           # Evaluation and error reporting
│   ├── PlaygroundResultDocument.ts    # Read-only result document
│   ├── PlaygroundSourcesView.ts       # The two source dropdowns
│   ├── playgroundViews.ts             # View ids shared with package.json
│   └── errorReport.ts                 # Source-framed error rendering
├── validation/
│   ├── ValidationService.ts      # Validation logic
│   └── expressionExtractor.ts    # Expression parsing
└── utils/
    └── jsonataUtils.ts           # Utility functions
```

This modular design keeps the main extension file clean and makes the codebase easier to maintain as it grows.

# JSONata Playground - Editor Tab Selection Feature

This feature allows you to select any open editor tab as the input source for JSON data or JSONata expressions in the playground, enabling dynamic live evaluation as you edit your source files.

## How to Use

### 1. Open the JSONata Playground
- Use Command Palette: `JSONata: Open Playground`
- Or use the command: `jsonata-validator.openPlayground`

### 2. Select Input Sources
In the playground results panel, you'll see two dropdown menus:

#### JSON Input Source
- Select any open editor tab to use as the JSON data source
- The playground will automatically update when you edit the selected file
- Suitable file types: `.json`, `.js`, `.ts`, and other text files containing JSON data

#### JSONata Template Source
- Select any open editor tab to use as the JSONata expression source
- The playground will automatically update when you edit the selected file
- Suitable file types: `.jsonata`, `.js`, `.ts`, and other text files containing JSONata expressions

### 3. Live Updates
- Once you select an editor tab as a source, the playground will automatically update the results whenever you modify the content in that tab
- Changes are reflected in real-time as you type
- No need to manually copy/paste content

### 4. Available Commands

#### `JSONata: Open Playground with Selection`
- Opens the playground and uses the currently selected text as the JSONata expression
- Command ID: `jsonata-validator.openPlaygroundWithSelection`

#### `JSONata: Populate Playground from Active Editor`
- Automatically detects the content type of the active editor and populates the appropriate field
- JSON files → JSON Input Source
- JSONata files → JSONata Template Source
- Other files → Attempts to parse as JSON, falls back to JSONata expression
- Command ID: `jsonata-validator.populatePlaygroundFromActiveEditor`

## Example Workflow

1. **Open sample files:**
   - `examples/sample-data.json` - Contains user and department data
   - `examples/active-users-template.jsonata` - JSONata expression to filter active users

2. **Open the playground:**
   - Execute command: `JSONata: Open Playground`

3. **Select your sources:**
   - Set "JSON Input Source" to `examples/sample-data.json`
   - Set "JSONata Template Source" to `examples/active-users-template.jsonata`

4. **Live editing:**
   - Edit the JSON data in `sample-data.json` and see results update immediately
   - Modify the JSONata expression in `active-users-template.jsonata` and see changes in real-time

## Tips

- **Refresh button**: Click the 🔄 button to refresh the list of available editors
- **File indicators**:
  - File language type is shown in badges (e.g., `json`, `jsonata`)
  - Modified files are marked with `●`
  - Non-visible files are marked with `(not visible)`
- **Fallback**: If no editor is selected, the playground uses its internal default editors
- **Multiple files**: You can quickly switch between different JSON data sets or JSONata expressions by changing the selected editor

## Supported File Types

### For JSON Input:
- `.json` - JSON data files
- `.js`, `.ts` - JavaScript/TypeScript files containing JSON data
- `.txt` - Plain text files with JSON content
- Any file containing valid JSON data

### For JSONata Expressions:
- `.jsonata` - JSONata expression files
- `.js`, `.ts` - JavaScript/TypeScript files containing JSONata expressions
- `.txt` - Plain text files with JSONata expressions
- Any text file containing JSONata syntax

This feature makes it easy to test JSONata expressions against different data sets and iterate on both data and expressions simultaneously.

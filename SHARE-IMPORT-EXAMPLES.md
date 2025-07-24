# Share/Import Feature Usage Examples

## Quick Start Guide

### Example 1: Basic Share and Import

1. **Create a session to share:**
   - Open JSONata Playground (`Ctrl+Shift+P` → "Open JSONata Playground")
   - Add JSON input:
     ```json
     {
       "users": [
         {"name": "Alice", "age": 30, "department": "Engineering"},
         {"name": "Bob", "age": 25, "department": "Marketing"},
         {"name": "Charlie", "age": 35, "department": "Engineering"}
       ]
     }
     ```
   - Add JSONata expression:
     ```jsonata
     users[department = "Engineering"].{
       "name": name,
       "age": age,
       "isExperienced": age > 30
     }
     ```
   - Click **📤 Share** button → "Copy to Clipboard"

2. **Share the session:**
   - The clipboard now contains a JSON session that looks like this:
     ```json
     {
       "version": "1.0",
       "timestamp": "2025-01-23T...",
       "metadata": {
         "extensionVersion": "1.3.6",
         "description": "JSONata Playground Session"
       },
       "data": {
         "jsonInput": "{\n  \"users\": [...]}",
         "jsonataExpression": "users[department = \"Engineering\"]...",
         "result": "[...]",
         "hasError": false
       }
     }
     ```

3. **Import the session (recipient side):**
   - Open VS Code with JSONata Validator extension
   - `Ctrl+Shift+P` → "Import Playground Session from Clipboard"
   - Confirm the import
   - The 3-panel layout opens with the exact same state!

### Example 2: File-based Sharing

1. **Export to file:**
   - In playground, click **📤 Share** → "Save to File"
   - Choose filename like "user-filtering-example.jsonata-session"
   - Save the file

2. **Share the file:**
   - Send the `.jsonata-session` file via email, Slack, etc.
   - Or commit it to a Git repository for team access

3. **Import from file:**
   - Click **📥 Import** → "From File"
   - Select the `.jsonata-session` file
   - Session loads automatically

### Example 3: Quick Commands

**Export to Clipboard (Quick):**
- `Ctrl+Shift+P` → "Export Playground to Clipboard"
- Instantly copies current session to clipboard

**Import from Clipboard (Quick):**
- `Ctrl+Shift+P` → "Import Playground from Clipboard"
- Instantly imports session from clipboard

### Example 4: Complex Transformation Example

Try importing this sample session (copy and paste into clipboard, then import):

```json
{
  "version": "1.0",
  "timestamp": "2025-01-23T15:30:00.000Z",
  "metadata": {
    "extensionVersion": "1.3.6",
    "description": "Advanced JSONata Transformation Example"
  },
  "data": {
    "jsonInput": "{\n  \"orders\": [\n    {\n      \"id\": \"ORD001\",\n      \"customer\": \"Alice Johnson\",\n      \"items\": [\n        {\"product\": \"Laptop\", \"price\": 1200, \"quantity\": 1},\n        {\"product\": \"Mouse\", \"price\": 25, \"quantity\": 2}\n      ],\n      \"status\": \"shipped\",\n      \"date\": \"2025-01-20\"\n    },\n    {\n      \"id\": \"ORD002\",\n      \"customer\": \"Bob Smith\",\n      \"items\": [\n        {\"product\": \"Keyboard\", \"price\": 75, \"quantity\": 1},\n        {\"product\": \"Monitor\", \"price\": 300, \"quantity\": 1}\n      ],\n      \"status\": \"pending\",\n      \"date\": \"2025-01-22\"\n    }\n  ]\n}",
    "jsonataExpression": "{\n  \"summary\": {\n    \"totalOrders\": $count(orders),\n    \"shippedOrders\": $count(orders[status = \"shipped\"]),\n    \"totalRevenue\": $sum(orders.items.(price * quantity))\n  },\n  \"customerReports\": orders.{\n    \"orderId\": id,\n    \"customer\": customer,\n    \"orderTotal\": $sum(items.(price * quantity)),\n    \"itemCount\": $sum(items.quantity),\n    \"status\": status,\n    \"date\": date\n  }\n}",
    "result": "{\n  \"summary\": {\n    \"totalOrders\": 2,\n    \"shippedOrders\": 1,\n    \"totalRevenue\": 1625\n  },\n  \"customerReports\": [\n    {\n      \"orderId\": \"ORD001\",\n      \"customer\": \"Alice Johnson\",\n      \"orderTotal\": 1250,\n      \"itemCount\": 3,\n      \"status\": \"shipped\",\n      \"date\": \"2025-01-20\"\n    },\n    {\n      \"orderId\": \"ORD002\",\n      \"customer\": \"Bob Smith\",\n      \"orderTotal\": 375,\n      \"itemCount\": 2,\n      \"status\": \"pending\",\n      \"date\": \"2025-01-22\"\n    }\n  ]\n}",
    "hasError": false
  }
}
```

## Use Cases

### 🤝 Team Collaboration
- Share complex JSONata transformations with team members
- Review each other's JSONata expressions with full context
- Standardize data transformation patterns across projects

### 📚 Documentation
- Include working examples in documentation
- Create tutorial sessions for learning JSONata
- Provide runnable examples for API documentation

### 🐛 Debugging
- Share problematic JSONata expressions for troubleshooting
- Reproduce and share edge cases
- Get help from experts with exact context

### 🎓 Learning
- Share learning examples between students and instructors
- Create JSONata challenges and solutions
- Build a library of useful JSONata patterns

## Tips

1. **Add descriptions**: When sharing, the session includes a description field that helps identify the purpose
2. **Version compatibility**: Sessions include version information for future compatibility
3. **Error states**: Sessions capture error states too, perfect for debugging
4. **File organization**: Use meaningful filenames like `user-filtering.jsonata-session` or `order-summary.jsonata-session`
5. **Git integration**: Commit session files to your repository as living documentation

## Troubleshooting

**"Invalid session data" error:**
- Check that the JSON is properly formatted
- Ensure all required fields are present
- Try copying the session again

**"No playground open" error:**
- The extension will automatically open a playground for imports
- Wait a moment for the playground to initialize

**"Version mismatch" warning:**
- Sessions from different extension versions may work but show a warning
- Choose "Yes" to proceed if you trust the session

**Import not working:**
- Ensure the JSONata Validator extension is installed and active
- Check that the session JSON is complete and not truncated

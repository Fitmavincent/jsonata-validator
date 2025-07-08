# JSONata Playground AI Integration Test

## Test Instructions
4. **Expected Result** (should appear instantly in the bottom half of the right column):
   ```json
   [
     {
       "orderId": "ORD-001",
       "customer": "John Doe",
       "total": 1049,
       "itemCount": 2
     }
   ]
   ```

## Layout Verification

The playground should arrange itself as follows for **simultaneous display**:

```
┌─────────────────┬─────────────────┐
│ JSON Input      │ JSONata Expr    │
│ (Full Height)   │ (Top Half)      │
│                 ├─────────────────┤
│                 │ 📊 Results      │
│                 │ (Bottom Half)   │
│                 │ Live Updates    │
└─────────────────┴─────────────────┘
```

**Key Benefits:**
- ✅ **No tab switching needed** - all panels visible simultaneously
- ✅ **Instant visual feedback** - results update as you type
- ✅ **AI tools work in both input editors** - full Copilot/Cline access
- ✅ **Optimal screen space usage** - template and results always visible
- ✅ **Real-time evaluation** - see changes instantly the JSONata Playground**:
   - Press `Ctrl+Shift+P`
   - Type "Open JSONata Playground"
   - Press Enter

2. **Verify AI Tool Access**:

   **In the JSON Input Editor (Left Column - Full Height)**:
   - You should see a normal VS Code editor
   - GitHub Copilot should work (if installed)
   - Type `{` and see if you get suggestions
   - Try invoking Cline or other AI assistants

   **In the JSONata Expression Editor (Right Column - Top Half)**:
   - You should see a normal VS Code editor with JSONata language support
   - AI tools should be fully functional
   - Type JSONata expressions and get AI assistance

   **Results Panel (Right Column - Bottom Half)**:
   - Should show evaluation results in real-time
   - Updates instantly as you type in the expression editor
   - No need to switch tabs to see results

3. **Test with Sample Data**:

   **JSON Input** (paste in Column 1):
   ```json
   {
     "orders": [
       {
         "id": "ORD-001",
         "customer": "John Doe",
         "items": [
           {"name": "Laptop", "price": 999, "quantity": 1},
           {"name": "Mouse", "price": 25, "quantity": 2}
         ],
         "status": "shipped",
         "date": "2024-01-15"
       },
       {
         "id": "ORD-002",
         "customer": "Jane Smith",
         "items": [
           {"name": "Keyboard", "price": 75, "quantity": 1}
         ],
         "status": "pending",
         "date": "2024-01-16"
       }
     ]
   }
   ```

   **JSONata Expression** (paste in Column 2 and ask AI to help improve it):
   ```jsonata
   orders[status = "shipped"].{
     "orderId": id,
     "customer": customer,
     "total": $sum(items.(price * quantity)),
     "itemCount": $count(items)
   }
   ```

4. **Expected Result** (should appear in Column 3):
   ```json
   [
     {
       "orderId": "ORD-001",
       "customer": "John Doe",
       "total": 1049,
       "itemCount": 2
     }
   ]
   ```

## AI Integration Success Criteria

✅ **JSON Input Editor**:
- [ ] GitHub Copilot suggestions work
- [ ] Cline can edit the content
- [ ] IntelliSense for JSON structure
- [ ] All VS Code editor features available

✅ **JSONata Expression Editor**:
- [ ] GitHub Copilot suggestions work for JSONata syntax
- [ ] Cline can help write/modify JSONata expressions
- [ ] IntelliSense for JSONata functions
- [ ] Syntax highlighting for JSONata

✅ **Results Panel**:
- [ ] Shows evaluation results in real-time (bottom half of right column)
- [ ] Displays errors clearly
- [ ] Updates automatically when inputs change
- [ ] No tab switching required to see results

## Notes

The key innovation is that the JSON Input and JSONata Expression panels are **real VS Code editors**, not HTML textareas. This means all AI tools and extensions that work with VS Code editors will work seamlessly in the playground.

This provides a much better developer experience compared to web-based JSONata playgrounds that don't have AI integration.

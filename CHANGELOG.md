# Change Log

All notable changes to the "jsonata-validator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.6.1]

### Fixed
- **Source selection is reachable again**
  ([#9](https://github.com/Fitmavincent/jsonata-validator/issues/9)): the
  results webview used to carry two dropdowns naming which open editor fed the
  JSON input and which fed the expression. Retiring the webview reduced that to
  one unlabelled icon among five in the results title bar - easy to miss, and
  showing nothing about what the sources currently were, which is most of what
  a dropdown was doing. Both sources are now in the status bar while the
  playground is open, each naming what it reads from, and each a click away
  from being pointed somewhere else:

  ```
    {} sample-data.json      </> active-users-template.jsonata
  ```

  They are backed by a command apiece, so either source can be re-pointed on
  its own from the command palette; **Select Sources** still walks both in
  turn. Share and Import moved off the title bar into its `...` menu, leaving
  Copy, Refresh and Select Sources as the buttons on it
- **The playground's own two editors are no longer offered as sources.** They
  were listed as `Untitled-1` and `Untitled-2` alongside the `Playground
  editor` entry that already reaches them, so the same editor appeared twice
- A test asserting the error report picked whichever untitled JSONata document
  it found first, which after earlier suites was not the playground's own, so
  it was passing or failing on test ordering rather than on the panel

### Changed
- **The result and the expression swap places.** The playground now opens as
  JSON input on the left, the **result top right**, and the **expression bottom
  right**. The output had been sitting furthest from the editor whose typing
  changes it; it now sits directly above it, so a result moves under your eyes
  as you type rather than in a panel you look away to check

## [1.6.0]

### Release numbering
- **The release line moves to `1.6.x`, skipping `1.5.2`.** Releases are supposed
  to sit on an even minor and pre-releases on the odd minor above, so opted-in
  users are never auto-downgraded to stable. The `1.4.4` → `1.5.0` bump moved
  releases by one instead of two, putting `1.5.0` and `1.5.1` on the odd minor
  that pre-releases already used, and pre-release `1.5.6` has since been
  published from the same line. Going to `1.6.0` separates the two channels
  again and puts pre-releases back on `1.7.<run number>`

### Changed
- **The playground results panel is a real editor again**
  ([#3](https://github.com/Fitmavincent/jsonata-validator/issues/3)): the panel
  was a webview rendering the result as static, syntax-coloured text. It could
  be copied wholesale and nothing else - no folding an object or an array shut,
  no outline, no Find, no selecting one section to copy out of a large result.
  Results now open in a read-only JSON editor, so everything VS Code does for a
  `.json` file works: collapsing sections, bracket matching, Find, Go to Symbol,
  and ordinary selection and copy
- **The output still cannot be edited.** The result document is served by a
  content provider, which VS Code treats as read-only, so the panel keeps
  showing what the expression actually produced
- **Errors are reported as a source-framed report** rather than as a dumped
  object, alongside the existing squiggle on the expression. The report names
  the phase and code, then shows the offending line with the failing span
  underlined in place, and the suggestion below it:

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

  A wide line is windowed around the error so the caret cannot scroll off
  screen, a multi-line expression is framed on the line that actually failed,
  and a bad input document is framed against the JSON instead of the
  expression. The panel takes its own language while a report is showing, so
  the report is not buried under JSON parse squiggles of the editor's own
  making, and returns to JSON as soon as the expression evaluates. Colours are
  resolved from the active theme rather than hard-coded
- **The three panels are laid out explicitly** rather than assembled by
  splitting the active editor, so the result reliably lands in the bottom-right
  group instead of depending on what was focused at the time
- The webview's controls moved to the result editor's title bar and the command
  palette: **Copy Result**, **Refresh**, **Select Sources**, **Share** and
  **Import**

### Fixed
- Choosing an external editor as a source and then switching back to the
  playground's own editor left the previous file's content loaded. Every source
  change now re-reads whichever editor is selected
- Closing a source file fell back to the playground's starting content, throwing
  away what was in the playground's own editor. It now falls back to that editor
- Closing the playground focused each of its documents in turn and closed
  whatever was active, which stole focus and could close a tab the playground
  did not own. Its tabs are now closed by identity
- An expression matching nothing wrote the text `undefined` into the results
  panel, which is not valid JSON. It now shows `null`

## [1.5.1]

### Fixed
- **Evaluation errors are shown again in the playground results panel**
  ([#6](https://github.com/Fitmavincent/jsonata-validator/issues/6)): the
  result box is sized to fill the panel, so the error box that follows it was
  pushed out of a clipped container and never seen. All the panel showed was
  "Error in evaluation" in the status bar. The result box now stands aside when
  an error is displayed, and the panel scrolls
- **The error is highlighted where it happened.** JSONata reports a position
  just *past* the offending token, and for a function call it has already
  consumed the `(` that follows the name, so `$number(model.value)` underlined
  `model` instead of `$number`. The reported span is now walked back to the
  token the user wrote, and the results panel shows the offending line with
  that token picked out
- **Misleading "expected X, got Y" text removed.** For a runtime error JSONata
  puts the failing *value* in `value` and the function name in `token`, so
  `$number("7.")` was reported as `(expected '7.', got 'number')`. The panel now
  labels the two correctly, and the message reads as JSONata wrote it:
  `Unable to cast value to a number: "7."`

### Changed
- A failed evaluation is now marked as an error rather than a warning in the
  template editor: it produces no result, the same as a template that will not
  compile
- Suggestions added for the common runtime failures — a value that cannot be
  cast (`D3030`), calling something that is not a function (`T1006`), and an
  argument of the wrong type (`T04xx`/`T20xx`)

### Technical
- `resolveErrorOffsets` and `offsetToPosition` in `src/utils/errorPosition.ts`
  translate a JSONata error position into a source span, and are covered by
  tests that run real expressions through JSONata to pin the position semantics
- The results webview renders the error snippet from the state it already has,
  instead of asking the extension for the expression in a round trip that only
  ever completed once

## [1.5.0]

### Fixed
- **Comments are no longer reported as syntax errors** ([#1](https://github.com/Fitmavincent/jsonata-validator/issues/1)):
  the validator only recognised a comment when a line *started* with `/*`, so
  the continuation lines of a multi-line block comment were each validated as
  standalone expressions and flagged as invalid. Comments are now understood
  wherever they appear — above an expression, inline, or spanning many lines —
  including brackets and quotes written inside them
- **Expressions spread over several lines without brackets** (`~>`, `&`, `+`
  and friends at a line boundary) are no longer split apart and reported as
  errors

### Added
- `jsonataValidator.warnOnUnsupportedLineComments` (default `true`): JSONata
  has no `//` line comments, and a stray one used to surface as a confusing
  `S0301 Empty regular expressions are not allowed` or `S0302 No terminating /
  in regular expression`, because the parser reads the `/` as a regex. These are
  now reported as a plain warning that names the real problem, and the rest of
  the file still validates
- Diagnostics refresh when JSONata Validator settings change, so toggling a
  setting updates what is already on screen

### Changed
- The `examples/` templates use block comments, since `//` is not valid JSONata

### Technical
- `BracketScanner` becomes `JsonataScanner`: it now tracks comments as well as
  brackets and strings, and returns each line with its comments blanked out so
  columns still line up with the document. Block comment state carries across
  lines; quote state still deliberately does not
- `ValidationService` compiles the whole document first and only falls back to
  splitting it into separate expressions when that fails, which lets JSONata
  itself deal with comments and line breaks instead of a line-based heuristic
- Unit suites for the scanner and the expression extractor, plus integration
  coverage for the issue above and for the new setting

## [Unreleased]

### Performance
- **Real debouncing for validate-on-type**: every keystroke previously queued its own
  validation pass 500ms later with no cancellation, so a burst of typing ran one full
  pass per character. Passes are now collapsed per document.
- **Linear expression extraction**: multi-line expressions were re-scanned from the top
  after every line, making extraction quadratic in file size (a 1000-line template cost
  ~775ms per pass, ~12.7s at 4000 lines). Bracket state is now carried across lines,
  bringing the same files to ~0.5ms and ~2.3ms.
- **Compiled expressions are cached** by source text and reused across validation and
  playground evaluation.
- **Playground evaluation is debounced** and guarded against stale results, so a slow
  expression can no longer overwrite the output of a newer edit.
- Editor settings are read once and refreshed on change instead of per keystroke; the
  editor list and persisted playground selection are only rewritten when they change;
  the open-editor lookup no longer rescans every open document per tab.
- JSON documents no longer trigger a validation pass that immediately discards its work.

### Fixed
- **Result syntax highlighting**: escape sequences in the webview script were consumed by
  the surrounding template literal (`\s` → `s`, `\d` → `d`), so string, number, boolean
  and null values were never highlighted.
- **Copy button in the error panel** used an inline `onclick` handler, which the panel's
  Content-Security-Policy blocks; it now uses a delegated listener and works.
- Playground results are HTML-escaped before display, so a result containing markup is
  rendered as text instead of being injected into the panel.
- An apostrophe inside a double-quoted string no longer causes following lines to be
  swallowed into one expression during extraction.
- Test suite: corrected the extension identifier (the manifest declares a publisher) and
  upgraded `@vscode/test-electron`, which could not launch VS Code 1.110+ on macOS.

### Changed
- Development scratch scripts, fixtures and internal notes are excluded from the packaged
  extension.
- Removed the unused `ValidationService` plumbing through the playground classes, the
  dead `containsJsonataExpression`/`extractJsonataExpressionsFromLine` helpers, and the
  `vscode:uninstall` script pointing at a file that does not exist.

### Added
- **Session Share/Import Feature**: Major new feature for sharing and importing JSONata playground sessions
  - Export current playground state (JSON input, JSONata template, and results) to clipboard or file
  - Import shared sessions from clipboard or file with automatic 3-panel layout setup
  - One-click sharing via Share/Import buttons in the playground results panel
  - Structured JSON format for easy copy/paste sharing
  - Session validation and compatibility checking
  - Perfect for collaboration, debugging, and documentation
  - New commands: Share Session, Import Session, Export to Clipboard, Import from Clipboard
  - Context menu integration for easy access
  - Sample session file included in examples folder

### Technical
- New `ShareService` module for session management
- New `ExportService` module for exporting functionality
- New `ImportService` module for importing functionality
- Added callback mechanism to `PlaygroundWebviewManager` for share/import operations
- Enhanced `PlaygroundProvider` with share/import integration
- Updated UI with Share/Import buttons in playground results panel

## [1.3.6] - Previous Release
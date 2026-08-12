# Change Log

All notable changes to the "jsonata-validator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
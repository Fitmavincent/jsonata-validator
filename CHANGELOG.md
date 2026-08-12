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
- **Brackets inside string literals** no longer confuse expression boundaries;
  the scanner now tracks which quote character opened a string, so
  `$foo["a]b"]` is read correctly
- **Validation on type is now actually debounced.** Every keystroke used to
  schedule its own full re-validation 500ms later; a burst of typing now
  results in a single pass

### Added
- `jsonataValidator.warnOnUnsupportedLineComments` (default `true`): JSONata
  has no `//` line comments, and a stray one used to surface as a confusing
  `S0301 Empty regular expressions are not allowed` or `S0302 No terminating /
  in regular expression`. These are now reported as a plain warning that names
  the real problem, and the rest of the file still validates
- Diagnostics refresh when JSONata Validator settings change

### Technical
- New `jsonataScanner` module: a small comment/string-aware scanner, kept free
  of any `vscode` import so it can be tested on its own
- `ValidationService` now compiles the whole document first and only falls back
  to splitting it into separate expressions when that fails, which lets JSONata
  itself deal with comments and line breaks instead of a line-based heuristic
- Unit test suites for the scanner and the expression extractor
- Fixed the extension ID used by the test suite, which silently skipped
  activation and left three tests failing

## [Unreleased]

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
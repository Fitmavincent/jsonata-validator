# Change Log

All notable changes to the "jsonata-validator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
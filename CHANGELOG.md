# Change Log

All notable changes to the "jsonata-validator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
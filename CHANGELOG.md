# Changelog

All notable changes to this project will be documented in this file.

## 0.1.1 - 2026-06-17

### Added

- `harness --version` support for checking the CLI release version directly
- release-facing documentation for version visibility and pre-release verification

### Changed

- stricter workspace validation for timezone presence, history integrity, compatibility target duplication, and snapshot consistency
- clearer `diff` output with metadata-field change summaries
- clearer `history` output with current-version markers and snapshot paths
- more focused `show` output with `--metadata` and `--content` modes

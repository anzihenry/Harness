# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 - 2026-06-17

### Added

- asset dependency modeling with validation for missing, duplicate, cyclic, and target-incompatible dependencies
- `show --resolved` for inspecting dependency trees and flattened dependency graphs
- filtered and grouped `list` output with `--kind`, `--tag`, `--owner`, `--target`, and `--group-by`
- structured `--json` output for `list`, `validate`, `history`, `diff`, `export`, and `pack`
- entry-scoped exports with `--entry <kind:id>` and optional `--include-dependencies`
- `pack` command for bundle delivery with `manifest.json`, `assets.json`, and `rendered/<target>.json`
- workspace-level `schemaVersion` and `bundleDirectory` configuration
- `0.2.0` roadmap documentation covering milestones, command design, and bundle packaging direction

### Changed

- strengthened target compatibility enforcement during export and pack flows
- expanded smoke coverage for dependency resolution, local adapter compatibility, scoped exports, and bundle generation
- updated README and architecture docs to reflect the `0.2.0` asset, export, and packaging model

## 0.1.1 - 2026-06-17

### Added

- `harness --version` support for checking the CLI release version directly
- release-facing documentation for version visibility and pre-release verification

### Changed

- stricter workspace validation for timezone presence, history integrity, compatibility target duplication, and snapshot consistency
- clearer `diff` output with metadata-field change summaries
- clearer `history` output with current-version markers and snapshot paths
- more focused `show` output with `--metadata` and `--content` modes

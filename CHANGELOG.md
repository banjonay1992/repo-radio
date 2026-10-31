# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-31

### Added

- `repo-radio` command that reads a repository's history with `git log` and writes a Standard MIDI File and a JSON score.
- Options for branch, date range, maximum commits, tempo, key, seed, output formats, title, real author names and hiding commit subjects, with clear errors and exit codes.
- Deterministic composer driven by lookup tables: author to instrument, language to mode, commit size to note count and loudness, time of day to mood, plus motifs for merges, tags and reverts and a rest after quiet spells.
- Author aliases by default, with `--show-authors` to opt in to real names.
- Static web player with Web Audio playback, a radio dial timeline, file and drag-and-drop loading, `?score=` loading and an in-browser demo that is loaded by default, ready for static hosting such as Cloudflare Pages.
- Unit tests, integration tests against generated git repositories and a GitHub Actions workflow.
- npm package metadata and a release workflow that publishes to npm with provenance through trusted publishing, switched off until npm is set up.
- README screenshots of the player and the command line tool.

[Unreleased]: https://github.com/banjonay1992/repo-radio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/banjonay1992/repo-radio/releases/tag/v0.1.0

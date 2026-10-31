# Roadmap

Rough estimates are in hours of focused work. They add up to about 55 hours, so this is several weeks of evenings rather than a weekend.

## Next

These make the existing tool more trustworthy and easier to use.

- **Browser tests for the web player (about 4 hours).** Add Playwright tests that load the built player, open a score file, press play, check the needle moves and the "now playing" text changes, seek with the arrow keys and check the error message for a bad file. Run them in CI on Chromium.
- **Stream `git log` instead of buffering it (about 3 hours).** Read stdout from `spawn` line by line and parse records as they arrive, so very large repositories do not need the whole log in memory. Add a test that feeds the parser in awkward chunk sizes.
- **`--first-parent` and `--no-merges` options (about 1.5 hours).** Pass them through to `git log`, document them and cover them in the integration tests. First-parent mode gives a much tidier track for projects that merge every pull request.
- **Line counts for merges (about 2 hours).** Use the diff against the first parent for merge commits so a big merge sounds big, behind a flag at first so existing tracks do not change.
- **Download as WAV from the player (about 3 hours).** Render the score through an `OfflineAudioContext` with the same voices the live player uses and offer the result as a file, so people can share audio without a DAW.
- **Release 0.2.0 to npm (about 2 hours).** Check the package contents, add `npm publish --provenance` to a tagged release workflow and test `npx repo-radio` from a clean machine.

## Then

These widen what the music can say about a project.

- **A mapping file (about 5 hours).** Let people override the lookup tables with `--mapping mapping.json`: file types to languages, languages to modes, size buckets, voices. Validate it with clear error messages and ship an example file. The tables are already plain data, so this is mostly validation and docs.
- **Instruments by folder instead of by author (about 3 hours).** A `--voice-by directory` option that gives each top-level folder its own instrument. This suits solo projects, where every commit currently has the same voice.
- **Proper rename handling (about 2 hours).** Turn rename detection back on and parse the `old => new` and `dir/{a => b}/file` forms, so a rename no longer sounds like a huge rewrite.
- **A zoomable dial with hover details (about 4 hours).** Let long histories be zoomed and scrolled, and show a commit's details on hover or focus as well as when it plays.
- **Host the player on GitHub Pages (about 1.5 hours).** Build `dist-web` in CI on the main branch and publish it, so anyone can drop a score on a public page.
- **Windows and macOS in CI (about 2 hours).** Run the test suite on both, fix any path quoting or temporary folder differences, and document anything that behaves differently.

## Later

Bigger ideas that need more design before building.

- **Station mode (about 6 hours).** Mix several repositories into one track, each with its own register, for an organisation-wide year in review.
- **Live mode (about 5 hours).** Watch a repository, or use a `post-commit` hook, and play each new commit's bar as it lands.
- **Richer sound in the browser (about 6 hours).** Optional General MIDI sound font playback, loaded only when asked for, with the simple synth staying as the default.
- **Accessibility pass on the player (about 2 hours).** Screen reader announcements that are useful rather than noisy, a text list of commits that can be navigated in place of the dial, and checks against reduced-motion settings.
- **Score format version 2 (about 3 hours).** Add per-commit file categories and an optional outro, with a reader that still accepts version 1 scores.

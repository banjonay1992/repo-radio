# Contributing

Thanks for taking a look. Bug reports, ideas for the music mapping and pull requests are all welcome.

## Getting set up

You need Node 22.12 or later and git.

```sh
npm install
npm run typecheck
npm run lint
npm test
```

All three checks run in CI on every push and pull request, so please run them before opening one.

## Ground rules

- **No real personal data in tests or fixtures.** Tests build temporary repositories with invented people at `example.invalid` addresses. Please keep it that way, and never commit a score or MIDI file made from a real repository.
- **Keep the music mapping readable.** Musical choices belong in the tables in `src/compose/tables.ts`. If a change needs more than a small rule, open an issue first so we can talk it through.
- **Keep output deterministic.** The same repository and options must always give the same bytes. Any randomness has to come from the seeded helpers in `src/util/hash.ts`.
- **Add a test with each change.** Unit tests for rules and tables, and an integration test when the change involves reading git.

## Commits and pull requests

Write commit messages in the imperative ("Add the thing"), with a short body explaining why when it is not obvious. Keep pull requests focused on one change, and update the README and CHANGELOG when behaviour changes.

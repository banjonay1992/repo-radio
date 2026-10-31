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

## How releases work

Releases are cut from `main` once CI is green, and each one is a GitHub release with a matching tag such as `v0.2.0`.

1. Move the notes under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) into a new version section with today's date.
2. Bump the version with `npm version 0.2.0 --no-git-tag-version` and commit both files.
3. Check what will be published with `npm pack --dry-run`. Only `dist/`, the README, the changelog and the licence should be in the list.
4. Push to `main` and wait for CI to pass.
5. Create the release on GitHub with the tag `v` plus the version, targeting `main`, and paste the changelog section in as the notes.

Publishing the release starts [`.github/workflows/release.yml`](.github/workflows/release.yml). It checks that the tag matches the version in `package.json`, runs the typecheck, lint, tests and build again, then runs `npm publish --provenance --access public`. Pre-releases are skipped.

The workflow uses npm trusted publishing, so there is no npm token stored anywhere. GitHub hands the job a short-lived OIDC token (`id-token: write`) and npm checks it against the trusted publisher set up on the package. It does nothing until that is in place:

- On npmjs.com, add a trusted publisher to the `repo-radio` package for the GitHub repository `banjonay1992/repo-radio`, workflow file `release.yml` and environment `npm`. A trusted publisher can only be added to a package that already exists, so the very first version has to be published once by hand from a clean checkout (`npm ci && npm publish --access public`, signed in with two-factor authentication). Every release after that goes through the workflow.
- The repository has to be public. npm will not attach provenance to a package built from a private repository.
- In the repository's Actions settings, add a variable named `NPM_PUBLISH` with the value `true`. Until it is set the publish job is skipped, so a release never leaves a failed run behind.

The `npm` environment is created by GitHub the first time the job runs. Adding required reviewers to it in the repository settings gives a final manual check before anything reaches npm.

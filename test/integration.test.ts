import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BAR, RepoRadioError, generate, parseScore, renderMidi, renderScoreJson } from "../src/index.js";
import { readCommits } from "../src/git/read.js";
import { readMidi } from "./helpers/midiReader.js";
import { ALEX, RIO, SAM, SyntheticRepo, buildStandardRepo } from "./helpers/syntheticRepo.js";

let repo: SyntheticRepo;

beforeAll(() => {
  repo = buildStandardRepo();
});

afterAll(() => {
  repo.cleanup();
});

describe("reading a scripted repository", () => {
  it("reads every commit oldest first with the right details", () => {
    const commits = readCommits(repo.dir);
    expect(commits.map((c) => c.subject)).toEqual([
      "Initial commit",
      "Add main entry point",
      "Add helpers",
      "Write the guide",
      "Tidy main",
      "Merge branch 'docs'",
      "Add experimental flag",
      'Revert "Add experimental flag"',
      "Add logo and café notes",
    ]);
    expect(commits[2]?.tags).toEqual(["v0.1.0"]);
    expect(commits[5]?.parents).toHaveLength(2);
    const last = commits[8]!;
    expect(last.files).toEqual(
      expect.arrayContaining([
        { path: "assets/logo.png", added: null, deleted: null },
        { path: "notes/café menu.md", added: 3, deleted: 0 },
      ]),
    );
  });

  it("follows another branch", () => {
    const commits = readCommits(repo.dir, { revision: "docs" });
    expect(commits.at(-1)?.subject).toBe("Write the guide");
    expect(commits).toHaveLength(4);
  });

  it("limits to the most recent commits", () => {
    const commits = readCommits(repo.dir, { maxCommits: 3 });
    expect(commits.map((c) => c.subject)).toEqual([
      "Add experimental flag",
      'Revert "Add experimental flag"',
      "Add logo and café notes",
    ]);
  });

  it("filters by date", () => {
    const commits = readCommits(repo.dir, { since: "2024-01-04T00:00:00Z", until: "2024-01-06T00:00:00Z" });
    expect(commits.map((c) => c.subject)).toEqual(["Write the guide", "Tidy main", "Merge branch 'docs'"]);
  });
});

describe("generating a track", () => {
  it("models kinds, bands and categories from real git output", () => {
    const { history } = generate(repo.dir);
    expect(history.commits.map((c) => c.kind)).toEqual([
      "initial",
      "commit",
      "commit",
      "commit",
      "commit",
      "merge",
      "commit",
      "revert",
      "commit",
    ]);
    expect(history.commits.map((c) => c.timeBand).slice(0, 3)).toEqual(["morning", "evening", "small-hours"]);
    expect(history.commits.map((c) => c.category).slice(0, 4)).toEqual(["docs", "web", "scripting", "docs"]);
    expect(history.commits[7]?.revertsIndex).toBe(6);
    expect(history.authors).toHaveLength(3);
  });

  it("hides real names unless asked", () => {
    const hidden = renderScoreJson(generate(repo.dir).score);
    for (const person of [ALEX, SAM, RIO]) {
      expect(hidden).not.toContain(person.name);
      expect(hidden).not.toContain(person.email);
    }
    const shown = generate(repo.dir, { showAuthors: true }).score;
    expect(shown.authors.map((a) => a.label)).toEqual([ALEX.name, SAM.name, RIO.name]);
    expect(renderScoreJson(shown)).not.toContain(ALEX.email);
  });

  it("lays commits out bar by bar, with a rest after the quiet month", () => {
    const { score } = generate(repo.dir);
    expect(score.meta.commitCount).toBe(9);
    expect(score.commits[7]?.startTick).toBe(7 * BAR);
    expect(score.commits[8]?.startTick).toBe(9 * BAR);
    expect(score.meta.durationTicks).toBe(10 * BAR);
  });

  it("plays the merge, tag and revert motifs", () => {
    const { score } = generate(repo.dir);
    expect(score.notes.some((n) => n.commit === 5 && n.voice === "brass")).toBe(true);
    expect(score.notes.some((n) => n.commit === 2 && n.voice === "pad")).toBe(true);
    const lead = (i: number) => score.notes.filter((n) => n.commit === i && n.voice === score.commits[i]!.voice).map((n) => n.pitch);
    expect(lead(7)).toEqual([...lead(6)].reverse());
  });

  it("is deterministic: same repo, same bytes", () => {
    const first = generate(repo.dir).score;
    const second = generate(repo.dir).score;
    expect(renderScoreJson(second)).toBe(renderScoreJson(first));
    expect(Buffer.from(renderMidi(second)).equals(Buffer.from(renderMidi(first)))).toBe(true);
  });

  it("writes a MIDI file whose notes match the score", () => {
    const { score } = generate(repo.dir);
    const midi = readMidi(renderMidi(score));
    expect(midi.tracks).toHaveLength(score.voices.length + 1);
    const ons = midi.tracks.flat().filter((e) => e.type === "noteOn");
    expect(ons).toHaveLength(score.notes.length);
    expect(parseScore(renderScoreJson(score)).notes).toHaveLength(score.notes.length);
  });
});

describe("errors", () => {
  function expectCode(fn: () => unknown, code: string) {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(RepoRadioError);
      expect((error as RepoRadioError).code).toBe(code);
      return;
    }
    throw new Error(`expected a RepoRadioError with code ${code}`);
  }

  it("reports a folder that is not a repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-radio-plain-"));
    try {
      expectCode(() => readCommits(dir), "NOT_A_REPO");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a missing folder", () => {
    expectCode(() => readCommits(join(tmpdir(), "repo-radio-does-not-exist-12345")), "PATH_NOT_FOUND");
  });

  it("reports a repository with no commits", () => {
    const empty = new SyntheticRepo();
    try {
      expectCode(() => readCommits(empty.dir), "EMPTY_HISTORY");
    } finally {
      empty.cleanup();
    }
  });

  it("reports an unknown branch, and refuses option-like revisions", () => {
    expectCode(() => readCommits(repo.dir, { revision: "no-such-branch" }), "UNKNOWN_REVISION");
    expectCode(() => readCommits(repo.dir, { revision: "--output=/tmp/x" }), "BAD_OPTION");
  });

  it("reports when filters match nothing", () => {
    expectCode(() => readCommits(repo.dir, { since: "2030-01-01" }), "NO_MATCHING_COMMITS");
  });
});

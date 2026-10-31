import { describe, expect, it } from "vitest";
import { BAR, compose, degreeToPitch, modeFor, normaliseKey } from "../src/compose/compose.js";
import { MODES, SIZE_BUCKETS, TIME_BAND_MOOD, sizeBucketFor } from "../src/compose/tables.js";
import { buildHistory } from "../src/model/build.js";
import type { RawCommit } from "../src/model/types.js";
import { fakeSha, rawCommit } from "./helpers/fixtures.js";

function history(commits: RawCommit[], showAuthors = false) {
  return buildHistory(commits, { showAuthors });
}

function sampleCommits(): RawCommit[] {
  return [
    rawCommit({ sha: fakeSha(1), parents: [], subject: "Initial commit", files: [{ path: "README.md", added: 5, deleted: 0 }] }),
    rawCommit({
      sha: fakeSha(2),
      subject: "Add parser",
      authorEmail: "second@example.invalid",
      files: [{ path: "src/parse.ts", added: 120, deleted: 4 }],
    }),
    rawCommit({ sha: fakeSha(3), subject: "Tidy up", files: [{ path: "src/parse.ts", added: 2, deleted: 30 }], tags: ["v0.1.0"] }),
    rawCommit({ sha: fakeSha(4), parents: [fakeSha(2), fakeSha(3)], subject: "Merge branch 'parser'", files: [] }),
    rawCommit({ sha: fakeSha(5), subject: 'Revert "Add parser"', files: [{ path: "src/parse.ts", added: 4, deleted: 120 }] }),
  ];
}

describe("degreeToPitch", () => {
  const major = MODES.ionian;
  it("walks the scale across octaves", () => {
    expect(degreeToPitch(major, 0, 60)).toBe(60);
    expect(degreeToPitch(major, 2, 60)).toBe(64);
    expect(degreeToPitch(major, 7, 60)).toBe(72);
    expect(degreeToPitch(major, -1, 60)).toBe(59);
  });

  it("folds pitches back into the MIDI range", () => {
    expect(degreeToPitch(major, 70, 120)).toBeLessThanOrEqual(127);
    expect(degreeToPitch(major, -70, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("tables", () => {
  it("size buckets grow with lines changed", () => {
    expect(sizeBucketFor(0).label).toBe("empty");
    expect(sizeBucketFor(7).label).toBe("tiny");
    expect(sizeBucketFor(51).label).toBe("medium");
    expect(sizeBucketFor(50_000).label).toBe("huge");
    for (let i = 1; i < SIZE_BUCKETS.length; i++) {
      expect(SIZE_BUCKETS[i]!.velocity).toBeGreaterThan(SIZE_BUCKETS[i - 1]!.velocity);
    }
  });

  it("late commits play darker and mornings brighter", () => {
    expect(modeFor("web", TIME_BAND_MOOD["small-hours"])).toBe("mixolydian");
    expect(modeFor("web", TIME_BAND_MOOD.morning)).toBe("lydian");
    expect(modeFor("web", TIME_BAND_MOOD.afternoon)).toBe("ionian");
    expect(modeFor("docs", TIME_BAND_MOOD.evening)).toBe("minorPentatonic");
  });

  it("normalises key names", () => {
    expect(normaliseKey("c")).toBe("C");
    expect(normaliseKey("f#")).toBe("F#");
    expect(normaliseKey("bb")).toBe("Bb");
    expect(normaliseKey("H")).toBeNull();
    expect(normaliseKey("")).toBeNull();
  });
});

describe("compose", () => {
  it("is deterministic for the same input and seed", () => {
    const a = compose(history(sampleCommits()), { seed: "abc" });
    const b = compose(history(sampleCommits()), { seed: "abc" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("varies with the seed", () => {
    const a = compose(history(sampleCommits()), { seed: "one" });
    const b = compose(history(sampleCommits()), { seed: "two" });
    expect(JSON.stringify(a.notes)).not.toBe(JSON.stringify(b.notes));
  });

  it("gives each commit one bar and keeps notes in range", () => {
    const score = compose(history(sampleCommits()));
    expect(score.commits).toHaveLength(5);
    score.commits.forEach((c, i) => {
      expect(c.startTick).toBe(i * BAR);
      expect(c.endTick).toBe((i + 1) * BAR);
    });
    expect(score.meta.durationTicks).toBe(5 * BAR);
    expect(score.meta.durationSeconds).toBe(10);
    for (const note of score.notes) {
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.pitch).toBeLessThanOrEqual(127);
      expect(note.velocity).toBeGreaterThanOrEqual(1);
      expect(note.velocity).toBeLessThanOrEqual(127);
      expect(note.duration).toBeGreaterThan(0);
      const commit = score.commits[note.commit]!;
      expect(note.tick).toBeGreaterThanOrEqual(commit.startTick);
      expect(note.tick).toBeLessThan(commit.endTick);
    }
  });

  it("gives each author their own lead voice", () => {
    const score = compose(history(sampleCommits()));
    expect(score.authors).toHaveLength(2);
    expect(score.authors[0]!.voice).not.toBe(score.authors[1]!.voice);
    expect(score.commits[1]!.voice).toBe(score.authors[1]!.voice);
  });

  it("plays busier phrases for bigger commits", () => {
    const score = compose(history(sampleCommits()));
    const leadCount = (i: number) =>
      score.notes.filter((n) => n.commit === i && n.voice === score.commits[i]!.voice).length;
    expect(leadCount(0)).toBe(2); // 5 lines: tiny
    expect(leadCount(1)).toBe(6); // 124 lines: medium
  });

  it("adds motifs for merges and tags", () => {
    const score = compose(history(sampleCommits()));
    expect(score.notes.some((n) => n.commit === 3 && n.voice === "brass")).toBe(true);
    expect(score.notes.filter((n) => n.commit === 2 && n.voice === "pad")).toHaveLength(3);
    expect(score.notes.some((n) => n.commit === 1 && n.voice === "pad")).toBe(false);
  });

  it("plays a reverted commit's tune backwards", () => {
    const score = compose(history(sampleCommits()));
    const lead = (i: number) =>
      score.notes.filter((n) => n.commit === i && n.voice === score.commits[i]!.voice).map((n) => n.pitch);
    expect(lead(4)).toEqual([...lead(1)].reverse());
  });

  it("inserts a bar of rest after a long quiet spell", () => {
    const commits = [
      rawCommit({ authorDate: "2024-01-01T12:00:00+00:00" }),
      rawCommit({ authorDate: "2024-03-01T12:00:00+00:00" }),
    ];
    const score = compose(history(commits));
    expect(score.commits[1]!.startTick).toBe(2 * BAR);
  });

  it("can leave subjects out", () => {
    const score = compose(history(sampleCommits()), { includeSubjects: false });
    expect(score.commits.every((c) => c.subject === null)).toBe(true);
  });

  it("transposes with the key", () => {
    const inC = compose(history(sampleCommits()), { key: "C" });
    const inD = compose(history(sampleCommits()), { key: "D" });
    const firstLead = (s: typeof inC) => s.notes.find((n) => n.voice === s.commits[0]!.voice)!.pitch;
    expect(firstLead(inD) - firstLead(inC)).toBe(2);
    expect(() => compose(history(sampleCommits()), { key: "Q" })).toThrow(/Unknown key/);
  });
});

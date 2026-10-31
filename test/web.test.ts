import { describe, expect, it } from "vitest";
import { compose } from "../src/compose/compose.js";
import { buildHistory } from "../src/model/build.js";
import { parseScore, renderScoreJson } from "../src/render/json.js";
import { demoCommits, demoScore } from "../web/src/demo.js";
import { VOICE_COLOURS, layoutDial, markHeight, tickForX, xForTick } from "../web/src/dialLayout.js";
import { LEAD_VOICES } from "../src/compose/tables.js";
import {
  commitAt,
  firstNoteAtOrAfter,
  formatTime,
  midiToFrequency,
  secondsToTick,
  tickToSeconds,
} from "../web/src/schedule.js";

describe("player timing", () => {
  const score = demoScore();

  it("converts between ticks and seconds at the score's tempo", () => {
    expect(tickToSeconds(score, score.meta.ppq)).toBeCloseTo(0.5); // one beat at 120 bpm
    expect(secondsToTick(score, 2)).toBeCloseTo(score.meta.ppq * 4);
    expect(tickToSeconds(score, score.meta.durationTicks)).toBeCloseTo(score.meta.durationSeconds, 2);
  });

  it("finds the first note at or after a tick", () => {
    const notes = score.notes;
    expect(firstNoteAtOrAfter(notes, 0)).toBe(0);
    expect(firstNoteAtOrAfter(notes, Number.MAX_SAFE_INTEGER)).toBe(notes.length);
    const mid = notes[Math.floor(notes.length / 2)]!.tick;
    const index = firstNoteAtOrAfter(notes, mid);
    expect(notes[index]!.tick).toBe(mid);
    expect(index === 0 || notes[index - 1]!.tick < mid).toBe(true);
  });

  it("knows which commit is playing, including during a rest", () => {
    const commits = score.commits;
    expect(commitAt(commits, 0)?.index).toBe(0);
    expect(commitAt(commits, commits[3]!.startTick + 10)?.index).toBe(3);
    expect(commitAt(commits, -1)).toBeUndefined();
    // The demo has a quiet month, which leaves a gap between two commits.
    const gapAfter = commits.findIndex((c, i) => commits[i + 1] && commits[i + 1]!.startTick > c.endTick);
    expect(gapAfter).toBeGreaterThan(-1);
    expect(commitAt(commits, commits[gapAfter]!.endTick + 5)?.index).toBe(gapAfter);
  });

  it("formats times and frequencies", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(-3)).toBe("0:00");
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(81)).toBe(880);
  });
});

describe("dial layout", () => {
  const score = demoScore();

  it("places marks left to right across the dial", () => {
    const layout = layoutDial(score, 800, 150);
    expect(layout.marks).toHaveLength(score.commits.length);
    for (let i = 1; i < layout.marks.length; i++) {
      expect(layout.marks[i]!.x).toBeGreaterThan(layout.marks[i - 1]!.x);
    }
    expect(layout.marks[0]!.x).toBe(16);
    expect(xForTick(score, score.meta.durationTicks, 800)).toBe(784);
  });

  it("maps clicks back to ticks and clamps outside the scale", () => {
    expect(tickForX(score, 400, 800)).toBeCloseTo(score.meta.durationTicks / 2);
    expect(tickForX(score, -50, 800)).toBe(0);
    expect(tickForX(score, 5000, 800)).toBe(score.meta.durationTicks);
  });

  it("gives bigger commits taller marks, within bounds", () => {
    expect(markHeight(0, 80)).toBe(6);
    expect(markHeight(10, 80)).toBeLessThan(markHeight(100, 80));
    expect(markHeight(1_000_000, 80)).toBe(80);
  });

  it("has a colour for every lead voice", () => {
    for (const voice of LEAD_VOICES) expect(VOICE_COLOURS[voice.id]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("demo score", () => {
  it("uses only made-up people", () => {
    for (const commit of demoCommits()) {
      expect(commit.authorEmail).toMatch(/@example\.invalid$/);
    }
  });

  it("composes the same way as the CLI and survives a JSON round trip", () => {
    const direct = compose(buildHistory(demoCommits()), { title: "Demo project", generator: "repo-radio demo" });
    expect(demoScore()).toEqual(direct);
    expect(parseScore(renderScoreJson(direct))).toEqual(direct);
  });

  it("shows off merges, tags and a revert", () => {
    const kinds = new Set(demoScore().commits.map((c) => c.kind));
    expect(kinds).toEqual(new Set(["initial", "commit", "merge", "revert"]));
    expect(demoScore().commits.flatMap((c) => c.tags)).toEqual(["v0.1.0", "v0.2.0"]);
  });
});

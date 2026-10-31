import { describe, expect, it } from "vitest";
import { compose } from "../src/compose/compose.js";
import type { Score, ScoreNote } from "../src/compose/score.js";
import { buildHistory } from "../src/model/build.js";
import { parseScore, renderScoreJson } from "../src/render/json.js";
import { clipOverlaps, encodeVlq, renderMidi } from "../src/render/midi.js";
import { fakeSha, rawCommit } from "./helpers/fixtures.js";
import { readMidi } from "./helpers/midiReader.js";

function sampleScore(): Score {
  const history = buildHistory([
    rawCommit({ sha: fakeSha(10), parents: [], files: [{ path: "a.ts", added: 40, deleted: 0 }] }),
    rawCommit({ sha: fakeSha(11), authorEmail: "other@example.invalid", tags: ["v1"], files: [{ path: "b.go", added: 3, deleted: 1 }] }),
    rawCommit({ sha: fakeSha(12), parents: ["x", "y"], files: [] }),
  ]);
  return compose(history, { tempo: 100, title: "Test track" });
}

describe("encodeVlq", () => {
  it.each([
    [0, [0x00]],
    [0x40, [0x40]],
    [0x7f, [0x7f]],
    [0x80, [0x81, 0x00]],
    [0x2000, [0xc0, 0x00]],
    [0x3fff, [0xff, 0x7f]],
    [0x4000, [0x81, 0x80, 0x00]],
    [0x0fffffff, [0xff, 0xff, 0xff, 0x7f]],
  ])("%i", (value, bytes) => {
    expect(encodeVlq(value)).toEqual(bytes);
  });

  it("rejects values it cannot encode", () => {
    expect(() => encodeVlq(-1)).toThrow(RangeError);
    expect(() => encodeVlq(0x10000000)).toThrow(RangeError);
    expect(() => encodeVlq(1.5)).toThrow(RangeError);
  });
});

describe("clipOverlaps", () => {
  it("shortens a note when the same pitch starts again before it ends", () => {
    const notes: ScoreNote[] = [
      { tick: 0, duration: 100, pitch: 60, velocity: 80, voice: "v", commit: 0 },
      { tick: 50, duration: 100, pitch: 60, velocity: 80, voice: "v", commit: 0 },
      { tick: 0, duration: 100, pitch: 64, velocity: 80, voice: "v", commit: 0 },
    ];
    const clipped = clipOverlaps(notes);
    expect(clipped.find((n) => n.pitch === 60 && n.tick === 0)?.duration).toBe(50);
    expect(clipped.find((n) => n.pitch === 64)?.duration).toBe(100);
  });
});

describe("renderMidi", () => {
  it("writes a valid format 1 file with a track per voice", () => {
    const score = sampleScore();
    const midi = readMidi(renderMidi(score));
    expect(midi.format).toBe(1);
    expect(midi.division).toBe(score.meta.ppq);
    expect(midi.tracks).toHaveLength(score.voices.length + 1);
  });

  it("puts tempo, time signature and commit markers in the conductor track", () => {
    const score = sampleScore();
    const [conductor] = readMidi(renderMidi(score)).tracks;
    const tempo = conductor!.find((e) => e.metaType === 0x51)!;
    const micros = (tempo.data![0]! << 16) | (tempo.data![1]! << 8) | tempo.data![2]!;
    expect(micros).toBe(600_000); // 100 bpm
    expect(conductor!.find((e) => e.metaType === 0x58)?.data).toEqual([4, 2, 24, 8]);
    const markers = conductor!.filter((e) => e.metaType === 0x06);
    expect(markers.map((m) => m.tick)).toEqual(score.commits.map((c) => c.startTick));
    const end = conductor!.at(-1)!;
    expect(end.metaType).toBe(0x2f);
    expect(end.tick).toBe(score.meta.durationTicks);
  });

  it("contains every note once, with matching note-offs", () => {
    const score = sampleScore();
    const midi = readMidi(renderMidi(score));
    const ons = midi.tracks.flat().filter((e) => e.type === "noteOn");
    const offs = midi.tracks.flat().filter((e) => e.type === "noteOff");
    expect(ons).toHaveLength(score.notes.length);
    expect(offs).toHaveLength(score.notes.length);
  });

  it("sets programs for melodic voices and none for drums", () => {
    const score = sampleScore();
    const midi = readMidi(renderMidi(score));
    score.voices.forEach((voice, i) => {
      const programs = midi.tracks[i + 1]!.filter((e) => e.type === "program");
      if (voice.role === "drums") {
        expect(programs).toHaveLength(0);
      } else {
        expect(programs).toEqual([expect.objectContaining({ channel: voice.channel, program: voice.program })]);
      }
    });
  });

  it("is byte-for-byte deterministic", () => {
    expect(Buffer.from(renderMidi(sampleScore())).equals(Buffer.from(renderMidi(sampleScore())))).toBe(true);
  });
});

describe("score JSON", () => {
  it("round-trips through renderScoreJson and parseScore", () => {
    const score = sampleScore();
    expect(parseScore(renderScoreJson(score))).toEqual(score);
  });

  it("writes one note per line", () => {
    const text = renderScoreJson(sampleScore());
    expect(text.split("\n").filter((l) => l.startsWith('    {"tick"')).length).toBe(sampleScore().notes.length);
  });

  it("rejects things that are not scores", () => {
    expect(() => parseScore("nope")).toThrow(/not valid JSON/);
    expect(() => parseScore("{}")).toThrow(/not a Repo Radio score/);
    expect(() => parseScore('{"format":"repo-radio-score","version":99}')).toThrow(/Unsupported score version/);
    expect(() => parseScore('{"format":"repo-radio-score","version":1}')).toThrow(/missing/);
  });
});

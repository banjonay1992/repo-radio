/**
 * Pure timing helpers for the player. Kept free of DOM and Web Audio so
 * they can be unit tested in Node.
 */

import type { Score, ScoreCommit, ScoreNote } from "../../src/compose/score.js";

export function secondsPerTick(score: Score): number {
  return 60 / score.meta.tempo / score.meta.ppq;
}

export function tickToSeconds(score: Score, tick: number): number {
  return tick * secondsPerTick(score);
}

export function secondsToTick(score: Score, seconds: number): number {
  return seconds / secondsPerTick(score);
}

/** Index of the first note at or after `tick`. Notes must be sorted by tick. */
export function firstNoteAtOrAfter(notes: readonly ScoreNote[], tick: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((notes[mid] as ScoreNote).tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The commit playing at `tick`, or the last one before it during a rest. */
export function commitAt(commits: readonly ScoreCommit[], tick: number): ScoreCommit | undefined {
  let found: ScoreCommit | undefined;
  for (const commit of commits) {
    if (commit.startTick > tick) break;
    found = commit;
  }
  return found;
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function midiToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

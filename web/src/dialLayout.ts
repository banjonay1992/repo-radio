/**
 * Layout for the tuning dial: where each commit's mark goes and how tall
 * it is. Pure, so it can be tested without a browser.
 */

import type { Score, ScoreCommit } from "../../src/compose/score.js";

/** One colour per lead voice, tuned to read on the dial face. */
export const VOICE_COLOURS: Record<string, string> = {
  piano: "#2b5c8a",
  vibes: "#8a3b6e",
  guitar: "#a4532a",
  flute: "#2f7d5b",
  marimba: "#86651a",
  "square-lead": "#5b4ba0",
  strings: "#9c3434",
  clarinet: "#1f7a85",
};

export const FALLBACK_COLOUR = "#4a5559";

export interface DialMark {
  commit: ScoreCommit;
  x: number;
  /** Tick height above (or for reverts, below) the baseline, in CSS pixels. */
  height: number;
  colour: string;
}

export interface DialLayout {
  width: number;
  height: number;
  baseline: number;
  marks: DialMark[];
}

const PADDING_X = 16;

export function xForTick(score: Score, tick: number, width: number): number {
  const usable = Math.max(1, width - PADDING_X * 2);
  const total = Math.max(1, score.meta.durationTicks);
  return PADDING_X + (Math.min(Math.max(tick, 0), total) / total) * usable;
}

export function tickForX(score: Score, x: number, width: number): number {
  const usable = Math.max(1, width - PADDING_X * 2);
  const ratio = Math.min(Math.max((x - PADDING_X) / usable, 0), 1);
  return ratio * score.meta.durationTicks;
}

/** Bigger commits get taller ticks, on a log scale so one huge commit cannot flatten the rest. */
export function markHeight(lines: number, maxHeight: number): number {
  const scaled = Math.log10(lines + 1) / Math.log10(10_001);
  return Math.round(6 + Math.min(scaled, 1) * (maxHeight - 6));
}

export function layoutDial(score: Score, width: number, height: number): DialLayout {
  const baseline = Math.round(height * 0.66);
  const maxUp = baseline - 22;
  const maxDown = height - baseline - 8;
  const marks = score.commits.map((commit) => {
    const lines = commit.linesAdded + commit.linesDeleted;
    const isRevert = commit.kind === "revert";
    return {
      commit,
      x: xForTick(score, commit.startTick, width),
      height: isRevert ? Math.min(markHeight(lines, maxUp), maxDown) : markHeight(lines, maxUp),
      colour: VOICE_COLOURS[commit.voice] ?? FALLBACK_COLOUR,
    };
  });
  return { width, height, baseline, marks };
}


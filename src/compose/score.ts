/**
 * The JSON "score": everything the web player (or any other tool) needs to
 * play and draw a track. Times are in MIDI ticks; meta.ppq says how many
 * ticks make a quarter note.
 */

import type { CommitKind, TimeBand } from "../model/types.js";

export const SCORE_FORMAT = "repo-radio-score";
export const SCORE_VERSION = 1;

export type Waveform = "sine" | "triangle" | "square" | "sawtooth" | "drums";

export type VoiceRole = "lead" | "bass" | "drums" | "motif" | "pad";

export interface Voice {
  id: string;
  name: string;
  role: VoiceRole;
  /** General MIDI program number, 0-127. Ignored for drums. */
  program: number;
  /** MIDI channel, 0-15. Channel 9 is percussion. */
  channel: number;
  /** Oscillator shape the web player uses for this voice. */
  waveform: Waveform;
  /** Envelope for the web player, in seconds. */
  attack: number;
  release: number;
}

export interface ScoreNote {
  tick: number;
  duration: number;
  /** MIDI note number, 0-127. */
  pitch: number;
  velocity: number;
  voice: string;
  /** Index of the commit this note belongs to. */
  commit: number;
}

export interface ScoreCommit {
  index: number;
  shortSha: string;
  kind: CommitKind;
  author: string;
  date: string;
  hour: number;
  timeBand: TimeBand;
  /** Null when subjects are hidden. */
  subject: string | null;
  tags: string[];
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  category: string;
  mode: string;
  voice: string;
  startTick: number;
  endTick: number;
}

export interface ScoreAuthor {
  label: string;
  voice: string;
  commits: number;
}

export interface ScoreMeta {
  title: string;
  generator: string;
  tempo: number;
  ppq: number;
  beatsPerBar: number;
  key: string;
  seed: string;
  commitCount: number;
  durationTicks: number;
  durationSeconds: number;
}

export interface Score {
  format: typeof SCORE_FORMAT;
  version: typeof SCORE_VERSION;
  meta: ScoreMeta;
  voices: Voice[];
  authors: ScoreAuthor[];
  commits: ScoreCommit[];
  notes: ScoreNote[];
}

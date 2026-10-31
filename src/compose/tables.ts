/**
 * All the musical choices live here as plain lookup tables, so the mapping
 * from git history to music can be read (and changed) in one place.
 */

import type { Category } from "../model/languages.js";
import type { TimeBand } from "../model/types.js";
import type { Voice } from "./score.js";

/** Scales as semitone offsets from the root. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
} as const satisfies Record<string, readonly number[]>;

export type ModeName = keyof typeof MODES;

/** Which mode each language category plays in. */
export const CATEGORY_MODE: Record<Category, ModeName> = {
  web: "ionian",
  styles: "lydian",
  systems: "dorian",
  scripting: "mixolydian",
  jvm: "aeolian",
  apps: "mixolydian",
  functional: "lydian",
  shell: "phrygian",
  data: "minorPentatonic",
  docs: "majorPentatonic",
  other: "majorPentatonic",
};

/** One step darker, used for late commits. */
export const DARKER: Record<ModeName, ModeName> = {
  lydian: "ionian",
  ionian: "mixolydian",
  mixolydian: "dorian",
  dorian: "aeolian",
  aeolian: "phrygian",
  phrygian: "phrygian",
  majorPentatonic: "minorPentatonic",
  minorPentatonic: "minorPentatonic",
};

/** One step brighter, used for morning commits. */
export const BRIGHTER: Record<ModeName, ModeName> = {
  phrygian: "aeolian",
  aeolian: "dorian",
  dorian: "mixolydian",
  mixolydian: "ionian",
  ionian: "lydian",
  lydian: "lydian",
  minorPentatonic: "majorPentatonic",
  majorPentatonic: "majorPentatonic",
};

export interface Mood {
  shift: "darker" | "brighter" | "none";
  /** Octaves to move the lead line. */
  octave: number;
  /** Added to every velocity. */
  velocity: number;
}

/** How the time of day colours a phrase. */
export const TIME_BAND_MOOD: Record<TimeBand, Mood> = {
  "small-hours": { shift: "darker", octave: -1, velocity: -14 },
  morning: { shift: "brighter", octave: 1, velocity: 4 },
  afternoon: { shift: "none", octave: 0, velocity: 0 },
  evening: { shift: "darker", octave: 0, velocity: -6 },
};

export interface SizeBucket {
  /** Upper bound (inclusive) on lines added plus deleted. */
  maxLines: number;
  label: string;
  /** Lead notes in the bar. */
  notes: number;
  velocity: number;
  /** Stack a third on every note for very large commits. */
  chords: boolean;
}

/** Commit size sets how busy and how loud the phrase is. */
export const SIZE_BUCKETS: readonly SizeBucket[] = [
  { maxLines: 0, label: "empty", notes: 1, velocity: 58, chords: false },
  { maxLines: 10, label: "tiny", notes: 2, velocity: 66, chords: false },
  { maxLines: 50, label: "small", notes: 4, velocity: 76, chords: false },
  { maxLines: 200, label: "medium", notes: 6, velocity: 88, chords: false },
  { maxLines: 1000, label: "large", notes: 8, velocity: 100, chords: false },
  { maxLines: Number.POSITIVE_INFINITY, label: "huge", notes: 8, velocity: 112, chords: true },
];

export function sizeBucketFor(lines: number): SizeBucket {
  return SIZE_BUCKETS.find((b) => lines <= b.maxLines) ?? (SIZE_BUCKETS.at(-1) as SizeBucket);
}

/**
 * Melodic shapes, as steps between scale degrees. The first note sits on a
 * chord tone and each following note moves by the next step. Commits that
 * delete more than they add play the shape upside down.
 */
export const CONTOURS: readonly (readonly number[])[] = [
  [1, 1, 1, -1, 1, 1, -2],
  [2, -1, 2, -1, 2, -1, -2],
  [-1, -1, 2, 1, 1, -1, 1],
  [1, 2, -1, -1, 2, 1, -2],
  [0, 1, 1, 2, -1, -1, 0],
  [2, 2, -1, -2, 1, -1, 1],
  [-2, 1, 1, 1, -1, 2, -1],
  [1, -1, 2, -2, 3, -1, -1],
];

/** Chord roots (scale degrees) cycled bar by bar: I, vi, IV, V. */
export const PROGRESSION: readonly number[] = [0, 5, 3, 4];

/** Lead voices handed to authors in order of first appearance. */
export const LEAD_VOICES: readonly Voice[] = [
  { id: "piano", name: "Piano", role: "lead", program: 0, channel: 0, waveform: "triangle", attack: 0.005, release: 0.4 },
  { id: "vibes", name: "Vibraphone", role: "lead", program: 11, channel: 1, waveform: "sine", attack: 0.005, release: 0.8 },
  { id: "guitar", name: "Clean guitar", role: "lead", program: 27, channel: 2, waveform: "sawtooth", attack: 0.004, release: 0.3 },
  { id: "flute", name: "Flute", role: "lead", program: 73, channel: 3, waveform: "sine", attack: 0.06, release: 0.2 },
  { id: "marimba", name: "Marimba", role: "lead", program: 12, channel: 4, waveform: "triangle", attack: 0.002, release: 0.25 },
  { id: "square-lead", name: "Square lead", role: "lead", program: 80, channel: 5, waveform: "square", attack: 0.01, release: 0.15 },
  { id: "strings", name: "Strings", role: "lead", program: 48, channel: 6, waveform: "sawtooth", attack: 0.12, release: 0.5 },
  { id: "clarinet", name: "Clarinet", role: "lead", program: 71, channel: 7, waveform: "square", attack: 0.03, release: 0.2 },
];

export const BASS_VOICE: Voice = {
  id: "bass", name: "Bass", role: "bass", program: 33, channel: 8, waveform: "triangle", attack: 0.01, release: 0.2,
};

export const DRUM_VOICE: Voice = {
  id: "drums", name: "Drums", role: "drums", program: 0, channel: 9, waveform: "drums", attack: 0.001, release: 0.1,
};

/** Plays the merge and revert motifs. */
export const MOTIF_VOICE: Voice = {
  id: "brass", name: "Brass", role: "motif", program: 61, channel: 10, waveform: "sawtooth", attack: 0.02, release: 0.25,
};

/** Holds a chord under tagged commits. */
export const PAD_VOICE: Voice = {
  id: "pad", name: "Warm pad", role: "pad", program: 89, channel: 11, waveform: "sine", attack: 0.3, release: 1.2,
};

/** General MIDI percussion notes. */
export const DRUMS = {
  kick: 36,
  snare: 38,
  closedHat: 42,
  openHat: 46,
  crash: 49,
} as const;

/** Base pitch (MIDI note) for each part, before the key is applied. C4 is 60. */
export const REGISTER = {
  lead: 60,
  motif: 60,
  pad: 48,
  bass: 36,
} as const;

/** Note names accepted by --key, mapped to semitones above C. */
export const KEYS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** A quiet gap between commits longer than this becomes a bar of rest. */
export const QUIET_GAP_DAYS = 14;

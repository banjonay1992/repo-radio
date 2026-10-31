import type { Category } from "../model/languages.js";
import type { Commit, History } from "../model/types.js";
import { hashParts, pick, seededRandom } from "../util/hash.js";
import {
  BASS_VOICE,
  BRIGHTER,
  CATEGORY_MODE,
  CONTOURS,
  DARKER,
  DRUMS,
  DRUM_VOICE,
  KEYS,
  LEAD_VOICES,
  MODES,
  MOTIF_VOICE,
  PAD_VOICE,
  PROGRESSION,
  QUIET_GAP_DAYS,
  REGISTER,
  TIME_BAND_MOOD,
  sizeBucketFor,
  type ModeName,
  type Mood,
} from "./tables.js";
import {
  SCORE_FORMAT,
  SCORE_VERSION,
  type Score,
  type ScoreCommit,
  type ScoreNote,
  type Voice,
} from "./score.js";

export const PPQ = 480;
export const BEATS_PER_BAR = 4;
export const BAR = PPQ * BEATS_PER_BAR;
export const DEFAULT_TEMPO = 120;
export const DEFAULT_SEED = "repo-radio";
export const DEFAULT_KEY = "C";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComposeOptions {
  /** Beats per minute. */
  tempo?: number;
  /** Any string. Changes melodic details; the same seed gives the same track. */
  seed?: string;
  /** Root note, e.g. "C", "F#" or "Bb". */
  key?: string;
  /** Include commit subjects in the score. On by default. */
  includeSubjects?: boolean;
  title?: string;
  generator?: string;
}

/** Normalise a key name like "f#" or "bb" to the form used in KEYS, or null. */
export function normaliseKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed === "") return null;
  const name = (trimmed[0] ?? "").toUpperCase() + trimmed.slice(1).toLowerCase();
  return name in KEYS ? name : null;
}

/** Apply the time-of-day mood to a mode. */
export function modeFor(category: Category, mood: Mood): ModeName {
  const base = CATEGORY_MODE[category];
  if (mood.shift === "darker") return DARKER[base];
  if (mood.shift === "brighter") return BRIGHTER[base];
  return base;
}

/** Turn a scale degree (which may be negative or past the octave) into a MIDI note. */
export function degreeToPitch(scale: readonly number[], degree: number, base: number): number {
  const octave = Math.floor(degree / scale.length);
  const index = degree - octave * scale.length;
  let pitch = base + octave * 12 + (scale[index] ?? 0);
  while (pitch > 127) pitch -= 12;
  while (pitch < 0) pitch += 12;
  return pitch;
}

function clampVelocity(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

/** Compose a score from a modelled history. Pure and deterministic. */
export function compose(history: History, options: ComposeOptions = {}): Score {
  const tempo = options.tempo ?? DEFAULT_TEMPO;
  const seed = options.seed ?? DEFAULT_SEED;
  const keyName = normaliseKey(options.key ?? DEFAULT_KEY);
  if (keyName === null) throw new Error(`Unknown key: ${options.key}`);
  const keyOffset = KEYS[keyName] ?? 0;
  const includeSubjects = options.includeSubjects ?? true;

  const notes: ScoreNote[] = [];
  const commits: ScoreCommit[] = [];
  const usedVoices = new Map<string, Voice>();
  const leadPitchesByCommit = new Map<number, number[]>();
  const authorOrder = new Map(history.authors.map((a) => [a.key, a.order]));

  const use = (voice: Voice): string => {
    usedVoices.set(voice.id, voice);
    return voice.id;
  };

  let tick = 0;
  let bar = 0;
  let previous: Commit | undefined;

  for (const commit of history.commits) {
    if (previous && commit.timestamp - previous.timestamp > QUIET_GAP_DAYS * DAY_MS) {
      tick += BAR; // a bar of rest for a quiet spell
    }

    const leadVoice = LEAD_VOICES[(authorOrder.get(commit.authorKey) ?? 0) % LEAD_VOICES.length] as Voice;
    const mood = TIME_BAND_MOOD[commit.timeBand];
    const mode = modeFor(commit.category as Category, mood);
    const scale = MODES[mode];
    const lines = commit.linesAdded + commit.linesDeleted;
    const bucket = sizeBucketFor(lines);
    const hash = hashParts(seed, commit.sha);
    const random = seededRandom(hash);
    const chordDegree = PROGRESSION[bar % PROGRESSION.length] ?? 0;
    const leadBase = REGISTER.lead + keyOffset + mood.octave * 12;

    const add = (voice: Voice, at: number, duration: number, pitch: number, velocity: number): void => {
      notes.push({
        tick: tick + at,
        duration,
        pitch,
        velocity: clampVelocity(velocity),
        voice: use(voice),
        commit: commit.index,
      });
    };

    // Lead line: the author's voice, shaped by size, language and mood.
    const leadPitches = leadLine(commit, {
      scale,
      chordDegree,
      leadBase,
      notes: bucket.notes,
      hash,
      earlier: commit.revertsIndex === null ? undefined : leadPitchesByCommit.get(commit.revertsIndex),
    });
    leadPitchesByCommit.set(commit.index, leadPitches.map((p) => p.pitch));
    const slot = Math.floor(BAR / leadPitches.length);
    leadPitches.forEach(({ pitch, degree }, i) => {
      const jitter = Math.floor(random() * 9) - 4;
      const velocity = bucket.velocity + mood.velocity + jitter;
      add(leadVoice, i * slot, Math.round(slot * 0.9), pitch, velocity);
      if (bucket.chords && commit.kind !== "revert") {
        add(leadVoice, i * slot, Math.round(slot * 0.9), degreeToPitch(scale, degree + 2, leadBase), velocity - 10);
      }
    });

    // Bass: chord root then fifth, a half note each.
    const bassBase = REGISTER.bass + keyOffset;
    const bassVelocity = 82 + mood.velocity;
    add(BASS_VOICE, 0, BAR / 2 - 20, degreeToPitch(scale, chordDegree, bassBase), bassVelocity);
    add(BASS_VOICE, BAR / 2, BAR / 2 - 20, degreeToPitch(scale, chordDegree + 4, bassBase), bassVelocity - 6);

    // Drums: kick every half bar, snare backbeat for real changes,
    // one hi-hat per changed file (up to eight), crash for big moments.
    const drumVelocity = 90 + mood.velocity;
    add(DRUM_VOICE, 0, PPQ / 4, DRUMS.kick, drumVelocity);
    add(DRUM_VOICE, BAR / 2, PPQ / 4, DRUMS.kick, drumVelocity - 8);
    if (lines > 10) {
      add(DRUM_VOICE, PPQ, PPQ / 4, DRUMS.snare, drumVelocity - 10);
      add(DRUM_VOICE, PPQ * 3, PPQ / 4, DRUMS.snare, drumVelocity - 10);
    }
    const hats = Math.min(commit.filesChanged, 8);
    for (let i = 0; i < hats; i++) {
      const eighth = Math.floor((i * 8) / hats);
      add(DRUM_VOICE, eighth * (PPQ / 2), PPQ / 8, DRUMS.closedHat, 58 + mood.velocity);
    }
    if (commit.kind === "initial" || commit.kind === "merge" || commit.tags.length > 0) {
      add(DRUM_VOICE, 0, PPQ, DRUMS.crash, 100);
    }

    // Merge motif: a rising brass arpeggio in the second half of the bar.
    if (commit.kind === "merge") {
      [0, 2, 4, 7].forEach((step, i) => {
        add(MOTIF_VOICE, BAR / 2 + i * (PPQ / 2), PPQ / 2 - 10, degreeToPitch(scale, chordDegree + step, REGISTER.motif + keyOffset), 96);
      });
    }

    // Tag: hold a chord under the whole bar and open the hi-hat at the end.
    if (commit.tags.length > 0) {
      for (const step of [0, 2, 4]) {
        add(PAD_VOICE, 0, BAR - 10, degreeToPitch(scale, chordDegree + step, REGISTER.pad + keyOffset), 72);
      }
      add(DRUM_VOICE, BAR - PPQ / 2, PPQ / 2, DRUMS.openHat, 80);
    }

    commits.push({
      index: commit.index,
      shortSha: commit.shortSha,
      kind: commit.kind,
      author: commit.authorLabel,
      date: commit.authorDate,
      hour: commit.localHour,
      timeBand: commit.timeBand,
      subject: includeSubjects ? commit.subject : null,
      tags: [...commit.tags],
      linesAdded: commit.linesAdded,
      linesDeleted: commit.linesDeleted,
      filesChanged: commit.filesChanged,
      category: commit.category,
      mode,
      voice: leadVoice.id,
      startTick: tick,
      endTick: tick + BAR,
    });

    tick += BAR;
    bar++;
    previous = commit;
  }

  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch || a.voice.localeCompare(b.voice));

  const authors = history.authors.map((a) => ({
    label: a.label,
    voice: (LEAD_VOICES[a.order % LEAD_VOICES.length] as Voice).id,
    commits: a.commitCount,
  }));

  return {
    format: SCORE_FORMAT,
    version: SCORE_VERSION,
    meta: {
      title: options.title ?? "Repo Radio track",
      generator: options.generator ?? "repo-radio",
      tempo,
      ppq: PPQ,
      beatsPerBar: BEATS_PER_BAR,
      key: keyName,
      seed,
      commitCount: commits.length,
      durationTicks: tick,
      durationSeconds: Math.round(((tick / PPQ) * 60 * 1000) / tempo) / 1000,
    },
    voices: [...usedVoices.values()].sort((a, b) => a.channel - b.channel),
    authors,
    commits,
    notes,
  };
}

interface LeadContext {
  scale: readonly number[];
  chordDegree: number;
  leadBase: number;
  notes: number;
  hash: number;
  /** Lead pitches of the commit being reverted, if known. */
  earlier: number[] | undefined;
}

/** Work out the lead melody for one commit as (pitch, degree) pairs. */
function leadLine(commit: Commit, ctx: LeadContext): Array<{ pitch: number; degree: number }> {
  const { scale, chordDegree, leadBase } = ctx;

  if (commit.kind === "revert") {
    // A revert plays the reverted commit's tune backwards when we can find
    // it, and otherwise a falling run down the scale.
    if (ctx.earlier && ctx.earlier.length > 0) {
      return [...ctx.earlier].reverse().map((pitch) => ({ pitch, degree: chordDegree }));
    }
    return [7, 6, 5, 4].map((step) => {
      const degree = chordDegree + step;
      return { pitch: degreeToPitch(scale, degree, leadBase), degree };
    });
  }

  const contour = pick(CONTOURS, ctx.hash);
  const direction = commit.linesDeleted > commit.linesAdded ? -1 : 1;
  let degree = chordDegree + pick([0, 2, 4], ctx.hash >>> 8);
  const result: Array<{ pitch: number; degree: number }> = [];
  for (let i = 0; i < ctx.notes; i++) {
    if (i > 0) degree += direction * (contour[(i - 1) % contour.length] ?? 0);
    result.push({ pitch: degreeToPitch(scale, degree, leadBase), degree });
  }
  return result;
}

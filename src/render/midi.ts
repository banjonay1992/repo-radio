/**
 * A small Standard MIDI File (SMF) writer. Writes format 1: a conductor
 * track with tempo and time signature, then one track per voice.
 *
 * Reference: the MIDI 1.0 "Standard MIDI Files" specification.
 */

import type { Score, ScoreNote, Voice } from "../compose/score.js";

interface TrackEvent {
  tick: number;
  /** Sort key within a tick: note-offs (0) before program/meta (1) before note-ons (2). */
  order: number;
  pitch: number;
  bytes: number[];
}

/** Encode a number as a MIDI variable-length quantity. */
export function encodeVlq(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new RangeError(`VLQ value out of range: ${value}`);
  }
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function metaText(type: number, text: string): number[] {
  const data = [...new TextEncoder().encode(text)];
  return [0xff, type, ...encodeVlq(data.length), ...data];
}

function chunk(id: string, data: number[]): number[] {
  return [...ascii(id), ...u32(data.length), ...data];
}

/** Build an MTrk chunk. The end-of-track event goes at endTick or after the last event. */
function trackChunk(events: TrackEvent[], endTick = 0): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order || a.pitch - b.pitch);
  const data: number[] = [];
  let last = 0;
  for (const event of sorted) {
    data.push(...encodeVlq(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  data.push(...encodeVlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0x00);
  return chunk("MTrk", data);
}

/**
 * Shorten any note that would still be sounding when the same pitch starts
 * again, so a note-off never cuts a later note short.
 */
export function clipOverlaps(notes: readonly ScoreNote[]): ScoreNote[] {
  const byPitch = new Map<number, ScoreNote[]>();
  for (const note of notes) {
    const list = byPitch.get(note.pitch) ?? [];
    list.push({ ...note });
    byPitch.set(note.pitch, list);
  }
  const result: ScoreNote[] = [];
  for (const list of byPitch.values()) {
    list.sort((a, b) => a.tick - b.tick);
    list.forEach((note, i) => {
      const next = list[i + 1];
      if (next && next.tick < note.tick + note.duration) {
        note.duration = next.tick - note.tick;
      }
      if (note.duration > 0) result.push(note);
    });
  }
  return result;
}

function voiceTrack(voice: Voice, notes: ScoreNote[], endTick: number): number[] {
  const channel = voice.channel & 0x0f;
  const events: TrackEvent[] = [{ tick: 0, order: 1, pitch: -1, bytes: metaText(0x03, voice.name) }];
  if (voice.role !== "drums") {
    events.push({ tick: 0, order: 1, pitch: -1, bytes: [0xc0 | channel, voice.program & 0x7f] });
  }
  for (const note of clipOverlaps(notes)) {
    events.push({ tick: note.tick, order: 2, pitch: note.pitch, bytes: [0x90 | channel, note.pitch & 0x7f, note.velocity & 0x7f] });
    events.push({ tick: note.tick + note.duration, order: 0, pitch: note.pitch, bytes: [0x80 | channel, note.pitch & 0x7f, 0x40] });
  }
  return trackChunk(events, endTick);
}

/** Render a score as the bytes of a format 1 Standard MIDI File. */
export function renderMidi(score: Score): Uint8Array {
  const { tempo, ppq, beatsPerBar, title } = score.meta;
  const microsPerQuarter = Math.round(60_000_000 / tempo);

  const conductor = trackChunk(
    [
      { tick: 0, order: 1, pitch: -1, bytes: metaText(0x03, title) },
      {
        tick: 0,
        order: 1,
        pitch: -1,
        bytes: [0xff, 0x51, 0x03, (microsPerQuarter >>> 16) & 0xff, (microsPerQuarter >>> 8) & 0xff, microsPerQuarter & 0xff],
      },
      { tick: 0, order: 1, pitch: -1, bytes: [0xff, 0x58, 0x04, beatsPerBar, 2, 24, 8] },
      // A marker at the start of each commit's bar, so DAWs show what is playing.
      ...score.commits.map((c) => ({ tick: c.startTick, order: 1, pitch: -1, bytes: metaText(0x06, `${c.shortSha} ${c.author}`) })),
    ],
    score.meta.durationTicks,
  );

  const tracks = score.voices.map((voice) =>
    voiceTrack(
      voice,
      score.notes.filter((n) => n.voice === voice.id),
      score.meta.durationTicks,
    ),
  );

  const header = chunk("MThd", [...u16(1), ...u16(tracks.length + 1), ...u16(ppq)]);
  const bytes = [...header, ...conductor, ...tracks.flat()];
  return Uint8Array.from(bytes);
}

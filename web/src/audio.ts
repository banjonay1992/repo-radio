/**
 * A small Web Audio player for Repo Radio scores. Notes are scheduled a
 * little ahead of time on a timer (the usual "lookahead" pattern), so
 * long scores do not create thousands of audio nodes up front.
 */

import type { Score, ScoreNote, Voice } from "../../src/compose/score.js";
import { firstNoteAtOrAfter, midiToFrequency, secondsToTick, tickToSeconds } from "./schedule.js";

const LOOKAHEAD_SECONDS = 0.15;
const TIMER_MS = 25;

/** Rough loudness per oscillator shape, so square and saw do not drown out sine. */
const SHAPE_GAIN: Record<string, number> = { sine: 0.32, triangle: 0.3, square: 0.12, sawtooth: 0.13 };

export class ScorePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<string, AudioNode>();
  private noise: AudioBuffer | null = null;
  private voices = new Map<string, Voice>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextIndex = 0;
  /** AudioContext time that corresponds to score time 0. */
  private anchor = 0;
  private pausedAt = 0;
  private live = new Set<AudioScheduledSourceNode>();
  private volume = 0.8;

  onEnded: (() => void) | null = null;

  constructor(private score: Score) {
    for (const voice of score.voices) this.voices.set(voice.id, voice);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  get duration(): number {
    return tickToSeconds(this.score, this.score.meta.durationTicks);
  }

  /** Current position in seconds. */
  get position(): number {
    if (!this.ctx || !this.playing) return this.pausedAt;
    return Math.min(this.duration, Math.max(0, this.ctx.currentTime - this.anchor));
  }

  setVolume(value: number): void {
    this.volume = value;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  async play(): Promise<void> {
    if (this.playing) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (this.pausedAt >= this.duration) this.pausedAt = 0;
    this.anchor = ctx.currentTime + 0.05 - this.pausedAt;
    this.nextIndex = firstNoteAtOrAfter(this.score.notes, secondsToTick(this.score, this.pausedAt));
    this.timer = setInterval(() => this.pump(), TIMER_MS);
    this.pump();
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.halt();
  }

  stop(): void {
    this.halt();
    this.pausedAt = 0;
  }

  /** Jump to a position in seconds, keeping the play state. */
  seek(seconds: number): void {
    const wasPlaying = this.playing;
    this.halt();
    this.pausedAt = Math.min(Math.max(seconds, 0), this.duration);
    if (wasPlaying) void this.play();
  }

  dispose(): void {
    this.halt();
    void this.ctx?.close();
    this.ctx = null;
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const node of this.live) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.live.clear();
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    master.connect(limiter).connect(ctx.destination);

    for (const voice of this.score.voices) {
      const bus = ctx.createGain();
      bus.gain.value = voice.role === "drums" ? 0.55 : voice.role === "pad" ? 0.5 : 0.8;
      if (voice.waveform === "square" || voice.waveform === "sawtooth") {
        // Soften bright shapes so they sit with the others.
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2400;
        bus.connect(filter).connect(master);
      } else {
        bus.connect(master);
      }
      this.buses.set(voice.id, bus);
    }

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    // Fixed-seed noise, so playback is the same every time.
    let state = 0x12345678;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = ((state >>> 0) / 4294967296) * 2 - 1;
    }
    this.noise = noise;
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  private pump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;
    const notes = this.score.notes;
    while (this.nextIndex < notes.length) {
      const note = notes[this.nextIndex] as ScoreNote;
      const when = this.anchor + tickToSeconds(this.score, note.tick);
      if (when > horizon) break;
      if (when >= ctx.currentTime - 0.01) this.trigger(note, when);
      this.nextIndex++;
    }
    if (this.nextIndex >= notes.length && ctx.currentTime - this.anchor >= this.duration) {
      this.stop();
      this.onEnded?.();
    }
  }

  private track(node: AudioScheduledSourceNode): void {
    this.live.add(node);
    node.onended = () => this.live.delete(node);
  }

  private trigger(note: ScoreNote, when: number): void {
    const voice = this.voices.get(note.voice);
    const bus = this.buses.get(note.voice);
    if (!voice || !bus || !this.ctx) return;
    if (voice.waveform === "drums") {
      this.drum(note, when, bus);
      return;
    }
    const ctx = this.ctx;
    const length = tickToSeconds(this.score, note.duration);
    const peak = (note.velocity / 127) * (SHAPE_GAIN[voice.waveform] ?? 0.2);
    const osc = ctx.createOscillator();
    osc.type = voice.waveform;
    osc.frequency.value = midiToFrequency(note.pitch);
    const env = ctx.createGain();
    const attackEnd = when + Math.min(voice.attack, length);
    const releaseStart = when + Math.max(length, voice.attack);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, attackEnd);
    env.gain.setTargetAtTime(peak * 0.6, attackEnd, 0.15);
    env.gain.setValueAtTime(peak * 0.6, releaseStart);
    env.gain.setTargetAtTime(0, releaseStart, voice.release / 4);
    osc.connect(env).connect(bus);
    osc.start(when);
    osc.stop(releaseStart + voice.release + 0.05);
    this.track(osc);
  }

  private drum(note: ScoreNote, when: number, bus: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const level = note.velocity / 127;
    if (note.pitch === 36) {
      // Kick: a sine that drops quickly in pitch.
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.setValueAtTime(140, when);
      osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
      env.gain.setValueAtTime(level * 0.9, when);
      env.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
      osc.connect(env).connect(bus);
      osc.start(when);
      osc.stop(when + 0.32);
      this.track(osc);
      return;
    }
    // Everything else is filtered noise with a different colour and length.
    const settings: Record<number, { cutoff: number; decay: number; gain: number }> = {
      38: { cutoff: 1200, decay: 0.16, gain: 0.6 },
      42: { cutoff: 7000, decay: 0.05, gain: 0.35 },
      46: { cutoff: 6000, decay: 0.3, gain: 0.35 },
      49: { cutoff: 4500, decay: 1.2, gain: 0.4 },
    };
    const s = settings[note.pitch] ?? { cutoff: 3000, decay: 0.1, gain: 0.3 };
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = s.cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level * s.gain, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + s.decay);
    src.connect(filter).connect(env).connect(bus);
    src.start(when);
    src.stop(when + s.decay + 0.02);
    this.track(src);
  }
}

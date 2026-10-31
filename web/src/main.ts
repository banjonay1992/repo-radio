import type { Score, ScoreCommit } from "../../src/compose/score.js";
import { parseScore } from "../../src/render/json.js";
import { ScorePlayer } from "./audio.js";
import { demoScore } from "./demo.js";
import { drawDial } from "./dial.js";
import { FALLBACK_COLOUR, VOICE_COLOURS, layoutDial, tickForX, type DialLayout } from "./dialLayout.js";
import { commitAt, formatTime, secondsToTick, tickToSeconds } from "./schedule.js";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const els = {
  title: byId<HTMLHeadingElement>("track-title"),
  meta: byId<HTMLParagraphElement>("track-meta"),
  canvas: byId<HTMLCanvasElement>("dial"),
  wrap: byId<HTMLDivElement>("dial-wrap"),
  play: byId<HTMLButtonElement>("play"),
  stop: byId<HTMLButtonElement>("stop"),
  time: byId<HTMLSpanElement>("time"),
  volume: byId<HTMLInputElement>("volume"),
  now: byId<HTMLDivElement>("now"),
  file: byId<HTMLInputElement>("file"),
  demo: byId<HTMLButtonElement>("demo"),
  error: byId<HTMLParagraphElement>("error"),
  legend: byId<HTMLElement>("legend"),
  voices: byId<HTMLUListElement>("voices"),
};

const MODE_NAMES: Record<string, string> = {
  ionian: "major",
  lydian: "lydian",
  mixolydian: "mixolydian",
  dorian: "dorian",
  aeolian: "minor",
  phrygian: "phrygian",
  majorPentatonic: "major pentatonic",
  minorPentatonic: "minor pentatonic",
};

const BAND_NAMES: Record<string, string> = {
  "small-hours": "in the small hours",
  morning: "in the morning",
  afternoon: "in the afternoon",
  evening: "in the evening",
};

let score: Score | null = null;
let player: ScorePlayer | null = null;
let layout: DialLayout | null = null;
let shownCommit: ScoreCommit | undefined;
let frame = 0;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resizeCanvas(): void {
  if (!score) return;
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(rect.width * ratio);
  els.canvas.height = Math.round(rect.height * ratio);
  const ctx = els.canvas.getContext("2d");
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  layout = layoutDial(score, rect.width, rect.height);
  render();
}

function render(): void {
  if (!score || !player || !layout) return;
  const ctx = els.canvas.getContext("2d");
  if (!ctx) return;
  const position = player.position;
  const tick = secondsToTick(score, position);
  drawDial(ctx, score, layout, tick, {
    face: cssVar("--dial-face"),
    ink: cssVar("--dial-ink"),
    needle: cssVar("--needle"),
  });
  els.time.textContent = `${formatTime(position)} / ${formatTime(player.duration)}`;
  els.canvas.setAttribute("aria-valuenow", String(Math.round(position)));
  els.canvas.setAttribute("aria-valuetext", `${formatTime(position)} of ${formatTime(player.duration)}`);
  showCommit(commitAt(score.commits, tick));
}

function showCommit(commit: ScoreCommit | undefined): void {
  if (commit === shownCommit) return;
  shownCommit = commit;
  els.now.replaceChildren();
  if (!commit) return;

  const subject = document.createElement("div");
  subject.className = "subject";
  subject.textContent = commit.subject ?? "(subject hidden)";

  const detail = document.createElement("div");
  detail.className = "detail";
  const sha = document.createElement("span");
  sha.className = "sha";
  sha.textContent = commit.shortSha;
  const kind = commit.kind === "commit" ? "" : ` (${commit.kind})`;
  const tags = commit.tags.length > 0 ? `, tagged ${commit.tags.join(", ")}` : "";
  const files = `${commit.filesChanged} file${commit.filesChanged === 1 ? "" : "s"}`;
  detail.append(
    sha,
    `${kind} by ${commit.author} ${BAND_NAMES[commit.timeBand] ?? ""}. ` +
      `${commit.linesAdded} added and ${commit.linesDeleted} removed across ${files}, ` +
      `played in ${MODE_NAMES[commit.mode] ?? commit.mode}${tags}.`,
  );
  els.now.append(subject, detail);
}

function tickLoop(): void {
  render();
  if (player?.playing) frame = requestAnimationFrame(tickLoop);
}

function updateButtons(): void {
  const ready = score !== null;
  els.play.disabled = !ready;
  els.stop.disabled = !ready;
  els.play.textContent = player?.playing ? "Pause" : "Play";
}

function showLegend(s: Score): void {
  els.voices.replaceChildren();
  const voiceNames = new Map(s.voices.map((v) => [v.id, v.name]));
  for (const author of s.authors) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = VOICE_COLOURS[author.voice] ?? FALLBACK_COLOUR;
    const text = document.createElement("span");
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `, ${author.commits} commit${author.commits === 1 ? "" : "s"}`;
    text.append(`${author.label} on ${(voiceNames.get(author.voice) ?? author.voice).toLowerCase()}`, count);
    li.append(swatch, text);
    els.voices.append(li);
  }
  els.legend.hidden = false;
}

function load(next: Score): void {
  player?.dispose();
  cancelAnimationFrame(frame);
  score = next;
  player = new ScorePlayer(next);
  player.setVolume(Number(els.volume.value));
  player.onEnded = () => {
    updateButtons();
    render();
  };
  shownCommit = undefined;
  els.error.textContent = "";
  els.title.textContent = next.meta.title;
  const people = next.authors.length;
  els.meta.textContent =
    `${next.meta.commitCount} commits by ${people} author${people === 1 ? "" : "s"}, ` +
    `${formatTime(next.meta.durationSeconds)} at ${next.meta.tempo} bpm in ${next.meta.key}.`;
  els.canvas.setAttribute("aria-valuemax", String(Math.round(player.duration)));
  showLegend(next);
  updateButtons();
  resizeCanvas();
}

async function togglePlay(): Promise<void> {
  if (!player) return;
  if (player.playing) {
    player.pause();
  } else {
    await player.play();
    frame = requestAnimationFrame(tickLoop);
  }
  updateButtons();
  render();
}

function seekToTick(tick: number): void {
  if (!player || !score) return;
  player.seek(tickToSeconds(score, tick));
  shownCommit = undefined;
  render();
}

function stepCommit(direction: 1 | -1): void {
  if (!score || !player) return;
  const tick = secondsToTick(score, player.position);
  const current = commitAt(score.commits, tick);
  const index = current ? current.index + direction : 0;
  const target = score.commits[Math.min(Math.max(index, 0), score.commits.length - 1)];
  if (target) seekToTick(target.startTick);
}

async function loadText(text: string): Promise<void> {
  try {
    load(parseScore(text));
  } catch (error) {
    els.error.textContent = `Could not open that score. ${(error as Error).message}`;
  }
}

els.play.addEventListener("click", () => void togglePlay());
els.stop.addEventListener("click", () => {
  player?.stop();
  updateButtons();
  shownCommit = undefined;
  render();
});
els.volume.addEventListener("input", () => player?.setVolume(Number(els.volume.value)));
els.demo.addEventListener("click", () => {
  load(demoScore());
  void togglePlay();
});
els.file.addEventListener("change", async () => {
  const file = els.file.files?.[0];
  if (file) await loadText(await file.text());
  els.file.value = "";
});

els.canvas.addEventListener("pointerdown", (event) => {
  if (!score) return;
  const rect = els.canvas.getBoundingClientRect();
  seekToTick(tickForX(score, event.clientX - rect.left, rect.width));
});
els.canvas.addEventListener("keydown", (event) => {
  if (!score || !player) return;
  const keys: Record<string, () => void> = {
    ArrowRight: () => stepCommit(1),
    ArrowLeft: () => stepCommit(-1),
    Home: () => seekToTick(0),
    End: () => seekToTick(score?.commits.at(-1)?.startTick ?? 0),
    " ": () => void togglePlay(),
  };
  const action = keys[event.key];
  if (action) {
    event.preventDefault();
    action();
  }
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("dragging");
});
document.addEventListener("dragleave", () => document.body.classList.remove("dragging"));
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  document.body.classList.remove("dragging");
  const file = event.dataTransfer?.files[0];
  if (file) await loadText(await file.text());
});

new ResizeObserver(() => resizeCanvas()).observe(els.wrap);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());

// ?score=path/to/file.score.json loads a score that sits next to the player.
const scoreUrl = new URLSearchParams(window.location.search).get("score");
if (scoreUrl) {
  fetch(scoreUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`The server answered ${response.status} for ${scoreUrl}.`);
      return response.text();
    })
    .then(loadText)
    .catch((error: Error) => {
      els.error.textContent = `Could not fetch that score. ${error.message}`;
    });
}

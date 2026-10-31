/**
 * The tuning dial: a radio-style strip where every commit is a tick mark,
 * drawn on a 2D canvas from the layout in dialLayout.ts.
 */

import type { Score } from "../../src/compose/score.js";
import { xForTick, type DialLayout } from "./dialLayout.js";

export interface DialTheme {
  face: string;
  ink: string;
  needle: string;
}

export function drawDial(
  ctx: CanvasRenderingContext2D,
  score: Score,
  layout: DialLayout,
  playheadTick: number,
  theme: DialTheme,
): void {
  const { width, height, baseline, marks } = layout;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.face;
  ctx.fillRect(0, 0, width, height);

  // Scale: a fine tick every bar, a longer one every 8 bars.
  const barTicks = score.meta.ppq * score.meta.beatsPerBar;
  const bars = Math.round(score.meta.durationTicks / barTicks);
  const step = Math.max(1, Math.ceil(bars / (width / 6)));
  ctx.strokeStyle = theme.ink;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let bar = 0; bar <= bars; bar += step) {
    const x = Math.round(xForTick(score, bar * barTicks, width)) + 0.5;
    const long = bar % (step * 8) === 0;
    ctx.moveTo(x, baseline + 3);
    ctx.lineTo(x, baseline + (long ? 11 : 6));
  }
  ctx.moveTo(xForTick(score, 0, width), baseline + 0.5);
  ctx.lineTo(xForTick(score, score.meta.durationTicks, width), baseline + 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const markWidth = Math.max(1.5, Math.min(5, (width - 32) / Math.max(marks.length, 1) - 1));
  for (const mark of marks) {
    const played = mark.commit.startTick <= playheadTick;
    ctx.globalAlpha = played ? 1 : 0.42;
    ctx.fillStyle = mark.colour;
    if (mark.commit.kind === "revert") {
      ctx.fillRect(mark.x - markWidth / 2, baseline + 2, markWidth, mark.height);
    } else {
      ctx.fillRect(mark.x - markWidth / 2, baseline - mark.height, markWidth, mark.height);
    }
    if (mark.commit.kind === "merge") {
      ctx.beginPath();
      ctx.arc(mark.x, baseline - mark.height - 5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (mark.commit.tags.length > 0) {
      const top = baseline - mark.height - 14;
      ctx.fillStyle = theme.ink;
      ctx.fillRect(mark.x - 0.5, top, 1, 10);
      ctx.beginPath();
      ctx.moveTo(mark.x, top);
      ctx.lineTo(mark.x + 7, top + 3);
      ctx.lineTo(mark.x, top + 6);
      ctx.fill();
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(mark.commit.tags[0] ?? "", mark.x + 9, top + 6);
    }
  }
  ctx.globalAlpha = 1;

  // The needle.
  const nx = Math.round(xForTick(score, playheadTick, width)) + 0.5;
  ctx.strokeStyle = theme.needle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx, 4);
  ctx.lineTo(nx, height - 4);
  ctx.stroke();
}

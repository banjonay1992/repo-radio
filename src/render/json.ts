import { SCORE_FORMAT, SCORE_VERSION, type Score } from "../compose/score.js";

/**
 * Serialise a score as readable JSON: metadata indented, one note per line
 * so large scores stay a sensible size and still diff well.
 */
export function renderScoreJson(score: Score): string {
  const { notes, ...rest } = score;
  const head = JSON.stringify(rest, null, 2);
  const noteLines = notes.map((n) => `    ${JSON.stringify(n)}`).join(",\n");
  return `${head.slice(0, -2)},\n  "notes": [\n${noteLines}\n  ]\n}\n`;
}

/** Parse and sanity-check a score. Throws an Error with a readable message. */
export function parseScore(text: string): Score {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("This file is not a Repo Radio score.");
  }
  const score = data as Partial<Score>;
  if (score.format !== SCORE_FORMAT) {
    throw new Error("This file is not a Repo Radio score.");
  }
  if (score.version !== SCORE_VERSION) {
    throw new Error(`Unsupported score version ${String(score.version)}; expected ${SCORE_VERSION}.`);
  }
  if (!score.meta || !Array.isArray(score.notes) || !Array.isArray(score.commits) || !Array.isArray(score.voices)) {
    throw new Error("The score is missing meta, voices, commits or notes.");
  }
  return score as Score;
}

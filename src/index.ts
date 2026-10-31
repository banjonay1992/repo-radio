/**
 * Library entry point. The pipeline is:
 *
 *   readCommits (git) -> buildHistory (model) -> compose (score) -> renderMidi / renderScoreJson
 */

import { compose, type ComposeOptions } from "./compose/compose.js";
import type { Score } from "./compose/score.js";
import { readCommits, type ReadOptions } from "./git/read.js";
import { buildHistory, type BuildOptions } from "./model/build.js";
import type { History } from "./model/types.js";

export { compose, normaliseKey, DEFAULT_KEY, DEFAULT_SEED, DEFAULT_TEMPO, PPQ, BAR } from "./compose/compose.js";
export type { ComposeOptions } from "./compose/compose.js";
export * from "./compose/score.js";
export { RepoRadioError } from "./errors.js";
export type { RepoRadioErrorCode } from "./errors.js";
export { parseGitLog } from "./git/parse.js";
export { readCommits } from "./git/read.js";
export type { ReadOptions } from "./git/read.js";
export { buildHistory } from "./model/build.js";
export type { BuildOptions } from "./model/build.js";
export type * from "./model/types.js";
export { renderMidi } from "./render/midi.js";
export { parseScore, renderScoreJson } from "./render/json.js";

export type GenerateOptions = ReadOptions & BuildOptions & ComposeOptions;

/** Read a repository and compose its score in one call. */
export function generate(repoPath: string, options: GenerateOptions = {}): { history: History; score: Score } {
  const raw = readCommits(repoPath, options);
  const history = buildHistory(raw, options);
  const score = compose(history, options);
  return { history, score };
}

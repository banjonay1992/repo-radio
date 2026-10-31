/**
 * Shared types for the pipeline: parse -> model -> compose -> render.
 */

/** One file entry from `git log --numstat`. */
export interface FileChange {
  path: string;
  /** Lines added. Null for binary files, where git reports "-". */
  added: number | null;
  /** Lines deleted. Null for binary files. */
  deleted: number | null;
}

/** A commit exactly as read from git, before any interpretation. */
export interface RawCommit {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** Author date in strict ISO 8601 with the author's own UTC offset. */
  authorDate: string;
  subject: string;
  /** Tag names pointing at this commit. */
  tags: string[];
  files: FileChange[];
}

export type CommitKind = "commit" | "merge" | "revert" | "initial";

export type TimeBand = "small-hours" | "morning" | "afternoon" | "evening";

/** A commit after interpretation: everything the composer needs. */
export interface Commit {
  index: number;
  sha: string;
  shortSha: string;
  kind: CommitKind;
  /** Stable key for the author (lower-cased email, or name if no email). */
  authorKey: string;
  /** Display name: an alias by default, the real name with --show-authors. */
  authorLabel: string;
  authorDate: string;
  /** Unix time in milliseconds. */
  timestamp: number;
  /** Hour of day (0-23) in the author's own time zone. */
  localHour: number;
  timeBand: TimeBand;
  subject: string;
  tags: string[];
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  /** Language category with the most changed lines, e.g. "web" or "systems". */
  category: string;
  /** For reverts: index of the commit being reverted, if we could find it. */
  revertsIndex: number | null;
}

export interface Author {
  key: string;
  label: string;
  commitCount: number;
  /** Order of first appearance, starting at 0. */
  order: number;
}

export interface History {
  commits: Commit[];
  authors: Author[];
}

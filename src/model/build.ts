import { assignAliases } from "./aliases.js";
import { dominantCategory } from "./languages.js";
import type { Author, Commit, CommitKind, History, RawCommit, TimeBand } from "./types.js";

export interface BuildOptions {
  /** Show real author names instead of aliases. Off by default. */
  showAuthors?: boolean;
}

/** Hour ranges for each part of the day, in the author's own time zone. */
export const TIME_BANDS: ReadonlyArray<{ band: TimeBand; from: number; to: number }> = [
  { band: "small-hours", from: 0, to: 5 },
  { band: "morning", from: 5, to: 12 },
  { band: "afternoon", from: 12, to: 18 },
  { band: "evening", from: 18, to: 24 },
];

export function timeBandForHour(hour: number): TimeBand {
  const match = TIME_BANDS.find((b) => hour >= b.from && hour < b.to);
  return match ? match.band : "afternoon";
}

/**
 * Read the hour straight from the ISO string ("2024-03-05T23:15:00+01:00"
 * gives 23), so it reflects the author's clock rather than ours.
 */
export function localHourOf(isoDate: string): number {
  const match = /T(\d{2}):/.exec(isoDate);
  const hour = match ? Number(match[1]) : NaN;
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : 12;
}

const REVERT_SUBJECT = /^Revert "(.*)"$/;

export function kindOf(raw: RawCommit, isFirst: boolean): CommitKind {
  if (raw.parents.length > 1) return "merge";
  if (isFirst && raw.parents.length === 0) return "initial";
  if (REVERT_SUBJECT.test(raw.subject) || /^revert\b/i.test(raw.subject)) return "revert";
  return "commit";
}

function authorKeyOf(raw: RawCommit): string {
  const email = raw.authorEmail.toLowerCase();
  return email !== "" ? email : `name:${raw.authorName.toLowerCase()}`;
}

/** Turn raw git commits (oldest first) into the model the composer uses. */
export function buildHistory(rawCommits: readonly RawCommit[], options: BuildOptions = {}): History {
  const keys = rawCommits.map(authorKeyOf);
  const aliases = assignAliases(keys);
  const realNames = new Map<string, string>();
  rawCommits.forEach((raw, i) => {
    const key = keys[i] as string;
    if (!realNames.has(key)) realNames.set(key, raw.authorName || raw.authorEmail || "Unknown");
  });
  const labelFor = (key: string): string =>
    (options.showAuthors ? realNames.get(key) : aliases.get(key)) ?? "Unknown";

  const authors = new Map<string, Author>();
  const subjectToIndex = new Map<string, number>();

  const commits: Commit[] = rawCommits.map((raw, index) => {
    const key = keys[index] as string;
    let author = authors.get(key);
    if (!author) {
      author = { key, label: labelFor(key), commitCount: 0, order: authors.size };
      authors.set(key, author);
    }
    author.commitCount++;

    let linesAdded = 0;
    let linesDeleted = 0;
    for (const file of raw.files) {
      linesAdded += file.added ?? 0;
      linesDeleted += file.deleted ?? 0;
    }

    const kind = kindOf(raw, index === 0);
    let revertsIndex: number | null = null;
    if (kind === "revert") {
      const original = REVERT_SUBJECT.exec(raw.subject)?.[1];
      revertsIndex = original !== undefined ? (subjectToIndex.get(original) ?? null) : null;
    }
    subjectToIndex.set(raw.subject, index);

    const localHour = localHourOf(raw.authorDate);
    const timestamp = Date.parse(raw.authorDate);

    return {
      index,
      sha: raw.sha,
      shortSha: raw.sha.slice(0, 7),
      kind,
      authorKey: key,
      authorLabel: author.label,
      authorDate: raw.authorDate,
      timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
      localHour,
      timeBand: timeBandForHour(localHour),
      subject: raw.subject,
      tags: [...raw.tags],
      linesAdded,
      linesDeleted,
      filesChanged: raw.files.length,
      category: dominantCategory(raw.files),
      revertsIndex,
    };
  });

  return { commits, authors: [...authors.values()] };
}

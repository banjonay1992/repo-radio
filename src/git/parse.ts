import type { FileChange, RawCommit } from "../model/types.js";

/**
 * The `--format` string we hand to `git log`. Fields are separated with
 * ASCII control characters that do not appear in normal commit metadata:
 *
 *   RS (0x1e) starts each record
 *   US (0x1f) separates the header fields
 *   GS (0x1d) ends the subject, after which the --numstat lines follow
 *
 * The subject goes last so that an odd character in it cannot shift the
 * other fields.
 */
export const LOG_FORMAT = "%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%aI%x1f%D%x1f%s%x1d";

const RECORD = "\x1e";
const FIELD = "\x1f";
const END_OF_SUBJECT = "\x1d";
const HEADER_FIELDS = 6;

/** Parse the output of `git log --format=LOG_FORMAT --numstat`. */
export function parseGitLog(raw: string): RawCommit[] {
  const commits: RawCommit[] = [];
  for (const record of raw.split(RECORD)) {
    if (record.trim() === "") continue;
    commits.push(parseRecord(record));
  }
  return commits;
}

function parseRecord(record: string): RawCommit {
  const fields: string[] = [];
  let cursor = 0;
  for (let i = 0; i < HEADER_FIELDS; i++) {
    const next = record.indexOf(FIELD, cursor);
    if (next === -1) {
      throw new Error(`Malformed git log record: ${JSON.stringify(record.slice(0, 80))}`);
    }
    fields.push(record.slice(cursor, next));
    cursor = next + 1;
  }
  const subjectEnd = record.indexOf(END_OF_SUBJECT, cursor);
  const subject = subjectEnd === -1 ? record.slice(cursor) : record.slice(cursor, subjectEnd);
  const rest = subjectEnd === -1 ? "" : record.slice(subjectEnd + 1);

  const [sha = "", parents = "", authorName = "", authorEmail = "", authorDate = "", decorations = ""] = fields;
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(sha)) {
    throw new Error(`Malformed commit hash in git log output: ${JSON.stringify(sha)}`);
  }

  return {
    sha,
    parents: parents.split(" ").filter((p) => p !== ""),
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    authorDate: authorDate.trim(),
    subject: subject.trim(),
    tags: parseTags(decorations),
    files: parseNumstat(rest),
  };
}

/** Pull tag names out of a `%D` decoration list such as "HEAD -> main, tag: v1.0". */
export function parseTags(decorations: string): string[] {
  return decorations
    .split(", ")
    .map((d) => d.trim())
    .filter((d) => d.startsWith("tag: "))
    .map((d) => d.slice("tag: ".length));
}

/** Parse `--numstat` lines: "added<TAB>deleted<TAB>path". Binary files use "-". */
export function parseNumstat(block: string): FileChange[] {
  const files: FileChange[] = [];
  for (const line of block.split("\n")) {
    if (line.trim() === "") continue;
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!match) continue;
    const [, added = "-", deleted = "-", path = ""] = match;
    files.push({
      path: unquotePath(path),
      added: added === "-" ? null : Number(added),
      deleted: deleted === "-" ? null : Number(deleted),
    });
  }
  return files;
}

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  '"': '"',
  "\\": "\\",
  a: "\x07",
  b: "\b",
  f: "\f",
  v: "\v",
};

/**
 * Git wraps unusual paths in double quotes with C-style escapes, and
 * writes non-ASCII bytes as octal escapes. Undo that.
 */
export function unquotePath(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }
  const inner = path.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string;
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
      continue;
    }
    const next = inner[i + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(inner.slice(i + 1, i + 4));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else if (next in SIMPLE_ESCAPES) {
      bytes.push(...Buffer.from(SIMPLE_ESCAPES[next] as string, "utf8"));
      i += 1;
    } else {
      bytes.push(...Buffer.from(ch, "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

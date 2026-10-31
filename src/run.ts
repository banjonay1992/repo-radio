import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_KEY, DEFAULT_SEED, DEFAULT_TEMPO, normaliseKey } from "./compose/compose.js";
import { RepoRadioError } from "./errors.js";
import { generate } from "./index.js";
import { renderScoreJson } from "./render/json.js";
import { renderMidi } from "./render/midi.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export const DEFAULT_MAX_COMMITS = 300;
const FORMATS = ["midi", "json"] as const;
type Format = (typeof FORMATS)[number];

export const HELP = `repo-radio ${version}
Turn a git repository's history into music.

Usage:
  repo-radio [repo] [options]

Arguments:
  repo                  Path to a git repository (default: current directory)

Options:
  -o, --out <path>      Output path without extension, or ending in .mid or
                        .json (default: ./<repo name>). Use "-" with
                        --format json to write the score to stdout.
  -f, --format <list>   Comma-separated: midi, json (default: midi,json)
  -b, --branch <rev>    Branch, tag or revision to read (default: HEAD)
      --since <date>    Only commits after this date, e.g. 2024-01-01
      --until <date>    Only commits before this date
  -n, --max-commits <n> Use the most recent n commits, 0 for all
                        (default: ${DEFAULT_MAX_COMMITS})
  -t, --tempo <bpm>     Tempo from 40 to 240 (default: ${DEFAULT_TEMPO})
  -k, --key <note>      Root note, e.g. C, F#, Bb (default: ${DEFAULT_KEY})
  -s, --seed <text>     Seed for melodic variation (default: ${DEFAULT_SEED})
      --title <text>    Track title (default: the repository folder name)
      --show-authors    Use real author names instead of aliases
      --hide-subjects   Leave commit subjects out of the JSON score
  -q, --quiet           Only print errors
  -h, --help            Show this help
  -v, --version         Show the version

Examples:
  repo-radio .
  repo-radio ../my-project --out tracks/my-project.mid --tempo 96
  repo-radio . --since "6 months ago" --format json --out -
`;

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}

const defaultIo: Io = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
};

class UsageError extends Error {}

function parseIntOption(name: string, value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value.trim())) throw new UsageError(`--${name} must be a whole number, got "${value}".`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`--${name} must be between ${min} and ${max}, got ${n}.`);
  return n;
}

function parseFormats(value: string | undefined): Format[] {
  if (value === undefined) return [...FORMATS];
  const parts = value
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p !== "");
  const formats: Format[] = [];
  for (const part of parts) {
    const format = part === "mid" ? "midi" : part;
    if (!(FORMATS as readonly string[]).includes(format)) {
      throw new UsageError(`Unknown format "${part}". Use midi, json or both.`);
    }
    if (!formats.includes(format as Format)) formats.push(format as Format);
  }
  if (formats.length === 0) throw new UsageError("--format needs at least one of midi or json.");
  return formats;
}

/** Strip a known extension so "track.mid" and "track" both give "track". */
export function outputBase(out: string): string {
  for (const suffix of [".score.json", ".json", ".midi", ".mid"]) {
    if (out.toLowerCase().endsWith(suffix)) return out.slice(0, -suffix.length);
  }
  return out;
}

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Run the CLI. Returns the process exit code: 0 ok, 1 failure, 2 bad usage. */
export async function run(argv: string[], io: Io = defaultIo): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        out: { type: "string", short: "o" },
        format: { type: "string", short: "f" },
        branch: { type: "string", short: "b" },
        since: { type: "string" },
        until: { type: "string" },
        "max-commits": { type: "string", short: "n" },
        tempo: { type: "string", short: "t" },
        key: { type: "string", short: "k" },
        seed: { type: "string", short: "s" },
        title: { type: "string" },
        "show-authors": { type: "boolean", default: false },
        "hide-subjects": { type: "boolean", default: false },
        quiet: { type: "boolean", short: "q", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });

    if (values.help) {
      io.stdout(HELP);
      return 0;
    }
    if (values.version) {
      io.stdout(`${version}\n`);
      return 0;
    }
    if (positionals.length > 1) {
      throw new UsageError(`Expected one repository path, got ${positionals.length}.`);
    }

    const repoPath = resolve(io.cwd, positionals[0] ?? ".");
    const formats = parseFormats(values.format);
    const tempo = parseIntOption("tempo", values.tempo, 40, 240) ?? DEFAULT_TEMPO;
    const maxCommits = parseIntOption("max-commits", values["max-commits"], 0, 1_000_000) ?? DEFAULT_MAX_COMMITS;
    const key = normaliseKey(values.key ?? DEFAULT_KEY);
    if (key === null) throw new UsageError(`Unknown key "${values.key}". Try C, F#, Bb and so on.`);
    const toStdout = values.out === "-";
    if (toStdout && (formats.length !== 1 || formats[0] !== "json")) {
      throw new UsageError('--out - only works with --format json.');
    }

    const repoName = basename(repoPath) || "repo";
    const { score } = generate(repoPath, {
      revision: values.branch,
      since: values.since,
      until: values.until,
      maxCommits: maxCommits === 0 ? undefined : maxCommits,
      showAuthors: values["show-authors"],
      tempo,
      key,
      seed: values.seed ?? DEFAULT_SEED,
      includeSubjects: !values["hide-subjects"],
      title: values.title ?? repoName,
      generator: `repo-radio ${version}`,
    });

    if (toStdout) {
      io.stdout(renderScoreJson(score));
      return 0;
    }

    const base = resolve(io.cwd, outputBase(values.out ?? repoName));
    const written: string[] = [];
    mkdirSync(dirname(base), { recursive: true });
    if (formats.includes("midi")) {
      const path = `${base}.mid`;
      writeFileSync(path, renderMidi(score));
      written.push(path);
    }
    if (formats.includes("json")) {
      const path = `${base}.score.json`;
      writeFileSync(path, renderScoreJson(score));
      written.push(path);
    }

    if (!values.quiet) {
      const authors = score.authors.length;
      io.stdout(
        `Composed ${score.meta.commitCount} commit${score.meta.commitCount === 1 ? "" : "s"} by ${authors} author${authors === 1 ? "" : "s"} ` +
          `into ${formatDuration(score.meta.durationSeconds)} at ${tempo} bpm in ${key}.\n`,
      );
      for (const path of written) io.stdout(`  wrote ${path}\n`);
      if (!values["show-authors"]) io.stdout("Authors are shown as aliases. Pass --show-authors to use real names.\n");
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError || isParseArgsError(error)) {
      io.stderr(`repo-radio: ${(error as Error).message}\nRun "repo-radio --help" for usage.\n`);
      return 2;
    }
    if (error instanceof RepoRadioError) {
      io.stderr(`repo-radio: ${error.message}\n`);
      return 1;
    }
    io.stderr(`repo-radio: unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    return 1;
  }
}

function isParseArgsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("ERR_PARSE_ARGS");
}

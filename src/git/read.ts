import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { RepoRadioError } from "../errors.js";
import type { RawCommit } from "../model/types.js";
import { LOG_FORMAT, parseGitLog } from "./parse.js";

export interface ReadOptions {
  /** Branch, tag or any revision git understands. Defaults to HEAD. */
  revision?: string;
  /** Passed to `git log --since`, e.g. "2024-01-01" or "6 months ago". */
  since?: string;
  /** Passed to `git log --until`. */
  until?: string;
  /** Keep only the most recent N commits. */
  maxCommits?: number;
}

const MAX_BUFFER = 512 * 1024 * 1024;

/** Run git and return stdout, or throw a RepoRadioError. */
function git(repoPath: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" },
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new RepoRadioError("git is not installed or not on your PATH.", "GIT_NOT_FOUND");
    }
    throw new RepoRadioError(`Could not run git: ${result.error.message}`, "GIT_FAILED");
  }
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

/** Check that a path is a git repository with at least one commit on the revision. */
export function assertRepository(repoPath: string, revision = "HEAD"): void {
  const absolute = resolve(repoPath);
  let isDirectory = false;
  try {
    isDirectory = statSync(absolute).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    throw new RepoRadioError(`No such directory: ${repoPath}`, "PATH_NOT_FOUND");
  }
  if (!git(absolute, ["rev-parse", "--git-dir"]).ok) {
    throw new RepoRadioError(`Not a git repository: ${repoPath}`, "NOT_A_REPO");
  }
  if (revision.startsWith("-")) {
    throw new RepoRadioError(`Branch or revision cannot start with "-": ${revision}`, "BAD_OPTION");
  }
  const verify = git(absolute, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${revision}^{commit}`]);
  if (!verify.ok) {
    const headExists = git(absolute, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).ok;
    if (!headExists) {
      throw new RepoRadioError(`The repository at ${repoPath} has no commits yet.`, "EMPTY_HISTORY");
    }
    throw new RepoRadioError(`Unknown branch or revision: ${revision}`, "UNKNOWN_REVISION");
  }
}

/** Build the argument list for `git log`. Exported for testing. */
export function buildLogArgs(options: ReadOptions): string[] {
  const args = [
    "-c",
    "core.quotepath=off",
    "-c",
    "log.showSignature=false",
    "log",
    `--format=${LOG_FORMAT}`,
    "--numstat",
    "--no-renames",
    "--no-color",
    "--reverse",
  ];
  if (options.maxCommits !== undefined) args.push(`--max-count=${options.maxCommits}`);
  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);
  args.push("--end-of-options", options.revision ?? "HEAD", "--");
  return args;
}

/**
 * Read commits from a repository, oldest first. When maxCommits is set,
 * these are the most recent N commits, still in chronological order.
 */
export function readCommits(repoPath: string, options: ReadOptions = {}): RawCommit[] {
  const revision = options.revision ?? "HEAD";
  assertRepository(repoPath, revision);
  const result = git(resolve(repoPath), buildLogArgs({ ...options, revision }));
  if (!result.ok) {
    const detail = result.stderr.trim().split("\n")[0] ?? "";
    throw new RepoRadioError(`git log failed: ${detail}`, "GIT_FAILED");
  }
  const commits = parseGitLog(result.stdout);
  if (commits.length === 0) {
    throw new RepoRadioError("No commits match the given filters.", "NO_MATCHING_COMMITS");
  }
  return commits;
}

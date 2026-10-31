import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface CommitSpec {
  author: { name: string; email: string };
  /** ISO 8601 with offset, used for both author and committer dates. */
  date: string;
  message: string;
  /** Files to write (string) or delete (null) before committing. */
  files?: Record<string, string | Buffer | null>;
}

/**
 * A throwaway git repository with scripted, made-up history. Global and
 * system git config are ignored so tests behave the same on any machine.
 */
export class SyntheticRepo {
  readonly dir: string;

  constructor(prefix = "repo-radio-test-") {
    this.dir = mkdtempSync(join(tmpdir(), prefix));
    this.git("init", "-q", "-b", "main");
  }

  private env(date?: string, author?: { name: string; email: string }): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: author?.name ?? "Test Fixture",
      GIT_AUTHOR_EMAIL: author?.email ?? "fixture@example.invalid",
      GIT_COMMITTER_NAME: author?.name ?? "Test Fixture",
      GIT_COMMITTER_EMAIL: author?.email ?? "fixture@example.invalid",
    };
    if (date) {
      env.GIT_AUTHOR_DATE = date;
      env.GIT_COMMITTER_DATE = date;
    }
    return env;
  }

  git(...args: string[]): string {
    return execFileSync("git", ["-C", this.dir, "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
      encoding: "utf8",
      env: this.env(),
    });
  }

  private gitAs(spec: Pick<CommitSpec, "author" | "date">, ...args: string[]): string {
    return execFileSync("git", ["-C", this.dir, "-c", "commit.gpgsign=false", ...args], {
      encoding: "utf8",
      env: this.env(spec.date, spec.author),
    });
  }

  /** Write files and commit them. Returns the new commit hash. */
  commit(spec: CommitSpec): string {
    for (const [path, content] of Object.entries(spec.files ?? {})) {
      const full = join(this.dir, path);
      if (content === null) {
        rmSync(full, { force: true });
      } else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
    }
    this.git("add", "-A");
    this.gitAs(spec, "commit", "-q", "--allow-empty", "-m", spec.message);
    return this.head();
  }

  merge(branch: string, spec: Pick<CommitSpec, "author" | "date">, message = `Merge branch '${branch}'`): string {
    this.gitAs(spec, "merge", "-q", "--no-ff", "-m", message, branch);
    return this.head();
  }

  revert(sha: string, spec: Pick<CommitSpec, "author" | "date">): string {
    this.gitAs(spec, "revert", "--no-edit", sha);
    return this.head();
  }

  tag(name: string): void {
    this.git("tag", name);
  }

  head(): string {
    return this.git("rev-parse", "HEAD").trim();
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

/** Lines of filler text, so commits have a predictable size. */
export function lines(count: number, prefix = "line"): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";
}

export const ALEX = { name: "Alex Fictional", email: "alex@example.invalid" };
export const SAM = { name: "Sam Madeup", email: "sam@example.invalid" };
export const RIO = { name: "Rio Invented", email: "rio@example.invalid" };

/**
 * Build the standard scripted history used by the integration tests:
 *
 *  0 initial      Alex   README                         morning
 *  1 commit       Sam    src/main.ts (30 lines)         evening
 *  2 commit       Alex   src/util.py (80 lines)         small hours, tagged v0.1.0
 *  3 commit       Rio    docs/guide.md                  afternoon (on branch "docs")
 *  4 commit       Sam    src/main.ts edit               afternoon
 *  5 merge        Alex   merge docs                     afternoon
 *  6 commit       Rio    experimental flag              afternoon
 *  7 revert       Rio    revert of 6                    afternoon
 *  8 commit       Sam    binary + unicode path          a month later
 */
export function buildStandardRepo(): SyntheticRepo {
  const repo = new SyntheticRepo();
  repo.commit({ author: ALEX, date: "2024-01-01T09:00:00+00:00", message: "Initial commit", files: { "README.md": lines(4, "readme") } });
  repo.commit({ author: SAM, date: "2024-01-02T20:30:00+01:00", message: "Add main entry point", files: { "src/main.ts": lines(30, "// main") } });
  repo.commit({ author: ALEX, date: "2024-01-03T02:15:00+00:00", message: "Add helpers", files: { "src/util.py": lines(80, "# util") } });
  repo.tag("v0.1.0");
  repo.git("checkout", "-q", "-b", "docs");
  repo.commit({ author: RIO, date: "2024-01-04T13:00:00+00:00", message: "Write the guide", files: { "docs/guide.md": lines(12, "guide") } });
  repo.git("checkout", "-q", "main");
  repo.commit({
    author: SAM,
    date: "2024-01-04T15:00:00+00:00",
    message: "Tidy main",
    files: { "src/main.ts": lines(10, "// main") },
  });
  repo.merge("docs", { author: ALEX, date: "2024-01-05T14:00:00+00:00" });
  const flag = repo.commit({
    author: RIO,
    date: "2024-01-06T14:00:00+00:00",
    message: "Add experimental flag",
    files: { "src/flag.ts": lines(20, "// flag") },
  });
  repo.revert(flag, { author: RIO, date: "2024-01-06T16:00:00+00:00" });
  repo.commit({
    author: SAM,
    date: "2024-02-20T11:00:00+00:00",
    message: "Add logo and café notes",
    files: { "assets/logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 0, 255]), "notes/café menu.md": lines(3, "note") },
  });
  return repo;
}

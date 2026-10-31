import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseScore } from "../src/render/json.js";
import { type Io, outputBase, run } from "../src/run.js";
import { readMidi } from "./helpers/midiReader.js";
import { SAM, type SyntheticRepo, buildStandardRepo } from "./helpers/syntheticRepo.js";

let repo: SyntheticRepo;
let outDir: string;

beforeAll(() => {
  repo = buildStandardRepo();
  outDir = mkdtempSync(join(tmpdir(), "repo-radio-out-"));
});

afterAll(() => {
  repo.cleanup();
  rmSync(outDir, { recursive: true, force: true });
});

async function cli(args: string[], cwd = outDir) {
  let stdout = "";
  let stderr = "";
  const io: Io = { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), cwd };
  const code = await run(args, io);
  return { code, stdout, stderr };
}

describe("outputBase", () => {
  it.each([
    ["track", "track"],
    ["track.mid", "track"],
    ["track.MIDI", "track"],
    ["track.json", "track"],
    ["tracks/a.score.json", "tracks/a"],
  ])("%s -> %s", (input, expected) => {
    expect(outputBase(input)).toBe(expected);
  });
});

describe("repo-radio CLI", () => {
  it("prints help and version", async () => {
    const help = await cli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("--show-authors");
    const version = await cli(["-v"]);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("writes MIDI and JSON by default", async () => {
    const result = await cli([repo.dir, "--out", "nested/song.mid", "--tempo", "90"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Composed 9 commits by 3 authors");
    expect(result.stdout).toContain("90 bpm");
    const midiPath = join(outDir, "nested/song.mid");
    const jsonPath = join(outDir, "nested/song.score.json");
    expect(readMidi(readFileSync(midiPath)).format).toBe(1);
    const score = parseScore(readFileSync(jsonPath, "utf8"));
    expect(score.meta.tempo).toBe(90);
    expect(score.meta.commitCount).toBe(9);
  });

  it("names output after the repository when --out is not given", async () => {
    const result = await cli([repo.dir, "--format", "json", "--quiet"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    const name = repo.dir.split(/[\\/]/).pop()!;
    expect(existsSync(join(outDir, `${name}.score.json`))).toBe(true);
    expect(existsSync(join(outDir, `${name}.mid`))).toBe(false);
  });

  it("streams JSON to stdout with --out -", async () => {
    const result = await cli([repo.dir, "--format", "json", "--out", "-", "--max-commits", "2", "--key", "eb", "--seed", "x"]);
    expect(result.code).toBe(0);
    const score = parseScore(result.stdout);
    expect(score.meta.commitCount).toBe(2);
    expect(score.meta.key).toBe("Eb");
    expect(score.meta.seed).toBe("x");
  });

  it("respects --show-authors and --hide-subjects", async () => {
    const shown = parseScore((await cli([repo.dir, "-f", "json", "-o", "-", "--show-authors"])).stdout);
    expect(shown.authors.map((a) => a.label)).toContain(SAM.name);
    const hidden = parseScore((await cli([repo.dir, "-f", "json", "-o", "-", "--hide-subjects"])).stdout);
    expect(hidden.commits.every((c) => c.subject === null)).toBe(true);
    expect(hidden.authors.map((a) => a.label)).not.toContain(SAM.name);
  });

  it("supports --branch, --since and --until", async () => {
    const result = await cli([repo.dir, "-f", "json", "-o", "-", "-b", "docs", "--since", "2024-01-02", "--until", "2024-01-05"]);
    expect(result.code).toBe(0);
    expect(parseScore(result.stdout).commits.map((c) => c.subject)).toEqual([
      "Add main entry point",
      "Add helpers",
      "Write the guide",
    ]);
  });

  it.each([
    [["--tempo", "999"], /--tempo must be between 40 and 240/],
    [["--tempo", "fast"], /--tempo must be a whole number/],
    [["--max-commits", "-3"], /max-commits|argument/],
    [["--format", "wav"], /Unknown format "wav"/],
    [["--key", "H"], /Unknown key "H"/],
    [["--out", "-"], /only works with --format json/],
    [["--nope"], /Unknown option/],
    [["a", "b"], /Expected one repository path/],
  ])("rejects bad usage %j with exit code 2", async (args, message) => {
    const result = await cli([...(args as string[])]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(message);
    expect(result.stderr).toContain("--help");
  });

  it("exits 1 with a clear message for a folder that is not a repository", async () => {
    const plain = mkdtempSync(join(tmpdir(), "repo-radio-plain-"));
    try {
      const result = await cli([plain]);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/^repo-radio: Not a git repository/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("exits 1 for an unknown branch", async () => {
    const result = await cli([repo.dir, "--branch", "missing"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown branch or revision: missing");
  });
});

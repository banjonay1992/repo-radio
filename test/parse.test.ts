import { describe, expect, it } from "vitest";
import { parseGitLog, parseNumstat, parseTags, unquotePath } from "../src/git/parse.js";
import { buildLogArgs } from "../src/git/read.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

function record(fields: {
  sha: string;
  parents?: string;
  name?: string;
  email?: string;
  date?: string;
  decorations?: string;
  subject?: string;
  numstat?: string;
}): string {
  return (
    "\x1e" +
    [
      fields.sha,
      fields.parents ?? "",
      fields.name ?? "Test Person",
      fields.email ?? "test@example.invalid",
      fields.date ?? "2024-01-02T10:00:00+00:00",
      fields.decorations ?? "",
    ].join("\x1f") +
    "\x1f" +
    (fields.subject ?? "A change") +
    "\x1d" +
    (fields.numstat ? `\n\n${fields.numstat}\n` : "\n")
  );
}

describe("parseGitLog", () => {
  it("parses headers and numstat blocks", () => {
    const raw =
      record({ sha: SHA_A, subject: "Initial commit", numstat: "10\t0\tREADME.md\n3\t0\tsrc/main.ts" }) +
      record({
        sha: SHA_B,
        parents: SHA_A,
        name: "Pat Example",
        email: "pat@example.invalid",
        date: "2024-01-03T23:30:00+02:00",
        decorations: "HEAD -> main, tag: v1.0.0",
        subject: "Fix the thing",
        numstat: "1\t4\tsrc/main.ts",
      });

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      sha: SHA_A,
      parents: [],
      subject: "Initial commit",
      files: [
        { path: "README.md", added: 10, deleted: 0 },
        { path: "src/main.ts", added: 3, deleted: 0 },
      ],
    });
    expect(commits[1]).toMatchObject({
      parents: [SHA_A],
      authorName: "Pat Example",
      authorEmail: "pat@example.invalid",
      authorDate: "2024-01-03T23:30:00+02:00",
      tags: ["v1.0.0"],
      subject: "Fix the thing",
    });
  });

  it("handles merges with two parents and no numstat", () => {
    const raw = record({ sha: SHA_C, parents: `${SHA_A} ${SHA_B}`, subject: "Merge branch 'feature'" });
    const [merge] = parseGitLog(raw);
    expect(merge?.parents).toEqual([SHA_A, SHA_B]);
    expect(merge?.files).toEqual([]);
  });

  it("keeps separator-like characters in the subject without shifting fields", () => {
    const raw = record({ sha: SHA_A, subject: "Odd \x1f subject", numstat: "1\t1\ta.txt" });
    const [commit] = parseGitLog(raw);
    expect(commit?.subject).toBe("Odd \x1f subject");
    expect(commit?.files).toHaveLength(1);
  });

  it("returns an empty list for empty output", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("\n\n")).toEqual([]);
  });

  it("rejects records without a valid hash", () => {
    expect(() => parseGitLog("\x1enot-a-sha\x1f\x1f\x1f\x1f\x1f\x1fsubject\x1d")).toThrow(/Malformed commit hash/);
  });
});

describe("parseNumstat", () => {
  it("reports binary files with null counts", () => {
    expect(parseNumstat("-\t-\tlogo.png\n2\t0\tnotes.md")).toEqual([
      { path: "logo.png", added: null, deleted: null },
      { path: "notes.md", added: 2, deleted: 0 },
    ]);
  });

  it("ignores lines that are not numstat", () => {
    expect(parseNumstat("garbage\n\n5\t5\tok.ts")).toEqual([{ path: "ok.ts", added: 5, deleted: 5 }]);
  });
});

describe("parseTags", () => {
  it("only keeps tag decorations", () => {
    expect(parseTags("HEAD -> main, origin/main, tag: v2, tag: release-2024")).toEqual(["v2", "release-2024"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("unquotePath", () => {
  it("leaves plain paths alone", () => {
    expect(unquotePath("src/index.ts")).toBe("src/index.ts");
  });

  it("decodes C-style escapes and octal UTF-8 bytes", () => {
    expect(unquotePath('"with\\ttab.txt"')).toBe("with\ttab.txt");
    expect(unquotePath('"quote\\".md"')).toBe('quote".md');
    expect(unquotePath('"caf\\303\\251.py"')).toBe("café.py");
  });
});

describe("buildLogArgs", () => {
  it("puts user values after --end-of-options and as --flag=value", () => {
    const args = buildLogArgs({ revision: "develop", since: "2024-01-01", until: "2024-06-01", maxCommits: 50 });
    expect(args).toContain("--since=2024-01-01");
    expect(args).toContain("--until=2024-06-01");
    expect(args).toContain("--max-count=50");
    const end = args.indexOf("--end-of-options");
    expect(args[end + 1]).toBe("develop");
    expect(args.at(-1)).toBe("--");
  });
});

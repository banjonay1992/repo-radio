import { describe, expect, it } from "vitest";
import { aliasFor, assignAliases } from "../src/model/aliases.js";
import { buildHistory, kindOf, localHourOf, timeBandForHour } from "../src/model/build.js";
import { categoryForPath, dominantCategory } from "../src/model/languages.js";
import { rawCommit } from "./helpers/fixtures.js";

describe("categoryForPath", () => {
  it.each([
    ["src/index.ts", "web"],
    ["lib/thing.RS", "systems"],
    ["scripts/build.sh", "shell"],
    ["Dockerfile", "shell"],
    ["docs/README.md", "docs"],
    ["README", "docs"],
    ["LICENSE.txt", "docs"],
    ["config/app.yaml", "data"],
    ["App/View.swift", "apps"],
    ["mystery.xyz", "other"],
    [".gitignore", "data"],
  ])("%s -> %s", (path, expected) => {
    expect(categoryForPath(path)).toBe(expected);
  });
});

describe("dominantCategory", () => {
  it("picks the category with the most changed lines", () => {
    expect(
      dominantCategory([
        { path: "a.ts", added: 5, deleted: 0 },
        { path: "b.py", added: 20, deleted: 4 },
        { path: "c.ts", added: 10, deleted: 0 },
      ]),
    ).toBe("scripting");
  });

  it("counts binary files as one line and falls back to other", () => {
    expect(dominantCategory([{ path: "logo.png", added: null, deleted: null }])).toBe("other");
    expect(dominantCategory([])).toBe("other");
  });

  it("breaks ties by category order, not file order", () => {
    const files = [
      { path: "a.md", added: 3, deleted: 0 },
      { path: "a.ts", added: 3, deleted: 0 },
    ];
    expect(dominantCategory(files)).toBe("web");
    expect(dominantCategory([...files].reverse())).toBe("web");
  });
});

describe("time of day", () => {
  it("reads the hour in the author's own zone", () => {
    expect(localHourOf("2024-03-05T23:15:00+01:00")).toBe(23);
    expect(localHourOf("2024-03-05T02:00:00-08:00")).toBe(2);
    expect(localHourOf("nonsense")).toBe(12);
  });

  it.each([
    [0, "small-hours"],
    [4, "small-hours"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [23, "evening"],
  ])("hour %i is %s", (hour, band) => {
    expect(timeBandForHour(hour)).toBe(band);
  });
});

describe("kindOf", () => {
  it("recognises merges, reverts and the first commit", () => {
    expect(kindOf(rawCommit({ parents: ["x", "y"] }), false)).toBe("merge");
    expect(kindOf(rawCommit({ parents: [] }), true)).toBe("initial");
    expect(kindOf(rawCommit({ subject: 'Revert "Add feature"' }), false)).toBe("revert");
    expect(kindOf(rawCommit({ subject: "revert: undo the thing" }), false)).toBe("revert");
    expect(kindOf(rawCommit({ subject: "Reverting is not this" }), false)).toBe("commit");
  });
});

describe("aliases", () => {
  it("are stable for the same key", () => {
    expect(aliasFor("someone@example.invalid")).toBe(aliasFor("someone@example.invalid"));
  });

  it("are made unique when two keys collide", () => {
    // Find two keys that hash to the same alias.
    const seen = new Map<string, string>();
    let pair: [string, string] | undefined;
    for (let i = 0; i < 10_000 && !pair; i++) {
      const key = `person${i}@example.invalid`;
      const alias = aliasFor(key);
      const earlier = seen.get(alias);
      if (earlier) pair = [earlier, key];
      seen.set(alias, key);
    }
    expect(pair).toBeDefined();
    const labels = assignAliases(pair as [string, string]);
    const [first, second] = [...labels.values()];
    expect(first).not.toBe(second);
    expect(second).toBe(`${first} 2`);
  });
});

describe("buildHistory", () => {
  const commits = [
    rawCommit({ parents: [], subject: "Initial commit", authorName: "Ada Sample", authorEmail: "ada@example.invalid" }),
    rawCommit({
      subject: "Add feature",
      authorName: "Bo Sample",
      authorEmail: "BO@example.invalid",
      authorDate: "2024-05-02T02:30:00+00:00",
      files: [
        { path: "src/a.py", added: 30, deleted: 2 },
        { path: "img.png", added: null, deleted: null },
      ],
      tags: ["v0.1.0"],
    }),
    rawCommit({ subject: 'Revert "Add feature"', authorName: "Ada Sample", authorEmail: "ada@example.invalid" }),
    rawCommit({ parents: ["p1", "p2"], subject: "Merge branch 'x'", files: [], authorEmail: "bo@example.invalid" }),
  ];

  it("hides real names by default", () => {
    const history = buildHistory(commits);
    expect(history.authors).toHaveLength(2);
    for (const commit of history.commits) {
      expect(commit.authorLabel).not.toMatch(/Sample/);
    }
    expect(JSON.stringify(history)).not.toContain("Ada Sample");
  });

  it("shows real names when asked", () => {
    const history = buildHistory(commits, { showAuthors: true });
    expect(history.authors.map((a) => a.label)).toEqual(["Ada Sample", "Bo Sample"]);
  });

  it("merges authors by email case-insensitively and counts commits", () => {
    const history = buildHistory(commits);
    expect(history.authors.map((a) => a.commitCount)).toEqual([2, 2]);
  });

  it("fills in kinds, totals, categories and revert links", () => {
    const { commits: built } = buildHistory(commits);
    expect(built.map((c) => c.kind)).toEqual(["initial", "commit", "revert", "merge"]);
    expect(built[1]).toMatchObject({
      linesAdded: 30,
      linesDeleted: 2,
      filesChanged: 2,
      category: "scripting",
      timeBand: "small-hours",
      tags: ["v0.1.0"],
    });
    expect(built[2]?.revertsIndex).toBe(1);
    expect(built[3]?.category).toBe("other");
  });
});

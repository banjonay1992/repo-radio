/**
 * A made-up project history, composed in the browser so the player has
 * something to play before you load your own score. Every name, address
 * and message here is invented.
 */

import { compose } from "../../src/compose/compose.js";
import type { Score } from "../../src/compose/score.js";
import { buildHistory } from "../../src/model/build.js";
import type { FileChange, RawCommit } from "../../src/model/types.js";
import { hashParts } from "../../src/util/hash.js";

const PEOPLE = [
  { name: "Demo Author One", email: "one@example.invalid" },
  { name: "Demo Author Two", email: "two@example.invalid" },
  { name: "Demo Author Three", email: "three@example.invalid" },
  { name: "Demo Author Four", email: "four@example.invalid" },
];

type Step = [person: number, day: number, hour: number, subject: string, files: Array<[string, number, number]>, extra?: "merge" | "tag"];

const SCRIPT: Step[] = [
  [0, 0, 10, "Initial commit", [["README.md", 12, 0], ["package.json", 20, 0]]],
  [0, 0, 11, "Set up the build", [["tsconfig.json", 18, 0], [".gitignore", 4, 0]]],
  [0, 1, 23, "Sketch the parser", [["src/parse.ts", 140, 0]]],
  [1, 2, 9, "Add tests for the parser", [["test/parse.test.ts", 85, 0]]],
  [0, 2, 14, "Handle empty input", [["src/parse.ts", 12, 3]]],
  [2, 3, 2, "Rewrite the core loop in Rust", [["core/src/lib.rs", 420, 0], ["core/Cargo.toml", 14, 0]]],
  [1, 4, 15, "Fix typo in README", [["README.md", 1, 1]]],
  [0, 5, 16, "Merge branch 'core'", [], "merge"],
  [3, 6, 20, "Add styles for the site", [["site/style.css", 160, 0], ["site/index.html", 40, 0]]],
  [3, 6, 21, "Tweak colours", [["site/style.css", 8, 8]]],
  [1, 7, 8, "Write the user guide", [["docs/guide.md", 210, 0]]],
  [0, 7, 12, "Release 0.1.0", [["CHANGELOG.md", 10, 0], ["package.json", 1, 1]], "tag"],
  [2, 9, 1, "Speed up hashing", [["core/src/hash.rs", 60, 35]]],
  [2, 9, 3, 'Revert "Speed up hashing"', [["core/src/hash.rs", 35, 60]]],
  [1, 30, 10, "Back from a break: update dependencies", [["package-lock.json", 900, 750]]],
  [0, 31, 13, "Add a shell installer", [["install.sh", 45, 0]]],
  [3, 31, 18, "Remove the old site", [["site/style.css", 0, 168], ["site/index.html", 0, 40]]],
  [0, 32, 11, "Merge branch 'cleanup'", [], "merge"],
  [1, 33, 9, "Polish the guide", [["docs/guide.md", 30, 22]]],
  [0, 33, 17, "Release 0.2.0", [["CHANGELOG.md", 8, 0]], "tag"],
];

function sha(i: number): string {
  return hashParts("demo", i).toString(16).padStart(8, "0").repeat(5);
}

export function demoCommits(): RawCommit[] {
  return SCRIPT.map(([person, day, hour, subject, files, extra], i) => {
    const who = PEOPLE[person] ?? PEOPLE[0]!;
    const date = new Date(Date.UTC(2024, 2, 1 + day, hour, 0, 0)).toISOString().replace(".000Z", "+00:00");
    const changes: FileChange[] = files.map(([path, added, deleted]) => ({ path, added, deleted }));
    const parents = i === 0 ? [] : extra === "merge" ? [sha(i - 1), sha(i + 100)] : [sha(i - 1)];
    return {
      sha: sha(i),
      parents,
      authorName: who.name,
      authorEmail: who.email,
      authorDate: date,
      subject,
      tags: extra === "tag" ? [`v0.${subject.endsWith("0.1.0") ? 1 : 2}.0`] : [],
      files: changes,
    };
  });
}

export function demoScore(): Score {
  return compose(buildHistory(demoCommits()), { title: "Demo project", generator: "repo-radio demo" });
}

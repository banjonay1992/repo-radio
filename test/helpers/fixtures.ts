import type { RawCommit } from "../../src/model/types.js";

let counter = 0;

/** Make a fake 40 character hash that is unique within a test run. */
export function fakeSha(seed?: number): string {
  const n = seed ?? ++counter;
  return n.toString(16).padStart(8, "0").repeat(5);
}

/** A synthetic raw commit with made-up details. Override any field. */
export function rawCommit(overrides: Partial<RawCommit> = {}): RawCommit {
  return {
    sha: fakeSha(),
    parents: [fakeSha()],
    authorName: "Robin Placeholder",
    authorEmail: "robin@example.invalid",
    authorDate: "2024-05-01T14:00:00+00:00",
    subject: "Make a change",
    tags: [],
    files: [{ path: "src/app.ts", added: 12, deleted: 3 }],
    ...overrides,
  };
}

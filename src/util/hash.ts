/**
 * Small, dependency free hashing and random number helpers.
 *
 * Everything here is deterministic and runs the same in Node and in the
 * browser, which keeps the composer usable from the web player too.
 */

/** 32-bit FNV-1a hash of a string. Not cryptographic, just stable. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Hash several parts into one number, with a separator so ("ab","c") != ("a","bc"). */
export function hashParts(...parts: Array<string | number>): number {
  return fnv1a(parts.map(String).join("\u0000"));
}

/**
 * Mulberry32: a tiny seeded generator. Returns a function that yields
 * floats in [0, 1). The same seed always gives the same sequence.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an item from a non-empty list using a hash value. */
export function pick<T>(items: readonly T[], hash: number): T {
  if (items.length === 0) {
    throw new Error("pick() needs at least one item");
  }
  return items[hash % items.length] as T;
}

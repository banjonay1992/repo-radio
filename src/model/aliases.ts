import { fnv1a } from "../util/hash.js";

/**
 * Friendly, stable aliases so output never needs real names. The alias is
 * derived from a hash of the author's email, so the same person gets the
 * same alias every run. This hides names from casual view; it is not
 * anonymisation, and anyone with the repository can work out who is who.
 */
const COLOURS = [
  "Amber", "Azure", "Coral", "Crimson", "Ember", "Indigo", "Ivory", "Jade",
  "Lilac", "Moss", "Ochre", "Pearl", "Russet", "Sage", "Slate", "Teal",
] as const;

const BIRDS = [
  "Avocet", "Bittern", "Chough", "Curlew", "Dunlin", "Fulmar", "Gannet", "Heron",
  "Kestrel", "Linnet", "Merlin", "Osprey", "Plover", "Puffin", "Shag", "Wren",
] as const;

export function aliasFor(key: string): string {
  const hash = fnv1a(key);
  const colour = COLOURS[hash % COLOURS.length] as string;
  const bird = BIRDS[Math.floor(hash / COLOURS.length) % BIRDS.length] as string;
  return `${colour} ${bird}`;
}

/**
 * Give every key a unique label. When two keys hash to the same alias, the
 * later one (in the order given) gets a number on the end.
 */
export function assignAliases(keysInOrder: readonly string[]): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Map<string, number>();
  for (const key of keysInOrder) {
    if (labels.has(key)) continue;
    const base = aliasFor(key);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    labels.set(key, count === 1 ? base : `${base} ${count}`);
  }
  return labels;
}

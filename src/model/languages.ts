/**
 * File type -> language category. A commit's "category" is the one with
 * the most changed lines, and the composer picks a musical mode from it.
 */

export const CATEGORIES = [
  "web",
  "styles",
  "systems",
  "scripting",
  "jvm",
  "apps",
  "functional",
  "shell",
  "data",
  "docs",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

const EXTENSIONS: Record<Category, readonly string[]> = {
  web: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "vue", "svelte", "astro"],
  styles: ["html", "htm", "css", "scss", "sass", "less", "styl"],
  systems: ["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "rs", "go", "zig", "nim", "d", "asm", "s"],
  scripting: ["py", "pyi", "rb", "php", "pl", "pm", "lua", "r", "jl", "tcl"],
  jvm: ["java", "scala", "groovy", "gradle", "cs", "fs", "vb"],
  apps: ["swift", "kt", "kts", "dart", "m", "mm", "xib", "storyboard"],
  functional: ["hs", "lhs", "ml", "mli", "ex", "exs", "erl", "hrl", "clj", "cljs", "elm", "purs", "rkt", "scm", "lisp"],
  shell: ["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd", "mk", "make", "nix"],
  data: ["json", "jsonc", "yaml", "yml", "toml", "xml", "csv", "tsv", "ini", "cfg", "conf", "lock", "sql", "graphql", "proto", "env"],
  docs: ["md", "mdx", "markdown", "txt", "rst", "adoc", "org", "tex"],
  other: [],
};

/** Whole file names that say more than their extension. */
const FILE_NAMES: Record<string, Category> = {
  dockerfile: "shell",
  makefile: "shell",
  justfile: "shell",
  gemfile: "scripting",
  rakefile: "scripting",
  license: "docs",
  licence: "docs",
  readme: "docs",
  changelog: "docs",
  authors: "docs",
  ".gitignore": "data",
  ".gitattributes": "data",
  ".editorconfig": "data",
};

const BY_EXTENSION: ReadonlyMap<string, Category> = new Map(
  (Object.entries(EXTENSIONS) as Array<[Category, readonly string[]]>).flatMap(([category, exts]) =>
    exts.map((ext) => [ext, category] as const),
  ),
);

/** Work out the category of a single path. */
export function categoryForPath(path: string): Category {
  const fileName = (path.split("/").pop() ?? path).toLowerCase();
  const byName = FILE_NAMES[fileName];
  if (byName) return byName;
  const dot = fileName.lastIndexOf(".");
  if (dot > 0) {
    const ext = fileName.slice(dot + 1);
    const byExt = BY_EXTENSION.get(ext);
    if (byExt) return byExt;
  }
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return FILE_NAMES[stem] ?? "other";
}

/**
 * Pick the category with the most changed lines. Binary files count as one
 * line. Ties go to whichever category comes first in CATEGORIES, so the
 * result never depends on file order.
 */
export function dominantCategory(files: ReadonlyArray<{ path: string; added: number | null; deleted: number | null }>): Category {
  const weights = new Map<Category, number>();
  for (const file of files) {
    const lines = file.added === null || file.deleted === null ? 1 : file.added + file.deleted;
    const category = categoryForPath(file.path);
    weights.set(category, (weights.get(category) ?? 0) + Math.max(lines, 1));
  }
  let best: Category = "other";
  let bestWeight = 0;
  for (const category of CATEGORIES) {
    const weight = weights.get(category) ?? 0;
    if (weight > bestWeight) {
      best = category;
      bestWeight = weight;
    }
  }
  return best;
}

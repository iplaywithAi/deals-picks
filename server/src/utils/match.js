// Words that carry no product identity
const STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'new', 'original', 'official', 'genuine',
  'set', 'pack', 'pcs', 'kenya', 'ksh', 'in', 'of', 'a', 'an',
]);

export function tokenize(name) {
  return new Set(
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
  );
}

// Jaccard similarity between two token sets, 0 to 1
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

import picomatch from "picomatch";

export function matchesAnyPattern(
  value: string,
  patterns: string[],
): boolean {
  if (patterns.length === 0) return false;
  for (const p of patterns) {
    const isMatch = picomatch(p, { dot: true, nocase: false });
    if (isMatch(value)) return true;
  }
  return false;
}

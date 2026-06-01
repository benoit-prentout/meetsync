// Mirrors apps-script/Code.gs:58-72 (functions matchesPattern_, isExcluded_).
// If you change one, update the other — there is no shared module.
import { describe, it, expect } from 'vitest';

function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern) return true;
  const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
  return name.match(new RegExp('^' + regex + '$', 'i')) !== null;
}

function isExcluded(name: string, exclusionPatterns: string): boolean {
  if (!exclusionPatterns) return false;
  const patterns = exclusionPatterns.split('\n');
  for (const raw of patterns) {
    const p = raw.trim();
    if (p && matchesPattern(name, p)) return true;
  }
  return false;
}

describe('matchesPattern', () => {
  it('returns true for empty pattern (no filter)', () => {
    expect(matchesPattern('anything.txt', '')).toBe(true);
  });
  it('matches * as any sequence', () => {
    expect(matchesPattern('Meeting Notes 2025.gdoc', '*Notes*')).toBe(true);
  });
  it('matches ? as exactly one character', () => {
    expect(matchesPattern('abc', 'a?c')).toBe(true);
    expect(matchesPattern('ac', 'a?c')).toBe(false);
  });
  it('is case-insensitive', () => {
    expect(matchesPattern('MEETING', 'meeting')).toBe(true);
  });
  it('anchors to full string (no partial match)', () => {
    expect(matchesPattern('prefix-meeting-suffix', 'meeting')).toBe(false);
  });
});

describe('isExcluded', () => {
  it('returns false when no exclusion patterns', () => {
    expect(isExcluded('foo', '')).toBe(false);
  });
  it('returns true when name matches any line', () => {
    expect(isExcluded('Private 1:1', 'Private*\nDraft*')).toBe(true);
    expect(isExcluded('Draft idea', 'Private*\nDraft*')).toBe(true);
  });
  it('returns false when no line matches', () => {
    expect(isExcluded('Team standup', 'Private*\nDraft*')).toBe(false);
  });
  it('ignores empty lines and whitespace', () => {
    expect(isExcluded('Private', '\n  \nPrivate\n')).toBe(true);
  });
});

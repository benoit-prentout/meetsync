// Runs the REAL apps-script/Code.gs (matchesPattern_, isExcluded_) via the loadCode harness.
import { describe, it, expect } from 'vitest';
import { loadCode } from './loadCode';

const gs = loadCode();
const matchesPattern = (name: string, pattern: string): boolean => gs.matchesPattern_(name, pattern);
const isExcluded = (name: string, patterns: string): boolean => gs.isExcluded_(name, patterns);

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
  it('treats regex metacharacters literally', () => {
    expect(matchesPattern('Team standup', '[Private]*')).toBe(false);
    expect(matchesPattern('[Private] 1:1', '[Private]*')).toBe(true);
    expect(matchesPattern('v1x0', 'v1.0')).toBe(false);
    expect(matchesPattern('a+b (c) $1 ^x {2} | \\', 'a+b (c) $1 ^x {2} | \\')).toBe(true);
  });
  it('does not throw on an unbalanced paren', () => {
    expect(() => matchesPattern('Notes (draft', 'Notes (draft')).not.toThrow();
    expect(matchesPattern('Notes (draft', 'Notes (draft')).toBe(true);
    expect(isExcluded('Notes (draft) v2', 'Notes (draft*')).toBe(true);
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

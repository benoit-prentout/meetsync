// Mirrors apps-script/Code.gs:74-83 (function isWithinTimeWindow_).
// Pure version takes (now, start, end) instead of reading CONFIG/Date directly.
import { describe, it, expect } from 'vitest';

function isWithinTimeWindow(now: Date, start: string, end: string): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = start.split(':').map((s) => parseInt(s, 10));
  const [eH, eM] = end.split(':').map((s) => parseInt(s, 10));
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

describe('isWithinTimeWindow', () => {
  it('returns true when now is inside [09:00, 17:00]', () => {
    expect(isWithinTimeWindow(new Date(2026, 0, 1, 12, 0), '09:00', '17:00')).toBe(true);
  });
  it('returns true at exact window start', () => {
    expect(isWithinTimeWindow(new Date(2026, 0, 1, 9, 0), '09:00', '17:00')).toBe(true);
  });
  it('returns true at exact window end', () => {
    expect(isWithinTimeWindow(new Date(2026, 0, 1, 17, 0), '09:00', '17:00')).toBe(true);
  });
  it('returns false before window start', () => {
    expect(isWithinTimeWindow(new Date(2026, 0, 1, 8, 59), '09:00', '17:00')).toBe(false);
  });
  it('returns false after window end', () => {
    expect(isWithinTimeWindow(new Date(2026, 0, 1, 17, 1), '09:00', '17:00')).toBe(false);
  });
});

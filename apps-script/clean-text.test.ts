// Exercises the real apps-script/Code.gs cleanGeminiText_ via the loadCode harness.
import { describe, it, expect } from 'vitest';
import { loadCode } from './loadCode';

const gs = loadCode();
const cleanGeminiText = (text: string): string => gs.cleanGeminiText_(text);

describe('cleanGeminiText', () => {
  it('strips Participants block followed by blank line', () => {
    const input = 'Participants: Alice, Bob\n\nDiscussion started.';
    expect(cleanGeminiText(input)).toBe('Discussion started.');
  });

  it('strips Attendees block (English)', () => {
    const input = 'Attendees: Alice\n\nWe talked.';
    expect(cleanGeminiText(input)).toBe('We talked.');
  });

  it('strips Présents block (French)', () => {
    const input = 'Présents: Alice\n\nDiscussion.';
    expect(cleanGeminiText(input)).toBe('Discussion.');
  });

  it('removes "Notes by Gemini" footer line', () => {
    const input = 'Body text.\nNotes by Gemini in Meet';
    expect(cleanGeminiText(input)).toBe('Body text.');
  });

  it('removes "Notes par Gemini" footer (French)', () => {
    const input = 'Texte.\nNotes par Gemini dans Meet';
    expect(cleanGeminiText(input)).toBe('Texte.');
  });

  it('strips markdown headers # through ######', () => {
    const input = '# H1\n## H2\n###### H6\nBody';
    expect(cleanGeminiText(input)).toBe('H1\nH2\nH6\nBody');
  });

  it('strips bold **text** and italic *text* markers', () => {
    expect(cleanGeminiText('**bold** and *italic*')).toBe('bold and italic');
  });

  it('collapses runs of 2+ spaces/tabs to a single space', () => {
    expect(cleanGeminiText('a    b\t\tc')).toBe('a b c');
  });

  it('collapses 3+ consecutive newlines to exactly 2', () => {
    expect(cleanGeminiText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims leading and trailing whitespace', () => {
    expect(cleanGeminiText('\n  hello  \n')).toBe('hello');
  });

  it('is idempotent on already-clean text', () => {
    const clean = 'Line one.\n\nLine two.';
    expect(cleanGeminiText(clean)).toBe(clean);
  });
});

describe('cleanGeminiText participants stripping (C1)', () => {
  const FR = 'Présents: Alice\n* Bob\nÉtapes suivantes\n- Livrer le projet\n- Tester\nRésumé complet ici';

  it('keeps an accented section heading, its action items and the summary', () => {
    expect(cleanGeminiText(FR)).toBe('Étapes suivantes\n- Livrer le projet\n- Tester\nRésumé complet ici');
  });

  it('leaves a mid-sentence "participants:" untouched', () => {
    const input = 'We asked participants: what blocks you? Then we moved on.\n\nNext topic.';
    expect(cleanGeminiText(input)).toBe(input);
  });

  it('still strips a normal participants line', () => {
    expect(cleanGeminiText('Participants: A, B, C\n\nSummary of the meeting.')).toBe('Summary of the meeting.');
  });

  it('strips a label wrapped in markdown bold and its bullet list', () => {
    expect(cleanGeminiText('Title\n**Participants:**\n- Alice Martin\n- Bob\nSummary\nWe decided X')).toBe('Title\n\nSummary\nWe decided X');
  });

  it('stops at a non-list line even without a blank line', () => {
    expect(cleanGeminiText('Participants: A\nSummary\nWe decided X')).toBe('Summary\nWe decided X');
  });

  it('treats CRLF input like LF', () => {
    expect(cleanGeminiText(FR.replace(/\n/g, '\r\n'))).toBe(cleanGeminiText(FR));
    const crlf = 'Participants: A, B\r\n\r\nSummary\r\nWe decided X';
    expect(cleanGeminiText(crlf)).toBe('Summary\nWe decided X');
  });
});

describe('extractParticipants (C2)', () => {
  const extract = (text: string): string | null => gs.extractParticipants_(text);

  it('stops at the first non-list line when there is no blank line', () => {
    expect(extract('Participants: A\nSummary\nWe decided X')).toBe('A');
  });

  it('does not leak the note body for CRLF text', () => {
    expect(extract('Title\r\nParticipants: Alice, Bob\r\nSummary\r\nWe decided X\r\nNext steps')).toBe('Alice, Bob');
  });

  it('captures a comma-separated list wrapped over several lines', () => {
    expect(extract('Participants: Alice Martin, Bob,\nCarol, Dave\n\nSummary')).toBe('Alice Martin, Bob, Carol, Dave');
  });

  it('captures a bullet list and strips emails', () => {
    expect(extract('**Attendees:**\r\n- Alice <alice@x.com>\r\n* Bob (bob@x.com)\r\n• Élodie Durand\r\nSummary')).toBe('Alice, Bob, Élodie Durand');
  });

  it('ignores a mid-sentence label and returns null without one', () => {
    expect(extract('We asked participants: what blocks you?')).toBeNull();
    expect(extract('No attendee line here')).toBeNull();
  });
});

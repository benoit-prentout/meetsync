import { describe, it, expect } from 'vitest';
import { extractDocId, extractFolderId } from './googleIds';

describe('extractDocId', () => {
  it('extracts ID from full Google Docs URL', () => {
    expect(extractDocId('https://docs.google.com/document/d/abc123/edit')).toBe('abc123');
  });

  it('extracts ID from Docs URL without /edit', () => {
    expect(extractDocId('https://docs.google.com/document/d/abc123')).toBe('abc123');
  });

  it('extracts ID from Docs URL with trailing slash', () => {
    expect(extractDocId('https://docs.google.com/document/d/abc123/')).toBe('abc123');
  });

  it('extracts ID with hyphens and underscores', () => {
    expect(extractDocId('https://docs.google.com/document/d/1aB_-xYz-123/edit')).toBe('1aB_-xYz-123');
  });

  it('accepts raw ID', () => {
    expect(extractDocId('abc123')).toBe('abc123');
  });

  it('accepts raw ID with hyphens', () => {
    expect(extractDocId('1aB_-xYz-123')).toBe('1aB_-xYz-123');
  });

  it('returns null for empty string', () => {
    expect(extractDocId('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(extractDocId('   ')).toBeNull();
  });

  it('returns null for non-Google URL', () => {
    expect(extractDocId('https://example.com/foo')).toBeNull();
  });

  it('returns null for Google Drive URL (wrong domain)', () => {
    expect(extractDocId('https://drive.google.com/drive/folders/abc123')).toBeNull();
  });

  it('handles URLs with query parameters', () => {
    expect(extractDocId('https://docs.google.com/document/d/abc123?usp=sharing')).toBe('abc123');
  });

  it('handles URLs with fragments', () => {
    expect(extractDocId('https://docs.google.com/document/d/abc123#heading=h.xyz')).toBe('abc123');
  });

  it('trims surrounding whitespace', () => {
    expect(extractDocId('  https://docs.google.com/document/d/abc123  ')).toBe('abc123');
  });

  it('returns null for URL with no ID segment', () => {
    expect(extractDocId('https://docs.google.com/document/')).toBeNull();
  });
});

describe('extractFolderId', () => {
  it('extracts ID from full Google Drive folder URL', () => {
    expect(extractFolderId('https://drive.google.com/drive/folders/abc123')).toBe('abc123');
  });

  it('extracts ID from Drive URL with trailing slash', () => {
    expect(extractFolderId('https://drive.google.com/drive/folders/abc123/')).toBe('abc123');
  });

  it('extracts ID with hyphens and underscores', () => {
    expect(extractFolderId('https://drive.google.com/drive/folders/1aB_-xYz-123')).toBe('1aB_-xYz-123');
  });

  it('accepts raw ID', () => {
    expect(extractFolderId('abc123')).toBe('abc123');
  });

  it('returns null for empty string', () => {
    expect(extractFolderId('')).toBeNull();
  });

  it('returns null for non-Google URL', () => {
    expect(extractFolderId('https://example.com/folder/abc123')).toBeNull();
  });

  it('returns null for Google Docs URL (wrong domain)', () => {
    expect(extractFolderId('https://docs.google.com/document/d/abc123')).toBeNull();
  });

  it('handles URLs with query parameters', () => {
    expect(extractFolderId('https://drive.google.com/drive/folders/abc123?usp=sharing')).toBe('abc123');
  });

  it('trims surrounding whitespace', () => {
    expect(extractFolderId('  https://drive.google.com/drive/folders/abc123  ')).toBe('abc123');
  });
});

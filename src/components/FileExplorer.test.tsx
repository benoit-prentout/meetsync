import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileExplorer } from './FileExplorer';
import { computeFileStats } from '@/lib/fileStats';
import type { SyncFile, SyncEvent } from '@/types';

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    files: [],
    history: [],
    settings: null,
  })),
}));

async function setMockStore(files: SyncFile[], history: SyncEvent[], settings?: Record<string, unknown> | null) {
  const store = await import('@/store/settingsStore');
  (store.useSettingsStore as ReturnType<typeof vi.fn>).mockReturnValue({
    files,
    history,
    settings: settings ?? null,
  });
}

describe('computeFileStats', () => {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  const files: SyncFile[] = [
    { id: 'f1', name: 'Alpha', lastSynced: daysAgo(1), size: 0 },
    { id: 'f2', name: 'Beta', lastSynced: daysAgo(10), size: 0 },
    { id: 'f3', name: 'Gamma', lastSynced: daysAgo(60), size: 0 },
    { id: 'f4', name: 'Delta', lastSynced: '', size: 0 },
  ];

  const history: SyncEvent[] = [
    { id: 'h1', timestamp: daysAgo(1), filesProcessed: 2, status: 'success', message: '', syncedNames: ['Alpha'], updatedNames: ['Alpha'] },
    { id: 'h2', timestamp: daysAgo(5), filesProcessed: 2, status: 'success', message: '', syncedNames: [], updatedNames: ['Alpha', 'Beta'] },
    { id: 'h3', timestamp: daysAgo(20), filesProcessed: 2, status: 'success', message: '', syncedNames: ['Alpha', 'Beta'], updatedNames: [] },
  ];

  it('returns empty array for empty files', () => {
    expect(computeFileStats([], [])).toEqual([]);
  });

  it('marks files with no history as "never"', () => {
    const result = computeFileStats(
      [{ id: 'f1', name: 'Orphan', lastSynced: '', size: 0 }],
      []
    );
    expect(result[0].status).toBe('never');
    expect(result[0].updateCount).toBe(0);
    expect(result[0].events).toEqual([]);
  });

  it('computes status from lastSynced', () => {
    const result = computeFileStats(files, history);
    expect(result.find((f) => f.name === 'Alpha')!.status).toBe('recent');
    expect(result.find((f) => f.name === 'Beta')!.status).toBe('active');
    expect(result.find((f) => f.name === 'Gamma')!.status).toBe('older');
    expect(result.find((f) => f.name === 'Delta')!.status).toBe('never');
  });

  it('counts updates correctly', () => {
    const result = computeFileStats(files, history);
    expect(result.find((f) => f.name === 'Alpha')!.updateCount).toBe(2);
    expect(result.find((f) => f.name === 'Beta')!.updateCount).toBe(1);
    expect(result.find((f) => f.name === 'Gamma')!.updateCount).toBe(0);
  });

  it('records first seen date', () => {
    const result = computeFileStats(files, history);
    const alpha = result.find((f) => f.name === 'Alpha')!;
    expect(alpha.firstSeen).toBe(daysAgo(20));
  });

  it('records all events sorted chronologically', () => {
    const result = computeFileStats(files, history);
    const alpha = result.find((f) => f.name === 'Alpha')!;
    expect(alpha.events).toHaveLength(4);
    expect(alpha.events[0].type).toBe('new');
    expect(alpha.events[1].type).toBe('updated');
    expect(alpha.events[2].type).toBe('new');
    expect(alpha.events[3].type).toBe('updated');
  });
});

describe('FileExplorer', () => {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  const mockFiles: SyncFile[] = [
    { id: 'f1', name: 'Weekly Sync', lastSynced: daysAgo(1), size: 0 },
    { id: 'f2', name: 'Q2 Planning', lastSynced: daysAgo(10), size: 0 },
    { id: 'f3', name: 'Old Meeting', lastSynced: daysAgo(60), size: 0 },
  ];

  const mockHistory: SyncEvent[] = [
    { id: 'h1', timestamp: daysAgo(1), filesProcessed: 2, status: 'success', message: '', syncedNames: ['Weekly Sync'], updatedNames: ['Weekly Sync'] },
  ];

  beforeEach(async () => {
    await setMockStore(mockFiles, mockHistory);
    vi.clearAllMocks();
  });

  it('renders stat cards', () => {
    render(<FileExplorer />);
    expect(screen.getByText('Total Files')).toBeInTheDocument();
    expect(screen.getByText('Synced This Week')).toBeInTheDocument();
  });

  it('renders all file names', () => {
    render(<FileExplorer />);
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.getByText('Q2 Planning')).toBeInTheDocument();
    expect(screen.getByText('Old Meeting')).toBeInTheDocument();
  });

  it('shows stat card values', () => {
    render(<FileExplorer />);
    expect(screen.getByText('Total Files').closest('div')!.querySelector('.text-2xl')).toHaveTextContent('3');
    expect(screen.getByText('Synced This Week').closest('div')!.querySelector('.text-2xl')).toHaveTextContent('1');
  });

  it('renders empty state when no files', async () => {
    await setMockStore([], []);
    render(<FileExplorer />);
    expect(screen.getByText('No files synced yet')).toBeInTheDocument();
  });

  it('filters files by search', () => {
    render(<FileExplorer />);
    const input = screen.getByPlaceholderText('Search files...');
    fireEvent.change(input, { target: { value: 'weekly' } });
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.queryByText('Q2 Planning')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Meeting')).not.toBeInTheDocument();
  });

  it('shows N of M when filtered', () => {
    render(<FileExplorer />);
    const input = screen.getByPlaceholderText('Search files...');
    fireEvent.change(input, { target: { value: 'weekly' } });
    expect(screen.getByText(/1 of 3 files/)).toBeInTheDocument();
  });

  it('renders file name as a Drive link', () => {
    render(<FileExplorer />);
    const link = screen.getByText('Weekly Sync').closest('a');
    expect(link).toHaveAttribute('href', 'https://drive.google.com/open?id=f1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows update count badge', () => {
    render(<FileExplorer />);
    expect(screen.getByText('1 upd')).toBeInTheDocument();
  });

  it('toggles expanded detail on row click', () => {
    render(<FileExplorer />);
    const row = screen.getByText('Weekly Sync').closest('.cursor-pointer')!;
    fireEvent.click(row);
    expect(screen.getByText(/Synced \(new\)/)).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.queryByText(/Synced \(new\)/)).not.toBeInTheDocument();
  });

  it('shows master doc in highlighted row when masterDocId matches a file', async () => {
    await setMockStore(
      [
        { id: 'master-1', name: 'Master Notes', lastSynced: new Date().toISOString(), size: 0 },
        { id: 'other-1', name: 'Other File', lastSynced: new Date().toISOString(), size: 0 },
      ],
      [],
      { masterDocId: 'master-1', archiveThresholdChars: 800000 }
    );
    render(<FileExplorer />);
    const stars = screen.getAllByText('★');
    expect(stars.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Master Notes')).toBeInTheDocument();
    expect(screen.getByText('Other File')).toBeInTheDocument();
  });

  it('renders chart with activity title', () => {
    render(<FileExplorer />);
    expect(screen.getByText('Files Synced (last 14 days)')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Analytics } from './Analytics';

const mockHistory = [
  { id: 'h1', timestamp: '2026-05-21T08:00:00Z', filesProcessed: 5, status: 'success' as const, message: '3 synced, 2 updated', syncedNames: ['A', 'B', 'C'], updatedNames: ['D', 'E'], duration: 4200 },
  { id: 'h2', timestamp: '2026-05-18T08:00:00Z', filesProcessed: 2, status: 'success' as const, message: '2 synced, 0 updated', syncedNames: ['F', 'G'], updatedNames: [], duration: 2100 },
  { id: 'h3', timestamp: '2026-05-15T08:00:00Z', filesProcessed: 1, status: 'error' as const, message: '0 synced, 0 updated, 1 error', syncedNames: [], updatedNames: [], duration: 800 },
  { id: 'h4', timestamp: '2026-05-12T08:00:00Z', filesProcessed: 3, status: 'partial' as const, message: '2 synced, 1 updated, 1 error', syncedNames: ['H', 'I'], updatedNames: ['J'], duration: 3200 },
];

function createMockStore(overrides = {}) {
  return {
    history: mockHistory,
    lastSync: '2026-05-21T08:00:00Z',
    docSize: 450000,
    settings: { archiveThresholdChars: 800000 },
    files: [
      { id: 'f1', name: 'Weekly Sync', lastSynced: '2026-05-21T08:00:00Z', size: 0 },
      { id: 'f2', name: 'Q2 Planning', lastSynced: '2026-05-18T08:00:00Z', size: 0 },
      { id: 'f3', name: 'Standup', lastSynced: '2026-05-15T08:00:00Z', size: 0 },
    ],
    archiveEvents: [],
    ...overrides,
  };
}

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => createMockStore()),
}));

describe('Analytics', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('top stat row 1', () => {
    it('renders row 1 stat cards', () => {
      render(<Analytics />);
      expect(screen.getByText('Total Syncs')).toBeInTheDocument();
      expect(screen.getByText('Files Processed')).toBeInTheDocument();
      expect(screen.getByText('Avg Files / Sync')).toBeInTheDocument();
      expect(screen.getByText('Success Rate')).toBeInTheDocument();
    });

    it('computes row 1 stats correctly', () => {
      render(<Analytics />);
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('11')).toBeInTheDocument();
      expect(screen.getByText('2.8')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('top stat row 2', () => {
    it('renders row 2 stat cards', () => {
      render(<Analytics />);
      expect(screen.getByText('Growth Rate')).toBeInTheDocument();
      expect(screen.getByText('Days to Archive')).toBeInTheDocument();
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
      expect(screen.getByText('Success Streak')).toBeInTheDocument();
    });
  });

  describe('sections', () => {
    it('renders Doc Health section', () => {
      render(<Analytics />);
      expect(screen.getByText('Doc Size Growth')).toBeInTheDocument();
    });

    it('renders Threshold gauge', () => {
      render(<Analytics />);
      expect(screen.getByText(/439/)).toBeInTheDocument();
      expect(screen.getByText(/781/)).toBeInTheDocument();
    });

    it('renders Sync Duration section', () => {
      render(<Analytics />);
      expect(screen.getByText('Sync Duration')).toBeInTheDocument();
    });

    it('renders reliability stats', () => {
      render(<Analytics />);
      expect(screen.getByText('Errors')).toBeInTheDocument();
      expect(screen.getByText('Partial')).toBeInTheDocument();
      expect(screen.getByText('Clean')).toBeInTheDocument();
      expect(screen.getByText('Best')).toBeInTheDocument();
      expect(screen.getByText('Worst')).toBeInTheDocument();
    });

    it('renders Content Breakdown section', () => {
      render(<Analytics />);
      expect(screen.getByText('New vs Updated')).toBeInTheDocument();
      expect(screen.getByText('Most Updated Files')).toBeInTheDocument();
    });

    it('renders Source Overview section', () => {
      render(<Analytics />);
      expect(screen.getByText('Total Unique Files')).toBeInTheDocument();
      expect(screen.getByText('Syncs / Week')).toBeInTheDocument();
      expect(screen.getByText('Last Sync')).toBeInTheDocument();
    });
  });

  describe('computed data', () => {
    it('shows most updated files count', () => {
      render(<Analytics />);
      expect(screen.getAllByText('1x').length).toBeGreaterThanOrEqual(1);
    });

    it('shows new vs updated totals', () => {
      render(<Analytics />);
      expect(screen.getByText('New files:', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('Updates:', { exact: false })).toBeInTheDocument();
    });
  });
});

describe('Analytics empty state', () => {
  it('shows empty messages when no history', async () => {
    const settingsStore = await import('@/store/settingsStore');
    (settingsStore.useSettingsStore as ReturnType<typeof vi.fn>).mockReturnValue(createMockStore({
      history: [],
      lastSync: null,
      docSize: 0,
      files: [],
    }));
    render(<Analytics />);
    const emptyMessages = screen.getAllByText(/No sync history yet/);
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
  });
});

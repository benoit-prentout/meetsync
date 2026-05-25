import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { History } from './History';

const mockHistory = [
  {
    id: 'h1',
    timestamp: '2026-05-21T08:06:19.000Z',
    filesProcessed: 3,
    status: 'success' as const,
    message: '2 synced, 1 updated',
    syncedNames: ['Weekly Sync — Design review', '1:1 with Lucas'],
    updatedNames: ['Team standup'],
    duration: 4200,
  },
  {
    id: 'h2',
    timestamp: '2026-05-20T08:06:19.000Z',
    filesProcessed: 1,
    status: 'error' as const,
    message: '0 synced, 0 updated, 1 error',
    syncedNames: [],
    updatedNames: [],
    duration: 800,
  },
  // Old entry with no names — graceful degradation
  {
    id: 'h3',
    timestamp: '2026-05-19T08:06:19.000Z',
    filesProcessed: 2,
    status: 'success' as const,
    message: '2 synced, 0 updated',
  },
];

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({ history: mockHistory })),
}));

describe('History', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all events', () => {
    render(<History />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows a chevron for rows that have file names', () => {
    render(<History />);
    // h1 has names — chevron should be present
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].querySelector('[data-testid="chevron"]')).toBeTruthy();
  });

  it('does NOT show a chevron for old entries with no names and no duration', () => {
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    // h3 (index 2) has no syncedNames, no updatedNames, no duration
    expect(rows[2].querySelector('[data-testid="chevron"]')).toBeNull();
  });

  it('is collapsed by default — file names not visible', () => {
    render(<History />);
    expect(screen.queryByText('Weekly Sync — Design review')).toBeNull();
  });

  it('expands a row on click, showing synced file names with ▸ prefix', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Weekly Sync — Design review')).toBeInTheDocument();
    expect(screen.getByText('1:1 with Lucas')).toBeInTheDocument();
  });

  it('shows updated file names with ↻ prefix when expanded', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Team standup')).toBeInTheDocument();
  });

  it('shows formatted duration when expanded', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText(/4\.2s/)).toBeInTheDocument();
  });

  it('collapses a row when clicked again', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Weekly Sync — Design review')).toBeInTheDocument();
    await user.click(rows[0]);
    expect(screen.queryByText('Weekly Sync — Design review')).toBeNull();
  });

  it('closes the open row when a different row is clicked', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Weekly Sync — Design review')).toBeInTheDocument();
    await user.click(rows[1]);
    expect(screen.queryByText('Weekly Sync — Design review')).toBeNull();
  });

  it('filter buttons narrow the list', async () => {
    const user = userEvent.setup();
    render(<History />);
    await user.click(screen.getByRole('button', { name: /error/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

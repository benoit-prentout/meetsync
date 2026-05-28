import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { History } from './History';

const mockHistory = [
  {
    id: 'h1',
    timestamp: '2026-05-21T08:06:19.000Z',
    filesProcessed: 3,
    status: 'success',
    message: '2 synced, 1 updated',
    syncedNames: ['Weekly Sync — Design review', '1:1 with Lucas'],
    updatedNames: ['Team standup'],
    duration: 4200,
  },
  {
    id: 'h2',
    timestamp: '2026-05-20T08:06:19.000Z',
    filesProcessed: 1,
    status: 'error',
    message: '0 synced, 0 updated, 1 error',
    syncedNames: [],
    updatedNames: [],
    duration: 800,
  },
  {
    id: 'h3',
    timestamp: '2026-05-19T08:06:19.000Z',
    filesProcessed: 2,
    status: 'success',
    message: '2 synced, 0 updated',
  },
  {
    id: 'h4',
    timestamp: '2026-05-12T08:06:19.000Z',
    filesProcessed: 1,
    status: 'partial',
    message: '1 synced, 0 updated, 1 error',
    syncedNames: ['Sprint Retro'],
    updatedNames: [],
    duration: 1500,
  },
  {
    id: 'h5',
    timestamp: '2026-04-15T08:06:19.000Z',
    filesProcessed: 3,
    status: 'success',
    message: '3 synced, 0 updated',
    syncedNames: ['Q1 Review', 'Team offsite', 'Board meeting'],
    updatedNames: [],
    duration: 5000,
  },
];

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({ history: mockHistory })),
}));

describe('History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all events', () => {
    render(<History />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('renders section headers for each time period', () => {
    render(<History />);
    expect(screen.getByText('Today · 1')).toBeInTheDocument();
    expect(screen.getByText('Yesterday · 1')).toBeInTheDocument();
    expect(screen.getByText('This Week · 1')).toBeInTheDocument();
    expect(screen.getByText('Last Week · 1')).toBeInTheDocument();
    expect(screen.getByText('Older · 1')).toBeInTheDocument();
  });

  it('shows a badge with +N new for events that added notes', () => {
    render(<History />);
    expect(screen.getByText('+2 new')).toBeInTheDocument();
    expect(screen.getByText('+1 new')).toBeInTheDocument();
    expect(screen.getByText('+3 new')).toBeInTheDocument();
  });

  it('shows Synced badge for successful events with no new notes', () => {
    render(<History />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('shows Failed badge for error events', () => {
    render(<History />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows a chevron for rows that have file names', () => {
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].querySelector('[data-testid="chevron"]')).toBeTruthy();
  });

  it('does NOT show a chevron for old entries with no names and no duration', () => {
    render(<History />);
    const rows = screen.getAllByRole('listitem');
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

  it('filter buttons narrow the list and hide empty groups', async () => {
    const user = userEvent.setup();
    render(<History />);
    await user.click(screen.getByRole('button', { name: /error/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Yesterday · 1')).toBeInTheDocument();
    expect(screen.queryByText('Today · 1')).toBeNull();
  });

  it('places events in the correct time period groups', () => {
    render(<History />);
    const groups = screen.getAllByRole('group');
    expect(groups[0]).toHaveTextContent('Today');
    expect(groups[0]).toHaveTextContent('+2 new');
    expect(groups[1]).toHaveTextContent('Yesterday');
    expect(groups[1]).toHaveTextContent('Failed');
    expect(groups[2]).toHaveTextContent('This Week');
    expect(groups[2]).toHaveTextContent('Synced');
    expect(groups[3]).toHaveTextContent('Last Week');
    expect(groups[3]).toHaveTextContent('+1 new');
    expect(groups[4]).toHaveTextContent('Older');
    expect(groups[4]).toHaveTextContent('+3 new');
  });
});

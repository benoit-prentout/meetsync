import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalyticsChart } from './AnalyticsChart';

describe('AnalyticsChart', () => {
  it('renders the title', () => {
    render(<AnalyticsChart title="Doc Growth" isEmpty={false} emptyMessage="">content</AnalyticsChart>);
    expect(screen.getByText('Doc Growth')).toBeInTheDocument();
  });

  it('shows empty message when isEmpty is true and hides children', () => {
    render(<AnalyticsChart title="Test" isEmpty={true} emptyMessage="Not enough data">content</AnalyticsChart>);
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders children when not empty', () => {
    render(<AnalyticsChart title="Test" isEmpty={false} emptyMessage=""><div>chart content</div></AnalyticsChart>);
    expect(screen.getByText('chart content')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): JSX.Element {
  throw new Error('Kaboom');
}

describe('ErrorBoundary', () => {
  it('catches a render-time error and shows the recovery card', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/Kaboom/)).toBeTruthy();
    spy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });
});

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] render-time error', error, info);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="m-6 max-w-xl rounded-md border border-red-300 bg-red-50 p-4 text-red-900">
          <h2 className="text-lg font-semibold">Something went wrong.</h2>
          <p className="mt-1 text-sm">The UI crashed. Reloading often fixes it. If it keeps happening, copy this and report it:</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-red-100 p-2 text-xs">{this.state.error.message}</pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-3 rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

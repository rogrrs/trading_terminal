import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Compact variant for panels, full page for the app root. */
  variant?: 'page' | 'panel';
}

interface State {
  error: Error | null;
}

/**
 * React 19 unmounts the whole tree on an uncaught render error, which looks
 * like a blank page. This boundary keeps the shell alive and explains what
 * happened instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[trading-terminal] UI error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const { variant = 'page' } = this.props;

    if (variant === 'panel') {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-xs font-medium text-foreground">Панель не смогла отрисоваться</p>
          <p className="max-w-[280px] text-[11px] break-words text-muted-foreground">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-md border bg-secondary px-2 py-1 text-[11px] hover:bg-accent"
          >
            Перезапустить панель
          </button>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <h1 className="text-base font-semibold">Терминал не смог отрисоваться</h1>
        <p className="max-w-[520px] text-xs break-words text-muted-foreground">
          {this.state.error.message}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Попробовать снова
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Перезагрузить страницу
        </button>
      </div>
    );
  }
}

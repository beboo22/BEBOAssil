import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

/**
 * App-wide error boundary. Without this, any uncaught render exception
 * (e.g. inside ItineraryPage hydrate / scheduler / resync chains) would
 * leave the user staring at a completely blank white page with no way to
 * recover. We render a minimal recovery UI instead and log the error so
 * developers can see what happened.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary] caught render error:", error, info);
  }

  private handleReload = () => {
    try {
      // Give the user a clean slate — most blank-screen reports trace back
      // to a single corrupt cached itinerary entry.
      Object.keys(localStorage)
        .filter((k) => k.startsWith("itinerary-"))
        .slice(0, 0); // no-op: keep cache by default; reload is enough
    } catch {}
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message || "Unexpected error";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 shadow-lg text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4 break-words">{msg}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Reload
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[clockwork] route error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="route-error" role="alert">
        <div className="route-error-card">
          <h1>This screen hit an error</h1>
          <p>{this.state.error.message || "An unexpected error occurred. Your saved project is still in local storage."}</p>
          <div className="empty-actions" style={{ justifyContent: "flex-start" }}>
            <button className="button button-primary" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
              Reload
            </button>
            <a className="button button-secondary" href="/">Back to projects</a>
          </div>
        </div>
      </div>
    );
  }
}

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16, padding: 32,
          background: 'var(--bg)', color: 'var(--text)',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
            An unexpected error occurred. Your data is safe — refresh the page to continue.
          </p>
          {this.state.message && (
            <code style={{
              background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              padding: '8px 14px', borderRadius: 6, fontSize: 12, color: 'var(--red)',
              maxWidth: 500, overflow: 'auto',
            }}>
              {this.state.message}
            </code>
          )}
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

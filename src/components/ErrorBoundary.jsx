'use client';
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', backgroundColor: '#500', color: 'white', fontFamily: 'monospace', minHeight: '100vh' }}>
          <h1 style={{color:'yellow'}}>CRITICAL CLIENT CRASH</h1>
          <p>Please share this error string with the AI:</p>
          <pre style={{ background: '#222', padding: '1rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ background: '#111', padding: '1rem', whiteSpace: 'pre-wrap', fontSize: '10px' }}>
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

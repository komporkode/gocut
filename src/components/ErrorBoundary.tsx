import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "240px",
            height: "100%",
            width: "100%",
            background: "#121217",
            color: "#e2e8f0",
            padding: "24px",
            boxSizing: "border-box",
            borderRadius: "8px",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "12px",
              color: "#ef4444",
              fontSize: "20px",
            }}
          >
            ⚠️
          </div>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600 }}>
            {this.props.fallbackTitle ?? "Terjadi kendala visual pada komponen"}
          </h3>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "12px",
              color: "#94a3b8",
              maxWidth: "480px",
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}
          >
            {this.state.error?.message ?? "Terjadi kesalahan internal. Silakan muat ulang komponen."}
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={this.handleReset}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Pulihkan Komponen
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#e2e8f0",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

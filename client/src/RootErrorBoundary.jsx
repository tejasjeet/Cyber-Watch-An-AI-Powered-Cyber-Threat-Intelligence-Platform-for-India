import { Component } from "react";

export default class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "2rem",
            background: "#050a12",
            color: "#fecaca",
            fontFamily: "system-ui, sans-serif",
            maxWidth: "42rem",
          }}
        >
          <h1 style={{ fontSize: "1rem", letterSpacing: "0.08em", color: "#f1f5f9" }}>
            UI failed to render
          </h1>
          <pre
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "#0f172a",
              borderRadius: "8px",
              overflow: "auto",
              fontSize: "0.8rem",
              color: "#fca5a5",
              whiteSpace: "pre-wrap",
            }}
          >
            {String(this.state.err?.message || this.state.err)}
            {this.state.err?.stack ? `\n\n${this.state.err.stack}` : ""}
          </pre>
          <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#94a3b8" }}>
            Open DevTools (F12) → Console for details. If this mentions Leaflet or the map, try{" "}
            <code style={{ color: "#7dd3fc" }}>/map</code> after a refresh, or run{" "}
            <code style={{ color: "#7dd3fc" }}>npm run prepare:geo</code> from <code>client/</code>.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

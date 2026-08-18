import { Component } from "react"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("Error no capturado en la interfaz:", error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24, background: "#0f1923",
        color: "#e2e8f0", fontFamily: "inherit",
      }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            Ocurrió un error al mostrar esta pantalla.
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, wordBreak: "break-word" }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button onClick={() => window.location.reload()} style={{
            background: "#2563eb", color: "white", border: "none",
            borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer",
          }}>
            RECARGAR
          </button>
        </div>
      </div>
    )
  }
}

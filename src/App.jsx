import { useState, useEffect } from "react"
import { INITIAL_WORKERS, INITIAL_PARTIDAS, INITIAL_FRENTES, INITIAL_TIPOS_HORA, DEFAULT_PROJECT_CONFIG } from "./data/defaults"
import { INITIAL_ACTIVIDADES } from "./data/actividades"
import VoiceRecorder from "./components/VoiceRecorder"
import ManualEntry from "./components/ManualEntry"
import Summary from "./components/Summary"
import Config from "./components/Config"
import { fetchRegistros } from "./utils/supabaseClient"
import "./App.css"

const TABS = [
  { id: "registro", label: "Registro por Voz" },
  { id: "manual", label: "Ingreso Manual" },
  { id: "resumen", label: "Resumen" },
  { id: "config", label: "Configuración" },
]

export default function App() {
  const [tab, setTab] = useState("registro")
  const [workers, setWorkers] = useState(INITIAL_WORKERS)
  const [partidas, setPartidas] = useState(INITIAL_PARTIDAS)
  const [actividades, setActividades] = useState(INITIAL_ACTIVIDADES)
  const [frentes, setFrentes] = useState(INITIAL_FRENTES)
  const [tiposHora, setTiposHora] = useState(INITIAL_TIPOS_HORA)
  const [projectConfig, setProjectConfig] = useState(DEFAULT_PROJECT_CONFIG)
  const [registros, setRegistros] = useState([])
  const [fechaTareo, setFechaTareo] = useState(new Date().toISOString().split("T")[0])

  useEffect(() => {
    async function loadData() {
      const data = await fetchRegistros(fechaTareo)
      setRegistros(data)
    }
    loadData()
  }, [fechaTareo])

  const getPartidaNombre = (id) => {
    const p = partidas.find((p) => p.id === id)
    return p ? `${p.id} - ${p.nombre}` : id
  }

  const getFrenteNombre = (id) => {
    const f = frentes.find((f) => f.id === id)
    return f ? f.nombre : id
  }

  return (
    <div className="app-root">
      <div className="app-container">
        <div className="header">
          <h1 className="title">Tareador</h1>
          <span className="subtitle">CONTROL DE HORAS HOMBRE</span>
          <div className="date-display" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, textTransform: "uppercase", color: "#8ab4c8" }}>Fecha:</label>
            <input 
              type="date" 
              value={fechaTareo} 
              onChange={(e) => setFechaTareo(e.target.value)}
              className="input-field mono"
              style={{ backgroundColor: "#2a3a4a", color: "#c8d6e5", padding: "4px 8px", border: "1px solid #4a6a8a" }}
            />
          </div>
        </div>

        <div className="tab-bar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`tab-button ${tab === t.id ? "tab-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "registro" && (
          <VoiceRecorder
            workers={workers}
            partidas={partidas}
            actividades={actividades}
            frentes={frentes}
            registros={registros}
            setRegistros={setRegistros}
            fechaTareo={fechaTareo}
            getPartidaNombre={getPartidaNombre}
            getFrenteNombre={getFrenteNombre}
          />
        )}

        {tab === "manual" && (
          <ManualEntry
            workers={workers}
            partidas={partidas}
            actividades={actividades}
            frentes={frentes}
            setRegistros={setRegistros}
            fechaTareo={fechaTareo}
          />
        )}

        {tab === "resumen" && (
          <Summary
            registros={registros}
            workers={workers}
            partidas={partidas}
            actividades={actividades}
            frentes={frentes}
            tiposHora={tiposHora}
            projectConfig={projectConfig}
            getPartidaNombre={getPartidaNombre}
            getFrenteNombre={getFrenteNombre}
          />
        )}

        {tab === "config" && (
          <Config
            workers={workers}
            setWorkers={setWorkers}
            partidas={partidas}
            setPartidas={setPartidas}
            frentes={frentes}
            setFrentes={setFrentes}
            tiposHora={tiposHora}
            setTiposHora={setTiposHora}
            projectConfig={projectConfig}
            setProjectConfig={setProjectConfig}
          />
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from "react"
import { INITIAL_WORKERS, INITIAL_PARTIDAS, INITIAL_FRENTES, INITIAL_TIPOS_HORA, DEFAULT_PROJECT_CONFIG } from "./data/defaults"
import { INITIAL_ACTIVIDADES } from "./data/actividades"
import VoiceRecorder from "./components/VoiceRecorder"
import ManualEntry from "./components/ManualEntry"
import Summary from "./components/Summary"
import Config from "./components/Config"
import { fetchRegistros } from "./utils/supabaseClient"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import Login from "./components/Login"
import "./App.css"

const TABS = [
  { id: "registro", label: "Registro por Voz" },
  { id: "manual", label: "Ingreso Manual" },
  { id: "resumen", label: "Resumen" },
  { id: "config", label: "Configuración", adminOnly: true },
]

function AppContent() {
  const { user, profile, logout } = useAuth()
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
    if (user) {
      loadData()
    }
  }, [fechaTareo, user])

  const getPartidaNombre = (id) => {
    const p = partidas.find((p) => p.id === id)
    return p ? `${p.id} - ${p.nombre}` : id
  }

  const getFrenteNombre = (id) => {
    const f = frentes.find((f) => f.id === id)
    return f ? f.nombre : id
  }

  if (!user) {
    return <Login />
  }

  const visibleTabs = TABS.filter(t => !t.adminOnly || profile?.role === 'admin')

  // Redirigir a "registro" o "manual" si estaba en config y le sacan el rol de admin abruptamente
  if (tab === 'config' && profile?.role !== 'admin') {
    setTab("registro")
  }

  return (
    <div className="app-root">
      <div className="app-container">
        <div className="header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="title">Tareador</h1>
              <span className="subtitle">CONTROL DE HORAS HOMBRE</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: '#8ab4c8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  backgroundColor: profile?.role === 'admin' ? 'rgba(255, 99, 71, 0.2)' : 'rgba(100, 255, 218, 0.2)', 
                  color: profile?.role === 'admin' ? '#ff6347' : '#64ffda',
                  padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' 
                }}>
                  {profile?.role === 'admin' ? 'ADMIN' : 'USUARIO'}
                </span>
                {user.email}
              </div>
              <button 
                onClick={logout} 
                style={{ background: 'transparent', border: '1px solid #4a6a8a', color: '#8ab4c8', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                Cerrar Sesión
              </button>
            </div>
          </div>
          
          <div className="date-display" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: '15px' }}>
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
          {visibleTabs.map((t) => (
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

        {tab === "config" && profile?.role === 'admin' && (
          <Config
            workers={workers}
            setWorkers={setWorkers}
            partidas={partidas}
            setPartidas={setPartidas}
            frentes={frentes}
            setFrentes={setFrentes}
            actividades={actividades}
            setActividades={setActividades}
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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

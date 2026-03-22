import { useState, useEffect } from "react"
import { INITIAL_WORKERS, INITIAL_PARTIDAS, INITIAL_FRENTES, INITIAL_TIPOS_HORA, DEFAULT_PROJECT_CONFIG } from "./data/defaults"
import { INITIAL_ACTIVIDADES } from "./data/actividades"
import VoiceRecorder from "./components/VoiceRecorder"
import ManualEntry from "./components/ManualEntry"
import MobileEntry from "./components/MobileEntry"
import WeeklyControl from "./components/WeeklyControl"
import Summary from "./components/Summary"
import AIAssistant from "./components/AIAssistant"
import Config from "./components/Config"
import { fetchRegistros } from "./utils/supabaseClient"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import Login from "./components/Login"
import {
  SparklesIcon,
  MicIcon,
  PlusIcon,
  ChartIcon,
  SettingsIcon,
  UsersIcon,
  LayoutIcon
} from "./components/Icons"
import "./App.css"

const TABS = [
  { id: "mobile", label: "Carga Grupal", icon: UsersIcon },
  { id: "weekly", label: "Control Semanal", icon: LayoutIcon },
  { id: "manual", label: "Manual", icon: PlusIcon },
  { id: "registro", label: "Voz", icon: MicIcon },
  { id: "resumen", label: "Planilla", icon: ChartIcon },
  { id: "ai", label: "Asistente", icon: SparklesIcon },
  { id: "config", label: "Config", icon: SettingsIcon, adminOnly: true },
]

function AppContent() {
  const { user, profile, logout } = useAuth()
  const [tab, setTab] = useState("mobile")
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
      const current = new Date(fechaTareo)
      const day = current.getDay()
      const diffToMonday = current.getDate() - (day === 0 ? 6 : day - 1)
      
      const monday = new Date(current.setDate(diffToMonday))
      monday.setHours(0, 0, 0, 0)
      
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)

      const startStr = monday.toISOString().split("T")[0]
      const endStr = sunday.toISOString().split("T")[0]
      
      const data = await fetchRegistros(startStr, endStr)
      setRegistros(data)
    }
    if (user) {
      loadData()
    }
  }, [fechaTareo, user])

  if (!user) {
    return <Login />
  }

  const visibleTabs = TABS.filter(t => !t.adminOnly || profile?.role === 'admin')

  const getPartidaNombre = (id) => {
    const p = partidas.find((p) => String(p.id) === String(id))
    return p ? p.nombre : id
  }

  const getFrenteNombre = (id) => {
    const f = frentes.find((f) => f.id === id)
    return f ? f.nombre : id
  }

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1 className="title" style={{ fontSize: '24px' }}>TAREADOR</h1>
          <span className="subtitle" style={{ fontSize: '9px' }}>S10 PROFESSIONAL</span>
        </div>
        
        <nav className="sidebar-nav">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`sidebar-item ${tab === t.id ? "active" : ""}`}
            >
              <t.icon />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ padding: '0 12px 16px 12px', fontSize: '12px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.email}
          </div>
          <button onClick={logout} className="sidebar-item" style={{ color: '#ef4444' }}>
            <span style={{ fontSize: '18px' }}>⏻</span>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      <div className="app-container">
        <header className="header" style={{ marginBottom: '24px' }}>
          <div className="title-group">
            <h1 className="title">
              {visibleTabs.find(t => t.id === tab)?.label || "TAREADOR"}
            </h1>
            <span className="subtitle">CONTROL DE PROYECTO</span>
          </div>
          <div className="date-display mono">
            <input 
              type="date" 
              value={fechaTareo} 
              onChange={(e) => setFechaTareo(e.target.value)}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', padding: '8px 12px', borderRadius: '8px', color: 'var(--accent-gold)', fontWeight: 'bold', fontFamily: 'inherit' }}
            />
          </div>
        </header>

        <main style={{ paddingBottom: '20px' }}>
          {tab === "mobile" && (
            <MobileEntry 
              workers={workers} 
              frentes={frentes} 
              actividades={actividades} 
              setRegistros={setRegistros} 
              fechaTareo={fechaTareo} 
            />
          )}

          {tab === "weekly" && (
            <WeeklyControl
              workers={workers}
              partidas={partidas}
              actividades={actividades}
              frentes={frentes}
              registros={registros}
              setRegistros={setRegistros}
              fechaTareo={fechaTareo}
            />
          )}

          {tab === "registro" && (
            <VoiceRecorder
              workers={workers}
              partidas={partidas}
              actividades={actividades}
              frentes={frentes}
              registros={registros}
              setRegistros={setRegistros}
              getPartidaNombre={getPartidaNombre}
              getFrenteNombre={getFrenteNombre}
              fechaTareo={fechaTareo}
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
              setRegistros={setRegistros}
              workers={workers}
              partidas={partidas}
              actividades={actividades}
              frentes={frentes}
              fechaTareo={fechaTareo}
              setFechaTareo={setFechaTareo}
              getPartidaNombre={getPartidaNombre}
              getFrenteNombre={getFrenteNombre}
            />
          )}

          {tab === "ai" && (
            <AIAssistant
              workers={workers}
              registros={registros}
              actividades={actividades}
              fechaTareo={fechaTareo}
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

          {/* Build Version Tag */}
          <div style={{ pointerEvents: 'none', position: 'fixed', bottom: 4, right: 10, fontSize: '8px', color: 'var(--text-dim)', opacity: 0.5, zIndex: 3000 }}>
            v1.1.9-STABLE-UI
          </div>
        </main>

        <nav className="bottom-nav">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-item ${tab === t.id ? "active" : ""}`}
            >
              <t.icon />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
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

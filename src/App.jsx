import { useState, useEffect, useRef } from "react"
import { INITIAL_WORKERS, INITIAL_PARTIDAS, INITIAL_FRENTES, INITIAL_TIPOS_HORA, DEFAULT_PROJECT_CONFIG } from "./data/defaults"
import { INITIAL_ACTIVIDADES } from "./data/actividades"
import VoiceRecorder from "./components/VoiceRecorder"
import ManualEntry from "./components/ManualEntry"
import MobileEntry from "./components/MobileEntry"
import WeeklyControl from "./components/WeeklyControl"
import Summary from "./components/Summary"
import AIAssistant from "./components/AIAssistant"
import Config from "./components/Config"
import Help from "./components/Help"
import Dashboard from "./components/Dashboard"
import { fetchAppSettings, fetchRegistros, saveAppSettings } from "./utils/supabaseClient"
import { getTodayLocalDate, getWeekRange } from "./utils/dateUtils"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import Login from "./components/Login"
import {
  SparklesIcon,
  MicIcon,
  PlusIcon,
  ChartIcon,
  SettingsIcon,
  UsersIcon,
  LayoutIcon,
  HelpIcon,
  BarChartIcon
} from "./components/Icons"
import "./App.css"

const STORAGE_KEYS = {
  workers: "tareador_workers",
  partidas: "tareador_partidas",
  actividades: "tareador_actividades",
  frentes: "tareador_frentes",
  tiposHora: "tareador_tipos_hora",
  projectConfig: "tareador_project_config",
}

function loadArrayFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch (error) {
    console.warn(`No se pudo leer ${key} desde localStorage:`, error)
    return fallback
  }
}

function loadProjectConfigFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.projectConfig)
    if (!raw) return DEFAULT_PROJECT_CONFIG

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object"
      ? { ...DEFAULT_PROJECT_CONFIG, ...parsed }
      : DEFAULT_PROJECT_CONFIG
  } catch (error) {
    console.warn("No se pudo leer projectConfig desde localStorage:", error)
    return DEFAULT_PROJECT_CONFIG
  }
}

const TABS = [
  { id: "dashboard", label: "Dashboard",       mobileLabel: "Dash",     icon: BarChartIcon },
  { id: "mobile",    label: "Carga Grupal",    mobileLabel: "Carga",    icon: UsersIcon },
  { id: "weekly",    label: "Control Semanal", mobileLabel: "Semanal",  icon: LayoutIcon },
  { id: "manual",    label: "Manual",          mobileLabel: "Manual",   icon: PlusIcon },
  { id: "registro",  label: "Voz",             mobileLabel: "Voz",      icon: MicIcon },
  { id: "resumen",   label: "Planilla",        mobileLabel: "Planilla", icon: ChartIcon },
  { id: "ai",        label: "Asistente",       mobileLabel: "IA",       icon: SparklesIcon, hideInBottomNav: true },
  { id: "ayuda",     label: "Ayuda",           mobileLabel: "Ayuda",    icon: HelpIcon, hideInBottomNav: true },
  { id: "config",    label: "Config",          mobileLabel: "Config",   icon: SettingsIcon, adminOnly: true },
]

function AppContent() {
  const { user, profile, logout } = useAuth()
  const cloudHydratedRef = useRef(false)
  const [tab, setTab] = useState("dashboard")
  const [workers, setWorkers] = useState(() => loadArrayFromStorage(STORAGE_KEYS.workers, INITIAL_WORKERS))
  const [partidas, setPartidas] = useState(() => loadArrayFromStorage(STORAGE_KEYS.partidas, INITIAL_PARTIDAS))
  const [actividades, setActividades] = useState(() => loadArrayFromStorage(STORAGE_KEYS.actividades, INITIAL_ACTIVIDADES))
  const [frentes, setFrentes] = useState(() => loadArrayFromStorage(STORAGE_KEYS.frentes, INITIAL_FRENTES))
  const [tiposHora, setTiposHora] = useState(() => loadArrayFromStorage(STORAGE_KEYS.tiposHora, INITIAL_TIPOS_HORA))
  const [projectConfig, setProjectConfig] = useState(() => loadProjectConfigFromStorage())
  const [registros, setRegistros] = useState([])
  const [fechaTareo, setFechaTareo] = useState(() => getTodayLocalDate())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.workers, JSON.stringify(workers))
    localStorage.setItem(STORAGE_KEYS.partidas, JSON.stringify(partidas))
    localStorage.setItem(STORAGE_KEYS.actividades, JSON.stringify(actividades))
    localStorage.setItem(STORAGE_KEYS.frentes, JSON.stringify(frentes))
    localStorage.setItem(STORAGE_KEYS.tiposHora, JSON.stringify(tiposHora))
    localStorage.setItem(STORAGE_KEYS.projectConfig, JSON.stringify(projectConfig))
  }, [workers, partidas, actividades, frentes, tiposHora, projectConfig])

  useEffect(() => {
    let active = true

    if (!user) {
      cloudHydratedRef.current = true
      return () => {
        active = false
      }
    }

    cloudHydratedRef.current = false

    async function hydrateCatalogs() {
      const remotePayload = await fetchAppSettings("catalogs")
      if (!active || !remotePayload || typeof remotePayload !== "object") {
        cloudHydratedRef.current = true
        return
      }

      if (Array.isArray(remotePayload.workers)) setWorkers(remotePayload.workers)
      if (Array.isArray(remotePayload.partidas)) setPartidas(remotePayload.partidas)
      if (Array.isArray(remotePayload.actividades)) setActividades(remotePayload.actividades)
      if (Array.isArray(remotePayload.frentes)) setFrentes(remotePayload.frentes)
      if (Array.isArray(remotePayload.tiposHora)) setTiposHora(remotePayload.tiposHora)
      if (remotePayload.projectConfig && typeof remotePayload.projectConfig === "object") {
        setProjectConfig({ ...DEFAULT_PROJECT_CONFIG, ...remotePayload.projectConfig })
      }

      cloudHydratedRef.current = true
    }

    hydrateCatalogs()

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user || !cloudHydratedRef.current) return

    const timeoutId = setTimeout(() => {
      saveAppSettings({
        workers,
        partidas,
        actividades,
        frentes,
        tiposHora,
        projectConfig,
      }, "catalogs")
    }, 700)

    return () => clearTimeout(timeoutId)
  }, [workers, partidas, actividades, frentes, tiposHora, projectConfig, user])

  useEffect(() => {
    async function loadData() {
      const { dates } = getWeekRange(fechaTareo)
      const startStr = dates[0]
      const endStr = dates[dates.length - 1]
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
          <span className="subtitle" style={{ fontSize: '12px' }}>S10 PROFESSIONAL</span>
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
              aria-label="Fecha de tareo"
              type="date" 
              value={fechaTareo} 
              onChange={(e) => setFechaTareo(e.target.value)}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', padding: '8px 12px', borderRadius: '8px', color: 'var(--accent-gold)', fontWeight: 'bold', fontFamily: 'inherit' }}
            />
          </div>
        </header>

        <main style={{ paddingBottom: '20px' }}>
          {tab === "dashboard" && (
            <Dashboard
              registros={registros}
              workers={workers}
              frentes={frentes}
              actividades={actividades}
              partidas={partidas}
              projectConfig={projectConfig}
              fechaTareo={fechaTareo}
            />
          )}

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
              tiposHora={tiposHora}
              projectConfig={projectConfig}
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

          {tab === "ayuda" && <Help />}

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
          <div style={{ pointerEvents: 'none', position: 'fixed', bottom: 4, right: 10, fontSize: '11px', color: 'var(--text-dim)', opacity: 0.65, zIndex: 3000 }}>
            v1.1.10-DYNAMIC
          </div>
        </main>

        <nav className="bottom-nav">
          {visibleTabs.filter(t => !t.hideInBottomNav).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-item ${tab === t.id ? "active" : ""}`}
            >
              <t.icon />
              <span>{t.mobileLabel || t.label}</span>
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

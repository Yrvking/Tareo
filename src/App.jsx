import { useState, useEffect, useRef, useCallback } from "react"
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
import VigilanciaPanel from "./components/VigilanciaPanel"
import PrevencionPanel from "./components/PrevencionPanel"
import ContractorPortalPanel from "./components/ContractorPortalPanel"
import {
  fetchAppSettings,
  fetchRegistros,
  getDataEventName,
  getPendingSyncCount,
  getSyncEventName,
  saveAppSettings,
  syncPendingRegistros,
} from "./utils/supabaseClient"
import { getTodayLocalDate, getWeekRange } from "./utils/dateUtils"
import { normalizeWorkersCollection } from "./utils/workerCategory"
import { mergeWorkers } from "./utils/s10Importer"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import {
  canAccessConfig,
  normalizeRole,
} from "./utils/accessControl"
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
  BarChartIcon,
  ShieldIcon,
  ClipboardCheckIcon,
  QrIcon,
} from "./components/Icons"
import projectLogo from "../LOGO.png"
import "./App.css"

const STORAGE_KEYS = {
  workers: "tareador_workers",
  partidas: "tareador_partidas",
  actividades: "tareador_actividades",
  frentes: "tareador_frentes",
  tiposHora: "tareador_tipos_hora",
  projectConfig: "tareador_project_config",
}

const isLocalDevHost = typeof window !== "undefined"
  && ["localhost", "127.0.0.1"].includes(window.location.hostname)
const LOCAL_DEV_FIXTURE_URL = "/dev-consolidado-s10.json"

function buildWorkerDateKey(record) {
  return `${String(record?.workerId || "")}|${String(record?.date || "")}`
}

function sortRecordsByDate(records = []) {
  return [...records].sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date))
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""))
  })
}

function mergeRegistrosByWorkerDate(baseRegistros = [], overrideRegistros = []) {
  const overrideKeys = new Set(overrideRegistros.map((record) => buildWorkerDateKey(record)))
  return sortRecordsByDate([
    ...baseRegistros.filter((record) => !overrideKeys.has(buildWorkerDateKey(record))),
    ...overrideRegistros,
  ])
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
  { id: "dashboard",  label: "Dashboard",       mobileLabel: "Dash",      icon: BarChartIcon,      roles: ["super_admin", "admin", "user"] },
  { id: "mobile",     label: "Carga Grupal",    mobileLabel: "Carga",     icon: UsersIcon,         roles: ["super_admin", "admin", "user"] },
  { id: "weekly",     label: "Control Semanal", mobileLabel: "Semanal",   icon: LayoutIcon,        roles: ["super_admin", "admin", "user"] },
  { id: "manual",     label: "Manual",          mobileLabel: "Manual",    icon: PlusIcon,          roles: ["super_admin", "admin", "user"] },
  { id: "registro",   label: "Voz",             mobileLabel: "Voz",       icon: MicIcon,           roles: ["super_admin", "admin", "user"] },
  { id: "resumen",    label: "Planilla",        mobileLabel: "Planilla",  icon: ChartIcon,         roles: ["super_admin", "admin", "user"] },
  { id: "ai",         label: "Asistente",       mobileLabel: "IA",        icon: SparklesIcon,      roles: ["super_admin", "admin", "user"] },
  { id: "contratista", label: "Portal Contratista", mobileLabel: "Portal", icon: QrIcon,         roles: ["super_admin"], hideInBottomNav: true, bottomNavRoles: ["super_admin"] },
  { id: "accesos",    label: "Vigilancia",      mobileLabel: "Accesos",   icon: ShieldIcon,        roles: ["super_admin"], hideInBottomNav: true, bottomNavRoles: ["super_admin"] },
  { id: "prevencion", label: "Prevención",      mobileLabel: "SOMA",      icon: ClipboardCheckIcon, roles: ["super_admin"], hideInBottomNav: true, bottomNavRoles: ["super_admin"] },
  { id: "ayuda",      label: "Ayuda",           mobileLabel: "Ayuda",     icon: HelpIcon,          roles: ["super_admin", "admin", "user", "vigilancia", "prevencion", "contratista"], hideInBottomNav: true },
  { id: "config",     label: "Config",          mobileLabel: "Config",    icon: SettingsIcon,      roles: ["super_admin", "admin"] },
]

function AppContent() {
  const { user, profile, logout } = useAuth()
  const currentRole = normalizeRole(profile?.role)
  const isAdminUser = canAccessConfig(currentRole)
  const cloudHydratedRef = useRef(false)
  const [tab, setTab] = useState("dashboard")
  const [showBottomNav, setShowBottomNav] = useState(() => (
    typeof window === "undefined" ? true : window.innerWidth < 900
  ))
  const [workers, setWorkers] = useState(() => normalizeWorkersCollection(loadArrayFromStorage(STORAGE_KEYS.workers, INITIAL_WORKERS)))
  const [partidas, setPartidas] = useState(() => loadArrayFromStorage(STORAGE_KEYS.partidas, INITIAL_PARTIDAS))
  const [actividades, setActividades] = useState(() => loadArrayFromStorage(STORAGE_KEYS.actividades, INITIAL_ACTIVIDADES))
  const [frentes, setFrentes] = useState(() => loadArrayFromStorage(STORAGE_KEYS.frentes, INITIAL_FRENTES))
  const [tiposHora, setTiposHora] = useState(() => loadArrayFromStorage(STORAGE_KEYS.tiposHora, INITIAL_TIPOS_HORA))
  const [projectConfig, setProjectConfig] = useState(() => loadProjectConfigFromStorage())
  const [registros, setRegistros] = useState([])
  const [allRegistros, setAllRegistros] = useState([])
  const [fechaTareo, setFechaTareo] = useState(() => getTodayLocalDate())
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false))
  const [syncState, setSyncState] = useState({ pendingCount: 0, syncing: false })
  const [localFixtureRegistros, setLocalFixtureRegistros] = useState([])

  const applyCatalogPayload = useCallback((payload, options = {}) => {
    if (!payload || typeof payload !== "object") return

    const { mergeWorkerCatalog = false } = options

    if (Array.isArray(payload.workers)) {
      const normalizedRemoteWorkers = normalizeWorkersCollection(payload.workers)
      setWorkers((current) => (
        mergeWorkerCatalog
          ? normalizeWorkersCollection(mergeWorkers(current, normalizedRemoteWorkers))
          : normalizedRemoteWorkers
      ))
    }
    if (Array.isArray(payload.partidas)) setPartidas(payload.partidas)
    if (Array.isArray(payload.actividades)) setActividades(payload.actividades)
    if (Array.isArray(payload.frentes)) setFrentes(payload.frentes)
    if (Array.isArray(payload.tiposHora)) setTiposHora(payload.tiposHora)
    if (payload.projectConfig && typeof payload.projectConfig === "object") {
      setProjectConfig((current) => ({ ...current, ...payload.projectConfig }))
    }
  }, [])

  const refreshCatalogs = useCallback(async (options = {}) => {
    if (!user || isLocalDevHost) return null

    const remotePayload = await fetchAppSettings("catalogs")
    if (!remotePayload || typeof remotePayload !== "object") return null

    applyCatalogPayload(remotePayload, options)
    cloudHydratedRef.current = true
    return remotePayload
  }, [applyCatalogPayload, user])

  useEffect(() => {
    if (!isLocalDevHost) return

    let active = true

    async function loadLocalFixture() {
      try {
        const response = await fetch(`${LOCAL_DEV_FIXTURE_URL}?v=200426`, { cache: "no-store" })
        if (!response.ok) return
        const payload = await response.json()
        if (!active || !payload || typeof payload !== "object") return

        applyCatalogPayload({
          ...payload,
          projectConfig: payload.projectConfig && typeof payload.projectConfig === "object"
            ? { ...DEFAULT_PROJECT_CONFIG, ...payload.projectConfig }
            : null,
        })
        if (Array.isArray(payload.registros)) {
          setLocalFixtureRegistros(payload.registros)
          setAllRegistros((prev) => mergeRegistrosByWorkerDate(prev, payload.registros))
        }
        cloudHydratedRef.current = true
        setSyncState({ pendingCount: 0, syncing: false })
      } catch (error) {
        console.warn("No se pudo cargar el fixture local del consolidado:", error)
      }
    }

    loadLocalFixture()

    return () => {
      active = false
    }
  }, [applyCatalogPayload])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.workers, JSON.stringify(workers))
    localStorage.setItem(STORAGE_KEYS.partidas, JSON.stringify(partidas))
    localStorage.setItem(STORAGE_KEYS.actividades, JSON.stringify(actividades))
    localStorage.setItem(STORAGE_KEYS.frentes, JSON.stringify(frentes))
    localStorage.setItem(STORAGE_KEYS.tiposHora, JSON.stringify(tiposHora))
    localStorage.setItem(STORAGE_KEYS.projectConfig, JSON.stringify(projectConfig))
  }, [workers, partidas, actividades, frentes, tiposHora, projectConfig])

  useEffect(() => {
    let mounted = true

    async function refreshPendingCount() {
      try {
        const pendingCount = await getPendingSyncCount()
        if (mounted) {
          setSyncState((prev) => ({ ...prev, pendingCount }))
        }
      } catch {
        if (mounted) {
          setSyncState((prev) => ({ ...prev, pendingCount: 0 }))
        }
      }
    }

    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
      setSyncState((prev) => ({ ...prev, syncing: false }))
    }

    function handleSyncEvent(event) {
      const detail = event?.detail || {}
      if (!mounted) return
      setSyncState((prev) => ({
        ...prev,
        pendingCount: typeof detail.pendingCount === "number" ? detail.pendingCount : prev.pendingCount,
        syncing: Boolean(detail.syncing),
      }))
      if (typeof detail.online === "boolean") {
        setIsOnline(detail.online)
      }
    }

    refreshPendingCount()
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    window.addEventListener(getSyncEventName(), handleSyncEvent)

    return () => {
      mounted = false
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener(getSyncEventName(), handleSyncEvent)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const media = window.matchMedia("(max-width: 899px)")
    const syncViewport = () => setShowBottomNav(media.matches)

    syncViewport()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncViewport)
      return () => media.removeEventListener("change", syncViewport)
    }

    media.addListener(syncViewport)
    return () => media.removeListener(syncViewport)
  }, [])

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
      const remotePayload = await refreshCatalogs()
      if (!active || !remotePayload) {
        cloudHydratedRef.current = true
        return
      }

      cloudHydratedRef.current = true
    }

    hydrateCatalogs()

    return () => {
      active = false
    }
  }, [refreshCatalogs, user])

  useEffect(() => {
    if (isLocalDevHost || !user) return undefined

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshCatalogs({ mergeWorkerCatalog: true })
      }
    }

    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)

    return () => {
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refreshCatalogs, user])

  useEffect(() => {
    if (isLocalDevHost) return
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
    let active = true
    let refreshTimer = null
    let intervalId = null

    async function loadData({ syncFirst = false } = {}) {
      if (!user) return

      if (syncFirst && isOnline && !isLocalDevHost) {
        setSyncState((prev) => ({ ...prev, syncing: true }))
        try {
          const result = await syncPendingRegistros()
          if (active) {
            setSyncState((prev) => ({
              ...prev,
              syncing: false,
              pendingCount: result.pending,
            }))
          }
        } catch {
          if (active) {
            setSyncState((prev) => ({ ...prev, syncing: false }))
          }
        }
      }

      const data = await fetchRegistros()
      if (active) {
        const mergedData = isLocalDevHost
          ? mergeRegistrosByWorkerDate(data, localFixtureRegistros)
          : data
        setAllRegistros(mergedData)
        if (isLocalDevHost) {
          setSyncState({ pendingCount: 0, syncing: false })
        } else {
          const pendingCount = await getPendingSyncCount()
          if (active) {
            setSyncState((prev) => ({ ...prev, pendingCount }))
          }
        }
      }
    }

    loadData({ syncFirst: isOnline })

    function queueLoad(syncFirst = false, delay = 120) {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        loadData({ syncFirst })
      }, delay)
    }

    function handleDataChanged(event) {
      const reason = String(event?.detail?.reason || "")
      const retryPendingSync = !isLocalDevHost && isOnline && /_pending$/.test(reason)
      queueLoad(retryPendingSync)
    }

    function handleWindowFocus() {
      if (!active || isLocalDevHost || !user) return
      queueLoad(isOnline, 80)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handleWindowFocus()
      }
    }

    window.addEventListener(getDataEventName(), handleDataChanged)
    window.addEventListener("focus", handleWindowFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    if (!isLocalDevHost && user && isOnline) {
      intervalId = setInterval(() => {
        loadData({ syncFirst: false })
      }, 15000)
    }

    return () => {
      active = false
      clearTimeout(refreshTimer)
      if (intervalId) clearInterval(intervalId)
      window.removeEventListener(getDataEventName(), handleDataChanged)
      window.removeEventListener("focus", handleWindowFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [user, isOnline, localFixtureRegistros])

  useEffect(() => {
    const { dates } = getWeekRange(fechaTareo)
    const startStr = dates[0]
    const endStr = dates[dates.length - 1]
    setRegistros(
      allRegistros.filter((record) => record.date >= startStr && record.date <= endStr)
    )
  }, [allRegistros, fechaTareo])

  const visibleTabs = TABS.filter((tabItem) => tabItem.roles.includes(currentRole))
  const bottomNavTabs = visibleTabs.filter((tabItem) => (
    !tabItem.hideInBottomNav || tabItem.bottomNavRoles?.includes(currentRole)
  ))

  useEffect(() => {
    if (visibleTabs.length === 0) return
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0].id)
    }
  }, [tab, visibleTabs])

  if (!user) {
    return <Login />
  }

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
          <img
            className="brand-logo"
            src={projectLogo}
            alt="Grupo Padova Registro y Tareo de Personal"
          />
          <div className="sidebar-brand-copy">
            <h1 className="title sidebar-brand-title">TAREADOR</h1>
            <span className="subtitle sidebar-brand-subtitle">CONTROL DE PROYECTO PADOVA</span>
          </div>
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
          <div className="header-title-wrap">
            <img
              className="header-logo"
              src={projectLogo}
              alt="Grupo Padova Registro y Tareo de Personal"
            />
            <div className="title-group">
              <h1 className="title">
                {visibleTabs.find(t => t.id === tab)?.label || "TAREADOR"}
              </h1>
              <span className="subtitle">CONTROL DE PROYECTO</span>
            </div>
          </div>
          <div className="date-display mono" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid var(--border-dim)",
                background: !isOnline
                  ? "rgba(239, 68, 68, 0.14)"
                  : syncState.syncing
                    ? "rgba(212, 165, 90, 0.15)"
                    : syncState.pendingCount > 0
                      ? "rgba(37, 99, 235, 0.14)"
                      : "rgba(34, 197, 94, 0.14)",
                color: !isOnline
                  ? "#fca5a5"
                  : syncState.syncing
                    ? "var(--accent-gold)"
                    : syncState.pendingCount > 0
                      ? "var(--accent-blue)"
                      : "#86efac",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {!isOnline
                ? "Sin conexión"
                : syncState.syncing
                  ? "Sincronizando..."
                  : syncState.pendingCount > 0
                    ? `${syncState.pendingCount} pendientes`
                    : "En línea"}
            </span>
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
              allRegistros={allRegistros}
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
              setActividades={setActividades}
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
              projectConfig={projectConfig}
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
              allRegistros={allRegistros}
              actividades={actividades}
              partidas={partidas}
              frentes={frentes}
              projectConfig={projectConfig}
              fechaTareo={fechaTareo}
            />
          )}

          {tab === "accesos" && (
            <VigilanciaPanel
              workers={workers}
              fechaTareo={fechaTareo}
            />
          )}

          {tab === "contratista" && (
            <ContractorPortalPanel />
          )}

          {tab === "prevencion" && (
            <PrevencionPanel
              workers={workers}
              fechaTareo={fechaTareo}
            />
          )}

          {tab === "ayuda" && <Help />}

          {tab === "config" && isAdminUser && (
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
              fechaTareo={fechaTareo}
            />
          )}

          {/* Build Version Tag */}
          <div className="build-version-tag">
            v1.1.11-DYNAMIC
          </div>
        </main>

        {showBottomNav && (
          <nav className="bottom-nav">
            {bottomNavTabs.map((t) => (
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

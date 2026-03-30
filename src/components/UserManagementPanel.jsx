import { useEffect, useMemo, useState } from "react"
import { PlusIcon } from "./Icons"
import {
  fetchManagedUsers,
  saveManagedUserRole,
} from "../utils/supabaseClient"
import {
  canManageUsers,
  ROLE_OPTIONS,
  getRoleLabel,
  isSuperAdminEmail,
  normalizeRole,
} from "../utils/accessControl"
import { useAuth } from "../contexts/AuthContext"

const NON_SUPERADMIN_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== "super_admin")

function formatSeenAt(value) {
  if (!value) return "Sin ingreso"

  try {
    return new Date(value).toLocaleString("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    })
  } catch {
    return value
  }
}

export default function UserManagementPanel() {
  const { profile } = useAuth()
  const currentRole = normalizeRole(profile?.role)
  const canEditUsers = canManageUsers(currentRole)
  const [managedUsers, setManagedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("user")
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [expandedUsers, setExpandedUsers] = useState({})

  const visibleUsers = useMemo(() => managedUsers.slice().sort((a, b) => a.email.localeCompare(b.email)), [managedUsers])

  useEffect(() => {
    let mounted = true

    async function loadUsers() {
      setLoading(true)
      const users = await fetchManagedUsers()
      if (mounted) {
        setManagedUsers(users)
        setLoading(false)
      }
    }

    loadUsers()
    return () => {
      mounted = false
    }
  }, [])

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    window.clearTimeout(showFeedback.timeoutId)
    showFeedback.timeoutId = window.setTimeout(() => setFeedback(null), 4000)
  }

  const refreshUsers = async () => {
    const users = await fetchManagedUsers()
    setManagedUsers(users)
  }

  const toggleUserExpansion = (key) => {
    setExpandedUsers((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const handleRoleChange = async (entry, nextRole) => {
    if (!entry?.email || !canEditUsers) return
    setSaving(true)
    await saveManagedUserRole(entry, nextRole)
    await refreshUsers()
    setSaving(false)
    showFeedback("success", `Rol actualizado para ${entry.email}.`)
  }

  const handleCreateUser = async () => {
    if (!canEditUsers) {
      showFeedback("error", "Solo el superadmin puede agregar usuarios o cambiar roles.")
      return
    }

    const email = String(newEmail || "").trim().toLowerCase()
    if (!email) {
      showFeedback("error", "Ingresa un correo para crear o preparar el acceso.")
      return
    }

    if (!email.includes("@")) {
      showFeedback("error", "El correo no parece válido.")
      return
    }

    setSaving(true)
    const targetRole = isSuperAdminEmail(email) ? "super_admin" : newRole
    await saveManagedUserRole({ email, source: "app_settings" }, targetRole)
    await refreshUsers()
    setNewEmail("")
    setNewRole("user")
    setSaving(false)
    showFeedback("success", `Usuario ${email} preparado con rol ${getRoleLabel(targetRole)}.`)
  }

  if (!canEditUsers) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div className="label">USUARIOS DEL SISTEMA</div>
          <span className="btn-pill-sm" style={{ cursor: "default" }}>{visibleUsers.length} usuarios</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12, marginBottom: 0 }}>
          Solo el <strong style={{ color: "var(--text-main)" }}>superadmin</strong> puede agregar usuarios o cambiar roles.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div className="label">USUARIOS DEL SISTEMA</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
            Superadmin reservado: <strong style={{ color: "var(--text-main)" }}>yleon@padovasac.com</strong>
          </div>
        </div>
        <button className="btn-pill-sm" onClick={() => setPanelExpanded((current) => !current)}>
          {panelExpanded ? "CONTRAER" : `EXPANDIR (${visibleUsers.length})`}
        </button>
      </div>

      {panelExpanded && (
        <>
          {feedback && (
            <div className={`feedback-banner ${feedback.type}`} style={{ marginTop: 14, marginBottom: 14 }}>
              {feedback.message}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.5fr) minmax(170px, 0.8fr) auto", gap: 10, marginTop: 14, marginBottom: 14 }}>
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="nuevo.usuario@empresa.com"
              className="input-field"
              disabled={saving}
            />
            <select
              value={isSuperAdminEmail(newEmail) ? "super_admin" : newRole}
              onChange={(event) => setNewRole(event.target.value)}
              className="input-field"
              disabled={isSuperAdminEmail(newEmail) || saving}
            >
              {(isSuperAdminEmail(newEmail) ? ROLE_OPTIONS : NON_SUPERADMIN_ROLE_OPTIONS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreateUser}
              className="btn-primary"
              disabled={saving}
            >
              <PlusIcon /> AGREGAR
            </button>
          </div>

          <div style={{ border: "1px solid var(--border-dim)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.6fr) minmax(130px, 0.6fr) minmax(160px, 0.8fr) auto", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
              <span>Correo</span>
              <span>Rol</span>
              <span>Último ingreso</span>
              <span style={{ textAlign: "right" }}>Detalle</span>
            </div>

            {loading ? (
              <div className="empty-state">Cargando usuarios...</div>
            ) : visibleUsers.length === 0 ? (
              <div className="empty-state">Aún no hay usuarios registrados en la configuración.</div>
            ) : (
              visibleUsers.map((entry) => {
                const lockedSuperAdmin = isSuperAdminEmail(entry.email)
                const roleOptions = lockedSuperAdmin ? ROLE_OPTIONS : NON_SUPERADMIN_ROLE_OPTIONS
                const rowKey = entry.id || entry.email
                const isExpanded = Boolean(expandedUsers[rowKey])

                return (
                  <div key={rowKey} style={{ padding: "12px", borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.6fr) minmax(130px, 0.6fr) minmax(160px, 0.8fr) auto", gap: 10, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.email}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                          {lockedSuperAdmin ? "Superadmin reservado" : entry.source === "profiles" ? "Perfil existente" : "Configurado en sistema"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-main)", fontWeight: 700 }}>
                        {getRoleLabel(entry.role)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        {formatSeenAt(entry.lastSeenAt)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button className="btn-pill-sm" onClick={() => toggleUserExpansion(rowKey)}>
                          {isExpanded ? "OCULTAR" : "VER"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, 240px)", gap: 10, alignItems: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          Fuente: <strong style={{ color: "var(--text-main)" }}>{entry.source === "profiles" ? "profiles" : "app_settings"}</strong>
                        </div>
                        <select
                          value={entry.role}
                          onChange={(event) => handleRoleChange(entry, event.target.value)}
                          className="input-field"
                          disabled={lockedSuperAdmin || saving}
                        >
                          {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12 }}>
            `Usuario` no podrá eliminar tareos ni ver Config. `Contratista` usa su portal y padrón digital. `Vigilancia` solo usa ingreso/egreso. `Prevencion` visualiza accesos y checklist documental.
          </div>
        </>
      )}
    </div>
  )
}
